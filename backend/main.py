from fastapi import FastAPI, BackgroundTasks, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Union, Dict
from dotenv import load_dotenv
import os
import asyncio
import uuid
import pandas as pd
from datetime import datetime, timedelta
import urllib.parse
import logging
import json
import time

import boto3
import botocore
from botocore.exceptions import NoCredentialsError

# Load environment variables immediately
from pathlib import Path
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

# Services
from services.fetch_company_metadata import analyze_url
from services.discover_maps_locations import discover_maps_links
from services.fetch_app_ids import resolve_app_ids
from services.fetch_reviews import run_scraper_service
from services.analyze_reviews import generate_dimensions, analyze_reviews

# Database & Auth
from database import init_db, get_db, User, CompanyModel, Review, Dimension, get_user_limits, SessionLocal, Portfolio, user_portfolios, PortfolioInvitation
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_admin, is_admin_email
)
from services.email_service import send_invitation_email
from sqlalchemy.orm import Session
from sqlalchemy import or_, asc, desc, cast, Text, select



OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "horus-voc-data-storage-v2-eu")
AWS_REGION = os.getenv("AWS_REGION", "eu-central-1")



# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="VoC Backend")

# Debugging NameError
import database
print(f"DEBUG: database has PortfolioInvitation: {'PortfolioInvitation' in dir(database)}")
logger.info(f"DEBUG: database has PortfolioInvitation: {'PortfolioInvitation' in dir(database)}")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/debug/version")
def debug_version():
    return {
        "version": "v2", 
        "has_invitation": "PortfolioInvitation" in globals(),
        "database_has_invitation": "PortfolioInvitation" in dir(database)
    }

# Ensure data directory exists
os.makedirs("data", exist_ok=True)

# Mount static files for CSV downloads
app.mount("/data", StaticFiles(directory="data"), name="data")

def cleanup_old_files():
    """Removes files from the data/ directory that are older than 48 hours."""
    data_dir = "data"
    if not os.path.exists(data_dir):
        return

    now = time.time()
    retention_period = 48 * 3600  # 48 hours in seconds
    
    logger.info("🧹 Starting scheduled cleanup for old data files...")
    files_deleted = 0
    
    try:
        for filename in os.listdir(data_dir):
            file_path = os.path.join(data_dir, filename)
            if os.path.isfile(file_path):
                file_age = now - os.path.getmtime(file_path)
                if file_age > retention_period:
                    os.remove(file_path)
                    files_deleted += 1
                    logger.info(f"🗑️ Deleted old file: {filename}")
        
        if files_deleted > 0:
            logger.info(f"✅ Cleanup finished. {files_deleted} files removed.")
        else:
            logger.info("✅ Cleanup finished. No old files found.")
            
    except Exception as e:
        logger.error(f"❌ Error during file cleanup: {e}")

async def run_periodic_cleanup():
    """Background loop to run cleanup every 24 hours."""
    while True:
        cleanup_old_files()
        # Wait 24 hours (24 * 3600 seconds)
        await asyncio.sleep(24 * 3600)

@app.on_event("startup")
async def startup_event():
    # Initialize database tables
    init_db()
    logger.info("✅ Database initialized")
    # Start the periodic cleanup task in the background
    asyncio.create_task(run_periodic_cleanup())



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



# --- Background Task Wrappers (Migrated from Worker) ---
def update_job_status(job_id: str, status: str, message: str, task_type: str="processing", **kwargs):
    """Helper to update job status in S3. Lightweight meta in headers, full data in body."""
    try:
        s3 = boto3.client('s3', region_name=AWS_REGION)
        if S3_BUCKET_NAME:
            # S3 Metadata only accepts ASCII characters and has a 2KB limit. 
            # We only put the essential status tracking fields here.
            safe_message = str(message).encode('ascii', 'ignore').decode('ascii')
            metadata_headers = {
                'job_id': str(job_id),
                'status': str(status),
                'message': safe_message,
                'task_type': str(task_type)
            }
            
            # The JSON body can be as large as we want, and include all kwargs (like scraped brands list)
            full_data = {
                'job_id': job_id,
                'status': status,
                'message': message,
                'task_type': task_type
            }
            full_data.update(kwargs)
            
            s3.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=f"job_status/{job_id}",
                Body=json.dumps(full_data),
                Metadata=metadata_headers,
                ContentType='application/json'
            )
        logger.info(f"🔄 Job {job_id} status updated to: {status}")
    except Exception as e:
        logger.error(f"❌ Failed to update job status for {job_id}: {e}")

def check_portfolio_access(db: Session, user_id: int, portfolio_id: int):
    """
    Verifies that a user has access to a specific portfolio.
    Checks inside the user_portfolios association table.
    """
    has_access = db.execute(
        select(user_portfolios).where(
            user_portfolios.c.user_id == user_id,
            user_portfolios.c.portfolio_id == portfolio_id
        )
    ).first()
    
    if not has_access:
        logger.warning(f"🚫 Access Denied: User {user_id} tried to access Portfolio {portfolio_id}")
        raise HTTPException(status_code=403, detail="Access denied to this portfolio")
    
    portfolio = db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio
    try:
        s3 = boto3.client('s3', region_name=AWS_REGION)
        if S3_BUCKET_NAME:
            payload = {
                "status": status, 
                "message": message, 
                "job_id": job_id, 
                "task_type": task_type
            }
            payload.update(kwargs)
            
            # Map metadata to S3 headers (must be strings)
            metadata = {
                "status": str(status),
                "message": str(message),
                "task_type": str(task_type)
            }
            if kwargs.get("s3_key"):
                metadata["s3_key"] = str(kwargs["s3_key"])
            
            # Write to a centralized status key with metadata
            s3.put_object(
                Bucket=S3_BUCKET_NAME,
                Key=f"job_status/{job_id}",
                Body=json.dumps(payload),
                ContentType='application/json',
                Metadata=metadata
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
        
        # Initialize job configuration
        # result is a list where the first item is the main company
        job_config = {
            "job_id": job_id,
            "status": "pending",
            "created_at": datetime.utcnow().isoformat(),
            "brands": result # This contains main company and competitors
        }

        # Save to unified job_config prefix
        s3 = boto3.client('s3', region_name=AWS_REGION)
        s3.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=f"job_config/{job_id}.json",
            Body=json.dumps(job_config),
            ContentType='application/json'
        )
        # Optimization: Update centralized status with Metadata
        update_job_status(job_id, "completed", "Website Analysis complete", task_type="analysis")
        logger.info(f"✅ Website Analysis complete & Job Config initialized: {job_id}")
        
    except Exception as e:
        logger.error(f"❌ Website Analysis failed: {e}")
        update_job_status(job_id, "error", str(e))


def task_final_analysis(job_id: str, file_key: str, dimensions: List[dict], portfolio_id: int):
    """
    Background task to perform AI analysis on reviews.
    """
    if not OPENAI_API_KEY:
        logger.error("❌ OpenAI API Key missing")
        update_job_status(job_id, "error", "Server configuration error: OpenAI Key missing", task_type="analysis")
        return

    try:
        update_job_status(job_id, "running", "Starting AI analysis...", "analysis")
        
        # Call the analysis service
        analyze_reviews(file_key, dimensions, OPENAI_API_KEY, job_id, portfolio_id)
        
        update_job_status(job_id, "completed", "Analysis finished.", "analysis")
        
    except Exception as e:
        logger.error(f"❌ Analysis Task {job_id} failed: {e}")
        update_job_status(job_id, "failed", str(e), "analysis")


def trigger_auto_analysis(job_id: str, db_session: Session, portfolio_id: int, scraper_context: str = "Scrape"):
    """
    Shared helper to check if new reviews were saved for a job_id.
    If yes, fetches user dimensions and triggers the AI analysis background pipeline.
    Returns True if analysis was triggered, False otherwise.
    """
    from sqlalchemy import func
    new_reviews_count = db_session.query(func.count(Review.id)).filter(Review.job_id == job_id).scalar()
    
    if new_reviews_count > 0:
        logger.info(f"[{scraper_context}] Fetched {new_reviews_count} new reviews for portfolio {portfolio_id}. Checking for dimensions...")
        user_dimensions = db_session.query(Dimension).filter(Dimension.portfolio_id == portfolio_id).all()
        dimensions_list = [{"dimension": d.name, "description": d.description, "keywords": d.keywords} for d in user_dimensions]
        
        if dimensions_list:
            logger.info(f"Found {len(dimensions_list)} dimensions. Triggering auto-analysis for {job_id}.")
            update_job_status(job_id, "running", f"Scraping complete! Found {new_reviews_count} new reviews. Starting AI Analysis...")
            # Pass portfolio_id to the analysis task
            task_final_analysis(job_id=job_id, file_key=None, dimensions=dimensions_list, portfolio_id=portfolio_id)
            return True
        else:
            logger.info(f"No dimensions found for portfolio {portfolio_id}. Skipping auto-analysis.")
    else:
        logger.info(f"[{scraper_context}] No new reviews fetched for portfolio {portfolio_id} in job {job_id}.")
    
    return False

def task_scrap_reviews(job_id: str, brands: List[dict], portfolio_id: int):
    """
    Background task to scrap reviews for multiple brands and platforms.
    """
    try:
        update_job_status(job_id, "running", "Initializing scrapers...", "scraping")
        
        # Call the scraper service
        results = run_scraper_service(job_id, brands, progress_callback=None, portfolio_id=portfolio_id)
        
        # update_job_status will be called within run_scraper_service too
        update_job_status(job_id, "completed", "Scraping finished. Data available.", "scraping", brands=results)
        
    except Exception as e:
        logger.error(f"❌ Scraping Task {job_id} failed: {e}")
        update_job_status(job_id, "failed", str(e), "scraping")

def task_discover_locations(job_id: str, company_name: str, website: str, session_id: Optional[str] = None):
    logger.info(f"🗺️ Starting Background Task: Discovery for {job_id} (Session: {session_id})")
    update_job_status(job_id, "running", f"Discovering locations for {company_name}...")
    
    def progress_callback(msg):
        logger.info(f"[Job {job_id}] {msg}")
        update_job_status(job_id, "running", msg)

    try:
        locations = discover_maps_links(company_name, website, progress_callback=progress_callback)
        
        # 1. Update status tracking for the specific discovery job
        update_job_status(
            job_id, 
            "completed", 
            "Discovery completed!", 
            task_type="discovery",
            result={"locations": locations} # Matches frontend expectation
        )

        # 2. If part of a session, update unified job_config
        if session_id:
            s3 = boto3.client('s3', region_name=AWS_REGION)
            try:
                response = s3.get_object(Bucket=S3_BUCKET_NAME, Key=f"job_config/{session_id}.json")
                job_config = json.loads(response['Body'].read().decode('utf-8'))
                
                # Find the company in the brands list and update its locations
                for brand in job_config.get("brands", []):
                    # Robust check: case insensitive or fallback to website
                    b_name = brand.get("company_name") or brand.get("name")
                    if b_name == company_name:
                        brand["google_maps_links"] = locations
                        break
                
                s3.put_object(
                    Bucket=S3_BUCKET_NAME,
                    Key=f"job_config/{session_id}.json",
                    Body=json.dumps(job_config),
                    ContentType='application/json'
                )
                logger.info(f"✅ Discovery complete & Job Config updated for session: {session_id}")
            except s3.exceptions.NoSuchKey:
                logger.warning(f"⚠️ Session job config not found for {session_id}")
            except Exception as e:
                logger.error(f"❌ Failed to update session config: {e}")
                
    except Exception as e:
        logger.error(f"❌ Discovery failed for {job_id}: {e}")
        update_job_status(job_id, "error", str(e))

def task_final_analysis(job_id: str, file_key: str, dimensions: List[str], portfolio_id: int = None):
    logger.info(f"🧠 Starting Background Task: Final Analysis for {job_id} (File: {file_key})")
    
    # Update status to running immediately
    update_job_status(job_id, "running", "Initializing analysis...", task_type="analysis")

    if not OPENAI_API_KEY:
        logger.error("❌ OpenAI API Key missing")
        update_job_status(job_id, "error", "Server configuration error: OpenAI Key missing", task_type="analysis")
        return

    try:
        # Pass job_id and portfolio_id to allow status updates within the service
        result = analyze_reviews(file_key, dimensions, OPENAI_API_KEY, portfolio_id, job_id=job_id)
        if result.get("error"):
            logger.error(f"❌ Analysis failed: {result.get('error')}")
            update_job_status(job_id, "error", result.get('error'), task_type="analysis")
        else:
            logger.info(f"✅ Analysis completed. Download URL: {result.get('download_url')}")
            # analyze_reviews already updates status to completed
    except Exception as e:
        logger.error(f"❌ Analysis crashed: {e}")
        update_job_status(job_id, "error", f"Analysis crashed: {str(e)}", task_type="analysis")

def task_reanalyze_all(portfolio_id: int):
    """
    Background task to re-analyze all reviews for a specific portfolio.
    Used when dimensions are changed.
    """
    logger.info(f"🔄 Starting Background Task: Re-analyzing all reviews for portfolio {portfolio_id}")
    
    db_session: Session = SessionLocal()
    try:
        # 1. Fetch current dimensions for the portfolio
        user_dimensions = db_session.query(Dimension).filter(Dimension.portfolio_id == portfolio_id).all()
        dimensions_list = [{"dimension": d.name, "description": d.description, "keywords": d.keywords} for d in user_dimensions]
        
        if not user_dimensions:
            logger.warning(f"No dimensions found for portfolio {portfolio_id}. Cannot re-analyze.")
            return

        # 2. Get all distinct job_ids for this portfolio's reviews
        job_ids = db_session.query(Review.job_id).filter(Review.portfolio_id == portfolio_id).distinct().all()
        
        # 3. Clear existing analysis data (set to NULL)
        db_session.query(Review).filter(Review.portfolio_id == portfolio_id).update({
            "sentiment": None,
            "emotion": None,
            "confidence": None,
            "topics": None,
            "analyzed_at": None
        }, synchronize_session=False)
        db_session.commit()
        logger.info(f"Cleared existing analysis data for portfolio {portfolio_id}")
        
        # 4. Trigger re-analysis for each job_id sequentially
        for (job_id,) in job_ids:
            # Clear S3 checkpoints for this analysis job
            from services.analyze_reviews import get_checkpoint_key
            s3_client = boto3.client('s3', region_name=AWS_REGION)
            analysis_job_id = f"analysis_{job_id}"
            try:
                s3_client.delete_object(Bucket=S3_BUCKET_NAME, Key=get_checkpoint_key(analysis_job_id))
            except Exception:
                pass # Checkpoint might not exist, ignore error
            
            logger.info(f"Triggering re-analysis for job: {job_id}")
            # file_path=None because analyze_reviews fetches from DB based on job_id
            task_final_analysis(job_id=analysis_job_id, file_key=None, dimensions=dimensions_list, portfolio_id=portfolio_id)
            
        logger.info(f"✅ Re-analysis triggered for {len(job_ids)} jobs in portfolio {portfolio_id}")

    except Exception as e:
        logger.error(f"Error preparing re-analysis for portfolio {portfolio_id}: {e}")
    finally:
        db_session.close()

def task_sync_latest_reviews(portfolio_id: int):
    """
    Background task to automatically fetch and analyze latest reviews for all companies in a portfolio.
    """
    logger.info(f"🔄 Starting Background Task: Auto-sync latest reviews for portfolio {portfolio_id}")
    
    db_session: Session = SessionLocal()
    try:
        from sqlalchemy import func
        
        # 1. Check if we synced recently (e.g., last 1 hour)
        latest_fetch = db_session.query(func.max(Review.created_at)).filter(Review.portfolio_id == portfolio_id).scalar()
        
        if latest_fetch and (datetime.utcnow() - latest_fetch).total_seconds() < 3600:
            logger.info(f"Skipping auto-sync for portfolio {portfolio_id}, last sync was {latest_fetch}")
            return
            
        # 2. Fetch companies for the portfolio
        user_companies = db_session.query(CompanyModel).filter(CompanyModel.portfolio_id == portfolio_id).all()
        if not user_companies:
            logger.info(f"No companies found for portfolio {portfolio_id}. Skipping auto-sync.")
            return
        
        brands_list = [c.to_dict() for c in user_companies]
        
        job_id = f"auto_sync_{user_id}_{int(datetime.utcnow().timestamp())}"
        
        # 1. Scrape only new reviews (handled by run_scraper_service fetching dates internally)
        result = run_scraper_service(job_id, brands_list, progress_callback=None, user_id=user_id)
        
        # 2. Check if anything was actually added/analyzed and trigger AI Auto-Analysis
        trigger_auto_analysis(user_id, job_id, db_session, scraper_context="Auto-Sync")

    except Exception as e:
        logger.error(f"Error in auto-sync for user {user_id}: {e}")
    finally:
        db_session.close()

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
    website: Optional[str] = None
    description: Optional[str] = None
    android_id: Optional[str] = None
    apple_id: Optional[str] = None
    google_maps_links: Optional[List[Union[str, MapsLocation]]] = []
    trustpilot_link: Optional[str] = None
    is_main: Optional[bool] = False

class ScrapRequest(BaseModel):
    brands: List[Company]
    job_id: Optional[str] = None
    portfolio_id: int

class UpdateJobConfigRequest(BaseModel):
    job_id: str
    brands: List[Company]

# Auth Pydantic Models
class SignupRequest(BaseModel):
    email: str
    password: str = Field(min_length=6)

class LoginRequest(BaseModel):
    email: str
    password: str

class CompanyCreateRequest(BaseModel):
    company_name: str
    website: Optional[str] = None
    description: Optional[str] = None
    android_id: Optional[str] = None
    apple_id: Optional[str] = None
    google_maps_links: Optional[List[Union[str, dict]]] = []
    trustpilot_link: Optional[str] = None
    is_main: Optional[bool] = False
    portfolio_id: Optional[int] = None

class CompanyUpdateRequest(BaseModel):
    company_name: Optional[str] = None
    website: Optional[str] = None
    description: Optional[str] = None
    android_id: Optional[str] = None
    apple_id: Optional[str] = None
    google_maps_links: Optional[List[Union[str, dict]]] = None
    trustpilot_link: Optional[str] = None
    is_main: Optional[bool] = None
    portfolio_id: Optional[int] = None

class DimensionCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    keywords: Optional[List[str]] = []
    portfolio_id: Optional[int] = None

class DimensionUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    keywords: Optional[List[str]] = None
    portfolio_id: Optional[int] = None

class PortfolioCreateRequest(BaseModel):
    name: str

class PortfolioUpdateRequest(BaseModel):
    name: Optional[str] = None

class InvitationRequest(BaseModel):
    email: EmailStr

class AcceptInvitationRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    token: str

# --- Endpoints ---

# ==========================================
# AUTH ENDPOINTS
# ==========================================

@app.post("/api/auth/signup")
def auth_signup(request: SignupRequest, db: Session = Depends(get_db)):
    """Register a new user. Role is 'admin' if email is in admin list, otherwise 'free'."""
    email = request.email.lower().strip()
    
    # Check if user already exists
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Determine role
    role = "admin" if is_admin_email(email) else "free"
    
    # Create user
    user = User(
        email=email,
        password=hash_password(request.password),
        role=role
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    logger.info(f"✅ New user registered: {email} (role: {role})")
    return {"message": "Account created successfully", "role": role}


@app.post("/api/auth/login")
def auth_login(request: LoginRequest, db: Session = Depends(get_db)):
    """Login and receive a JWT token."""
    email = request.email.lower().strip()
    
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(request.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_access_token({"sub": str(user.id), "email": user.email, "role": user.role})
    
    logger.info(f"✅ User logged in: {email}")
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": user.to_dict()
    }


@app.get("/api/auth/me")
def auth_me(current_user: User = Depends(get_current_user)):
    """Get current user info and their limits."""
    limits = get_user_limits(current_user.role)
    return {
        **current_user.to_dict(),
        "limits": limits
    }


# ==========================================
# PORTFOLIO CRUD ENDPOINTS
# ==========================================

@app.get("/api/portfolios")
def list_portfolios(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """List all portfolios for the current user."""
    return [p.to_dict() for p in current_user.portfolios]


@app.post("/api/portfolios")
def create_portfolio(request: PortfolioCreateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create a new portfolio and associate it with the current user."""
    limits = get_user_limits(current_user.role)
    if limits["max_portfolios"] is not None:
        if len(current_user.portfolios) >= limits["max_portfolios"]:
            raise HTTPException(
                status_code=403,
                detail=f"Plan limit reached: maximum {limits['max_portfolios']} portfolio(s) allowed. Upgrade for more."
            )

    portfolio = Portfolio(name=request.name)
    db.add(portfolio)
    db.flush() # Get ID
    
    # Associate user
    current_user.portfolios.append(portfolio)
    db.commit()
    db.refresh(portfolio)
    
    logger.info(f"✅ Portfolio created: '{portfolio.name}' for user {current_user.email}")
    return portfolio.to_dict()


@app.put("/api/portfolios/{portfolio_id}")
def update_portfolio(portfolio_id: int, request: PortfolioUpdateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update a portfolio name."""
    portfolio = check_portfolio_access(db, current_user.id, portfolio_id)
    
    if request.name:
        portfolio.name = request.name
        portfolio.updated_at = datetime.utcnow()
        db.commit()
    
    return portfolio.to_dict()


@app.delete("/api/portfolios/{portfolio_id}")
def delete_portfolio(portfolio_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a portfolio."""
    portfolio = check_portfolio_access(db, current_user.id, portfolio_id)
    
    db.delete(portfolio)
    db.commit()
    
    logger.info(f"🗑️ Portfolio deleted: '{portfolio.name}' by user {current_user.email}")
    return {"message": "Portfolio deleted successfully"}


# ==========================================
# PORTFOLIO INVITATION ENDPOINTS
# ==========================================

@app.post("/api/portfolios/{portfolio_id}/invite")
async def invite_to_portfolio(
    portfolio_id: int, 
    request: InvitationRequest, 
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """Invite a user to a portfolio via email."""
    try:
        portfolio = check_portfolio_access(db, current_user.id, portfolio_id)
        
        email = request.email.lower().strip()
        
        # Check if user is already in the portfolio
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user and portfolio in existing_user.portfolios:
            raise HTTPException(status_code=400, detail="User already has access to this portfolio")
        
        # Generate unique token
        token = str(uuid.uuid4())
        expires_at = datetime.utcnow() + timedelta(hours=48)
        
        # Save invitation
        invitation = PortfolioInvitation(
            email=email,
            portfolio_id=portfolio_id,
            token=token,
            status="pending",
            invited_by_id=current_user.id,
            expires_at=expires_at
        )
        db.add(invitation)
        db.commit()
        
        # Trigger email in background
        # Update this with your actual frontend URL
        invite_link = f"http://localhost:3000/invite/accept?token={token}&email={email}"
        background_tasks.add_task(send_invitation_email, email, portfolio.name, invite_link)
        
        logger.info(f"✉️ Invitation sent to {email} for portfolio '{portfolio.name}'")
        return {"message": "Invitation sent successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"❌ Error in invite_to_portfolio: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/invitations/{token}")
def get_invitation(token: str, db: Session = Depends(get_db)):
    """Verify an invitation token and return details."""
    invitation = db.query(PortfolioInvitation).filter(PortfolioInvitation.token == token).first()
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    if invitation.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invitation has expired")
    
    return {
        "email": invitation.email,
        "portfolio_name": invitation.portfolio.name
    }


@app.post("/api/invitations/accept")
def accept_invitation(request: AcceptInvitationRequest, db: Session = Depends(get_db)):
    """Accept an invitation, create user if needed, and link to portfolio."""
    invitation = db.query(PortfolioInvitation).filter(PortfolioInvitation.token == request.token).first()
    
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation not found")
    
    if invitation.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invitation has expired")
    
    if invitation.email != request.email:
        raise HTTPException(status_code=400, detail="Email mismatch")
    
    # Check if user exists
    user = db.query(User).filter(User.email == request.email).first()
    if not user:
        # Create new user
        role = "admin" if is_admin_email(request.email) else "free"
        user = User(
            email=request.email,
            password=hash_password(request.password),
            role=role
        )
        db.add(user)
        db.flush()
    
    # Associate user with portfolio if not already
    portfolio = invitation.portfolio
    if portfolio not in user.portfolios:
        user.portfolios.append(portfolio)
    
    # Delete invitation
    db.delete(invitation)
    db.commit()
    
    # Generate token for immediate login
    access_token = create_access_token({"sub": str(user.id), "email": user.email, "role": user.role})
    
    logger.info(f"✅ Invitation accepted by {user.email} for portfolio '{portfolio.name}'")
    return {
        "message": "Invitation accepted successfully",
        "access_token": access_token,
        "token_type": "bearer",
        "user": user.to_dict()
    }


@app.get("/api/portfolios/{portfolio_id}/members")
def list_portfolio_members(
    portfolio_id: int, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """List all current members and pending invitations for a portfolio."""
    portfolio = check_portfolio_access(db, current_user.id, portfolio_id)
    
    # Get current members
    members = [u.to_dict() for u in portfolio.users]
    
    # Get pending invitations
    invitations = db.query(PortfolioInvitation).filter(
        PortfolioInvitation.portfolio_id == portfolio_id,
        PortfolioInvitation.status == "pending"
    ).all()
    
    return {
        "members": members,
        "invitations": [i.to_dict() for i in invitations]
    }


# ==========================================
# COMPANY CRUD ENDPOINTS
# ==========================================

@app.get("/api/companies")
async def api_get_companies(portfolio_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all companies for a user, filtered by portfolio."""
    check_portfolio_access(db, current_user.id, portfolio_id)
    
    companies = db.query(CompanyModel).filter(
        CompanyModel.portfolio_id == portfolio_id
    ).all()
    return [c.to_dict() for c in companies]

@app.post("/api/companies")
async def api_create_company(request: CompanyCreateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Add a new company/competitor to a portfolio."""
    check_portfolio_access(db, current_user.id, request.portfolio_id)
    
    # Check limit for portfolio
    limits = get_user_limits(current_user.role)
    if limits["max_companies"]:
        existing_count = db.query(CompanyModel).filter(CompanyModel.portfolio_id == request.portfolio_id).count()
        if existing_count >= limits["max_companies"]:
            raise HTTPException(status_code=403, detail=f"Company limit reached for your plan ({limits['max_companies']})")
            
    new_company = CompanyModel(
        company_name=request.company_name,
        website=request.website,
        description=request.description,
        android_id=request.android_id,
        apple_id=request.apple_id,
        google_maps_links=request.google_maps_links,
        trustpilot_link=request.trustpilot_link,
        portfolio_id=request.portfolio_id,
        is_main=request.is_main
    )
    db.add(new_company)
    db.commit()
    db.refresh(new_company)
    return new_company.to_dict()


@app.put("/api/companies/{company_id}")
def update_company(company_id: int, request: CompanyUpdateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update a company's details."""
    db_company = db.query(CompanyModel).filter(CompanyModel.id == company_id).first()
    if not db_company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    check_portfolio_access(db, current_user.id, db_company.portfolio_id)
    
    # Update fields
    update_data = request.dict(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            setattr(db_company, key, value)
    
    db_company.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_company)
    return db_company.to_dict()


@app.delete("/api/companies/{company_id}")
def delete_company(company_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a company."""
    db_company = db.query(CompanyModel).filter(CompanyModel.id == company_id).first()
    if not db_company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    check_portfolio_access(db, current_user.id, db_company.portfolio_id)
    
    db.delete(db_company)
    db.commit()
    return {"message": "Company deleted"}


# ==========================================
# DIMENSION CRUD ENDPOINTS
# ==========================================

@app.get("/api/dimensions")
async def api_get_dimensions(portfolio_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """List all dimensions for a portfolio."""
    check_portfolio_access(db, current_user.id, portfolio_id)
    
    dimensions = db.query(Dimension).filter(
        Dimension.portfolio_id == portfolio_id
    ).all()
    return [d.to_dict() for d in dimensions]


@app.post("/api/dimensions")
async def api_create_dimension(request: DimensionCreateRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Create a new dimension for a portfolio."""
    portfolio_id = request.portfolio_id
    if not portfolio_id:
        if not current_user.portfolios:
             raise HTTPException(status_code=400, detail="User has no portfolios.")
        portfolio_id = current_user.portfolios[0].id
        
    check_portfolio_access(db, current_user.id, portfolio_id)
    
    new_dim = Dimension(
        name=request.name,
        description=request.description,
        keywords=request.keywords or [],
        portfolio_id=portfolio_id
    )
    db.add(new_dim)
    db.commit()
    db.refresh(new_dim)
    return new_dim.to_dict()


@app.put("/api/dimensions/{dimension_id}")
def update_dimension(dimension_id: int, request: DimensionUpdateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Update an existing dimension."""
    dimension = db.query(Dimension).filter(
        Dimension.id == dimension_id,
        Dimension.user_id == current_user.id
    ).first()
    
    if not dimension:
        raise HTTPException(status_code=404, detail="Dimension not found")
    
    # Update only provided fields
    update_data = request.dict(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            setattr(dimension, key, value)
    
    dimension.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(dimension)
    
    return dimension.to_dict()


@app.delete("/api/dimensions/{dim_id}")
async def api_delete_dimension(dim_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Delete a dimension."""
    dim = db.query(Dimension).filter(Dimension.id == dim_id).first()
    if not dim:
        raise HTTPException(status_code=404, detail="Dimension not found")
        
    check_portfolio_access(db, current_user.id, dim.portfolio_id)
    
    db.delete(dim)
    db.commit()
    return {"message": "Dimension deleted"}

@app.post("/api/dimensions/reanalyze")
async def reanalyze_reviews(portfolio_id: int, background_tasks: BackgroundTasks, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Trigger background re-analysis of all reviews for a portfolio."""
    check_portfolio_access(db, current_user.id, portfolio_id)
    
    background_tasks.add_task(task_reanalyze_all, portfolio_id)
    return {"message": "Re-analysis started in background"}

# ==========================================
# ORIGINAL ENDPOINTS (below)
# ==========================================

@app.get("/")
async def root():
    return {"message": "VoC Backend is running"}

@app.get("/api/proxy-csv")
async def proxy_csv(url: str, current_user: User = Depends(get_current_user)):
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
async def api_analyze_website(request: WebsiteRequest, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    job_id = str(uuid.uuid4())
    
    # Add to background tasks
    background_tasks.add_task(task_analyze_website, job_id, request.website)
    logger.info(f"✅ Website Analysis Job {job_id} started in background")
             
    return {"job_id": job_id, "status": "pending"}

@app.get("/api/check-status")
def check_status(job_id: str, current_user: User = Depends(get_current_user)):
    """Optimized status check using S3 Object Metadata (Single HEAD request)"""
    s3_client = boto3.client('s3', region_name=AWS_REGION)
    status_key = f"job_status/{job_id}"
    
    try:
        # Optimization: Use head_object to get metadata without downloading the body
        response = s3_client.head_object(Bucket=S3_BUCKET_NAME, Key=status_key)
        metadata = response.get('Metadata', {})
        
        status = metadata.get('status', 'pending')
        message = metadata.get('message', 'Processing...')
        
        if status == "completed":
            # If completed, we need the result data (brands or file key)
            obj_response = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=status_key)
            data = json.loads(obj_response['Body'].read().decode('utf-8'))
            
            # Check for linked unified config if this was an analysis job
            if metadata.get('task_type') == "analysis":
                try:
                    config_resp = s3_client.get_object(Bucket=S3_BUCKET_NAME, Key=f"job_config/{job_id}.json")
                    config_data = json.loads(config_resp['Body'].read().decode('utf-8'))
                    return {
                        "status": "completed",
                        "result": config_data.get("brands", config_data)
                    }
                except:
                    pass
            
            # Handle s3_key/download_url for scraping jobs
            if data.get("s3_key"):
                url = generate_presigned_url(data["s3_key"])
                data["csv_download_url"] = url
            
            return {
                "status": "completed",
                **data
            }
            
        return {
            "status": status,
            "message": message,
            "job_id": job_id,
            "task_type": metadata.get('task_type', 'unknown')
        }
        
    except botocore.exceptions.ClientError as e:
        if e.response['Error']['Code'] == '404':
            return {"status": "pending", "message": "Job initializing..."}
        logger.error(f"Error checking status for {job_id}: {e}")
        return {"status": "pending", "message": "Fetching status..."}
    except Exception as e:
        logger.error(f"Error checking status for {job_id}: {e}")
        return {"status": "pending", "message": "Fetching status..."}

@app.post("/api/appids")
async def api_resolve_app_ids(companies: List[Company], current_user: User = Depends(get_current_user)):
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
async def api_scrap_reviews(request: ScrapRequest, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Start scraping reviews for the given brands.
    Saves or updates the companies in the database for the given portfolio.
    """
    check_portfolio_access(db, current_user.id, request.portfolio_id)
    job_id = request.job_id or str(uuid.uuid4())
    
    # 1. Fetch current companies for portfolio to check limits and manage upsert
    user_companies = db.query(CompanyModel).filter(CompanyModel.portfolio_id == request.portfolio_id).all()
    user_company_map = {c.company_name: c for c in user_companies}
    
    limits = get_user_limits(current_user.role)
    new_company_count = 0
    
    for brand in request.brands:
        if brand.company_name and brand.company_name not in user_company_map:
            new_company_count += 1
            
    # Check limits if applicable
    if limits["max_companies"] is not None:
        if len(user_companies) + new_company_count > limits["max_companies"]:
             raise HTTPException(
                status_code=403,
                detail=f"Plan limit reached: maximum {limits['max_companies']} companies allowed per portfolio."
            )
            
    # 2. Iterate and upsert the brands to the database
    for brand in request.brands:
        if not brand.company_name:
            continue
            
        maps_links = []
        if brand.google_maps_links:
            # handle serialization of generic types into dicts for JSON column
            maps_links = [link.dict() if hasattr(link, 'dict') else link for link in brand.google_maps_links]
            
        # Update existing
        if brand.company_name in user_company_map:
            db_company = user_company_map[brand.company_name]
            db_company.website = brand.website or db_company.website
            db_company.description = brand.description or db_company.description
            db_company.android_id = brand.android_id or db_company.android_id
            db_company.apple_id = brand.apple_id or db_company.apple_id
            db_company.google_maps_links = maps_links or db_company.google_maps_links
            db_company.trustpilot_link = brand.trustpilot_link or db_company.trustpilot_link
            db_company.is_main = brand.is_main if brand.is_main is not None else db_company.is_main
            db_company.updated_at = datetime.utcnow()
        # Insert new
        else:
            db_company = CompanyModel(
                company_name=brand.company_name,
                website=brand.website,
                description=brand.description,
                android_id=brand.android_id,
                apple_id=brand.apple_id,
                google_maps_links=maps_links,
                trustpilot_link=brand.trustpilot_link,
                portfolio_id=request.portfolio_id,
                is_main=brand.is_main if brand.is_main is not None else False
            )
            db.add(db_company)
            # add to map so duplicates in the same request don't cause double inserts
            user_company_map[brand.company_name] = db_company
            
    db.commit()
    logger.info(f"💾 Updated company database for user {current_user.email}")
    
    # Convert companies to dict format
    brands_list = [brand.dict() for brand in request.brands]
    
    # Add to background tasks
    # 3. Add background task for scraping & subsequent analysis
    background_tasks.add_task(task_scrap_reviews, job_id, [b.dict() for b in request.brands], request.portfolio_id)
    logger.info(f"✅ Scraping Job {job_id} started in background (Portfolio: {request.portfolio_id})")
    
    return {"message": "Scraping started", "job_id": job_id}

@app.post("/api/update-job-metadata")
def api_update_job_metadata_manual(request: UpdateJobConfigRequest, current_user: User = Depends(get_current_user)):
    """
    Updates the unified job configuration in S3.
    Used for saving resolved App IDs or manual user edits.
    """
    job_id = request.job_id
    try:
        s3 = boto3.client('s3', region_name=AWS_REGION)
        
        # Try to load existing config to preserve metadata like created_at
        try:
            response = s3.get_object(Bucket=S3_BUCKET_NAME, Key=f"job_config/{job_id}.json")
            job_config = json.loads(response['Body'].read().decode('utf-8'))
        except s3.exceptions.NoSuchKey:
            job_config = {"job_id": job_id, "created_at": datetime.utcnow().isoformat()}

        # Update brands (which includes app IDs)
        job_config["brands"] = [brand.dict() for brand in request.brands]
        job_config["updated_at"] = datetime.utcnow().isoformat()

        s3.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=f"job_config/{job_id}.json",
            Body=json.dumps(job_config),
            ContentType='application/json'
        )
        logger.info(f"✅ Job Config updated for {job_id}")
        return {"status": "success", "message": "Job config updated"}
    except Exception as e:
        logger.error(f"❌ Failed to update job config: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/discover-maps")
async def api_discover_maps(request: dict, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    """
    Start async discovery job for Google Maps locations.
    Returns job_id immediately for polling.
    """
    company_name = request.get("company_name")
    website = request.get("website")
    session_id = request.get("job_id")  # Can be passed as job_id or session_id
    
    if not company_name:
        raise HTTPException(status_code=400, detail="company_name is required")
    
    if not os.getenv("DATAFORSEO_LOGIN") or not os.getenv("DATAFORSEO_PASSWORD"):
        raise HTTPException(status_code=500, detail="DataForSEO credentials (DATAFORSEO_LOGIN/PASSWORD) are missing in the environment.")
    
    # Generate unique Discovery Job ID
    discovery_job_id = f"discovery_{company_name.replace(' ', '_')}_{str(uuid.uuid4())[:8]}"
    
    # Add to background tasks
    background_tasks.add_task(task_discover_locations, discovery_job_id, company_name, website, session_id)
    logger.info(f"✅ Discovery Job {discovery_job_id} started (Session: {session_id})")
    
    return {"job_id": discovery_job_id, "status": "processing"}

@app.get("/api/user/reviews")
async def get_user_reviews(
    portfolio_id: int,
    brand: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all reviews from database for a portfolio."""
    check_portfolio_access(db, current_user.id, portfolio_id)
    query = db.query(Review).filter(Review.portfolio_id == portfolio_id)
    
    if brand:
        query = query.filter(Review.brand == brand)
    if start_date:
        query = query.filter(Review.date >= start_date)
    if end_date:
        query = query.filter(Review.date <= end_date)
        
    reviews = query.all()
    return [r.to_dict() for r in reviews]


@app.get("/api/user/reviews/paginated")
async def get_user_reviews_paginated(
    portfolio_id: int,
    page: int = 1,
    page_size: int = 50,
    sort_field: Optional[str] = "date",
    sort_order: Optional[str] = "desc",
    search: Optional[str] = None,
    brand: Optional[str] = None,
    platform: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get paginated reviews for a portfolio."""
    check_portfolio_access(db, current_user.id, portfolio_id)
    query = db.query(Review).filter(Review.portfolio_id == portfolio_id)
    
    if brand and brand != "all":
        query = query.filter(Review.brand == brand)
    if platform and platform != "all":
        query = query.filter(Review.platform.ilike(f"%{platform}%"))
    if start_date:
        query = query.filter(Review.date >= start_date)
    if end_date:
        query = query.filter(Review.date <= end_date)
        
    if search:
        search_term = f"%{search}%"
        # Search in text, brand, platform, and JSON topics casted as text
        query = query.filter(
            or_(
                Review.text.ilike(search_term),
                Review.brand.ilike(search_term),
                Review.platform.ilike(search_term),
                cast(Review.topics, Text).ilike(search_term)
            )
        )
        
    total_count = query.count()
    
    # Sorting
    if sort_field == "date":
        query = query.order_by(desc(Review.date) if sort_order == "desc" else asc(Review.date))
    elif sort_field == "rating":
        query = query.order_by(desc(Review.rating) if sort_order == "desc" else asc(Review.rating))
    elif sort_field == "sentiment":
        query = query.order_by(desc(Review.sentiment) if sort_order == "desc" else asc(Review.sentiment))
    elif sort_field == "brand":
        query = query.order_by(desc(Review.brand) if sort_order == "desc" else asc(Review.brand))
    elif sort_field == "platform":
        query = query.order_by(desc(Review.platform) if sort_order == "desc" else asc(Review.platform))
    else:
        query = query.order_by(desc(Review.date)) # Default
        
    offset = (page - 1) * page_size
    reviews = query.offset(offset).limit(page_size).all()
    
    return {
        "items": [r.to_dict() for r in reviews],
        "total": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": (total_count + page_size - 1) // page_size if page_size > 0 else 0
    }


@app.get("/api/download-analysis-csv")
async def download_analysis_csv(portfolio_id: int, brand: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Generate and return a CSV file of analyzed reviews for a specific portfolio."""
    check_portfolio_access(db, current_user.id, portfolio_id)
    
    query = db.query(Review).filter(Review.portfolio_id == portfolio_id)
    if brand and brand != "all":
        query = query.filter(Review.brand == brand)
        
    reviews = query.all()
    if not reviews:
        raise HTTPException(status_code=404, detail="No reviews found for this selection")

    import pandas as pd
    import uuid
    
    df = pd.DataFrame([r.to_dict() for r in reviews])
    
    # Clean up topics/JSON for CSV
    if 'topics' in df.columns:
        df['topics'] = df['topics'].apply(lambda x: json.dumps(x) if x else "")

    filename = f"analysis_{portfolio_id}_{uuid.uuid4().hex[:8]}.csv"
    filepath = os.path.join("data", filename)
    df.to_csv(filepath, index=False)
    
    return {"download_url": f"/data/{filename}"}
 
@app.get("/api/user/dashboard-stats")
async def get_dashboard_stats(
    portfolio_id: int,
    brand: Optional[str] = None,
    job_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns aggregated DashboardData for a portfolio."""
    check_portfolio_access(db, current_user.id, portfolio_id)
    query = db.query(Review).filter(Review.portfolio_id == portfolio_id)

    if brand and brand != "all":
        brands_list = [b.strip() for b in brand.split(",")]
        query = query.filter(Review.brand.in_(brands_list))
    if job_id:
        query = query.filter(Review.job_id == job_id)
        
    reviews = query.all()
    if not reviews:
        return None
        
    total_reviews = len(reviews)
    positive = sum(1 for r in reviews if r.sentiment and r.sentiment.lower() == 'positive')
    negative = sum(1 for r in reviews if r.sentiment and r.sentiment.lower() == 'negative')
    neutral = sum(1 for r in reviews if r.sentiment and r.sentiment.lower() == 'neutral')
    
    pos_pct = (positive / total_reviews) * 100
    neg_pct = (negative / total_reviews) * 100
    neu_pct = (neutral / total_reviews) * 100
    net_sentiment = pos_pct - neg_pct
    
    avg_rating = sum((r.rating or 0) for r in reviews) / total_reviews
    
    # Dimensions
    dim_map = {}
    brand_map = {}
    platform_map = {}
    week_map = {}
    
    for r in reviews:
        b_name = r.brand or "Unknown"
        
        # Brand stats
        if b_name not in brand_map:
            brand_map[b_name] = []
        brand_map[b_name].append(r)
        
        # Platform stats
        plat = r.platform or "Unknown"
        if 'App Store' in plat: plat = 'App Store'
        if 'Google Play' in plat: plat = 'Google Play'
        if 'Google Maps' in plat: plat = 'Google Maps'
        if 'Trustpilot' in plat: plat = 'Trustpilot'
        platform_map[plat] = platform_map.get(plat, 0) + 1
        
        # Sentiment trend by week
        if r.date:
            try:
                # Naive ISO slice "2023-01-01"
                date_str = r.date[:10]
                d = datetime.fromisoformat(date_str)
                iso_year, iso_week, _ = d.isocalendar()
                wk_key = f"W-{iso_week}"
                
                if wk_key not in week_map:
                    week_map[wk_key] = {"positive": 0, "negative": 0, "neutral": 0, "year": iso_year, "week": iso_week}
                sent = (r.sentiment or "").lower()
                if sent == "positive": week_map[wk_key]["positive"] += 1
                elif sent == "negative": week_map[wk_key]["negative"] += 1
                else: week_map[wk_key]["neutral"] += 1
            except Exception:
                pass

        # Dimensions logic
        topics = r.topics
        if isinstance(topics, list):
            for t in topics:
                if t.get("mentioned") is False:
                    continue
                dim = t.get("dimension", "Unknown")
                sent = (t.get("sentiment") or "Neutral").lower()
                
                if dim not in dim_map:
                    dim_map[dim] = {"positive": 0, "negative": 0, "neutral": 0, "brands": {}}
                
                d_stats = dim_map[dim]
                if b_name not in d_stats["brands"]:
                    d_stats["brands"][b_name] = {"positive": 0, "negative": 0, "neutral": 0}
                b_stats = d_stats["brands"][b_name]
                
                if sent == "positive":
                    d_stats["positive"] += 1
                    b_stats["positive"] += 1
                elif sent == "negative":
                    d_stats["negative"] += 1
                    b_stats["negative"] += 1
                else:
                    d_stats["neutral"] += 1
                    b_stats["neutral"] += 1

    dimension_stats = []
    for dim, stats in dim_map.items():
        total = stats["positive"] + stats["negative"] + stats["neutral"]
        d_pos_pct = (stats["positive"] / total * 100) if total > 0 else 0
        d_neg_pct = (stats["negative"] / total * 100) if total > 0 else 0
        d_neu_pct = (stats["neutral"] / total * 100) if total > 0 else 0
        d_net = d_pos_pct - d_neg_pct
        impact = (total / total_reviews) * d_net
        
        brand_stats_obj = {}
        for b_name, b_stats in stats["brands"].items():
            b_total = b_stats["positive"] + b_stats["negative"] + b_stats["neutral"]
            b_pos_pct = (b_stats["positive"] / b_total * 100) if b_total > 0 else 0
            b_neg_pct = (b_stats["negative"] / b_total * 100) if b_total > 0 else 0
            b_neu_pct = (b_stats["neutral"] / b_total * 100) if b_total > 0 else 0
            brand_stats_obj[b_name] = {
                "positive": b_stats["positive"],
                "negative": b_stats["negative"],
                "neutral": b_stats["neutral"],
                "positivePercent": b_pos_pct,
                "negativePercent": b_neg_pct,
                "neutralPercent": b_neu_pct,
                "netSentiment": b_pos_pct - b_neg_pct
            }
            
        dimension_stats.append({
            "dimension": dim,
            "total": total,
            "positive": stats["positive"],
            "negative": stats["negative"],
            "neutral": stats["neutral"],
            "positivePercent": d_pos_pct,
            "negativePercent": d_neg_pct,
            "neutralPercent": d_neu_pct,
            "netSentiment": d_net,
            "impact": impact,
            "brandStats": brand_stats_obj
        })
        
    dimension_stats.sort(key=lambda x: x["impact"], reverse=True)
    top_strengths = [d for d in dimension_stats if d["impact"] > 0][:3]
    top_weaknesses = sorted([d for d in dimension_stats if d["impact"] < 0], key=lambda x: x["impact"])[:3]
    
    brand_stats_list = []
    for b_name, b_revs in brand_map.items():
        b_total = len(b_revs)
        b_avg = sum((r.rating or 0) for r in b_revs) / b_total
        b_pos = sum(1 for r in b_revs if r.sentiment and r.sentiment.lower() == 'positive')
        b_neg = sum(1 for r in b_revs if r.sentiment and r.sentiment.lower() == 'negative')
        b_neu = sum(1 for r in b_revs if r.sentiment and r.sentiment.lower() == 'neutral')
        b_pos_pct = (b_pos / b_total) * 100
        b_neg_pct = (b_neg / b_total) * 100
        brand_stats_list.append({
            "brand": b_name,
            "reviews": b_total,
            "avgRating": b_avg,
            "positivePercent": b_pos_pct,
            "negativePercent": b_neg_pct,
            "neutralPercent": (b_neu / b_total) * 100,
            "netSentiment": b_pos_pct - b_neg_pct
        })
    brand_stats_list.sort(key=lambda x: x["reviews"], reverse=True)
    
    platform_stats = [
        {"platform": p, "count": c, "percentage": (c / total_reviews) * 100}
        for p, c in platform_map.items()
    ]
    platform_stats.sort(key=lambda x: x["count"], reverse=True)
    
    trend_data = []
    for wk, wk_stats in week_map.items():
        trend_data.append({
            "week": wk,
            "positive": wk_stats["positive"],
            "negative": wk_stats["negative"],
            "neutral": wk_stats["neutral"],
            "_sort_key": (wk_stats["year"], wk_stats["week"])
        })
    trend_data.sort(key=lambda x: x["_sort_key"])
    for t in trend_data:
        del t["_sort_key"]
    trend_data = trend_data[-12:]
    
    return {
        "totalReviews": total_reviews,
        "avgRating": avg_rating,
        "negativePercent": neg_pct,
        "positivePercent": pos_pct,
        "neutralPercent": neu_pct,
        "netSentiment": net_sentiment,
        "sentimentTrend": trend_data,
        "brandStats": brand_stats_list,
        "dimensionStats": dimension_stats,
        "topStrengths": top_strengths,
        "topWeaknesses": top_weaknesses,
        "platformStats": platform_stats
    }


@app.get("/api/reviews/{job_id}")
async def get_reviews(
    job_id: str,
    brand: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get reviews from database for a given job, with optional brand filter."""
    query = db.query(Review).filter(
        Review.job_id == job_id,
        Review.user_id == current_user.id
    )
    if brand:
        query = query.filter(Review.brand == brand)
    
    reviews = query.all()
    return [r.to_dict() for r in reviews]


@app.post("/api/scrapped-data")
async def api_scrapped_data2(request: dict, current_user: User = Depends(get_current_user)):
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

    # 1. Try reading existing dimensions for the user first
    try:
        db_session = SessionLocal()
        existing_dims = db_session.query(Dimension).filter(Dimension.user_id == current_user.id).all()
        if existing_dims:
            logger.info(f"Using {len(existing_dims)} existing dimensions for user {current_user.id}")
            # Map them back to the expected output format
            formatted_dims = []
            for d in existing_dims:
                formatted_dims.append({
                    "dimension": d.name,
                    "description": d.description,
                    "keywords": d.keywords
                })
            return {
                "message": "Dimensions generated",
                "body": {
                    "dimensions": formatted_dims,
                    "s3_bucket": S3_BUCKET_NAME if s3_key else "local",
                    "s3_key": s3_key if s3_key else f"db://{job_id}"
                }
            }
    except Exception as db_e:
        logger.warning(f"Could not load dimensions from DB: {db_e}")
    finally:
        if 'db_session' in locals():
            db_session.close()
        
    try:
        # Try reading from database first
        db_session = SessionLocal()
        try:
            db_reviews = db_session.query(Review).filter(Review.job_id == job_id).all()
            if db_reviews:
                logger.info(f"Reading {len(db_reviews)} reviews from database for job {job_id}")
                sample_reviews = db_reviews[:min(10, len(db_reviews))]
                sample = [r.to_dict() for r in sample_reviews]
                dimensions = generate_dimensions(sample, OPENAI_API_KEY)
                
                # Save newly generated dimensions for the user
                for dim in dimensions:
                    new_dim = Dimension(
                        user_id=current_user.id,
                        name=dim.get("dimension", ""),
                        description=dim.get("description", ""),
                        keywords=dim.get("keywords", [])
                    )
                    db_session.add(new_dim)
                db_session.commit()
                
                return {
                    "message": "Dimensions generated",
                    "body": {
                        "dimensions": dimensions,
                        "s3_bucket": S3_BUCKET_NAME if s3_key else "local",
                        "s3_key": s3_key if s3_key else f"db://{job_id}"
                    }
                }
        except Exception as db_e:
            logger.warning(f"Could not load reviews from DB: {db_e}. Falling back to CSV/S3.")
            db_reviews = None
        finally:
            db_session.close()

        # Fallback to CSV/S3 if no DB records
        if os.path.exists(file_path):
            df = pd.read_csv(file_path)
        elif s3_key:
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
        
        # Save newly generated dimensions for the user
        db_session = SessionLocal()
        try:
            for dim in dimensions:
                new_dim = Dimension(
                    user_id=current_user.id,
                    name=dim.get("dimension", ""),
                    description=dim.get("description", ""),
                    keywords=dim.get("keywords", [])
                )
                db_session.add(new_dim)
            db_session.commit()
        except Exception as db_e:
            logger.warning(f"Could not save fallback dimensions to DB: {db_e}")
        finally:
            db_session.close()

        
        return {
            "message": "Dimensions generated",
            "body": {
                "dimensions": dimensions,
                "s3_bucket": S3_BUCKET_NAME if s3_key else "local", 
                "s3_key": s3_key if s3_key else file_path 
            }
        }
    except Exception as e:
        print(f"Error: {e}")
        return {"error": str(e)}



@app.post("/api/final-analysis")
async def api_final_analysis(request: dict, background_tasks: BackgroundTasks, current_user: User = Depends(get_current_user)):
    # Expected: { dimensions: [...], file_key: ... }
    dimensions = request.get("dimensions", [])
    file_key = request.get("file_key")
    
    # 1. Fetch portfolio's stored dimensions to ensure consistency
    db_session = SessionLocal()
    try:
        # Determine portfolio_id (e.g., from request)
        portfolio_id = request.get("portfolio_id")
        if not portfolio_id:
            # Fallback to user's first portfolio
            if current_user.portfolios:
                portfolio_id = current_user.portfolios[0].id

        if not portfolio_id:
            raise HTTPException(status_code=400, detail="Missing portfolio_id")

        check_portfolio_access(db_session, current_user.id, portfolio_id)

        user_dims = db_session.query(Dimension).filter(Dimension.portfolio_id == portfolio_id).all()
        if user_dims:
            dimensions = [{"dimension": d.name, "description": d.description, "keywords": d.keywords} for d in user_dims]
            logger.info(f"Using {len(dimensions)} stored dimensions for portfolio {portfolio_id} in final analysis")
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Failed to fetch dimensions for final analysis: {e}")
    finally:
        db_session.close()

    # file_key is no longer strictly required if we have job_id (DB mode)
    job_id_param = request.get("job_id")
    if not file_key and not job_id_param: 
        raise HTTPException(status_code=400, detail="Missing file_key or job_id")
    
    # Generate a new job ID for the analysis task itself
    analysis_job_id = f"analysis_{str(uuid.uuid4())}"
    
    # Add to background tasks
    # Determine portfolio_id (e.g., from first dimension or request if we add it there)
    portfolio_id = request.get("portfolio_id")
    if not portfolio_id:
        # Fallback to user's first portfolio
        if current_user.portfolios:
            portfolio_id = current_user.portfolios[0].id

    # If file_key is missing, fall back to passing job_id_param.
    target_key = file_key or job_id_param
    background_tasks.add_task(task_final_analysis, analysis_job_id, target_key, dimensions, portfolio_id)
    logger.info(f"✅ Analysis Task {analysis_job_id} started in background for {target_key} (Portfolio: {portfolio_id})")
    
    return {
        "status": "success",
        "message": "Analysis started in background",
        "job_id": analysis_job_id
    }

@app.get("/api/download-result/{job_id}")
async def download_result(job_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Returns a CSV file containing the reviews for the given job_id directly from the Database.
    """
    try:
        from fastapi.responses import Response as FastApiResponse
        import pandas as pd
        
        # Strip potential "analysis_" prefix if present to find original job_id
        search_id = job_id
        if job_id.startswith("analysis_"):
            import re
            match = re.search(r'([a-f0-9-]{36})', job_id)
            if match:
                search_id = match.group(1)
            else:
                search_id = job_id.replace("analysis_", "", 1)
                
        # 1. Fetch reviews from Database
        query = db.query(Review).filter(
            Review.job_id == search_id
        )
        
        # Verify access to this job's reviews via portfolio
        # (Since reviews are in a portfolio, and user has access to portfolios)
        if not first_review:
            raise HTTPException(status_code=404, detail="Result not found or you don't have access")
            
        check_portfolio_access(db, current_user.id, first_review.portfolio_id)
        reviews = query.all()
                
        # 2. Convert to DataFrame and then to CSV
        df = pd.DataFrame([r.to_dict() for r in reviews])
        
        # 3. Clean up internal columns
        cols_to_drop = ['id']
        df = df.drop(columns=[c for c in cols_to_drop if c in df.columns])
            
        csv_data = df.to_csv(index=False, encoding='utf-8-sig')
        
        # 4. Return as a downloadable CSV file
        return FastApiResponse(
            content=csv_data, 
            media_type="text/csv", 
            headers={
                "Content-Disposition": f'attachment; filename="analyzed_reviews_{search_id}.csv"',
                "Access-Control-Allow-Origin": "*"
            }
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving download for {job_id}: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

