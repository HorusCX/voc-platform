"""
Authentication module for VoC Platform.
Handles password hashing, JWT tokens, user validation, and admin email management (via S3).
"""

import os
import json
import time
import logging
from datetime import datetime, timedelta
from typing import Optional

import boto3
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from dotenv import load_dotenv
from pathlib import Path

from database import get_db, User

# Load environment variables
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

logger = logging.getLogger(__name__)

# --- Configuration ---
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is required")

JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 72  # Token valid for 3 days

S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "horus-voc-data-storage-v2-eu")
AWS_REGION = os.getenv("AWS_REGION", "eu-central-1")
ADMIN_EMAILS_S3_KEY = "config/admin_emails.json"

import bcrypt

# --- Bearer Token Security ---
security = HTTPBearer()


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a bcrypt hash."""
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


# --- JWT Token Management ---

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=JWT_EXPIRATION_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decode and validate a JWT access token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )


# --- Admin Email Management (S3-based with caching) ---

_admin_emails_cache = {
    "emails": [],
    "last_fetched": 0
}
ADMIN_CACHE_TTL = 60  # seconds


def _fetch_admin_emails_from_s3() -> list:
    """Fetch admin emails list from S3."""
    try:
        s3 = boto3.client('s3', region_name=AWS_REGION)
        response = s3.get_object(Bucket=S3_BUCKET_NAME, Key=ADMIN_EMAILS_S3_KEY)
        data = json.loads(response['Body'].read().decode('utf-8'))
        emails = [e.lower().strip() for e in data.get("admin_emails", [])]
        logger.info(f"✅ Loaded {len(emails)} admin emails from S3")
        return emails
    except s3.exceptions.NoSuchKey:
        logger.warning(f"⚠️ Admin emails config not found in S3 at {ADMIN_EMAILS_S3_KEY}")
        return []
    except Exception as e:
        logger.error(f"❌ Failed to fetch admin emails from S3: {e}")
        return _admin_emails_cache["emails"]  # Return stale cache on error


def get_admin_emails() -> list:
    """Get admin emails with TTL-based caching (re-fetches from S3 every 60 seconds)."""
    now = time.time()
    if now - _admin_emails_cache["last_fetched"] > ADMIN_CACHE_TTL:
        _admin_emails_cache["emails"] = _fetch_admin_emails_from_s3()
        _admin_emails_cache["last_fetched"] = now
    return _admin_emails_cache["emails"]


def is_admin_email(email: str) -> bool:
    """Check if an email is in the admin list."""
    return email.lower().strip() in get_admin_emails()


# --- FastAPI Dependencies ---

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """
    FastAPI dependency to extract and validate the current user from JWT.
    Usage: current_user: User = Depends(get_current_user)
    """
    token = credentials.credentials
    payload = decode_access_token(token)

    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token: missing user ID",
        )

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )

    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    FastAPI dependency that requires admin role.
    Usage: admin_user: User = Depends(require_admin)
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user
