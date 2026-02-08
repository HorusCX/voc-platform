"""
Google Maps Reviews Scraper using DataForSEO API

This module fetches Google Maps reviews using the DataForSEO Business Data API,
replacing the previous Selenium-based scraping approach.

API Documentation: https://docs.dataforseo.com/v3/business_data/google/reviews/
"""

import requests
import base64
import pandas as pd
from datetime import datetime
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

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


def _create_review_task(keyword: str = None, location: str = "Saudi Arabia", 
                         language: str = "English", depth: int = 100,
                         place_id: str = None, cid: str = None) -> str | None:
    """
    Create a review scraping task via DataForSEO API.
    Returns task_id if successful, None otherwise.
    """
    url = f"{DATAFORSEO_BASE_URL}/business_data/google/reviews/task_post"
    
    payload = {
        "language_name": language,
        "location_name": location,  # Required even with place_id/cid
        "depth": depth,
        "sort_by": "newest"
    }
    
    # Priority: place_id > cid > keyword search
    if place_id:
        payload["place_id"] = place_id
    elif cid:
        payload["cid"] = cid
    elif keyword:
        payload["keyword"] = keyword
    
    try:
        response = requests.post(url, json=[payload], headers=_get_auth_header(), timeout=30)
        response.raise_for_status()
        result = response.json()
        
        if result.get("status_code") == 20000:
            tasks = result.get("tasks", [])
            if tasks and tasks[0].get("status_code") == 20100:
                task_id = tasks[0].get("id")
                logger.info(f"Task created: {task_id} for '{keyword or place_id or cid}'")
                return task_id
        
        logger.error(f"Task creation failed: {result}")
        return None
        
    except Exception as e:
        logger.error(f"Error creating task: {e}")
        return None


def _poll_for_results(task_id: str, max_attempts: int = 15, initial_wait: float = 2.0) -> list:
    """
    Poll for task completion with exponential backoff.
    Returns list of review items or empty list.
    """
    url = f"{DATAFORSEO_BASE_URL}/business_data/google/reviews/task_get/{task_id}"
    
    wait_time = initial_wait
    
    for attempt in range(max_attempts):
        time.sleep(wait_time)
        
        try:
            response = requests.get(url, headers=_get_auth_header(), timeout=30)
            result = response.json()
            
            tasks = result.get("tasks", [])
            if not tasks:
                continue
                
            task = tasks[0]
            status_code = task.get("status_code")
            
            # 20000 = success
            if status_code == 20000:
                task_result = task.get("result") or []
                if task_result:
                    items = task_result[0].get("items") or []
                    logger.info(f"Task {task_id}: Retrieved {len(items)} reviews")
                    return items
                return []
            
            # Task still processing
            elif status_code in [40601, 40602]:  # Task in queue / processing
                logger.info(f"Task {task_id}: Still processing (attempt {attempt + 1}/{max_attempts})")
                wait_time = min(wait_time * 1.5, 10.0)  # Cap at 10 seconds
            
            # No results found - terminal condition
            elif status_code == 40102:
                logger.warning(f"Task {task_id}: No search results found")
                return []
                
            else:
                logger.warning(f"Task {task_id}: Status {status_code} - {task.get('status_message')}")
                # For unknown status codes, continue polling
                wait_time = min(wait_time * 1.5, 10.0)
                
        except Exception as e:
            logger.error(f"Error polling task {task_id}: {e}")
    
    logger.warning(f"Task {task_id}: Timeout after {max_attempts} attempts")
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
    
    This is the main entry point, designed to be a drop-in replacement for 
    the previous Selenium-based scraper. Accepts either a keyword/location name
    or a Google Maps URL (for backwards compatibility).
    
    Args:
        keyword_or_url: Business name, search query, or Google Maps URL
        location: Location context for search (e.g., "Riyadh,Saudi Arabia")
        language: Language for results
        max_reviews: Maximum number of reviews to fetch (charged per 10)
        
    Returns:
        DataFrame with columns: [text, rating, date, source_user, platform]
    """
    if not DATAFORSEO_LOGIN or not DATAFORSEO_PASSWORD:
        logger.error("DataForSEO credentials not configured")
        return pd.DataFrame()
    
    # Extract keyword from URL if a URL is passed (backwards compatibility)
    # Extract keyword from URL if a URL is passed (backwards compatibility)
    keyword = keyword_or_url
    place_id_found = None

    if "google.com/maps" in keyword_or_url or "goo.gl" in keyword_or_url or "maps.app.goo.gl" in keyword_or_url:
        # Try to extract query parameter
        import urllib.parse
        import re
        
        parsed = urllib.parse.urlparse(keyword_or_url)
        params = urllib.parse.parse_qs(parsed.query)
        
        if "query" in params or "q" in params:
            query_key = "query" if "query" in params else "q"
            query_val = urllib.parse.unquote_plus(params[query_key][0])
            
            if query_val.startswith("place_id:"):
                place_id_found = query_val.replace("place_id:", "")
                keyword = None # Clear keyword since we have place_id
            else:
                keyword = query_val
        elif "/maps/place/" in keyword_or_url:
            # Extract name from place URL: /maps/place/Name+Here/
            match = re.search(r'/maps/place/([^/]+)', keyword_or_url)
            if match:
                keyword = urllib.parse.unquote_plus(match.group(1))
        elif "/maps/search/" in keyword_or_url:
            # Extract from search path
            match = re.search(r'/maps/search/([^/?]+)', keyword_or_url)
            if match:
                keyword = urllib.parse.unquote_plus(match.group(1))
    
    # Also handle raw string "place_id:..." if passed directly
    if keyword and str(keyword).startswith("place_id:"):
        place_id_found = str(keyword).replace("place_id:", "")
        keyword = None

    if place_id_found:
        logger.info(f"--- 🌍 DataForSEO: Fetching reviews for Place ID: {place_id_found} ---")
        # Increase depth to ensure we cover enough history (e.g., 6 months)
        # Using 300 as requested for recent reviews
        actual_depth = max(300, max_reviews) 
        
        task_id = _create_review_task(
            place_id=place_id_found,
            location=location,
            language=language,
            depth=actual_depth
        )
    else:
        logger.info(f"--- 🌍 DataForSEO: Fetching reviews for '{keyword}' ---")
        actual_depth = max(300, max_reviews)
        task_id = _create_review_task(
            keyword=keyword,
            location=location,
            language=language,
            depth=actual_depth
        )
    
    if not task_id:
        return pd.DataFrame()
    
    # Poll for results
    items = _poll_for_results(task_id)
    
    if not items:
        logger.warning(f"No reviews returned for '{keyword}'")
        return pd.DataFrame()
    
    # Parse and return
    df = _parse_reviews(items)
    
    # Filter for last 6 months
    if not df.empty and 'date' in df.columns:
        try:
            six_months_ago = pd.Timestamp(datetime.now() - pd.DateOffset(months=6))
            # Ensure date column is datetime
            df['date'] = pd.to_datetime(df['date'])
            original_count = len(df)
            df = df[df['date'] >= six_months_ago]
            filtered_count = len(df)
            logger.info(f"--- 📅 Date Filter: Kept {filtered_count}/{original_count} reviews (last 6 months) ---")
            
            # Format date back to string for consistency if needed, or keep as datetime
            # existing code expects string YYYY-MM-DD usually? 
            # let's check fetch_reviews.py... it does: df['date'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m-%d')
            # So let's return it as string to be safe
            df['date'] = df['date'].dt.strftime('%Y-%m-%d')
            
        except Exception as e:
            logger.error(f"Error filtering dates: {e}")

    logger.info(f"--- ✅ DataForSEO: Collected {len(df)} reviews for '{keyword}' ---")
    
    return df


def scrape_google_maps_by_place_id(place_id: str, max_reviews: int = 100) -> pd.DataFrame:
    """
    Fetch reviews for a specific place using its Google Place ID.
    
    This is more reliable than keyword search for exact locations.
    
    Args:
        place_id: Google Place ID (e.g., "ChIJ...")
        max_reviews: Maximum reviews to fetch
    """
    logger.info(f"--- 🌍 DataForSEO: Fetching reviews for Place ID: {place_id} ---")
    
    task_id = _create_review_task(place_id=place_id, depth=max_reviews)
    
    if not task_id:
        return pd.DataFrame()
    
    items = _poll_for_results(task_id)
    return _parse_reviews(items) if items else pd.DataFrame()


def scrape_multiple_locations(locations: list, max_reviews_per_location: int = 100) -> pd.DataFrame:
    """
    Fetch reviews for multiple locations in parallel.
    
    Args:
        locations: List of dicts with 'name' or 'url' keys
                   e.g., [{"name": "Budget Rent A Car Riyadh"}, ...]
        max_reviews_per_location: Max reviews per location
        
    Returns:
        Combined DataFrame with all reviews
    """
    if not locations:
        return pd.DataFrame()
    
    logger.info(f"--- 🚀 DataForSEO: Starting batch scrape for {len(locations)} locations ---")
    
    all_results = []
    
    # Create all tasks first (API allows batch submission)
    tasks_created = []
    
    for loc in locations:
        keyword = loc.get("name") or loc.get("url") or loc.get("keyword")
        if not keyword:
            continue
            
        task_id = _create_review_task(
            keyword=keyword,
            location=loc.get("location", "Saudi Arabia"),
            depth=max_reviews_per_location
        )
        
        if task_id:
            tasks_created.append({
                "task_id": task_id,
                "keyword": keyword,
                "location": loc
            })
    
    if not tasks_created:
        return pd.DataFrame()
    
    # Wait a bit for tasks to process
    time.sleep(3)
    
    # Poll all tasks in parallel
    def poll_task(task_info):
        items = _poll_for_results(task_info["task_id"])
        df = _parse_reviews(items) if items else pd.DataFrame()
        if not df.empty:
            df["source_location"] = task_info["keyword"]
        return df
    
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(poll_task, t): t for t in tasks_created}
        
        for future in as_completed(futures):
            try:
                df = future.result()
                if not df.empty:
                    all_results.append(df)
            except Exception as e:
                task_info = futures[future]
                logger.error(f"Failed to get results for {task_info['keyword']}: {e}")
    
    if all_results:
        combined = pd.concat(all_results, ignore_index=True)
        logger.info(f"--- ✅ Batch complete: {len(combined)} total reviews ---")
        return combined
    
    return pd.DataFrame()
