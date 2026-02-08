import time
import json
import logging
import os
import sys

# Add the current directory to sys.path so we can import services
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from services.queue_service import QueueService
from services.fetch_reviews import run_scraper_service
from services.analyze_reviews import analyze_reviews

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("VoC-Worker")

SQS_QUEUE_URL = os.getenv("SQS_QUEUE_URL")
AWS_REGION = os.getenv("AWS_REGION", "me-central-1")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

def process_message(message_body):
    """
    Route message to appropriate service based on 'task_type'.
    """
    task_type = message_body.get("task_type")
    
    if task_type == "scraping":
        logger.info(f"🕸️ Processing SCRAPING task: {message_body.get('job_id')}")
        job_id = message_body.get("job_id")
        brands_list = message_body.get("brands_list")
        
        # Define a callback to log progress (since we don't have shared DB for status updates yet)
        def progress_callback(msg):
             logger.info(f"[Job {job_id}] {msg}")
             
        result = run_scraper_service(job_id, brands_list, progress_callback)
        logger.info(f"✅ Scraping completed. Result S3 Key: {result.get('s3_key')}")
        
    elif task_type == "analyze_website":
        logger.info(f"🔍 Processing WEBSITE ANALYSIS task: {message_body.get('job_id')}")
        job_id = message_body.get("job_id")
        website = message_body.get("website")
        
        # Load Gemini Key
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not gemini_key:
             logger.error("❌ Gemini API Key missing for website analysis")
             return

        try:
            from services.fetch_company_metadata import analyze_url
            import boto3
            
            # Execute Gemini analysis
            result = analyze_url(website, gemini_key)
            
            # Save to S3
            s3_bucket = os.getenv("S3_BUCKET_NAME")
            if s3_bucket:
                s3_key = f"analysis_results/{job_id}.json"
                s3 = boto3.client('s3', region_name=AWS_REGION)
                s3.put_object(
                    Bucket=s3_bucket,
                    Key=s3_key,
                    Body=json.dumps(result),
                    ContentType='application/json'
                )
                logger.info(f"✅ Website analysis saved to s3://{s3_bucket}/{s3_key}")
            else:
                 logger.error("❌ S3 Bucket not configured")
                 
        except Exception as e:
            logger.error(f"❌ Website analysis failed: {e}")

    elif task_type == "analysis":
        logger.info(f"🧠 Processing ANALYSIS task: {message_body.get('file_path')}")
        file_path = message_body.get("file_path")
        dimensions = message_body.get("dimensions")
        
        if not OPENAI_API_KEY:
            logger.error("❌ OpenAI API Key missing for analysis task")
            return

        result = analyze_reviews(file_path, dimensions, OPENAI_API_KEY)
        
        if result.get("error"):
            logger.error(f"❌ Analysis failed: {result.get('error')}")
        else:
            logger.info(f"✅ Analysis completed. Download URL: {result.get('download_url')}")
            
    else:
        logger.warning(f"⚠️ Unknown task type: {task_type}")

def main():
    if not SQS_QUEUE_URL:
        logger.error("❌ SQS_QUEUE_URL is not set. Exiting.")
        return

    queue_service = QueueService(region_name=AWS_REGION)
    logger.info(f"🚀 Worker started. Polling queue: {SQS_QUEUE_URL}")

    while True:
        try:
            messages = queue_service.receive_messages(
                queue_url=SQS_QUEUE_URL,
                max_messages=1,
                wait_time=20 # Long polling
            )

            for message in messages:
                try:
                    body = json.loads(message['Body'])
                    receipt_handle = message['ReceiptHandle']
                    
                    logger.info(f"📨 Received message: {message['MessageId']}")
                    process_message(body)
                    
                    # Delete message after successful processing
                    queue_service.delete_message(SQS_QUEUE_URL, receipt_handle)
                    
                except json.JSONDecodeError:
                    logger.error("❌ Failed to decode message body")
                    # Optionally delete invalid JSON messages to prevent loops, 
                    # but safer to let them dead-letter in production.
                except Exception as e:
                    logger.error(f"❌ Error processing message: {e}")
                    # Don't delete message so visibility timeout resets and it retries
                    
        except KeyboardInterrupt:
            logger.info("🛑 Worker stopping...")
            break
        except Exception as e:
            logger.error(f"❌ Worker loop error: {e}")
            time.sleep(5) # Backoff on error

if __name__ == "__main__":
    main()
