import pandas as pd
from google_play_scraper import Sort, reviews
import requests
import os

from datetime import datetime
import concurrent.futures
import logging
import time as _time
import functools

# Configure logging
logging.basicConfig(level=logging.INFO)
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

import ssl
try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

import boto3
from botocore.exceptions import NoCredentialsError

logger = logging.getLogger(__name__)

def timed(fn):
    """Decorator that logs wall-clock time for any function call."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        t0 = _time.perf_counter()
        result = fn(*args, **kwargs)
        elapsed_ms = (_time.perf_counter() - t0) * 1000
        logger.info(f"TIMED {fn.__name__} {elapsed_ms:.1f}ms")
        return result
    return wrapper

# Import Google Maps Scraper (lazy or direct)

# Import DB models
from database import Review, SessionLocal

# Config
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)
RUN_GOOGLE_PLAY = True
RUN_APP_STORE = True
RUN_GOOGLE_MAPS = True
RUN_TRUSTPILOT = True
COUNTRIES = ['sa', 'ae', 'kw', 'bh', 'qa', 'om', 'us', 'eg']
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "horus-voc-data-storage-v2-eu")
AWS_REGION = os.getenv("AWS_REGION", "eu-central-1")

def upload_to_s3(file_path, object_name=None):
    """
    Upload a file to an S3 bucket and return the object key.
    """
    if object_name is None:
        object_name = os.path.basename(file_path)

    s3_client = boto3.client('s3', region_name=AWS_REGION)
    
    try:
        s3_client.upload_file(file_path, S3_BUCKET_NAME, object_name)
        logger.info(f"✅ Uploaded to S3: {object_name}")
        return object_name
        
    except FileNotFoundError:
        logger.error("The file was not found")
        return None
    except NoCredentialsError:
        logger.error("Credentials not available")
        return None
    except Exception as e:
        logger.error(f"Failed to upload to S3: {e}")
        return None

# 1. Google Play Scraper
def scrape_google_play(brand_name, app_id, since_date=None):
    if not app_id:
        return pd.DataFrame()

    logger.info(f"--- 🟢 Starting Google Play Scrape for {brand_name} ({app_id}) ---")
    limit_date = since_date if since_date is not None else datetime.now() - pd.DateOffset(months=6)
    
    def process_country(country):
        try:
            continuation_token = None
            country_reviews = []
            while True:
                result, continuation_token = reviews(
                    app_id, lang='en', country=country, sort=Sort.NEWEST,
                    count=200, continuation_token=continuation_token
                )
                if not result: break
                
                batch_oldest_date = None
                for r in result:
                    r_date = r['at']
                    if r_date < limit_date: continue
                    r['country'] = country 
                    country_reviews.append(r)
                    batch_oldest_date = r_date

                if batch_oldest_date and batch_oldest_date < limit_date: break
                if not continuation_token: break
                if len(country_reviews) > 2000: break
            
            return country_reviews
        except Exception:
            return []

    all_reviews = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(COUNTRIES)) as executor:
        future_to_country = {executor.submit(process_country, country): country for country in COUNTRIES}
        for future in concurrent.futures.as_completed(future_to_country):
            res = future.result()
            if res: all_reviews.extend(res)

    if not all_reviews: return pd.DataFrame()

    df = pd.DataFrame(all_reviews)
    if df.empty: return pd.DataFrame()

    needed_cols = ['content', 'score', 'at', 'userName', 'country']
    for c in needed_cols:
        if c not in df.columns: return pd.DataFrame()

    df = df[needed_cols]
    df.columns = ['text', 'rating', 'date', 'source_user', 'region']
    df['date'] = pd.to_datetime(df['date']).dt.strftime('%Y-%m-%d')
    df['platform'] = df['region'].apply(lambda x: f'Google Play ({x.upper()})')
    df['brand'] = brand_name
    df = df.drop(columns=['region'])
    return df

# 2. Apple App Store Scraper
def scrape_app_store(brand_name, app_id, since_date=None):
    if not app_id: return pd.DataFrame()
    logger.info(f"--- 🍎 Starting Apple App Store Scrape for {brand_name} ---")
    limit_date = pd.Timestamp(since_date if since_date is not None else datetime.now() - pd.DateOffset(months=6))
    
    def process_country(country):
        country_reviews = []
        
        def fetch_page(page):
            url = f"https://itunes.apple.com/{country}/rss/customerreviews/page={page}/id={app_id}/sortBy=mostRecent/json"
            try:
                resp = requests.get(url, timeout=5)
                if resp.status_code != 200: return []
                data = resp.json()
                entries = data.get('feed', {}).get('entry', [])
                if not entries: return []
                if isinstance(entries, dict): entries = [entries]
                
                page_reviews = []
                for entry in entries:
                    try:
                        date_str = entry.get('updated', {}).get('label', '')
                        entry_date = pd.to_datetime(date_str)
                        if entry_date.tz_localize(None) < limit_date:
                            continue
                        review = {
                            'text': entry.get('content', {}).get('label', ''),
                            'rating': int(entry.get('im:rating', {}).get('label', '0')),
                            'date': entry_date.strftime('%Y-%m-%d'),
                            'source_user': entry.get('author', {}).get('name', {}).get('label', 'Anonymous'),
                            'platform': f'App Store ({country.upper()})',
                            'brand': brand_name
                        }
                        page_reviews.append(review)
                    except: continue
                return page_reviews
            except: return []

        # Fetch up to 10 pages in parallel
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as page_executor:
            futures = [page_executor.submit(fetch_page, p) for p in range(1, 11)]
            for future in concurrent.futures.as_completed(futures):
                res = future.result()
                if res: country_reviews.extend(res)
                
        return country_reviews

    all_reviews = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(COUNTRIES)) as executor:
        future_to_country = {executor.submit(process_country, country): country for country in COUNTRIES}
        for future in concurrent.futures.as_completed(future_to_country):
            res = future.result()
            if res: all_reviews.extend(res)

    df = pd.DataFrame(all_reviews)
    if df.empty: return pd.DataFrame()
    return df

# MAIN LOGIC
@timed
def save_reviews_to_db(job_id: str, df: pd.DataFrame, portfolio_id: int):
    """Bulk insert reviews from DataFrame into the reviews table."""
    if df.empty:
        return

    db = SessionLocal()
    from database import CompanyModel
    from sqlalchemy.dialects.postgresql import insert
    try:
        company_mapping = {}
        if portfolio_id:
            companies = db.query(CompanyModel).filter(CompanyModel.portfolio_id == portfolio_id).all()
            for c in companies:
                company_mapping[c.company_name] = c.id

        reviews_data = []
        for _, row in df.iterrows():
            def _clean(val, is_str=True):
                if pd.isna(val): return "" if is_str else None
                s = str(val).strip()
                if s.lower() in ["nan", "none", "null", "nat"]: return "" if is_str else None
                return s

            brand_val = str(row.get("brand", ""))
            text_val = _clean(row.get("text"), True)
            user_val = _clean(row.get("source_user"), True)
            date_val = _clean(row.get("date"), True)
            plat_val = _clean(row.get("platform"), True)
            
            c_id = company_mapping.get(brand_val)
            if not c_id:
                c_id = company_mapping.get(brand_val.strip())
            
            try:
                if date_val:
                    # Try to parse the date string. Scrapers usually return 'YYYY-MM-DD'
                    dt_obj = pd.to_datetime(date_val).date()
                else:
                    dt_obj = None
            except Exception:
                dt_obj = None

            reviews_data.append({
                "job_id": job_id,
                "portfolio_id": portfolio_id,
                "company_id": c_id,
                "brand": brand_val,
                "text": text_val,
                "rating": int(row.get("rating", 0)) if pd.notna(row.get("rating")) else None,
                "date": dt_obj,
                "source_user": user_val,
                "platform": plat_val,
                "source_location": str(row.get("source_location", "")) if pd.notna(row.get("source_location")) else None,
            })
            
        if reviews_data:
            stmt = insert(Review).values(reviews_data)
            stmt = stmt.on_conflict_do_nothing(
                constraint='uq_review_text_user_date_platform'
            )
            db.execute(stmt)
            db.commit()
            logger.info(f"💾 Saved {len(reviews_data)} reviews to database for job {job_id}")
    except Exception as e:
        db.rollback()
        logger.error(f"❌ Failed to save reviews to database: {e}")
    finally:
        db.close()


def _fetch_latest_dates_batch(portfolio_id: int, brand_names: list) -> dict:
    """
    Fetch the most recent review date per brand per platform in a single query.
    Returns {brand_name: {play, app, maps, tp: max_date | None}}.
    Replaces 4 × N individual MAX queries with one GROUP BY query.
    """
    from sqlalchemy import func, case as sa_case
    db = SessionLocal()
    try:
        rows = db.query(
            Review.brand,
            func.max(sa_case((Review.platform.like("Google Play%"), Review.date), else_=None)).label("max_play"),
            func.max(sa_case((Review.platform.like("App Store%"),   Review.date), else_=None)).label("max_app"),
            func.max(sa_case((Review.platform.like("Google Maps%"), Review.date), else_=None)).label("max_maps"),
            func.max(sa_case((Review.platform == "Trustpilot",      Review.date), else_=None)).label("max_tp"),
        ).filter(
            Review.portfolio_id == portfolio_id,
            Review.brand.in_(brand_names),
        ).group_by(Review.brand).all()

        result = {}
        for row in rows:
            result[row.brand] = {
                "play": pd.to_datetime(row.max_play).tz_localize(None) if row.max_play else None,
                "app":  pd.to_datetime(row.max_app).tz_localize(None)  if row.max_app  else None,
                "maps": pd.to_datetime(row.max_maps).tz_localize(None) if row.max_maps else None,
                "tp":   pd.to_datetime(row.max_tp).tz_localize(None)   if row.max_tp   else None,
            }
        logger.info(f"BATCH dates fetched for {len(result)}/{len(brand_names)} brands in 1 query")
        return result
    except Exception as e:
        logger.error(f"Error batch-fetching latest dates: {e}")
        return {}
    finally:
        db.close()


@timed
def run_scraper_service(job_id, brands_list, portfolio_id, progress_callback=None):
    """
    Main function to run scraping. Saves result to backend/data/{job_id}.csv
    """
    logger.info(f"🚀 Starting Scraping Job {job_id}")
    if progress_callback:
        progress_callback("Starting scraping job...")

    all_dfs = []

    # Batch-fetch latest review dates for all brands in one DB query (Fix 3)
    brand_names_all = [b.get('name') or b.get('company_name') for b in brands_list
                       if b.get('name') or b.get('company_name')]
    latest_dates = _fetch_latest_dates_batch(portfolio_id, brand_names_all) if portfolio_id else {}

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        future_map = {}

        for brand in brands_list:
            name = brand.get('name') or brand.get('company_name')
            if not name: continue
            
            if progress_callback:
                progress_callback(f"Queuing scraping tasks for {name}...")
            
            android_id = brand.get('android_id', '')
            if android_id and ':' in android_id: android_id = android_id.split(':')[-1].strip()
            apple_id = brand.get('apple_id')
            
            gmaps_links = brand.get('google_maps_links', [])
            if brand.get('google_maps_link'):
                gmaps_links.append(brand.get('google_maps_link'))
            # Deduplicate links (handling both strings and dicts)
            unique_links = []
            seen_identifiers = set()
            for l in gmaps_links:
                if not l: continue
                identifier = l
                if isinstance(l, dict):
                    identifier = l.get('place_id') or l.get('url') or l.get('name')
                
                if identifier and identifier not in seen_identifiers:
                    seen_identifiers.add(identifier)
                    unique_links.append(l)
            gmaps_links = unique_links
            
            # Look up pre-fetched batch dates — no DB call per brand (Fix 3)
            dates = latest_dates.get(name, {})
            since_date_play = dates.get("play")
            since_date_app  = dates.get("app")
            since_date_maps = dates.get("maps")
            since_date_tp   = dates.get("tp")

            if RUN_GOOGLE_PLAY and android_id:
                f = executor.submit(scrape_google_play, name, android_id, since_date_play)
                future_map[f] = {'brand': name, 'type': 'play'}
                
            if RUN_APP_STORE and apple_id:
                f = executor.submit(scrape_app_store, name, apple_id, since_date_app)
                future_map[f] = {'brand': name, 'type': 'app'}
                
            if RUN_GOOGLE_MAPS and gmaps_links:
                batch_locations_new = []
                batch_locations_existing = []

                # Simple heuristic: if company is Kcal or website is .ae, use UAE
                default_loc = "Saudi Arabia"
                if "kcal" in name.lower() or (brand.get('website') and ".ae" in brand.get('website').lower()):
                    default_loc = "United Arab Emirates"
                
                # Build all targets without any DB calls (Fix 4)
                link_targets = []
                for link_data in gmaps_links:
                    if not link_data: continue
                    if isinstance(link_data, dict):
                        place_id = link_data.get("place_id", "")
                        url = link_data.get("url", "")
                        location_name = link_data.get("name", "")
                        target = f"place_id:{place_id}" if place_id else (url or location_name)
                    else:
                        target = link_data
                    if target:
                        link_targets.append(target)

                # Single IN query to check all locations at once (Fix 4)
                existing_locations: set = set()
                if link_targets:
                    db = SessionLocal()
                    try:
                        existing_rows = db.query(Review.source_location).filter(
                            Review.portfolio_id == portfolio_id,
                            Review.brand == name,
                            Review.source_location.in_(link_targets),
                        ).distinct().all()
                        existing_locations = {row.source_location for row in existing_rows}
                        logger.info(f"Location check for {name}: {len(link_targets)} targets, 1 query, {len(existing_locations)} existing")
                    finally:
                        db.close()

                # Classify without further DB calls
                for target in link_targets:
                    loc_item = {"keyword": target, "name": target, "location": default_loc}
                    if target in existing_locations:
                        batch_locations_existing.append(loc_item)
                    else:
                        batch_locations_new.append(loc_item)

                from services.fetch_maps_reviews import scrape_multiple_locations
                
                if batch_locations_new:
                    # New locations get 6 months lookback
                    since_date_6m = datetime.now() - pd.DateOffset(months=6)
                    f = executor.submit(scrape_multiple_locations, batch_locations_new, since_date=since_date_6m)
                    future_map[f] = {'brand': name, 'type': 'maps_batch', 'locations': [loc['name'] for loc in batch_locations_new]}
                    logger.info(f"📍 Queued {len(batch_locations_new)} NEW locations for {name} (Since 6 months)")

                if batch_locations_existing:
                    # Existing locations use the brand's latest review date
                    f = executor.submit(scrape_multiple_locations, batch_locations_existing, since_date=since_date_maps)
                    future_map[f] = {'brand': name, 'type': 'maps_batch', 'locations': [loc['name'] for loc in batch_locations_existing]}
                    logger.info(f"📍 Queued {len(batch_locations_existing)} EXISTING locations for {name} (Since {since_date_maps})")
            
            trustpilot_link = brand.get('trustpilot_link')
            if RUN_TRUSTPILOT and trustpilot_link:
                from services.fetch_trustpilot_reviews import scrape_trustpilot
                f = executor.submit(scrape_trustpilot, name, trustpilot_link, since_date=since_date_tp)
                future_map[f] = {'brand': name, 'type': 'trustpilot'}

        # Track all maps link results (including 0)
        maps_link_results = {}  # {brand: {link: count}}

        # Collect results
        completed_count = 0
        total_futures = len(future_map)

        for future in concurrent.futures.as_completed(future_map):
            meta = future_map[future]
            brand_name = meta['brand']
            scraped_type = meta.get('type', 'Unknown')
            completed_count += 1
            
            if progress_callback:
                # Human friendly message
                readable_type = {
                    'play': 'Google Play',
                    'app': 'App Store',
                    'maps': 'Google Maps'
                }.get(scraped_type, scraped_type)
                
                progress_callback(f"[{completed_count}/{total_futures}] Analyzed {readable_type} for {brand_name}")

            try:
                df = future.result()
                
                # Track maps link results
                if meta['type'] == 'maps_batch':
                    if brand_name not in maps_link_results:
                        maps_link_results[brand_name] = {}
                    
                    # If it's a batch, we need to extract per-location counts if available
                    # The optimized scrape_multiple_locations adds 'source_location' to the DF
                    if not df.empty and 'source_location' in df.columns:
                        for loc in meta['locations']:
                            loc_df = df[df['source_location'] == loc]
                            maps_link_results[brand_name][loc] = len(loc_df)
                    else:
                        for loc in meta['locations']:
                            maps_link_results[brand_name][loc] = 0
                
                if meta['type'] in ['play', 'app', 'trustpilot']:
                    pass # Standard handling
                
                if not df.empty:
                    df['brand'] = brand_name
                    # 'source_location' is already in maps batch DF
                    all_dfs.append(df)
            except Exception as e:
                logger.error(f"Failed task for {brand_name} ({meta['type']}): {e}")
                # Still track failed maps links with 0 count
                if meta['type'] == 'maps':
                    if brand_name not in maps_link_results:
                        maps_link_results[brand_name] = {}
                    maps_link_results[brand_name][meta['link']] = 0

    # Combine & Save
    result_metadata = {
        "status": "failed", 
        "message": "No data collected",
        "file_path": None,
        "summary": "",
        "brand_names": [],
        "sample_reviews": []
    }
    
    if all_dfs:
        final_df = pd.concat(all_dfs, ignore_index=True)
        final_df.drop_duplicates(subset=['text', 'source_user', 'date', 'brand'], inplace=True)
        
        # --- DEPRECATED: CSV EXPORT & S3 UPLOAD ---
        # filename = f"{job_id}.csv"
        # file_path = os.path.join(DATA_DIR, filename)
        # final_df.to_csv(file_path, index=False, encoding='utf-8-sig')
        # s3_url = upload_to_s3(file_path, f"scrapped_data/{filename}")
        # ----------------------------------------
        file_path = None
        s3_url = None

        # Save reviews to database
        if portfolio_id:
            logger.info(f"💾 Saving {len(final_df)} reviews to DB (Portfolio: {portfolio_id})")
            save_reviews_to_db(job_id, final_df, portfolio_id)
        
        # Summary
        
        # Summary
        summary_lines = []
        brands = final_df['brand'].unique()
        for b in brands:
            brand_df = final_df[final_df['brand'] == b]
            play_count = len(brand_df[brand_df['platform'].str.contains('Google Play', case=False, na=False)])
            app_count = len(brand_df[brand_df['platform'].str.contains('App Store', case=False, na=False)])
            
            maps_df = brand_df[brand_df['platform'].str.contains('Google Maps', case=False, na=False)]
            maps_count = len(maps_df)
            
            tp_count = len(brand_df[brand_df['platform'] == 'Trustpilot'])
            
            summary_lines.append(f"{b} - Playstore: {play_count} - App Store: {app_count} - Google Maps: {maps_count} - Trustpilot: {tp_count}")
            
            # Add detailed maps breakdown using tracked results (includes 0 results)
            if b in maps_link_results:
                for link, link_count in maps_link_results[b].items():
                    # Show full link without truncation
                    summary_lines.append(f"    - {link}: {link_count}")

            summary_lines.append("") # Empty line for spacing
        
        summary_text = "\n".join(summary_lines)
        
        # Samples
        sample_reviews = []
        if not final_df.empty:
            sample_df = final_df.sample(n=min(5, len(final_df)))
            # Replace NaN/Infinity values with None for JSON serialization
            sample_df = sample_df.fillna('').replace([float('inf'), float('-inf')], '')
            sample_reviews = sample_df.to_dict(orient='records')
            
        result_metadata.update({
            "status": "completed",
            "message": "Scraping successful",
            "message": "Scraping successful",
            "file_path": file_path,
            "s3_key": s3_url, # s3_url variable now holds the key from upload_to_s3 
            "summary": summary_text,
            "brand_names": list(brands),
            "sample_reviews": sample_reviews
        })
        
    return result_metadata
