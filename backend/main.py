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



OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "horus-voc-data-storage-v2-eu")
AWS_REGION = os.getenv("AWS_REGION", "eu-central-1")



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
    # Configure client for eu-central-1 with explicit endpoint and SigV4
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

    except Exception as e:
        logger.error(f"Error generating presigned URL: {e}")
        return None

# --- Background Task Wrappers (Migrated from Worker) ---

def update_job_status(job_id: str, status: str, message: str, task_type: str="processing", **kwargs):
    """Helper to update job status in S3 for frontend polling"""
    try:
        s3 = boto3.client('s3', region_name=AWS_REGION)
        if S3_BUCKET_NAME:
            payload = {
                "status": status, 
                "message": message, 
                "job_id": job_id, 
                "task_type": task_type
            }
            # Add any extra metadata
            payload.update(kwargs)
            
            s3.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=f"processing_status/{job_id}.json",
                Body=json.dumps(payload),
                ContentType='application/json'
            )
    except Exception as e:
        logger.error(f"Failed to update status in S3 for {job_id}: {e}")

def task_analyze_website(job_id: str, website: str):
    logger.info(f"🔍 Starting Background Task: Website Analysis for {job_id}")
    update_job_status(job_id, "running", "Analyzing website content...")
    
    if not GEMINI_API_KEY:
        logger.error("❌ Gemini API Key missing")
        update_job_status(job_id, "error", "Server configuration error: Gemini Key missing")
        return

    try:
        result = analyze_url(website, GEMINI_API_KEY)
        
        # Save result
        s3 = boto3.client('s3', region_name=AWS_REGION)
        s3.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=f"analysis_results/{job_id}.json",
            Body=json.dumps(result),
            ContentType='application/json'
        )
        logger.info(f"✅ Website Analysis complete: {job_id}")
        
    except Exception as e:
        logger.error(f"❌ Website Analysis failed: {e}")
        update_job_status(job_id, "error", str(e))

def task_scrap_reviews(job_id: str, brands_list: List[Dict]):
    logger.info(f"🕸️ Starting Background Task: Scraping for {job_id}")
    update_job_status(job_id, "running", "Starting scraper...")
    
    def progress_callback(msg):
        logger.info(f"[Job {job_id}] {msg}")
        update_job_status(job_id, "running", msg)

    try:
        result = run_scraper_service(job_id, brands_list, progress_callback)
        logger.info(f"✅ Scraping completed. Result S3 Key: {result.get('s3_key')}")
        
        # Explicitly mark as completed in status tracking
        # Remove keys that might conflict with positional/keyword args
        result.pop("status", None)
        result.pop("message", None)
        
        update_job_status(
            job_id, 
            "completed", 
            "Scraping completed successfully!", 
            task_type="scraping",
            **result # This includes s3_key, summary, sample_reviews, etc.
        )
        
    except Exception as e:
        logger.error(f"❌ Scraping failed: {e}")
        update_job_status(job_id, "error", f"Scraping failed: {str(e)}")

def task_discover_locations(job_id: str, company_name: str, website: str):
    logger.info(f"🗺️ Starting Background Task: Discovery for {job_id}")
    update_job_status(job_id, "running", f"Discovering locations for {company_name}...")
    
    def progress_callback(msg):
        logger.info(f"[Job {job_id}] {msg}")
        update_job_status(job_id, "running", msg)

    try:
        locations = discover_maps_links(company_name, website, progress_callback=progress_callback)
        
        # Save result
        s3 = boto3.client('s3', region_name=AWS_REGION)
        s3.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=f"discovery_results/{job_id}.json",
            Body=json.dumps({"locations": locations}),
            ContentType='application/json'
        )
        logger.info(f"✅ Discovery complete: {job_id}")
    except Exception as e:
        logger.error(f"❌ Discovery failed: {e}")
        # Save error as result so frontend sees it
        try: 
            s3 = boto3.client('s3', region_name=AWS_REGION)
            s3.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=f"discovery_results/{job_id}.json",
                Body=json.dumps({"error": str(e), "locations": []}),
                ContentType='application/json'
            )
        except: pass

def task_final_analysis(job_id: str, file_key: str, dimensions: List[str]):
    logger.info(f"🧠 Starting Background Task: Final Analysis for {job_id} (File: {file_key})")
    # Can't easily update status for this one as usage pattern relies on analysis_results/ maybe?
    # The worker logic didn't seem to update "processing_status" for this, but notified completion via logs/result?
    # Actually worker logic for 'analysis' just ran analyze_reviews.
    
    if not OPENAI_API_KEY:
        logger.error("❌ OpenAI API Key missing")
        return

    try:
        # Pass job_id to allow status updates within the service
        result = analyze_reviews(file_key, dimensions, OPENAI_API_KEY, job_id=job_id)
        if result.get("error"):
            logger.error(f"❌ Analysis failed: {result.get('error')}")
        else:
            logger.info(f"✅ Analysis completed. Download URL: {result.get('download_url')}")
    except Exception as e:
        logger.error(f"❌ Analysis crashed: {e}")

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

@app.get("/api/proxy-csv")
async def proxy_csv(url: str):
    """
    Proxy to fetch CSV content from a URL to bypass CORS.
    """
    # URL might be very long due to pre-signed params, log it for debugging
    logger.info(f"🔗 Proxying request for URL: {url}")
    try:
        import requests
        from fastapi.responses import Response as FastApiResponse
        
        with requests.Session() as session:
            try:
                # Set a reasonable timeout and headers
                headers = {
                    "User-Agent": "Mozilla/5.0 (VoC-Backend-Proxy)"
                }
                response = session.get(url, timeout=30, headers=headers)
                
                if response.status_code != 200:
                    logger.error(f"❌ Source returned {response.status_code}. Body: {response.text[:500]}")
                    error_detail = f"Source returned {response.status_code}"
                    if "AccessDenied" in response.text or "ExpiredToken" in response.text:
                        error_detail = "S3 Link Expired or Access Denied"
                    raise HTTPException(status_code=response.status_code, detail=error_detail)
                
                # Return content with correct CSV type if applicable
                return FastApiResponse(
                    content=response.text, 
                    media_type="text/csv", 
                    headers={"Access-Control-Allow-Origin": "*"}
                )
                
            except requests.exceptions.Timeout:
                logger.error("❌ Request to source timed out")
                raise HTTPException(status_code=504, detail="Source request timed out")
            except requests.exceptions.RequestException as re:
                logger.error(f"❌ Request failed: {str(re)}")
                raise HTTPException(status_code=502, detail=f"Failed to reach source: {str(re)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Proxy internal error: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Proxy internal error: {str(e)}")

@app.post("/api/analyze-website")
async def api_analyze_website(request: WebsiteRequest, background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    
    # Add to background tasks
    background_tasks.add_task(task_analyze_website, job_id, request.website)
    logger.info(f"✅ Website Analysis Job {job_id} started in background")
             
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

    # Path B2: Analysis Job (NEW - Unified with Discovery/Generic S3 Status)
    # Check for processing_status first as it might be running
    try:
        progress_key = f"processing_status/{job_id}.json"
        response = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=progress_key)
        progress_data = json.loads(response['Body'].read().decode('utf-8'))
        
        # If it's completed, we might want to fetch the full result or just return this if it has the link
        # The analyze_reviews service writes "completed" status to this file too.
        # But for full result details (like the big JSON), we might check analysis_results/{job_id}.json if we saved it there?
        # analyze_reviews logic doesn't save full result to S3 as JSON, it saves CSV. 
        # But it returns dict. 
        # Generate presigned URL if s3_key is present in progress data
        if progress_data.get("s3_key"):
            url = generate_presigned_url(progress_data["s3_key"])
            if url:
                progress_data["csv_download_url"] = url
        
        return progress_data
    except Exception as e:
        # Not found or error -> fall through to other checks
        pass

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
async def api_scrap_reviews(request: ScrapRequest, background_tasks: BackgroundTasks):
    """
    Start scraping reviews for the given brands.
    """
    job_id = request.job_id or str(uuid.uuid4())
    
    # Convert companies to dict format
    brands_list = [brand.dict() for brand in request.brands]
    
    # Add to background tasks
    background_tasks.add_task(task_scrap_reviews, job_id, brands_list)
    logger.info(f"✅ Scraping Job {job_id} started in background")
    
    return {"message": "Scraping started", "job_id": job_id}

@app.post("/api/discover-maps")
async def api_discover_maps(request: dict, background_tasks: BackgroundTasks):
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
    
    # Add to background tasks
    background_tasks.add_task(task_discover_locations, job_id, company_name, website)
    logger.info(f"✅ Discovery Job {job_id} started in background")
    
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
        if os.path.exists(file_path):
            df = pd.read_csv(file_path)
        elif s3_key:
             # Fallback to S3
             logger.info(f"Local file {file_path} not found, reading from S3: {s3_key}")
             s3 = boto3.client('s3', region_name=AWS_REGION)
             obj = s3.get_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
             df = pd.read_csv(obj['Body'])
        else:
             raise FileNotFoundError(f"File not found locally ({file_path}) and no s3_key provided")
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
async def api_final_analysis(request: dict, background_tasks: BackgroundTasks):
    # Expected: { dimensions: [...], file_key: ... }
    dimensions = request.get("dimensions", [])
    file_key = request.get("file_key")
    
    if not file_key: 
        raise HTTPException(status_code=400, detail="Missing file_key")
    
    # Generate a job ID for tracking
    job_id = f"analysis_{str(uuid.uuid4())}"
    
    # Add to background tasks
    background_tasks.add_task(task_final_analysis, job_id, file_key, dimensions)
    logger.info(f"✅ Analysis Task {job_id} started in background for {file_key}")
    
    return {
        "status": "success",
        "message": "Analysis started in background",
        "job_id": job_id
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

