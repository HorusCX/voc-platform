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
    ForeignKey, JSON, Index, Float, Table, Date, text
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from dotenv import load_dotenv
from pathlib import Path

# pgvector support (optional — gracefully degrades if not installed)
try:
    from pgvector.sqlalchemy import Vector
    PGVECTOR_AVAILABLE = True
except ImportError:
    PGVECTOR_AVAILABLE = False
    Vector = None

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
    pool_pre_ping=True,  # Check connection health before using
    echo=False  # Set to True for SQL debugging
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


# --- Association Tables ---

user_portfolios = Table(
    "user_portfolios",
    Base.metadata,
    Column("user_id", Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("portfolio_id", Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), primary_key=True),
    Column("created_at", DateTime, default=datetime.utcnow)
)

class PortfolioInvitation(Base):
    __tablename__ = "portfolio_invitations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False)
    email = Column(String(255), nullable=False)
    token = Column(String(255), unique=True, nullable=False, index=True)
    status = Column(String(50), nullable=False, default="pending")
    invited_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)

    # Relationship
    portfolio = relationship("Portfolio", back_populates="invitations")
    invited_by = relationship("User")

    def to_dict(self):
        return {
            "id": self.id,
            "email": self.email,
            "portfolio_id": self.portfolio_id,
            "token": self.token,
            "status": self.status,
            "invited_by_id": self.invited_by_id,
            "expires_at": self.expires_at.isoformat(),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# --- ORM Models ---

class Portfolio(Base):
    __tablename__ = "portfolios"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    last_sync_at = Column(DateTime, nullable=True)
    sync_status = Column(String(20), default="idle", nullable=False)  # idle | syncing | completed | failed
    sync_job_id = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    users = relationship("User", secondary=user_portfolios, back_populates="portfolios")
    companies = relationship("CompanyModel", back_populates="portfolio", cascade="all, delete-orphan")
    dimensions = relationship("Dimension", back_populates="portfolio", cascade="all, delete-orphan")
    reviews = relationship("Review", back_populates="portfolio", cascade="all, delete-orphan")
    invitations = relationship("PortfolioInvitation", back_populates="portfolio", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "last_sync_at": self.last_sync_at.isoformat() + "Z" if self.last_sync_at else None,
            "sync_status": self.sync_status or "idle",
            "sync_job_id": self.sync_job_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)  # bcrypt hash
    role = Column(String(20), default="free", nullable=False)  # 'free' or 'admin'
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship to portfolios (many-to-many)
    portfolios = relationship("Portfolio", secondary=user_portfolios, back_populates="users")

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
    company_name = Column(String(255), nullable=False)
    website = Column(String(500))
    description = Column(Text)
    android_id = Column(String(255))
    apple_id = Column(String(255))
    google_maps_links = Column(JSON, default=[])  # Stored as JSON array
    trustpilot_link = Column(String(500))
    logo_url = Column(String(500))
    arabic_name = Column(String(255), nullable=True)
    is_main = Column(Boolean, default=False)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Index for fast lookups by portfolio
    __table_args__ = (
        Index("idx_companies_portfolio_id", "portfolio_id"),
    )

    # Relationship back to portfolio
    portfolio = relationship("Portfolio", back_populates="companies")

    def to_dict(self):
        return {
            "id": self.id,
            "company_name": self.company_name,
            "website": self.website,
            "description": self.description,
            "android_id": self.android_id,
            "apple_id": self.apple_id,
            "google_maps_links": self.google_maps_links or [],
            "trustpilot_link": self.trustpilot_link,
            "logo_url": self.logo_url,
            "arabic_name": self.arabic_name,
            "is_main": self.is_main,
            "portfolio_id": self.portfolio_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Dimension(Base):
    __tablename__ = "dimensions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    keywords = Column(JSON, default=[])  # Stored as JSON array
    portfolio_id = Column(Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Index for fast lookups by portfolio
    __table_args__ = (
        Index("idx_dimensions_portfolio_id", "portfolio_id"),
    )

    portfolio = relationship("Portfolio", back_populates="dimensions")

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "keywords": self.keywords or [],
            "portfolio_id": self.portfolio_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    job_id = Column(String(100), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id", ondelete="SET NULL"), nullable=True)

    # --- Raw Review Fields ---
    brand = Column(String(255), nullable=False)
    text = Column(Text, nullable=True)
    rating = Column(Integer, nullable=True)
    date = Column(Date, nullable=True)
    source_user = Column(String(255), nullable=True)
    platform = Column(String(100), nullable=False)
    source_location = Column(String(500), nullable=True)

    # --- AI Analysis Fields (populated after OpenAI analysis) ---
    sentiment = Column(String(20), nullable=True)       # Positive / Neutral / Negative
    emotion = Column(String(50), nullable=True)         # Delighted / Frustrated / etc.
    confidence = Column(Float, nullable=True)            # 0.0 - 1.0
    topics = Column(JSON, nullable=True)                 # [{dimension, sentiment, mentioned}]

    # --- Semantic Embedding (populated by embed_reviews job, requires pgvector) ---
    embedding = Column(Vector(1536), nullable=True) if PGVECTOR_AVAILABLE else Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    analyzed_at = Column(DateTime, nullable=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False)

    portfolio = relationship("Portfolio", back_populates="reviews")

    __table_args__ = (
        Index("idx_reviews_job_id", "job_id"),
        Index("idx_reviews_brand", "brand"),
        Index("idx_reviews_portfolio_id", "portfolio_id"),
        # Composite indexes for dashboard-stats and fetch_reviews hot paths
        Index("idx_reviews_portfolio_brand_platform", "portfolio_id", "brand", "platform"),
        Index("idx_reviews_portfolio_brand_location", "portfolio_id", "brand", "source_location"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "job_id": self.job_id,
            "brand": self.brand,
            "text": self.text,
            "rating": self.rating,
            "date": self.date,
            "source_user": self.source_user,
            "platform": self.platform,
            "source_location": self.source_location,
            "sentiment": self.sentiment,
            "emotion": self.emotion,
            "confidence": self.confidence,
            "topics": self.topics,
            "portfolio_id": self.portfolio_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "analyzed_at": self.analyzed_at.isoformat() if self.analyzed_at else None,
        }


class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    portfolio = relationship("Portfolio", backref="conversations")
    user = relationship("User", backref="conversations")
    messages = relationship("ChatMessage", back_populates="conversation", cascade="all, delete-orphan", order_by="ChatMessage.created_at")

    def to_dict(self):
        return {
            "id": self.id,
            "portfolio_id": self.portfolio_id,
            "user_id": self.user_id,
            "title": self.title,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(50), nullable=False)  # "user" or "ai"
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationship
    conversation = relationship("Conversation", back_populates="messages")

    def to_dict(self):
        return {
            "id": self.id,
            "conversation_id": self.conversation_id,
            "role": self.role,
            "content": self.content,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# --- Database Utilities ---

def init_db():
    """Create all tables if they don't exist."""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("✅ Database tables created/verified successfully")
        # Run migrations for new columns on existing tables
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500)"))
            conn.execute(text("ALTER TABLE companies ADD COLUMN IF NOT EXISTS arabic_name VARCHAR(255)"))
            # Drop old btree constraints on raw text (btree index size limit exceeded for long reviews).
            # Use a functional unique index on md5(text) instead — md5 is always 32 chars.
            conn.execute(text("ALTER TABLE reviews DROP CONSTRAINT IF EXISTS uq_review_text_user_date_platform"))
            conn.commit()
            conn.execute(text("ALTER TABLE reviews DROP CONSTRAINT IF EXISTS uq_review_text_user_date_platform_portfolio"))
            conn.commit()
            conn.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS uq_review_dedup
                ON reviews (md5(text), source_user, date, platform, portfolio_id)
            """))
            conn.commit()
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
        "max_companies": 15,        # Including main company
        "max_total_reviews": 1000,  # Total across all companies per scraping job
        "max_portfolios": 1,        # Only one portfolio allowed for free users
    },
    "admin": {
        "max_companies": None,     # Unlimited
        "max_total_reviews": None,  # Unlimited
        "max_portfolios": None,     # Unlimited
    },
}


def get_user_limits(role: str) -> dict:
    """Get the limits for a user role."""
    return ROLE_LIMITS.get(role, ROLE_LIMITS["free"])
