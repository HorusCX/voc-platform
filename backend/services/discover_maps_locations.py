"""
Google Maps Location Discovery using DataForSEO API

This module discovers Google Maps business locations using the DataForSEO 
Google Maps SERP API, replacing the previous Gemini-based approach.

API Documentation: https://docs.dataforseo.com/v3/serp/google/maps/
"""

import requests
import base64
import os
import time
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# DataForSEO API Configuration (reuse from google_maps.py)
DATAFORSEO_LOGIN = os.getenv("DATAFORSEO_LOGIN", "info@horuscx.com")
DATAFORSEO_PASSWORD = os.getenv("DATAFORSEO_PASSWORD", "ae38f0810ccce4ce")
DATAFORSEO_BASE_URL = "https://api.dataforseo.com/v3"

# Location codes for Middle East/GCC region
# Get location codes from: https://api.dataforseo.com/v3/serp/google/locations
LOCATION_CODES = {
    "Saudi Arabia": 2682,
    "United Arab Emirates": 2784,
    "Egypt": 2818,
    "Kuwait": 2414,
    "Bahrain": 2048,
    "Qatar": 2634,
    "Oman": 2512,
}


def _get_auth_header() -> dict:
    """Generate Basic Auth header for DataForSEO API"""
    credentials = f"{DATAFORSEO_LOGIN}:{DATAFORSEO_PASSWORD}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return {
        "Authorization": f"Basic {encoded}",
        "Content-Type": "application/json"
    }


def _create_maps_search_task(keyword: str, location_code: int, depth: int = 100) -> Optional[str]:
    """
    Create a Google Maps SERP search task.
    Returns task_id if successful, None otherwise.
    """
    url = f"{DATAFORSEO_BASE_URL}/serp/google/maps/task_post"
    
    payload = [{
        "keyword": keyword,
        "location_code": location_code,
        "language_code": "en",
        "depth": min(depth, 100),  # Max 100 for maps
        "device": "desktop"
    }]
    
    try:
        response = requests.post(url, json=payload, headers=_get_auth_header(), timeout=60)
        response.raise_for_status()
        result = response.json()
        
        if result.get("status_code") == 20000:
            tasks = result.get("tasks", [])
            if tasks and tasks[0].get("status_code") == 20100:
                task_id = tasks[0].get("id")
                logger.info(f"📍 Created search task: {task_id} for '{keyword}' in location {location_code}")
                return task_id
        
        logger.error(f"Task creation failed: {result}")
        return None
        
    except Exception as e:
        logger.error(f"Error creating maps search task: {e}")
        return None


def _poll_for_maps_results(task_id: str, max_attempts: int = 10, initial_wait: float = 2.0) -> List[Dict]:
    """
    Poll for Google Maps SERP task completion.
    Returns list of location items or empty list.
    """
    url = f"{DATAFORSEO_BASE_URL}/serp/google/maps/task_get/advanced/{task_id}"
    
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
                    logger.info(f"Task {task_id}: Retrieved {len(items)} locations")
                    return items
                return []
            
            # Task still processing
            elif status_code in [40601, 40602]:
                logger.info(f"Task {task_id}: Processing (attempt {attempt + 1}/{max_attempts})")
                wait_time = min(wait_time * 1.5, 8.0)
            
            # No results found
            elif status_code == 40102:
                logger.warning(f"Task {task_id}: No results found")
                return []
                
            else:
                logger.warning(f"Task {task_id}: Status {status_code} - {task.get('status_message')}")
                wait_time = min(wait_time * 1.5, 8.0)
                
        except Exception as e:
            logger.error(f"Error polling task {task_id}: {e}")
    
    logger.warning(f"Task {task_id}: Timeout after {max_attempts} attempts")
    return []


def _parse_maps_items(items: List[Dict], company_name: str) -> List[Dict]:
    """
    Parse DataForSEO Google Maps SERP items into normalized location objects.
    Filters to only include results that match the company name.
    """
    locations = []
    
    # Extract significant words from company name (min 3 chars, ignore common words)
    stopwords = {'the', 'and', 'inc', 'llc', 'ltd', 'co', 'corp', 'company', 'group', 'rent', 'car', 'rental'}
    company_words = [
        word.lower() for word in company_name.split() 
        if len(word) >= 3 and word.lower() not in stopwords
    ]
    
    # If no significant words found, use first word as fallback
    if not company_words:
        first_word = company_name.split()[0].lower() if company_name.split() else ""
        if first_word:
            company_words = [first_word]
    
    logger.info(f"Filtering results using keywords: {company_words}")
    
    for item in items:
        if item.get("type") != "maps_search":
            continue
            
        title = item.get("title", "") or ""
        title_lower = title.lower()
        
        # Filter: check if ANY significant word from company name appears in title
        # This handles cases like "Budget Saudi" matching "Budget Rent A Car"
        matches = any(word in title_lower for word in company_words)
        if not matches:
            continue
        
        place_id = item.get("place_id", "") or ""
        address = item.get("address", "") or ""
        
        # Skip if no place_id (required for reviews)
        if not place_id:
            continue
        
        # Generate proper Google Maps URL from place_id
        # This ensures we always have a working Maps link, not a website URL
        maps_url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
        
        locations.append({
            "place_id": place_id,
            "name": title,
            "url": maps_url,  # Always use generated Maps URL
            "address": address,
            "rating": item.get("rating", {}).get("value") if item.get("rating") else None,
            "reviews_count": int(item.get("rating", {}).get("votes_count") or 0) if item.get("rating") else None,
        })
    
    logger.info(f"Filtered to {len(locations)} matching locations")
    return locations


def discover_maps_links(company_name: str, website: str, 
                         progress_callback=None,
                         location_context: str = "Middle East/GCC or Egypt") -> List[Dict]:
    """
    Discover Google Maps business locations using DataForSEO API.
    
    This replaces the previous Gemini-based approach with a faster, more reliable
    API-based solution.
    
    Args:
        company_name: Name of the company to search for
        website: Company website (not used currently but kept for API compatibility)
        progress_callback: Optional function to call with status updates
        location_context: Not used (searches all GCC/MENA countries)
        
    Returns:
        List of location dicts with: place_id, name, url, address, rating, reviews_count
    """
    if not DATAFORSEO_LOGIN or not DATAFORSEO_PASSWORD:
        logger.error("DataForSEO credentials not configured")
        return []
    
    logger.info(f"🔍 DataForSEO Maps Discovery: Searching for '{company_name}' across GCC/MENA region...")
    if progress_callback:
        progress_callback(f"Starting discovery for '{company_name}'...")
    
    all_locations = []
    seen_place_ids = set()
    
    # Search across multiple countries in parallel
    def search_country(country_name: str, location_code: int):
        """Search for company in a specific country"""
        if progress_callback:
            progress_callback(f"Searching in {country_name}...")
            
        task_id = _create_maps_search_task(company_name, location_code, depth=50)
        if not task_id:
            return []
        
        # Increased attempts for better reliability (approx 2-3 mins)
        items = _poll_for_maps_results(task_id, max_attempts=20)
        locations = _parse_maps_items(items, company_name)
        
        # Add country info
        for loc in locations:
            loc["country"] = country_name
            
        return locations
    
    # Run searches in parallel (max 3 concurrent to avoid rate limits)
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(search_country, country, code): country 
            for country, code in LOCATION_CODES.items()
        }
        
        for future in as_completed(futures):
            country = futures[future]
            try:
                locations = future.result()
                for loc in locations:
                    if loc["place_id"] not in seen_place_ids:
                        seen_place_ids.add(loc["place_id"])
                        all_locations.append(loc)
                        if len(all_locations) <= 20:
                            logger.info(f"  ✓ {loc['name']} ({country})")
            except Exception as e:
                logger.error(f"Error searching {country}: {e}")
    
    # Sort by reviews count (most reviewed first)
    all_locations.sort(key=lambda x: x.get("reviews_count") or 0, reverse=True)
    
    logger.info(f"✅ DataForSEO Maps Discovery: Found {len(all_locations)} unique locations for '{company_name}'")
    
    return all_locations


def discover_maps_links_single_country(company_name: str, country: str = "Saudi Arabia", 
                                         depth: int = 50) -> List[Dict]:
    """
    Discover locations in a single country (faster, cheaper option).
    
    Args:
        company_name: Name of the company to search for
        country: Country name (must be in LOCATION_CODES)
        depth: Number of results to fetch (max 100)
        
    Returns:
        List of location dicts
    """
    location_code = LOCATION_CODES.get(country)
    if not location_code:
        logger.error(f"Unknown country: {country}. Available: {list(LOCATION_CODES.keys())}")
        return []
    
    logger.info(f"🔍 Searching for '{company_name}' in {country}...")
    
    task_id = _create_maps_search_task(company_name, location_code, depth)
    if not task_id:
        return []
    
    items = _poll_for_maps_results(task_id)
    locations = _parse_maps_items(items, company_name)
    
    for loc in locations:
        loc["country"] = country
    
    logger.info(f"✅ Found {len(locations)} locations in {country}")
    return locations
