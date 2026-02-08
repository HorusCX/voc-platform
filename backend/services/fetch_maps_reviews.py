import requests
import base64
import pandas as pd
from datetime import datetime
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional, List, Dict

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# DataForSEO API Configuration
DATAFORSEO_LOGIN = os.getenv("DATAFORSEO_LOGIN", "info@horuscx.com")
DATAFORSEO_PASSWORD = os.getenv("DATAFORSEO_PASSWORD", "ae38f0810ccce4ce")
DATAFORSEO_BASE_URL = "https://api.dataforseo.com/v3"


def _get_auth_header() -> dict:
    """Generate Basic Auth header for DataForSEO API"""
    credentials = f"{DATAFORSEO_LOGIN}:{DATAFORSEO_PASSWORD}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return {
        "Authorization": f"Basic {encoded}",
        "Content-Type": "application/json"
    }


def _parse_timestamp(timestamp_str: str) -> str:
    """Parse DataForSEO timestamp to YYYY-MM-DD format"""
    if not timestamp_str:
        return datetime.now().strftime("%Y-%m-%d")
    try:
        # Format: "2024-01-15 12:57:46 +00:00"
        dt = datetime.fromisoformat(timestamp_str.replace(" +00:00", "+00:00").replace(" ", "T", 1))
        return dt.strftime("%Y-%m-%d")
    except:
        return datetime.now().strftime("%Y-%m-%d")


def _create_review_tasks(tasks_payload: List[Dict]) -> Dict[str, str]:
    """
    Create multiple review scraping tasks via DataForSEO API in a single POST.
    Returns mapping of {task_id: original_target} if successful.
    """
    url = f"{DATAFORSEO_BASE_URL}/business_data/google/reviews/task_post"
    
    if not tasks_payload:
        return {}

    try:
        response = requests.post(url, json=tasks_payload, headers=_get_auth_header(), timeout=30)
        response.raise_for_status()
        result = response.json()
        
        task_mapping = {}
        if result.get("status_code") == 20000:
            tasks = result.get("tasks", [])
            for i, task in enumerate(tasks):
                if task.get("status_code") == 20100:
                    task_id = task.get("id")
                    # Track what this task was for (keyword or place_id)
                    target = tasks_payload[i].get("keyword") or tasks_payload[i].get("place_id") or tasks_payload[i].get("cid")
                    task_mapping[task_id] = target
                    logger.info(f"Task created: {task_id} for '{target}'")
                else:
                    logger.error(f"Task creation failed for item {i}: {task.get('status_message')}")
            return task_mapping
        
        logger.error(f"Batch task creation failed: {result}")
        return {}
        
    except Exception as e:
        logger.error(f"Error creating batch tasks: {e}")
        return {}


def _poll_for_results(task_id: str, max_attempts: int = 40, initial_wait: float = 2.0) -> list:
    """
    Poll for task completion with exponential backoff.
    Returns list of review items or empty list.
    """
    url = f"{DATAFORSEO_BASE_URL}/business_data/google/reviews/task_get/{task_id}"
    
    wait_time = initial_wait
    
    logger.info(f"🔄 Starting to poll task {task_id} (max {max_attempts} attempts)")
    
    for attempt in range(max_attempts):
        time.sleep(wait_time)
        
        try:
            response = requests.get(url, headers=_get_auth_header(), timeout=30)
            result = response.json()
            
            tasks = result.get("tasks", [])
            if not tasks:
                logger.warning(f"Task {task_id}: No tasks in response (attempt {attempt + 1}/{max_attempts})")
                continue
                
            task = tasks[0]
            status_code = task.get("status_code")
            status_message = task.get("status_message", "No message")
            
            # 20000 = success
            if status_code == 20000:
                task_result = task.get("result") or []
                if task_result:
                    items = task_result[0].get("items") or []
                    logger.info(f"✅ Task {task_id}: Retrieved {len(items)} reviews")
                    return items
                logger.warning(f"Task {task_id}: Success but no results")
                return []
            
            # Task still processing
            elif status_code in [40601, 40602]:  # Task in queue / processing
                logger.debug(f"⏳ Task {task_id}: Still processing (attempt {attempt + 1}/{max_attempts}) - {status_message}")
                wait_time = min(wait_time * 1.5, 10.0)  # Cap at 10 seconds
            
            # No results found - terminal condition
            elif status_code == 40102:
                logger.warning(f"❌ Task {task_id}: No search results found - {status_message}")
                return []
                
            else:
                logger.warning(f"⚠️ Task {task_id}: Status {status_code} - {status_message} (attempt {attempt + 1}/{max_attempts})")
                wait_time = min(wait_time * 1.5, 10.0)
                
        except Exception as e:
            logger.error(f"❌ Error polling task {task_id} (attempt {attempt + 1}/{max_attempts}): {e}")
    
    logger.error(f"⏱️ Task {task_id}: TIMEOUT after {max_attempts} attempts")
    return []


def _parse_reviews(items: list) -> pd.DataFrame:
    """Parse DataForSEO review items into a DataFrame"""
    reviews = []
    
    for item in items:
        if item.get("type") != "google_reviews_search":
            continue
            
        reviews.append({
            "text": item.get("review_text", "") or item.get("original_review_text", "") or "",
            "rating": item.get("rating", {}).get("value", 0) if isinstance(item.get("rating"), dict) else 0,
            "date": _parse_timestamp(item.get("timestamp")),
            "source_user": item.get("profile_name", "Anonymous"),
            "platform": "Google Maps"
        })
    
    return pd.DataFrame(reviews)


def scrape_google_maps_reviews(keyword_or_url: str, location: str = "Saudi Arabia",
                                language: str = "English", max_reviews: int = 100) -> pd.DataFrame:
    """
    Fetch Google Maps reviews using DataForSEO API.
    Main entry point for single location requests.
    """
    if not DATAFORSEO_LOGIN or not DATAFORSEO_PASSWORD:
        logger.error("DataForSEO credentials not configured")
        return pd.DataFrame()
    
    # Process inputs to extract target (place_id or keyword)
    target_data = _prepare_payload_item(keyword_or_url, location, language, max_reviews)
    
    # Single item batch
    task_mapping = _create_review_tasks([target_data])
    
    if not task_mapping:
        return pd.DataFrame()
    
    task_id = list(task_mapping.keys())[0]
    items = _poll_for_results(task_id)
    
    if not items:
        return pd.DataFrame()
    
    df = _parse_reviews(items)
    return _apply_date_filter(df)


def _prepare_payload_item(target: str, location: str, language: str, max_reviews: int) -> Dict:
    """Helper to prepare a single task payload item"""
    payload = {
        "language_name": language,
        "location_name": location,
        "depth": max(300, max_reviews),
        "sort_by": "newest"
    }

    # Extract info from URL/string
    place_id_found = None
    keyword = target

    if any(s in target for s in ["google.com/maps", "goo.gl", "maps.app.goo.gl"]):
        import urllib.parse
        import re
        parsed = urllib.parse.urlparse(target)
        params = urllib.parse.parse_qs(parsed.query)
        
        if "query" in params or "q" in params:
            query_key = "query" if "query" in params else "q"
            query_val = urllib.parse.unquote_plus(params[query_key][0])
            if query_val.startswith("place_id:"):
                place_id_found = query_val.replace("place_id:", "")
            else:
                keyword = query_val
        elif "/maps/place/" in target:
            match = re.search(r'/maps/place/([^/]+)', target)
            if match: keyword = urllib.parse.unquote_plus(match.group(1))
        elif "/maps/search/" in target:
            match = re.search(r'/maps/search/([^/?]+)', target)
            if match: keyword = urllib.parse.unquote_plus(match.group(1))

    if keyword and str(keyword).startswith("place_id:"):
        place_id_found = str(keyword).replace("place_id:", "")
        keyword = None

    if place_id_found:
        payload["place_id"] = place_id_found
    else:
        payload["keyword"] = keyword
        
    return payload


def _apply_date_filter(df: pd.DataFrame) -> pd.DataFrame:
    """Filter DataFrame for last 6 months of reviews"""
    if df.empty or 'date' not in df.columns:
        return df
        
    try:
        six_months_ago = pd.Timestamp(datetime.now() - pd.DateOffset(months=6))
        df['date'] = pd.to_datetime(df['date'])
        original_count = len(df)
        df = df[df['date'] >= six_months_ago]
        logger.info(f"--- 📅 Date Filter: Kept {len(df)}/{original_count} reviews ---")
        df['date'] = df['date'].dt.strftime('%Y-%m-%d')
        return df
    except Exception as e:
        logger.error(f"Error filtering dates: {e}")
        return df


def scrape_multiple_locations(locations: list, max_reviews_per_location: int = 100) -> pd.DataFrame:
    """
    Fetch reviews for multiple locations efficiently using batch tasks and parallel polling.
    """
    if not locations:
        return pd.DataFrame()
    
    logger.info(f"--- 🚀 Batching reviews for {len(locations)} locations ---")
    
    payloads = []
    for loc in locations:
        target = loc.get("url") or loc.get("name") or loc.get("keyword")
        if not target: continue
        
        payloads.append(_prepare_payload_item(
            target, 
            loc.get("location", "Saudi Arabia"),
            "English", 
            max_reviews_per_location
        ))
    
    if not payloads:
        return pd.DataFrame()

    # Create all tasks in one or more batches (DataForSEO accepts up to 100 per call)
    task_mapping = _create_review_tasks(payloads)
    
    if not task_mapping:
        return pd.DataFrame()

    all_dfs = []
    
    # Poll all tasks in parallel
    def poll_and_parse(task_id, target_name):
        items = _poll_for_results(task_id)
        if not items: return pd.DataFrame()
        df = _parse_reviews(items)
        df = _apply_date_filter(df)
        if not df.empty:
            df["source_location"] = target_name
        return df

    with ThreadPoolExecutor(max_workers=min(len(task_mapping), 10)) as executor:
        futures = {executor.submit(poll_and_parse, tid, target): tid for tid, target in task_mapping.items()}
        
        for future in as_completed(futures):
            try:
                res_df = future.result()
                if not res_df.empty:
                    all_dfs.append(res_df)
            except Exception as e:
                logger.error(f"Error processing task: {e}")
    
    if all_dfs:
        combined = pd.concat(all_dfs, ignore_index=True)
        logger.info(f"--- ✅ Batch complete: {len(combined)} total reviews ---")
        return combined
    
    return pd.DataFrame()


def scrape_google_maps_by_place_id(place_id: str, max_reviews: int = 100) -> pd.DataFrame:
    """Drop-in for specific place ID scraping"""
    return scrape_google_maps_reviews(f"place_id:{place_id}", max_reviews=max_reviews)
