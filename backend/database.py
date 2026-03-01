"""
Database layer for VoC Platform.
Uses SQLAlchemy with PostgreSQL (AWS RDS).
Handles connection, table creation, and session management.
"""

import os
import logging
from datetime import datetime

from sqlalchemy import (
    create_engine, Column, Integer, String, Boolean, Text, DateTime,
    ForeignKey, JSON, Index
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required")

# Create SQLAlchemy engine
engine = create_engine(
    DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,  # Recycle connections every 30 minutes
    echo=False  # Set to True for SQL debugging
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


# --- ORM Models ---

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)  # bcrypt hash
    role = Column(String(20), default="free", nullable=False)  # 'free' or 'admin'
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship to companies
    companies = relationship("CompanyModel", back_populates="owner", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "role": self.role,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class CompanyModel(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    company_name = Column(String(255), nullable=False)
    website = Column(String(500))
    description = Column(Text)
    android_id = Column(String(255))
    apple_id = Column(String(255))
    google_maps_links = Column(JSON, default=[])  # Stored as JSON array
    trustpilot_link = Column(String(500))
    is_main = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Index for fast lookups by user
    __table_args__ = (
        Index("idx_companies_user_id", "user_id"),
    )

    # Relationship back to user
    owner = relationship("User", back_populates="companies")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "company_name": self.company_name,
            "website": self.website,
            "description": self.description,
            "android_id": self.android_id,
            "apple_id": self.apple_id,
            "google_maps_links": self.google_maps_links or [],
            "trustpilot_link": self.trustpilot_link,
            "is_main": self.is_main,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# --- Database Utilities ---

def init_db():
    """Create all tables if they don't exist."""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Database tables created/verified successfully")
    except Exception as e:
        logger.error(f"❌ Failed to initialize database: {e}")
        raise


def get_db():
    """Dependency to get a database session. Use with FastAPI's Depends()."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- Role Limits ---

ROLE_LIMITS = {
    "free": {
        "max_companies": 5,        # Including main company
        "max_total_reviews": 1000,  # Total across all companies per scraping job
    },
    "admin": {
        "max_companies": None,     # Unlimited
        "max_total_reviews": None,  # Unlimited
    },
}


def get_user_limits(role: str) -> dict:
    """Get the limits for a user role."""
    return ROLE_LIMITS.get(role, ROLE_LIMITS["free"])
