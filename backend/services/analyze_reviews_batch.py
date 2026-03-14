import json
import logging
import os
import re
import tempfile
import time
from datetime import datetime

import boto3
import pandas as pd
from google import genai
from google.genai import types

from services.analyze_reviews import update_analysis_status

logger = logging.getLogger(__name__)

BATCH_POLL_INTERVAL = 30          # seconds between Gemini status polls
BATCH_MAX_WAIT = 24 * 3600        # hard ceiling: 24 hours
BATCH_MODEL = "gemini-3-flash-preview"
TERMINAL_STATES = {
    "JOB_STATE_SUCCEEDED",
    "JOB_STATE_FAILED",
    "JOB_STATE_CANCELLED",
    "JOB_STATE_EXPIRED",
}

SYSTEM_PROMPT_TEMPLATE = """You are an expert Customer Experience Analyst.

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


def _neutral_fallback():
    return {"sentiment": "Neutral", "emotion": "Indifferent", "confidence": 0.0, "topics": []}


def _load_reviews(file_path, job_id, portfolio_id):
    """Load reviews from DB (primary) or S3/local CSV (fallback). Returns a DataFrame."""
    from database import Review, SessionLocal

    db_session = SessionLocal()
    db_reviews = []
    try:
        review_job_id = None
        if file_path:
            match = re.search(r'([a-f0-9-]{36})', file_path)
            if match:
                review_job_id = match.group(1)

        if not review_job_id and job_id:
            review_job_id = job_id
            if review_job_id.startswith('analysis_'):
                match = re.search(r'([a-f0-9-]{36})', review_job_id)
                if match:
                    review_job_id = match.group(1)
                else:
                    review_job_id = review_job_id.replace('analysis_', '', 1)

        if review_job_id:
            db_reviews = db_session.query(Review).filter(Review.job_id == review_job_id).order_by(Review.id).all()

        if not db_reviews and portfolio_id:
            db_reviews = db_session.query(Review).filter(Review.portfolio_id == portfolio_id).order_by(Review.id).all()
            if db_reviews:
                logger.info(f"DB fallback: using {len(db_reviews)} portfolio-level reviews (job_id '{review_job_id}' had none)")
    finally:
        db_session.close()

    if db_reviews:
        logger.info(f"Loaded {len(db_reviews)} reviews from database")
        return pd.DataFrame([r.to_dict() for r in db_reviews]), review_job_id

    # CSV fallbacks
    if file_path and os.path.exists(file_path):
        return pd.read_csv(file_path), None

    if file_path:
        s3_bucket = os.getenv("S3_BUCKET_NAME", "horus-voc-data-storage-v2-eu")
        logger.info(f"Reading from S3: {file_path}")
        s3 = boto3.client('s3', region_name=os.getenv("AWS_REGION", "eu-central-1"))
        obj = s3.get_object(Bucket=s3_bucket, Key=file_path)
        return pd.read_csv(obj['Body']), None

    raise ValueError(f"No reviews found in DB for job_id '{review_job_id}' and no file_path provided.")


def _save_results_to_db(analyzed_results, dimensions, file_path, job_id, portfolio_id, df):
    """Write analysis results back to the database. Mirrors the save block in analyze_reviews.py."""
    try:
        from database import Review, SessionLocal
        db_session = SessionLocal()
        try:
            review_job_id = None
            if file_path:
                match = re.search(r'([a-f0-9-]{36})', file_path)
                if match:
                    review_job_id = match.group(1)
            if not review_job_id and job_id:
                review_job_id = job_id
                if review_job_id.startswith('analysis_'):
                    match = re.search(r'([a-f0-9-]{36})', review_job_id)
                    if match:
                        review_job_id = match.group(1)
                    else:
                        review_job_id = review_job_id.replace('analysis_', '', 1)

            db_reviews = []
            if review_job_id:
                db_reviews = db_session.query(Review).filter(
                    Review.job_id == review_job_id
                ).order_by(Review.id).all()

            if not db_reviews and portfolio_id:
                db_reviews = db_session.query(Review).filter(
                    Review.portfolio_id == portfolio_id
                ).order_by(Review.id).all()
                if db_reviews:
                    logger.info(f"Save-back fallback: writing analysis to {len(db_reviews)} portfolio-level reviews")

            if db_reviews:
                result_map = {item['index']: item['result'] for item in analyzed_results}
                valid_dims = {d['dimension'] for d in dimensions} if dimensions else None

                for i, review in enumerate(db_reviews):
                    if i in result_map:
                        result = result_map[i]
                        review.sentiment = result.get('sentiment', 'Neutral')
                        review.emotion = result.get('emotion', 'Indifferent')
                        review.confidence = result.get('confidence', 0.0)
                        topics_list = result.get('topics', [])
                        if valid_dims:
                            topics_list = [t for t in topics_list if t.get('dimension') in valid_dims]
                        if i == 0:
                            logger.info(f"Saving topics for review 0: {json.dumps(topics_list)}")
                        review.topics = topics_list
                        review.analyzed_at = datetime.utcnow()

                db_session.commit()
                logger.info(f"💾 Updated {len(db_reviews)} reviews with AI analysis in database")

                # Generate embeddings (non-blocking)
                openai_key = os.getenv("OPENAI_API_KEY")
                if openai_key:
                    try:
                        from services.embeddings import embed_reviews_bulk
                        reviews_needing_embed = [r for r in db_reviews if r.text and r.embedding is None]
                        if reviews_needing_embed:
                            embedded_count = embed_reviews_bulk(reviews_needing_embed, openai_key)
                            if embedded_count > 0:
                                db_session.commit()
                                logger.info(f"📐 Embedded {embedded_count} reviews for semantic search")
                    except Exception as embed_err:
                        logger.warning(f"Embedding step skipped (non-critical): {embed_err}")
        finally:
            db_session.close()
    except Exception as e:
        logger.error(f"❌ Failed to save AI analysis to database: {e}")


def analyze_reviews_batch(file_path, dimensions, api_key, portfolio_id, job_id=None):
    """
    Analyzes reviews using the Gemini Batch API (50% cost vs real-time).

    Submits a JSONL file to Gemini, polls for completion every 30s, then
    parses the output and saves results to the database.
    """
    s3_bucket = os.getenv("S3_BUCKET_NAME", "horus-voc-data-storage-v2-eu")

    # ── 1. Load reviews ────────────────────────────────────────────────────────
    try:
        df, _ = _load_reviews(file_path, job_id, portfolio_id)
    except Exception as e:
        error_msg = f"Could not read reviews: {e}"
        logger.error(error_msg)
        if job_id:
            update_analysis_status(job_id, "error", error_msg)
        return {"error": error_msg}

    df_sample = df.copy()
    total_reviews = len(df_sample)
    logger.info(f"Starting batch analysis for {total_reviews} reviews.")

    if job_id:
        update_analysis_status(
            job_id, "running",
            f"Preparing batch job for {total_reviews} reviews...",
            0, total_reviews, mode="batch"
        )

    # ── 2. Build JSONL tempfile ────────────────────────────────────────────────
    dims_list = "\n".join([f"- {d['dimension']}" for d in dimensions])
    system_prompt = SYSTEM_PROMPT_TEMPLATE.replace("{dimensions}", dims_list)

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode='w', suffix='.jsonl', delete=False, encoding='utf-8'
        ) as tmp:
            tmp_path = tmp.name
            for idx, row in df_sample.iterrows():
                review_text = str(row.get('text', ''))
                line = {
                    "key": str(idx),
                    "request": {
                        "system_instruction": {"parts": [{"text": system_prompt}]},
                        "contents": [{"parts": [{"text": f'Review:\n"{review_text}"'}]}],
                        "generation_config": {"response_mime_type": "application/json"},
                    }
                }
                tmp.write(json.dumps(line, ensure_ascii=False) + "\n")

        logger.info(f"JSONL tempfile written: {tmp_path} ({total_reviews} requests)")

        # ── 3. Upload to Gemini Files API ──────────────────────────────────────
        client = genai.Client(api_key=api_key)

        if job_id:
            update_analysis_status(
                job_id, "running", "Uploading batch to Gemini...",
                0, total_reviews, mode="batch"
            )

        uploaded_file = client.files.upload(
            file=tmp_path,
            config=types.UploadFileConfig(
                display_name=f"voc-batch-{job_id or 'unknown'}",
                mime_type="application/jsonl",
            ),
        )
        logger.info(f"Uploaded batch file: {uploaded_file.name}")

    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    # ── 4. Submit batch job ────────────────────────────────────────────────────
    batch_job = client.batches.create(
        model=BATCH_MODEL,
        src=uploaded_file.name,
        config=types.CreateBatchJobConfig(
            display_name=f"voc-analysis-{job_id or 'unknown'}",
        ),
    )
    logger.info(f"Batch job created: {batch_job.name}")

    if job_id:
        update_analysis_status(
            job_id, "running",
            f"Batch submitted to Gemini. Processing {total_reviews} reviews...",
            0, total_reviews, mode="batch", batch_job_name=batch_job.name
        )

    # ── 5. Poll until terminal state ───────────────────────────────────────────
    elapsed = 0
    batch_status = batch_job

    while elapsed < BATCH_MAX_WAIT:
        time.sleep(BATCH_POLL_INTERVAL)
        elapsed += BATCH_POLL_INTERVAL

        try:
            batch_status = client.batches.get(name=batch_job.name)
        except Exception as poll_err:
            logger.warning(f"Batch poll error (will retry): {poll_err}")
            continue

        state = str(batch_status.state)
        logger.info(f"Batch job {batch_job.name} state={state} elapsed={elapsed}s")

        if job_id:
            update_analysis_status(
                job_id, "running",
                f"Gemini is processing your reviews... ({elapsed // 60}m elapsed)",
                0, total_reviews, mode="batch",
                batch_job_name=batch_job.name, batch_state=state
            )

        if state in TERMINAL_STATES:
            break
    else:
        msg = "Batch job timed out after 24h."
        logger.error(msg)
        if job_id:
            update_analysis_status(job_id, "error", msg, mode="batch")
        return {"error": msg}

    final_state = str(batch_status.state)
    if final_state != "JOB_STATE_SUCCEEDED":
        msg = f"Batch job ended with state: {final_state}"
        logger.error(msg)
        if job_id:
            update_analysis_status(job_id, "error", msg, mode="batch")
        return {"error": msg}

    # ── 6. Parse results ───────────────────────────────────────────────────────
    if job_id:
        update_analysis_status(
            job_id, "running", "Parsing and saving results...",
            0, total_reviews, mode="batch"
        )

    analyzed_results = []
    try:
        output_content = client.files.download(
            file=batch_status.dest.file_name
        ).decode('utf-8')

        for line in output_content.strip().split('\n'):
            if not line.strip():
                continue
            try:
                item = json.loads(line)
                idx = int(item['key'])
                if 'response' in item:
                    candidate_text = (
                        item['response']['candidates'][0]['content']['parts'][0]['text']
                    )
                    result = json.loads(candidate_text)
                    analyzed_results.append({"index": idx, "result": result})
                else:
                    # error field present — use neutral fallback
                    logger.warning(f"Batch result for key={item.get('key')} has error: {item.get('error')}")
                    analyzed_results.append({"index": idx, "result": _neutral_fallback()})
            except (KeyError, IndexError, ValueError, json.JSONDecodeError) as parse_err:
                logger.warning(f"Failed to parse batch result line: {parse_err} — line: {line[:200]}")
                try:
                    fallback_idx = int(json.loads(line).get('key', -1))
                    if fallback_idx >= 0:
                        analyzed_results.append({"index": fallback_idx, "result": _neutral_fallback()})
                except Exception:
                    pass

    except Exception as e:
        error_msg = f"Failed to download/parse batch results: {e}"
        logger.error(error_msg)
        if job_id:
            update_analysis_status(job_id, "error", error_msg, mode="batch")
        return {"error": error_msg}

    logger.info(f"Parsed {len(analyzed_results)} results from batch output.")

    # ── 7. Save to database ────────────────────────────────────────────────────
    _save_results_to_db(analyzed_results, dimensions, file_path, job_id, portfolio_id, df_sample)

    # ── 8. Final status ────────────────────────────────────────────────────────
    if job_id:
        update_analysis_status(
            job_id, "completed", "Analysis complete!",
            total_reviews, total_reviews,
            mode="batch", s3_key=None, s3_bucket=s3_bucket
        )

    return {
        "total_reviews": len(df),
        "analyzed_count": len(analyzed_results),
        "results": analyzed_results,
        "s3_bucket": s3_bucket,
        "s3_key": None,
        "local_path": None,
    }
