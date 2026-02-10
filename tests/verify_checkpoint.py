
import sys
import os
import json
import unittest
from unittest.mock import MagicMock, patch
import pandas as pd

# Add backend to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '../backend')))

from services import analyze_reviews

class TestCheckpointing(unittest.TestCase):
    def setUp(self):
        # Create a dummy dataframe with 150 reviews
        self.df = pd.DataFrame({'text': [f'Review {i}' for i in range(150)]})
        self.csv_path = 'test_reviews.csv'
        self.df.to_csv(self.csv_path, index=False)
        self.job_id = 'test_job_123'
        
        # Mock S3 storage
        self.s3_storage = {}
        
    def tearDown(self):
        if os.path.exists(self.csv_path):
            os.remove(self.csv_path)

    @patch('services.analyze_reviews.OpenAI')
    @patch('services.analyze_reviews.boto3')
    def test_checkpoint_and_resume(self, mock_boto3, mock_openai):
        # --- MOCK SETUP ---
        
        # Mock OpenAI response
        mock_client = MagicMock()
        mock_openai.return_value = mock_client
        mock_client.chat.completions.create.return_value.choices[0].message.content = json.dumps({
            "sentiment": "Positive",
            "topics": []
        })

        # Mock S3 Client
        mock_s3 = MagicMock()
        mock_boto3.client.return_value = mock_s3
        
        # Mock S3 put_object (save checkpoint)
        def mock_put_object(Bucket, Key, Body, **kwargs):
            self.s3_storage[Key] = Body
            return {}
        mock_s3.put_object.side_effect = mock_put_object
        
        # Mock S3 get_object (load checkpoint)
        def mock_get_object(Bucket, Key):
            if Key in self.s3_storage:
                return {'Body': MagicMock(read=lambda: self.s3_storage[Key].encode('utf-8'))}
            raise Exception("NoSuchKey") # boto3 raises ClientError, but simplified for mock
        mock_s3.get_object.side_effect = mock_get_object
        
        # Mock S3 delete_object
        def mock_delete_object(Bucket, Key):
            if Key in self.s3_storage:
                del self.s3_storage[Key]
        mock_s3.delete_object.side_effect = mock_delete_object

        # Mock exceptions for NoSuchKey (need to be a bit tricky with boto3 mocks usually, but we can patch the imported module exception if needed, or just ensure our load_checkpoint handles specific errors)
        # In implementation: except s3.exceptions.NoSuchKey:
        # We need to make sure s3.exceptions.NoSuchKey exists on our mock or patch it
        # Actually, analyze_reviews.py does `except s3.exceptions.NoSuchKey`.
        # Since s3 is created via boto3.client(), we need to mock that structure.
        # It's easier to just patch load_checkpoint for the "resume" test if strictly unit testing, 
        # but let's try to mock the client properly.
        
        # Better approach for creating exceptions in mocks:
        class MockClientError(Exception):
            pass
        mock_s3.exceptions.NoSuchKey = MockClientError

        def mock_get_object_raise(Bucket, Key):
            if Key in self.s3_storage:
                 return {'Body': MagicMock(read=lambda: self.s3_storage[Key].encode('utf-8'))}
            raise MockClientError()
        mock_s3.get_object.side_effect = mock_get_object_raise


        # Mock generate_presigned_url to return a string
        mock_s3.generate_presigned_url.return_value = "http://example.com/fake_presigned_url"

        # --- RUN 1: FAIL HALFWAY ---
        print("\n--- Starting Run 1 (Simulating Crash at 75) ---")
        
        with patch('services.analyze_reviews.update_analysis_status') as mock_update:
            def side_effect(*args, **kwargs):
                # args: job_id, status, message, processed, total
                if len(args) >= 4:
                    processed = args[3]
                    if processed >= 75:
                         raise RuntimeError("Simulated Crash")
            mock_update.side_effect = side_effect
            
            try:
                analyze_reviews.analyze_reviews(
                    self.csv_path, 
                    dimensions=[], 
                    openai_key="fake", 
                    job_id=self.job_id
                )
            except RuntimeError:
                print("Caught simulated crash.")

        # --- VERIFY CHECKPOINT ---
        checkpoint_key = f"checkpoints/{self.job_id}.json"
        self.assertIn(checkpoint_key, self.s3_storage)
        checkpoint_data = json.loads(self.s3_storage[checkpoint_key])
        print(f"Checkpoint data length: {len(checkpoint_data)}")
        self.assertEqual(len(checkpoint_data), 50, "Should have saved 50 results")

        # --- RUN 2: RESUME ---
        print("\n--- Starting Run 2 (Resuming) ---")
        
        # Reset OpenAI mock to track calls
        mock_client.chat.completions.create.reset_mock()
        
        # Run to completion
        with patch('services.analyze_reviews.update_analysis_status') as mock_update:
            analyze_reviews.analyze_reviews(
                self.csv_path, 
                dimensions=[], 
                openai_key="fake", 
                job_id=self.job_id
            )
            
        # Analysis should have processed 100 more items (150 total - 50 checkpointed)
        # Wait, processed_indices are those IN the checkpoint.
        # If we crashed at 75, we saved 50.
        # So we skip 50. We process 100.
        # The 25 we did in run 1 (50-75) were NOT saved, so they are re-processed.
        
        print(f"OpenAI calls in Run 2: {mock_client.chat.completions.create.call_count}")
        # We expect 100 calls (150 total - 50 skipped).
        self.assertEqual(mock_client.chat.completions.create.call_count, 100)
        
        # Verify checkpoint is cleaned up
        self.assertNotIn(checkpoint_key, self.s3_storage)
        print("Checkpoint cleaned up successfully.")

if __name__ == '__main__':
    unittest.main()
