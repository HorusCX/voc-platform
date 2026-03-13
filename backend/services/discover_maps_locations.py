"""
Google Maps Location Discovery using DataForSEO API

API Documentation: https://docs.dataforseo.com/v3/serp/google/maps/
"""

import requests
import base64
import os
import time
import logging
import difflib
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional
from functools import wraps

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# DataForSEO API Configuration (reuse from google_maps.py)
DATAFORSEO_LOGIN = os.getenv("DATAFORSEO_LOGIN")
DATAFORSEO_PASSWORD = os.getenv("DATAFORSEO_PASSWORD")
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

# Prioritize countries by business density and likelihood
PRIORITY_COUNTRIES = [
    "United Arab Emirates",
    "Saudi Arabia",
    "Egypt",
    "Kuwait",
    "Qatar",
    "Bahrain",
    "Oman",
]

# Configuration
MAX_LOCATIONS_TARGET = 30  # Stop early if we reach this many locations
DEFAULT_POLL_ATTEMPTS = 10  # Increased to give it ~1.5 minutes to process

# --- Layer 1: Valid countries for address validation ---
GCC_EGYPT_KEYWORDS: frozenset = frozenset({
    # Country names
    "saudi arabia", "united arab emirates", "uae", "egypt",
    "kuwait", "bahrain", "qatar", "oman",
    # Saudi cities
    "riyadh", "jeddah", "mecca", "medina", "dammam", "khobar",
    "jubail", "tabuk", "abha", "taif", "yanbu", "najran",
    # UAE cities
    "dubai", "abu dhabi", "sharjah", "ajman", "fujairah",
    "ras al khaimah", "al ain", "umm al quwain",
    # Egypt cities
    "cairo", "alexandria", "giza", "luxor", "aswan", "hurghada",
    "sharm el sheikh", "mansoura", "tanta", "suez", "ismailia",
    # Kuwait, Bahrain, Qatar, Oman cities
    "kuwait city", "hawalli", "salmiya", "manama", "muharraq",
    "riffa", "doha", "al wakrah", "lusail", "muscat", "salalah",
    # Abbreviations
    "ksa", "gcc",
    # Arabic country names
    "مصر", "السعودية", "الإمارات", "الكويت", "البحرين", "قطر", "عمان",
})

# --- Layer 2: Brand name matching config ---
FUZZY_SIMILARITY_THRESHOLD = 0.65
DISTINCTIVE_WORD_MIN_LEN = 5
_NAME_STOPWORDS = frozenset({
    'the', 'and', 'inc', 'llc', 'ltd', 'co', 'corp', 'company', 'group',
    'rent', 'car', 'rental', 'service', 'services', 'international', 'global',
    'trading', 'trade', 'enterprises', 'solutions', 'hotel', 'hotels',
    'center', 'centre', 'store', 'shop', 'market',
})

def _retry_on_failure(max_retries: int = 1, delay: float = 0.5):
    """Decorator to retry failed API calls with exponential backoff"""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            last_exception = None
            for attempt in range(max_retries + 1):
                try:
                    return func(*args, **kwargs)
                except requests.RequestException as e:
                    last_exception = e
                    if attempt < max_retries:
                        wait_time = delay * (2 ** attempt)
                        logger.warning(f"Retry {attempt + 1}/{max_retries} after {wait_time}s: {e}")
                        time.sleep(wait_time)
                    else:
                        logger.error(f"Failed after {max_retries} retries: {e}")
            raise last_exception
        return wrapper
    return decorator


def _get_auth_header() -> dict:
    """Generate Basic Auth header for DataForSEO API"""
    login = os.getenv("DATAFORSEO_LOGIN")
    password = os.getenv("DATAFORSEO_PASSWORD")
    if not login or not password:
        logger.error("DataForSEO credentials missing in _get_auth_header")
        return {}
        
    credentials = f"{login}:{password}"
    encoded = base64.b64encode(credentials.encode()).decode()
    return {
        "Authorization": f"Basic {encoded}",
        "Content-Type": "application/json"
    }


@_retry_on_failure(max_retries=1, delay=0.5)
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
        # Reduced timeout to 30s to prevent hanging
        response = requests.post(url, json=payload, headers=_get_auth_header(), timeout=30)
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


def _poll_for_maps_results(task_id: str, max_attempts: int = DEFAULT_POLL_ATTEMPTS, initial_wait: float = 2.0) -> List[Dict]:
    """
    Poll for Google Maps SERP task completion.
    Returns list of location items or empty list.
    """
    url = f"{DATAFORSEO_BASE_URL}/serp/google/maps/task_get/advanced/{task_id}"
    
    wait_time = initial_wait
    
    for attempt in range(max_attempts):
        time.sleep(wait_time)
        
        try:
            # Short timeout for polling
            response = requests.get(url, headers=_get_auth_header(), timeout=10)
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
                wait_time = min(wait_time * 1.5, 10.0) # Cap wait time at 10s
            
            # No results found
            elif status_code == 40102:
                logger.warning(f"Task {task_id}: No results found")
                return []
                
            else:
                logger.warning(f"Task {task_id}: Status {status_code} - {task.get('status_message')}")
                wait_time = min(wait_time * 1.5, 10.0)
                
        except Exception as e:
            logger.error(f"Error polling task {task_id}: {e}")
            # Don't break immediately on network error, try one more time if attempts allow
    
    logger.warning(f"Task {task_id}: Timeout after {max_attempts} attempts")
    return []


def _is_address_in_gcc_egypt(address: str) -> bool:
    """Returns True only if address contains a GCC/Egypt city or country keyword."""
    if not address or not address.strip():
        return False
    address_lower = address.lower()
    return any(kw in address_lower for kw in GCC_EGYPT_KEYWORDS)


def _get_distinctive_word(company_name: str) -> str:
    """Returns the longest non-stopword from the company name (min 5 chars)."""
    words = [
        w.lower() for w in company_name.split()
        if w.lower() not in _NAME_STOPWORDS and len(w) >= DISTINCTIVE_WORD_MIN_LEN
    ]
    if not words:
        words = [company_name.split()[0].lower()] if company_name.split() else []
    return max(words, key=len) if words else ""


def _title_matches_brand(title: str, company_name: str) -> bool:
    """
    Two-gate check:
    Gate 1: The brand's distinctive word MUST appear in the title.
    Gate 2: Either fuzzy similarity >= threshold, OR title starts with distinctive word,
            OR full company name is a substring of title.
    """
    if not title or not company_name:
        return False
    title_lower = title.lower()
    company_lower = company_name.lower()
    distinctive = _get_distinctive_word(company_name)

    # Gate 1: hard requirement — distinctive word must appear
    if distinctive and distinctive not in title_lower:
        return False

    # Gate 2a: fuzzy match against title prefix (ignore long branch suffixes)
    title_prefix = title_lower[:max(len(company_lower), len(distinctive) + 15)]
    ratio = difflib.SequenceMatcher(None, company_lower, title_prefix).ratio()
    if ratio >= FUZZY_SIMILARITY_THRESHOLD:
        return True

    # Gate 2b: title begins with the brand's distinctive word
    if title_lower.startswith(distinctive):
        return True

    # Gate 2c: exact brand name is a substring of title
    if company_lower in title_lower:
        return True

    return False


def _gemini_validate_locations(
    locations: List[Dict], company_name: str, gemini_key: str
) -> List[Dict]:
    """
    Sends candidate locations to Gemini to confirm they are genuine branches of company_name.
    Fail-open: returns all locations unchanged if the Gemini call fails for any reason.
    """
    if not locations or not gemini_key:
        return locations

    candidates = [
        {"index": i, "name": loc["name"], "address": loc["address"]}
        for i, loc in enumerate(locations)
    ]
    prompt = (
        f'You are validating business locations for the brand "{company_name}".\n'
        f"Return a JSON array of the INTEGER indices of locations that are genuine "
        f'branches, offices, or franchises of "{company_name}". '
        f"Exclude competitors, unrelated businesses, or different companies with similar names.\n\n"
        f"Candidates:\n{json.dumps(candidates, ensure_ascii=False)}\n\n"
        f"Return ONLY a JSON array of integers, e.g. [0, 1, 3]. No explanation."
    )
    endpoint = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"gemini-2.5-flash:generateContent?key={gemini_key}"
    )
    try:
        resp = requests.post(
            endpoint,
            json={
                "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                "generationConfig": {"responseMimeType": "application/json"},
            },
            timeout=60,
        )
        resp.raise_for_status()
        valid_indices = json.loads(
            resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        )
        if not isinstance(valid_indices, list):
            logger.warning("Gemini validation returned unexpected format; skipping filter")
            return locations
        confirmed = [
            locations[i] for i in valid_indices
            if isinstance(i, int) and 0 <= i < len(locations)
        ]
        logger.info(
            f"Gemini validation: {len(locations)} candidates → {len(confirmed)} confirmed for '{company_name}'"
        )
        return confirmed
    except Exception as e:
        logger.warning(f"Gemini location validation failed ({e}); returning unfiltered candidates")
        return locations  # fail-open


def _parse_maps_items(items: List[Dict], company_name: str, gemini_key: Optional[str] = None) -> List[Dict]:
    """
    Parse DataForSEO Google Maps SERP items into normalized location objects.
    Applies a 3-layer filter pipeline:
      Layer 1: Address must be in GCC/Egypt (eliminates India, Pakistan, etc.)
      Layer 2: Title must credibly match the brand name (fuzzy + distinctive word)
      Layer 3: Gemini AI batch validation for final quality assurance
    """
    locations = []

    for item in items:
        if item.get("type") != "maps_search":
            continue

        title = item.get("title", "") or ""
        place_id = item.get("place_id", "") or ""
        address = item.get("address", "") or ""

        if not place_id:
            continue

        # Layer 1: address must be physically in GCC/Egypt
        if not _is_address_in_gcc_egypt(address):
            logger.debug(f"L1 reject (wrong country): {title!r} — {address!r}")
            continue

        # Layer 2: title must credibly match the brand name
        if not _title_matches_brand(title, company_name):
            logger.debug(f"L2 reject (brand mismatch): {title!r}")
            continue

        maps_url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"
        locations.append({
            "place_id": place_id,
            "name": title,
            "url": maps_url,
            "address": address,
            "rating": item.get("rating", {}).get("value") if item.get("rating") else None,
            "reviews_count": int(item.get("rating", {}).get("votes_count") or 0) if item.get("rating") else None,
        })

    logger.info(f"After L1+L2 filters: {len(locations)} candidates for '{company_name}'")

    # Layer 3: Gemini AI batch validation on surviving candidates
    if gemini_key and locations:
        locations = _gemini_validate_locations(locations, company_name, gemini_key)

    logger.info(f"Final: {len(locations)} matching locations for '{company_name}'")
    return locations


def discover_maps_links(company_name: str, website: str,
                         progress_callback=None,
                         location_context: str = "Middle East/GCC or Egypt",
                         gemini_key: Optional[str] = None) -> List[Dict]:
    """
    Discover Google Maps business locations using DataForSEO API.

    Args:
        company_name: Name of the company to search for
        website: Company website (not used currently but kept for API compatibility)
        progress_callback: Optional function to call with status updates
        location_context: Not used (searches all GCC/MENA countries)
        gemini_key: Optional Gemini API key for Layer 3 AI validation.
                    Defaults to GEMINI_API_KEY env var if not provided.

    Returns:
        List of location dicts with: place_id, name, url, address, rating, reviews_count
    """
    # Load credentials dynamically to ensure they are available
    login = os.getenv("DATAFORSEO_LOGIN")
    password = os.getenv("DATAFORSEO_PASSWORD")
    
    if not login or not password:
        logger.error("❌ DataForSEO credentials not configured (DATAFORSEO_LOGIN/PASSWORD missing)")
        if progress_callback:
            progress_callback("Error: Server configuration missing credentials")
        return []

    # Auto-load Gemini key from env for Layer 3 AI validation
    if gemini_key is None:
        gemini_key = os.getenv("GEMINI_API_KEY")
    if gemini_key:
        logger.info("🤖 Gemini AI validation enabled for Layer 3 filtering")
    else:
        logger.info("ℹ️  Gemini key not found — Layer 3 AI validation skipped")

    logger.info(f"🔍 DataForSEO Maps Discovery: Searching for '{company_name}' across GCC/MENA region...")
    if progress_callback:
        progress_callback(f"Starting discovery for '{company_name}'...")
    
    all_locations = []
    seen_place_ids = set()
    
    # Search across multiple countries in priority order
    def search_country(country_name: str, location_code: int):
        """Search for company in a specific country"""
        if progress_callback:
            progress_callback(f"Searching in {country_name}...")
            
        try:
            # We need to pass credentials to helper functions or ensure they use os.getenv too?
            # actually _create_maps_search_task uses global DATAFORSEO_LOGIN/PASSWORD
            # Let's verify _create_maps_search_task uses updated values or refresh them there too.
            # Ideally we refactor helpers to take credentials, but for now we rely on os.getenv in helpers
            # IF we update the globals or just trust os.getenv works globally if loaded.
            
            task_id = _create_maps_search_task(company_name, location_code, depth=50)
            if not task_id:
                logger.warning(f"Failed to create task for {country_name}")
                return []
            
            # Use optimized polling attempts
            items = _poll_for_maps_results(task_id, max_attempts=DEFAULT_POLL_ATTEMPTS)
            locations = _parse_maps_items(items, company_name, gemini_key=gemini_key)
            
            # Add country info
            for loc in locations:
                loc["country"] = country_name
                
            return locations
        except Exception as e:
            logger.error(f"Error searching {country_name}: {e}")
            return []
    
    # Use priority-ordered countries for better early termination
    ordered_countries = [
        (country, LOCATION_CODES[country]) 
        for country in PRIORITY_COUNTRIES 
        if country in LOCATION_CODES
    ]
    
    # Run searches in parallel (max 10 concurrent to cover all countries at once)
    with ThreadPoolExecutor(max_workers=10) as executor:
        futures = {
            executor.submit(search_country, country, code): country 
            for country, code in ordered_countries
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
                
                # Early termination: stop if we have enough quality results
                if len(all_locations) >= MAX_LOCATIONS_TARGET:
                    logger.info(f"🎯 Reached target of {MAX_LOCATIONS_TARGET} locations, stopping early")
                    break
                    
            except Exception as e:
                logger.error(f"Error processing results from {country}: {e}")
    
    # Sort by reviews count (most reviewed first)
    all_locations.sort(key=lambda x: x.get("reviews_count") or 0, reverse=True)
    
    logger.info(f"✅ DataForSEO Maps Discovery: Found {len(all_locations)} unique locations for '{company_name}'")
    
    return all_locations


def discover_maps_links_single_country(company_name: str, country: str = "Saudi Arabia",
                                         depth: int = 50,
                                         gemini_key: Optional[str] = None) -> List[Dict]:
    """
    Discover locations in a single country (faster, cheaper option).

    Args:
        company_name: Name of the company to search for
        country: Country name (must be in LOCATION_CODES)
        depth: Number of results to fetch (max 100)
        gemini_key: Optional Gemini API key for Layer 3 AI validation.
                    Defaults to GEMINI_API_KEY env var if not provided.

    Returns:
        List of location dicts
    """
    location_code = LOCATION_CODES.get(country)
    if not location_code:
        logger.error(f"Unknown country: {country}. Available: {list(LOCATION_CODES.keys())}")
        return []

    if gemini_key is None:
        gemini_key = os.getenv("GEMINI_API_KEY")

    logger.info(f"🔍 Searching for '{company_name}' in {country}...")

    task_id = _create_maps_search_task(company_name, location_code, depth)
    if not task_id:
        return []

    items = _poll_for_maps_results(task_id)
    locations = _parse_maps_items(items, company_name, gemini_key=gemini_key)

    for loc in locations:
        loc["country"] = country

    logger.info(f"✅ Found {len(locations)} locations in {country}")
    return locations
