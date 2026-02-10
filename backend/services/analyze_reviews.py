import pandas as pd
from openai import OpenAI
import json
import logging
import boto3
import os
import io
import time
from botocore.exceptions import NoCredentialsError

from services.email_service import send_email_gmail

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Helper for Status Updates (Matches logic in main.py but imported here for worker usage) ---
def update_analysis_status(job_id, status, message, processed=0, total=0, error=None, **kwargs):
    if not job_id: return
    
    
    try:
        s3 = boto3.client('s3', region_name=os.getenv("AWS_REGION", "eu-central-1"))
        bucket = os.getenv("S3_BUCKET_NAME", "horus-voc-data-storage-v2-eu")
        
        payload = {
            "status": status, 
            "message": message, 
            "job_id": job_id,
            "processed": processed,
            "total": total,
            "task_type": "analysis"
        }
        if error:
            payload["error"] = error
            
        # Add extra fields (like dashboard_link, download_url)
        payload.update(kwargs)
        s3.put_object(
            Bucket=bucket,
            Key=f"processing_status/{job_id}.json",
            Body=json.dumps(payload),
            ContentType='application/json'
        )
    except Exception as e:
        logger.error(f"Failed to update status in S3 for {job_id}: {e}")

def get_s3_client():
    return boto3.client(
        's3', 
        region_name=os.getenv("AWS_REGION", "eu-central-1"),
        config=boto3.session.Config(signature_version='s3v4')
    )

def get_checkpoint_key(job_id):
    return f"checkpoints/{job_id}.json"

def load_checkpoint(job_id):
    """
    Loads intermediate results from S3 if they exist.
    Returns a list of previously analyzed results or empty list.
    """
    if not job_id: return []
    
    bucket = os.getenv("S3_BUCKET_NAME", "horus-voc-data-storage-v2-eu")
    key = get_checkpoint_key(job_id)
    
    try:
        s3 = get_s3_client()
        response = s3.get_object(Bucket=bucket, Key=key)
        data = json.loads(response['Body'].read().decode('utf-8'))
        logger.info(f"🔄 Resuming job {job_id} from checkpoint. Loaded {len(data)} results.")
        return data
    except s3.exceptions.NoSuchKey:
        logger.info(f"No checkpoint found for job {job_id}. Starting fresh.")
        return []
    except Exception as e:
        logger.warning(f"Failed to load checkpoint for {job_id}: {e}")
        return []

def save_checkpoint(job_id, results):
    """
    Saves current list of results to S3.
    """
    if not job_id: return

    bucket = os.getenv("S3_BUCKET_NAME", "horus-voc-data-storage-v2-eu")
    key = get_checkpoint_key(job_id)
    
    try:
        s3 = get_s3_client()
        s3.put_object(
            Bucket=bucket,
            Key=key,
            Body=json.dumps(results),
            ContentType='application/json'
        )
        logger.info(f"💾 Checkpoint saved for {job_id}: {len(results)} records.")
    except Exception as e:
        logger.error(f"Failed to save checkpoint for {job_id}: {e}")


def generate_dimensions(reviews_sample, openai_key):
    """
    Analyzes a sample of reviews to suggest relevant analysis axes.
    """
    client = OpenAI(api_key=openai_key)
    
    # Format reviews for prompt
    reviews_text = "\n".join([f"- {r.get('text', '')}" for r in reviews_sample[:10]])
    
    prompt = f"""
    Analyze the following customer reviews and suggest key "Dimensions" or "Topics" that would be valuable to track for this brand (e.g., "Delivery Speed", "Packaging", "Customer Service").
    
    Reviews Sample:
    {reviews_text}
    
    Return a JSON array of objects, where each object has:
    - dimension: The name of the dimension
    - description: What this dimension covers
    - keywords: A list of 3-5 related keywords
    """
    
    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are an expert Customer Experience (CX) taxonomy designer. Your task is to generate a set of 8-14 experience dimensions (topics) that are specifically relevant for analyzing customer reviews. Return ONLY JSON."},
                {"role": "user", "content": prompt}
            ],
            response_format={ "type": "json_object" }
        )
        content = completion.choices[0].message.content
        data = json.loads(content)
        
        # Handle if wrapped in a key like "dimensions" or just array
        if "dimensions" in data:
            return data["dimensions"]
        elif isinstance(data, list):
            return data
        else:
            # Try to find array in values
            for v in data.values():
                if isinstance(v, list): return v
            return []
            
    except Exception as e:
        logger.error(f"Error generating dimensions: {e}")
        return []

def analyze_reviews(file_path, dimensions, openai_key, job_id=None, progress_callback=None):
    """
    Reads CSV, batches reviews, and sends to OpenAI for sentiment/topic analysis.
    Merges results back into DataFrame and uploads to S3.
    """
    error = None
    try:
        if os.path.exists(file_path):
            df = pd.read_csv(file_path)
        else:
            # Assume file_path is S3 Key
            s3_bucket = os.getenv("S3_BUCKET_NAME", "horus-voc-data-storage-v2-eu")
            logger.info(f"Reading from S3: {file_path}")
            s3 = boto3.client('s3', region_name=os.getenv("AWS_REGION", "eu-central-1"))
            obj = s3.get_object(Bucket=s3_bucket, Key=file_path)
            df = pd.read_csv(obj['Body'])
    except Exception as e:
        error_msg = f"Could not read file: {e}"
        logger.error(error_msg)
        if job_id:
            update_analysis_status(job_id, "error", error_msg)
        return {"error": error_msg}
        
    client = OpenAI(api_key=openai_key)
    
    # Analyze all reviews (removed limit for production/full analysis)
    df_sample = df.copy()
    
    logger.info(f"Starting analysis for {len(df_sample)} reviews.")
    
    # Initial status update
    if job_id:
        update_analysis_status(job_id, "running", "Starting analysis...", 0, len(df_sample))
    
    # --- RESUME LOGIC ---
    # Try to load existing progress
    analyzed_results = load_checkpoint(job_id)
    
    # Create a set of processed indices for O(1) lookup
    processed_indices = {item['index'] for item in analyzed_results}
    
    if processed_indices:
        logger.info(f"Skipping {len(processed_indices)} already processed reviews.")
    # --------------------
    
    # Prepare dimensions list for prompt
    dims_list = "\n".join([f"- {d['dimension']}" for d in dimensions])
    
    # Process reviews individually for better accuracy
    total_reviews = len(df_sample)
    logger.info(f"Processing {total_reviews} reviews individually...")
    
    for idx, row in df_sample.iterrows():
        # Skip if already processed
        if idx in processed_indices:
            continue

        review_num = idx + 1
        
        # Update progress every 5 reviews or on last one
        if review_num % 5 == 0 or review_num == total_reviews:
            msg = f"Analyzing review {review_num}/{total_reviews}..."
            logger.info(msg)
            if job_id:
                update_analysis_status(job_id, "running", msg, review_num, total_reviews)
            if progress_callback:
                progress_callback(msg)
        
        # Checkpoint every 50 reviews
        if job_id and len(analyzed_results) > 0 and len(analyzed_results) % 50 == 0:
             save_checkpoint(job_id, analyzed_results)
        
        review_text = row['text']
        
        # Build the detailed prompt
        system_prompt = """You are an expert Customer Experience Analyst.

Analyze the following customer review and extract:
1. Multi-level sentiment analysis
2. Structured experience dimensions (topics)

Return ONLY valid JSON in this EXACT format with no additional text, no markdown formatting, no code blocks:
{
  "sentiment": "Positive",
  "emotion": "Delighted",
  "confidence": 0.95,
  "topics": [
    {
      "dimension": "Dimension Name Here",
      "sentiment": "Positive",
      "mentioned": true
    }
  ]
}

SENTIMENT GUIDELINES:
- Overall Sentiment: Choose ONLY: Positive, Neutral, or Negative
- Emotional Tone: Choose ONLY from: Delighted, Satisfied, Frustrated, Disappointed, Angry, Surprised, Confused, or Indifferent
- Confidence: A number between 0.00 and 1.00 (higher when language is explicit and clear)

Distinguish severity examples:
- "A bit expensive" → sentiment: Negative, emotion: Disappointed, confidence: 0.70
- "Worst service ever" → sentiment: Negative, emotion: Angry, confidence: 0.95
- "Product was amazing" → sentiment: Positive, emotion: Delighted, confidence: 0.90
- "It's okay" → sentiment: Neutral, emotion: Indifferent, confidence: 0.60

TOPIC/DIMENSION GUIDELINES:
Extract ONLY the experience dimensions that are explicitly mentioned in the review.

Use ONLY these predefined dimensions (use exact names):
{dimensions}

For each mentioned dimension:
- Set "mentioned": true
- Indicate sentiment for that specific dimension: Positive, Neutral, or Negative
- Use the EXACT dimension name from the list above

ONLY include dimensions that are clearly referenced in the review. If a dimension is not mentioned, do NOT include it in the topics array.

The review may contain English, Arabic, or both languages. Analyze accordingly.

Remember: Return ONLY the JSON object. No explanations, no markdown code blocks, no additional text."""
        
        user_prompt = f"""Review:
"{review_text}"
"""
        
        # Replace dimensions placeholder
        system_prompt = system_prompt.replace("{dimensions}", dims_list)
        
        try:
            completion = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={ "type": "json_object" }
            )
            content = completion.choices[0].message.content
            result = json.loads(content)
            
            # Store result with index
            analyzed_results.append({
                "index": idx,
                "result": result
            })
            
        except Exception as e:
            logger.error(f"Error analyzing review {idx}: {e}")
            # Store empty result to maintain index alignment
            analyzed_results.append({
                "index": idx,
                "result": {
                    "sentiment": "Neutral",
                    "emotion": "Indifferent",
                    "confidence": 0.0,
                    "topics": []
                }
            })
            
            
    # Merge results back into DataFrame
    logger.info("Merging analysis results into DataFrame...")
    
    # Initialize new columns
    df_sample['sentiment'] = None
    df_sample['emotion'] = None
    df_sample['confidence'] = None
    df_sample['topics'] = None
    
    # Merge individual review results
    for item in analyzed_results:
        idx = item['index']
        result = item['result']
        
        if idx in df_sample.index:
            # Extract sentiment, emotion, and confidence
            df_sample.at[idx, 'sentiment'] = result.get('sentiment', 'Neutral')
            df_sample.at[idx, 'emotion'] = result.get('emotion', 'Indifferent')
            df_sample.at[idx, 'confidence'] = result.get('confidence', 0.0)
            
            # Extract and format topics
            topics_list = result.get('topics', [])
            if topics_list:
                # Format as: "Dimension1 (Positive), Dimension2 (Negative)"
                topic_strings = [
                    f"{topic.get('dimension', 'Unknown')} ({topic.get('sentiment', 'Neutral')})"
                    for topic in topics_list
                    if topic.get('mentioned', False)
                ]
                df_sample.at[idx, 'topics'] = '; '.join(topic_strings)
            else:
                df_sample.at[idx, 'topics'] = ''
    
    
    # Save analyzed CSV locally first
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    analyzed_filename = f"analyzed_reviews_{timestamp}.csv"
    local_analyzed_path = f"data/{analyzed_filename}"
    
    # Ensure data directory exists
    os.makedirs("data", exist_ok=True)
    
    df_sample.to_csv(local_analyzed_path, index=False)
    logger.info(f"Saved analyzed reviews to {local_analyzed_path}")
    
    # Upload to S3
    s3_bucket = os.getenv("S3_BUCKET_NAME", "horus-voc-data-storage-v2-eu")
    s3_key = f"analyzed_data/{analyzed_filename}"
    aws_region = os.getenv("AWS_REGION", "eu-central-1")
    
    try:
        s3_client = boto3.client(
            's3',
            region_name=aws_region,
            endpoint_url=f"https://s3.{aws_region}.amazonaws.com",
            config=boto3.session.Config(signature_version='s3v4')
        )
        
        s3_client.upload_file(local_analyzed_path, s3_bucket, s3_key)
        logger.info(f"✅ Uploaded analyzed reviews to S3: s3://{s3_bucket}/{s3_key}")
        
        # Generate presigned download URL
        download_url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': s3_bucket, 'Key': s3_key},
            ExpiresIn=86400  # 24 hours
        )
        
        # Generate dashboard URL with auto-load parameter
        import urllib.parse
        dashboard_base_url = os.getenv("DASHBOARD_URL", "http://localhost:3000")
        encoded_download_url = urllib.parse.quote(download_url, safe='')
        dashboard_link = f"{dashboard_base_url}/dashboard?csv_url={encoded_download_url}"
        
        board_link_msg = f"Dashbaord Link: {dashboard_link}"
        logger.info(f"📥 Download Link: {download_url}")
        logger.info(f"📊 {board_link_msg}")
        
        # Send Email Notification
        email_sent = False
        if job_id:
            import textwrap
            
            email_body = textwrap.dedent(f"""
                Hello,
                
                Your VoC Analysis is complete!
                
                Analyzed {len(df_sample)} reviews.
                
                You can view the interactive dashboard here:
                {dashboard_link}
                
                Or download the raw data:
                {download_url}
                
                Best regards,
                HorusCX VoC Platform
            """)
            
            email_html = f"""
            <html>
                <body>
                    <h2>VoC Analysis Complete ✅</h2>
                    <p>We have successfully analyzed <strong>{len(df_sample)}</strong> reviews.</p>
                    <p>
                        <a href="{dashboard_link}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
                            Open Dashboard
                        </a>
                    </p>
                    <p>Or <a href="{download_url}">download the raw CSV data</a>.</p>
                    <hr>
                    <p style="font-size: 12px; color: #666;">HorusCX VoC Intelligence Platform</p>
                </body>
            </html>
            """
            
            # Send to fixed email as per request
            target_email = "info@horuscx.com" 
            try:
                send_email_gmail(target_email, "VoC Analysis Complete - Dashboard Ready", email_body, email_html)
                email_sent = True
            except Exception as e:
                logger.error(f"Failed to send email: {e}")

        # Final Status Update (Completed)
        if job_id:
            update_analysis_status(
                job_id, 
                "completed", 
                "Analysis complete!", 
                len(df_sample), 
                len(df_sample),
                dashboard_link=dashboard_link,
                csv_download_url=download_url,
                s3_key=s3_key,
                s3_bucket=s3_bucket
            )
            
            # Clean up checkpoint after successful completion
            try:
                s3_client.delete_object(Bucket=s3_bucket, Key=get_checkpoint_key(job_id))
                logger.info(f"🧹 Removed checkpoint for {job_id} after success.")
            except Exception as e:
                logger.warning(f"Failed to delete checkpoint: {e}")

        
        return {
            "total_reviews": len(df),
            "analyzed_count": len(df_sample),
            "results": analyzed_results,
            "s3_bucket": s3_bucket,
            "s3_key": s3_key,
            "download_url": download_url,
            "dashboard_link": dashboard_link,
            "local_path": local_analyzed_path,
            "email_sent": email_sent
        }
        
    except NoCredentialsError:
        logger.error("❌ AWS credentials not found. Skipping S3 upload.")
        return {
            "total_reviews": len(df),
            "analyzed_count": len(df_sample),
            "results": analyzed_results,
            "local_path": local_analyzed_path,
            "error": "AWS credentials not configured"
        }
    except Exception as e:
        logger.error(f"❌ Error uploading to S3: {e}")
        error = e
        return {
            "total_reviews": len(df),
            "analyzed_count": len(df_sample),
            "results": analyzed_results,
            "local_path": local_analyzed_path,
            "error": str(e)
        }
        
    finally:
         if job_id and error: # Update status if we crashed out completely
             update_analysis_status(job_id, "error", str(error))
