"""
VoC Embeddings Service
Generates and stores vector embeddings for review texts using OpenAI text-embedding-3-small.
Enables semantic search via pgvector cosine similarity.

Usage:
  - embed_portfolio_reviews(portfolio_id, db, api_key) — batch job for existing reviews
  - embed_single_review(text, api_key) — for embedding on ingestion
"""

import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional
from sqlalchemy import func

logger = logging.getLogger(__name__)

EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMS = 1536
BATCH_SIZE = 500   # Reviews per OpenAI embeddings API call (supports up to 2048)
MAX_WORKERS = 3    # Concurrent OpenAI batch calls
MAX_CHARS = 30_000  # ~7500 tokens — safely below the 8191-token per-input limit


def _truncate(text: str) -> str:
    """Truncate text to stay within OpenAI's per-input token limit."""
    return text[:MAX_CHARS] if len(text) > MAX_CHARS else text


def embed_texts(texts: list[str], api_key: str) -> list[list[float]]:
    """Call OpenAI Embeddings API and return a list of embedding vectors."""
    from openai import OpenAI
    client = OpenAI(api_key=api_key)
    response = client.embeddings.create(model=EMBEDDING_MODEL, input=[_truncate(t) for t in texts])
    return [item.embedding for item in response.data]


def _embed_batch_with_retry(texts: list[str], api_key: str, retries: int = 3) -> list[list[float]]:
    """Embed a single batch with exponential-backoff retry on rate limit errors."""
    from openai import OpenAI
    try:
        from openai import RateLimitError
    except ImportError:
        RateLimitError = Exception  # fallback for older SDK versions

    client = OpenAI(api_key=api_key)
    for attempt in range(retries):
        try:
            response = client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=[_truncate(t) for t in texts],
            )
            return [item.embedding for item in response.data]
        except RateLimitError:
            wait = 2 ** attempt  # 1s, 2s, 4s
            logger.warning(f"Rate limited, retrying in {wait}s (attempt {attempt + 1}/{retries})")
            time.sleep(wait)
        except Exception as e:
            logger.error(f"Embedding batch failed: {e}")
            raise
    raise RuntimeError(f"Embedding batch failed after {retries} retries")


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


def embed_reviews_bulk(reviews: list, api_key: str) -> int:
    """
    Embed a list of Review ORM objects in-place, writing vectors to review.embedding.
    Processes in batches of BATCH_SIZE. Caller is responsible for db.commit().
    Returns the count of successfully embedded reviews.
    """
    if not reviews:
        return 0
    embedded = 0
    for i in range(0, len(reviews), BATCH_SIZE):
        batch = [r for r in reviews[i:i + BATCH_SIZE] if r.text and r.text.strip()]
        if not batch:
            continue
        texts = [r.text.strip() for r in batch]
        try:
            vectors = _embed_batch_with_retry(texts, api_key)
            for r, vec in zip(batch, vectors):
                r.embedding = vec
            embedded += len(batch)
        except Exception as e:
            logger.error(f"embed_reviews_bulk batch {i} failed: {e}")
    return embedded


def embed_portfolio_reviews(
    portfolio_id: int,
    db,
    api_key: str,
    status_callback=None,
) -> dict:
    """
    Batch-embed all un-embedded reviews for a portfolio.
    Streams rows from the DB with yield_per() to avoid loading everything into RAM,
    then fires up to MAX_WORKERS batches concurrently per flush group.
    Skips already-embedded reviews (checkpointing: safe to re-run after failures).

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

    logger.info(f"Starting embedding job for portfolio {portfolio_id}")

    base_filter = [
        Review.portfolio_id == portfolio_id,
        Review.text.isnot(None),
        Review.text != "",
        Review.embedding.is_(None),
    ]

    # Count first — cheap query, no text data loaded
    total = db.query(func.count(Review.id)).filter(*base_filter).scalar() or 0

    if total == 0:
        logger.info("No reviews need embedding — all up to date.")
        return {"embedded": 0, "skipped": 0, "failed": 0, "total": 0}

    logger.info(f"Found {total} reviews to embed")
    if status_callback:
        status_callback(0, total, f"Starting embedding of {total} reviews...")

    embedded = 0
    failed = 0
    # Fetch size per round: MAX_WORKERS concurrent batches of BATCH_SIZE each
    fetch_size = BATCH_SIZE * MAX_WORKERS

    def _flush_pending(groups: list[list]) -> tuple[int, int]:
        """Submit all batch groups concurrently, write vectors back, commit once."""
        if not groups:
            return 0, 0
        batch_texts = [[r.text.strip() for r in g] for g in groups]
        ok, err = 0, 0
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = {
                executor.submit(_embed_batch_with_retry, texts, api_key): reviews_batch
                for texts, reviews_batch in zip(batch_texts, groups)
            }
            for future in as_completed(futures):
                reviews_batch = futures[future]
                try:
                    vectors = future.result()
                    for r, vec in zip(reviews_batch, vectors):
                        r.embedding = vec
                    ok += len(reviews_batch)
                except Exception as e:
                    logger.error(f"Concurrent embedding batch failed: {e}")
                    err += len(reviews_batch)
        try:
            db.commit()
        except Exception as e:
            logger.error(f"DB commit failed: {e}")
            db.rollback()
            err += ok
            ok = 0
        return ok, err

    # Use limit/offset-style pagination: always query from offset=0 because
    # after each commit the embedded reviews no longer match embedding.is_(None),
    # so the "window" advances naturally without needing to track an offset.
    # This avoids yield_per()'s named cursor which gets invalidated on commit.
    while embedded + failed < total:
        rows = (
            db.query(Review)
            .filter(*base_filter)
            .order_by(Review.id)
            .limit(fetch_size)
            .all()
        )
        if not rows:
            break  # Nothing left (all embedded or filtered out)

        # Split into BATCH_SIZE groups for concurrent dispatch
        groups = [rows[i:i + BATCH_SIZE] for i in range(0, len(rows), BATCH_SIZE)]
        ok, err = _flush_pending(groups)
        embedded += ok
        failed += err
        logger.info(f"  Embedded {embedded}/{total} reviews")
        if status_callback:
            status_callback(embedded, total, f"Embedded {embedded}/{total} reviews")

    logger.info(f"Embedding complete: {embedded} embedded, {failed} failed out of {total}")
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
