"""
VoC Embeddings Service
Generates and stores vector embeddings for review texts using OpenAI text-embedding-3-small.
Enables semantic search via pgvector cosine similarity.

Usage:
  - embed_portfolio_reviews(portfolio_id, db, api_key) — batch job for existing reviews
  - embed_single_review(text, api_key) — for embedding on ingestion
"""

import os
import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMS = 1536
BATCH_SIZE = 50  # Reviews per OpenAI embeddings API call


def embed_texts(texts: list[str], api_key: str) -> list[list[float]]:
    """Call OpenAI Embeddings API and return a list of embedding vectors."""
    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    response = client.embeddings.create(model=EMBEDDING_MODEL, input=texts)
    return [item.embedding for item in response.data]


def embed_single_review(text: str, api_key: str) -> Optional[list[float]]:
    """Generate an embedding vector for a single review text. Returns None on failure."""
    if not text or not text.strip():
        return None
    try:
        vectors = embed_texts([text.strip()], api_key)
        return vectors[0] if vectors else None
    except Exception as e:
        logger.error(f"Failed to embed review text: {e}")
        return None


def embed_portfolio_reviews(
    portfolio_id: int,
    db,
    api_key: str,
    status_callback=None,
) -> dict:
    """
    Batch-embed all un-embedded reviews for a portfolio.
    Processes in batches of BATCH_SIZE with checkpointing (skips already-embedded).

    Args:
        portfolio_id: Portfolio whose reviews to embed
        db: SQLAlchemy session
        api_key: OpenAI API key
        status_callback: Optional callable(processed, total, message) for progress reporting

    Returns:
        dict with 'embedded', 'skipped', 'failed', 'total' counts
    """
    from database import Review

    try:
        from pgvector.sqlalchemy import Vector  # noqa: F401
    except ImportError:
        msg = "pgvector is not installed. Run: pip install pgvector"
        logger.error(msg)
        return {"error": msg, "embedded": 0, "skipped": 0, "failed": 0, "total": 0}

    logger.info(f"📐 Starting embedding job for portfolio {portfolio_id}")

    # Fetch all reviews that have text but no embedding yet
    reviews_to_embed = (
        db.query(Review)
        .filter(
            Review.portfolio_id == portfolio_id,
            Review.text.isnot(None),
            Review.text != "",
            Review.embedding.is_(None),
        )
        .all()
    )

    total = len(reviews_to_embed)
    embedded = 0
    failed = 0

    if total == 0:
        logger.info("No reviews need embedding — all up to date.")
        return {"embedded": 0, "skipped": 0, "failed": 0, "total": 0}

    logger.info(f"Found {total} reviews to embed")
    if status_callback:
        status_callback(0, total, f"Starting embedding of {total} reviews...")

    # Process in batches
    for batch_start in range(0, total, BATCH_SIZE):
        batch = reviews_to_embed[batch_start: batch_start + BATCH_SIZE]
        texts = [r.text.strip() for r in batch]

        try:
            vectors = embed_texts(texts, api_key)

            for review, vector in zip(batch, vectors):
                review.embedding = vector

            db.commit()
            embedded += len(batch)
            logger.info(f"  Embedded {embedded}/{total} reviews")

            if status_callback:
                status_callback(embedded, total, f"Embedded {embedded}/{total} reviews")

            # Respect OpenAI rate limits
            time.sleep(0.2)

        except Exception as e:
            logger.error(f"Batch embedding failed (batch starting at {batch_start}): {e}")
            db.rollback()
            failed += len(batch)
            # Continue with next batch rather than aborting
            time.sleep(1.0)

    logger.info(f"✅ Embedding complete: {embedded} embedded, {failed} failed out of {total}")
    return {
        "embedded": embedded,
        "skipped": 0,
        "failed": failed,
        "total": total,
    }


def ensure_pgvector_setup(engine) -> bool:
    """
    Ensure pgvector extension and IVFFlat index exist.
    Safe to call multiple times (uses IF NOT EXISTS).
    Returns True if setup succeeded, False otherwise.
    """
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            # Enable extension (requires superuser or rds_superuser on RDS)
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))

            # Add embedding column if it doesn't exist yet
            conn.execute(text("""
                ALTER TABLE reviews
                ADD COLUMN IF NOT EXISTS embedding vector(1536);
            """))

            # Create IVFFlat index for approximate nearest neighbor search
            # lists = sqrt(num_rows) is a good heuristic; 100 is safe for up to 10k rows
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS reviews_embedding_idx
                ON reviews USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 100);
            """))

            conn.commit()
            logger.info("✅ pgvector extension and index ready")
            return True

    except Exception as e:
        logger.error(f"pgvector setup failed: {e}")
        return False
