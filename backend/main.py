from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Union, Dict
from dotenv import load_dotenv
import os
import asyncio
import uuid
import pandas as pd
from datetime import datetime
import urllib.parse
import logging
import json

import boto3
from botocore.exceptions import NoCredentialsError

# Load environment variables immediately
load_dotenv()

# Services
from services.fetch_company_metadata import analyze_url
from services.discover_maps_locations import discover_maps_links
from services.fetch_app_ids import resolve_app_ids
from services.fetch_reviews import run_scraper_service
from services.analyze_reviews import generate_dimensions, analyze_reviews
from services.queue_service import QueueService

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "horus-voc-data")
AWS_REGION = os.getenv("AWS_REGION", "me-central-1")
SQS_QUEUE_URL = os.getenv("SQS_QUEUE_URL")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="VoC Backend")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory Job Store (for simplicity, use Redis/DB in prod)
# With Async worker, this will only track "submission" status locally unless we use a shared DB
JOBS = {}

# Ensure data directory exists
os.makedirs("data", exist_ok=True)

# Mount static files for CSV downloads
app.mount("/data", StaticFiles(directory="data"), name="data")

# Helper for Presigned URL
def generate_presigned_url(object_name, expiration=3600):
    # Configure client for me-central-1 with explicit endpoint and SigV4
    s3_client = boto3.client(
        's3', 
        region_name=AWS_REGION,
        endpoint_url=f"https://s3.{AWS_REGION}.amazonaws.com",
        config=boto3.session.Config(signature_version='s3v4')
    )
    try:
        response = s3_client.generate_presigned_url('get_object',
                                                    Params={'Bucket': S3_BUCKET_NAME,
                                                            'Key': object_name},
                                                    ExpiresIn=expiration)
        return response
    except Exception as e:
        logger.error(f"Error generating presigned URL: {e}")
        return None

# --- Pydantic Models ---
class WebsiteRequest(BaseModel):
    website: str

class MapsLocation(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    place_id: Optional[str] = None
    reviews_count: Optional[int] = None
    address: Optional[str] = None

class Company(BaseModel):
    company_name: Optional[str] = None
    # name field removed to avoid duplication. Frontend/Backend should use company_name.
    # Logic in scripts handles fallback if valid keys provided.
    website: Optional[str] = None
    description: Optional[str] = None
    android_id: Optional[str] = None
    apple_id: Optional[str] = None
    google_maps_links: Optional[List[Union[str, MapsLocation]]] = []
    is_main: Optional[bool] = False

class ScrapRequest(BaseModel):
    brands: List[Company]
    job_id: Optional[str] = None

# --- Endpoints ---

@app.get("/")
async def root():
    return {"message": "VoC Backend is running"}

@app.post("/api/analyze-website")
async def api_analyze_website(request: WebsiteRequest):
    job_id = str(uuid.uuid4())
    
    # Push to SQS
    if SQS_QUEUE_URL:
        try:
            queue_service = QueueService(region_name=AWS_REGION)
            message_body = {
                "task_type": "analyze_website",
                "job_id": job_id,
                "website": request.website
            }
            queue_service.send_message(SQS_QUEUE_URL, message_body)
            logger.info(f"✅ Website Analysis Job {job_id} pushed to SQS")
        except Exception as e:
            logger.error(f"❌ Failed to push to SQS: {e}")
            raise HTTPException(status_code=500, detail="Failed to queue job")
    else:
        # Fallback for local dev (synchronous if no queue - but we know user has queue)
        # For strict async compliance, we should error or warn. 
        # Given the timeout issue, we MUST use SQS.
        raise HTTPException(status_code=500, detail="SQS_QUEUE_URL not configured")
             
    return {"job_id": job_id, "status": "pending"}

@app.get("/api/check-status")
async def check_status(job_id: str):
    # 1. Check if it's a scraping job, analysis job, or discovery job
    # For simplicity, we check S3 for all patterns.
    
    s3_client = boto3.client('s3', region_name=AWS_REGION)
    
    # Path A: Website Analysis Result
    analysis_key = f"analysis_results/{job_id}.json"
    try:
        response = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=analysis_key)
        data = json.loads(response['Body'].read().decode('utf-8'))
        return {
            "status": "completed",
            "result": data
        }
    except s3_client.exceptions.NoSuchKey:
        pass # Not found, check next path
    except Exception as e:
        logger.error(f"Error checking analysis status: {e}")

    # Path B: Discovery Result (NEW)
    if job_id.startswith("discovery_"):
        discovery_key = f"discovery_results/{job_id}.json"
        try:
            response = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=discovery_key)
            data = json.loads(response['Body'].read().decode('utf-8'))
            return {
                "status": "completed",
                "result": data
            }
        except s3_client.exceptions.NoSuchKey:
             # Check for progress status
            try:
                progress_key = f"processing_status/{job_id}.json"
                response = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=progress_key)
                progress_data = json.loads(response['Body'].read().decode('utf-8'))
                return progress_data # {"status": "running", "message": "...", "job_id": ...}
            except:
                return {"status": "processing", "message": "Discovering locations..."}

        except Exception as e:
            logger.error(f"Error checking discovery status: {e}")
            return {"status": "error", "message": str(e)}

    # Path C: Scraping Job (Existing)
    # We check local JOBS dict first (legacy/local support) or S3
    job = JOBS.get(job_id)
    if not job:
        # Check S3 for scraping result
        s3_key = f"scrapped_data/{job_id}.csv"
        try:
            s3_client.head_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
            return {
                "status": "completed",
                "message": "Job finished (found in S3)",
                "s3_key": s3_key,
                "csv_download_url": generate_presigned_url(s3_key)
            }
        except:
             # Check for progress status
             try:
                progress_key = f"processing_status/{job_id}.json"
                response = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=progress_key)
                progress_data = json.loads(response['Body'].read().decode('utf-8'))
                return progress_data
             except:
                 # If neither found
                 return {"status": "pending", "message": "Job processing..."}
    
    # Refresh presigned URL if s3_key exists (from local JOBS cache)
    if job.get("s3_key"):
        url = generate_presigned_url(job["s3_key"])
        if url:
             job["csv_download_url"] = url
             
    return job

@app.post("/api/appids")
async def api_resolve_app_ids(companies: List[Company]):
    """
    Resolve Android and Apple App IDs for a list of companies.
    """
    try:
        # Convert Pydantic models to dicts for the service
        company_dicts = [company.dict() for company in companies]
        
        # Resolve app IDs using the service
        resolved = resolve_app_ids(company_dicts, OPENAI_API_KEY)
        
        # Convert back to Company models
        return [Company(**c) for c in resolved]
        
    except Exception as e:
        logger.error(f"Error resolving app IDs: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to resolve app IDs: {str(e)}")

@app.post("/api/scrap-reviews")
async def api_scrap_reviews(request: ScrapRequest):
    """
    Start scraping reviews for the given brands.
    Pushes job to SQS queue for async processing.
    """
    job_id = request.job_id or str(uuid.uuid4())
    
    # Convert companies to dict format
    brands_list = [brand.dict() for brand in request.brands]
    
    # Push to SQS
    if SQS_QUEUE_URL:
        try:
            queue_service = QueueService(region_name=AWS_REGION)
            message_body = {
                "task_type": "scraping",
                "job_id": job_id,
                "brands_list": brands_list
            }
            queue_service.send_message(SQS_QUEUE_URL, message_body)
            logger.info(f"✅ Scraping Job {job_id} pushed to SQS")
            
        except Exception as e:
            logger.error(f"❌ Failed to push scraping job to SQS: {e}")
            raise HTTPException(status_code=500, detail="Failed to queue scraping job")
    else:
        raise HTTPException(status_code=500, detail="SQS_QUEUE_URL not configured")
    
    return {"message": "Scraping started", "job_id": job_id}

@app.post("/api/discover-maps")
async def api_discover_maps(request: dict):
    """
    Start async discovery job for Google Maps locations.
    Returns job_id immediately for polling.
    """
    company_name = request.get("company_name")
    website = request.get("website")
    
    if not company_name:
        raise HTTPException(status_code=400, detail="company_name is required")
    
    # Generate job ID
    job_id = f"discovery_{company_name.replace(' ', '_')}_{str(uuid.uuid4())[:8]}"
    
    # Push to SQS
    if SQS_QUEUE_URL:
        try:
            queue_service = QueueService(region_name=AWS_REGION)
            message_body = {
                "task_type": "discover_locations",
                "job_id": job_id,
                "company_name": company_name,
                "website": website
            }
            queue_service.send_message(SQS_QUEUE_URL, message_body)
            logger.info(f"✅ Discovery Job {job_id} pushed to SQS")
            
        except Exception as e:
            logger.error(f"❌ Failed to push discovery job to SQS: {e}")
            raise HTTPException(status_code=500, detail="Failed to queue discovery job")
    else:
        raise HTTPException(status_code=500, detail="SQS_QUEUE_URL not configured")
    
    return {"job_id": job_id, "status": "processing"}

# --- Background Worker Function (Deprecated in Main, moved to worker.py) ---
# def process_scraping_job(job_id, brands_list): ...

@app.post("/api/scrapped-data")
async def api_scrapped_data2(request: dict):
    # n8n workflow "VoC Data Collection" -> trigger 1 of "VoC Analysis"
    # Expected payload via main flow: just needs s3_key or dimensions generation
    
    # Minimal implementation based on plan:
    # "Generates Analysis Dimensions using OpenAI"
    
    s3_key = request.get("s3_key")
    # For local dev, we might just look up job ID or file path
    # If s3_key is actually a job_id (from our file naming convention), let's use that.
    
    job_id = s3_key.replace("scrapped_data/", "").replace(".csv", "") if s3_key else None
    
    if not job_id and "job_id" in request:
        job_id = request["job_id"]
        
    # Read the data locally
    if job_id:
        file_path = f"data/{job_id}.csv" 
    else:
        # Fallback/Mock
        return {"error": "Missing job_id or s3_key"}
        
    try:
        # Read sample
        df = pd.read_csv(file_path)
        # Replace NaN/Infinity values for JSON serialization
        sample_df = df.sample(n=min(10, len(df))).fillna('').replace([float('inf'), float('-inf')], '')
        sample = sample_df.to_dict(orient='records')
        
        dimensions = generate_dimensions(sample, OPENAI_API_KEY)
        
        return {
            "message": "Dimensions generated",
            "body": { # replicating n8n structure slightly for frontend compatibility
                "dimensions": dimensions,
                "s3_bucket": "local", 
                "s3_key": file_path 
            }
        }
    except Exception as e:
        print(f"Error: {e}")
        return {"error": str(e)}

# def process_analysis_task(file_path, dimensions): ...

@app.post("/api/final-analysis")
async def api_final_analysis(request: dict):
    # Expected: { dimensions: [...], file_key: ... }
    dimensions = request.get("dimensions", [])
    file_key = request.get("file_key")
    
    if not file_key: 
        return {"error": "Missing file_key"}
    
    # Resolve file path/key logic
    # In async worker, we prefer S3 key or full link. 
    # If it's local path "data/...", worker needs access to it. 
    # Assuming worker has shared storage or we are using S3.
    # Deployment plan uses S3. So we should pass S3 key.
    
    # --- ASYNC CHANGE: Push to SQS ---
    if SQS_QUEUE_URL:
        try:
            queue_service = QueueService(region_name=AWS_REGION)
            message_body = {
                "task_type": "analysis",
                "file_path": file_key, # Worker must handle S3 download if it's an S3 key
                "dimensions": dimensions
            }
            queue_service.send_message(SQS_QUEUE_URL, message_body)
            logger.info(f"✅ Analysis Task pushed to SQS for {file_key}")
            
        except Exception as e:
            logger.error(f"❌ Failed to push to SQS: {e}")
            raise HTTPException(status_code=500, detail="Failed to queue analysis")
    else:
        raise HTTPException(status_code=500, detail="SQS_QUEUE_URL not configured")
    
    # Return immediately to unblock UI
    return {
        "status": "success",
        "message": "Analysis started in background (Async SQS)"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

