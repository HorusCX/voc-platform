from google_play_scraper import search

from openai import OpenAI
import json
import logging
import concurrent.futures
import requests
from bs4 import BeautifulSoup
import re

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def search_google_play(query):
    # Try multiple regions since some apps are region-locked to GCC
    regions = ['us', 'ae', 'sa']
    
    best_result = None

    for country in regions:
        try:
            results = search(query, lang='en', country=country)
            if results:
                # Iterate through top 3 results to find the best match
                for result in results[:3]:
                    title = result.get('title', '').lower()
                    developer = result.get('developer', '').lower()
                    app_id = result.get('appId')
                    query_clean = query.lower()
                    
                    # 1. Strong Match: Developer name contains query (e.g. Developer "Calo Inc" for query "Calo")
                    if query_clean in developer:
                        logger.info(f"Strong match found (Developer): '{title}' ({app_id}) in {country}")
                        return app_id
                        
                    # 2. Perfect Title Match: Title is exactly the query (e.g. "Calo")
                    if title == query_clean:
                        logger.info(f"Strong match found (Exact Title): '{title}' ({app_id}) in {country}")
                        return app_id

                    # 3. Heuristic: If title starts with query and is short, it's likely good.
                    # Avoid generic "Calorie Counter" apps if query is "Calo" unless developer matches.
                    if title.startswith(query_clean) and len(title) < len(query_clean) + 5:
                         if not best_result: best_result = app_id
                         
                # Fallback: specific anti-pattern
                # If we found nothing strong, but have a result, check if it's generic
                first = results[0]
                if not best_result:
                    title = first.get('title', '').lower()
                    # If title contains generic words like "calorie counter" but query didn't, be careful
                    if "calorie counter" in title and "calorie" not in query.lower():
                        continue # Skip this result, try next country (maybe AE has the real branded app)
                        
                    query_words = [w.lower() for w in query.split() if len(w) > 2]
                    if not query_words or any(w in title for w in query_words):
                        best_result = first['appId']

        except Exception as e:
            logger.warning(f"Google Play search failed for {query} in {country}: {e}")
    
    return best_result

def search_app_store(query):
    # Try multiple regions
    regions = ['us', 'ae', 'sa']
    
    best_result = None
    
    for country in regions:
        try:
            # Use iTunes Search API directly
            url = "https://itunes.apple.com/search"
            params = {
                "term": query,
                "country": country,
                "entity": "software",
                "limit": 3 # Fetch top 3 to check developer
            }
            response = requests.get(url, params=params, timeout=10)
            data = response.json()
            
            if data.get("resultCount", 0) > 0:
                for result in data["results"]:
                    track_name = result.get("trackName", "").lower()
                    seller_name = result.get("sellerName", "").lower()
                    app_id = str(result["trackId"])
                    query_clean = query.lower()

                    # 1. Strong Match: Developer/Seller name contains query
                    if query_clean in seller_name:
                         logger.info(f"Strong match found (Developer): '{track_name}' ({app_id}) in {country}")
                         return app_id
                         
                    # 2. Perfect Title Match
                    if track_name == query_clean:
                        logger.info(f"Strong match found (Exact Title): '{track_name}' ({app_id}) in {country}")
                        return app_id

                    # 3. Fallback logic similar to Google Play
                    if not best_result:
                         # Anti-pattern check
                         if "calorie counter" in track_name and "calorie" not in query_clean:
                             continue
                             
                         query_words = [w.lower() for w in query.split() if len(w) > 2]
                         if not query_words or any(w in track_name for w in query_words):
                             best_result = app_id
                
        except Exception as e:
            logger.warning(f"App Store search failed for {query} in {country}: {e}")
            
    return best_result

def find_app_links_on_website(url):
    """
    Scrapes the given URL for Google Play and App Store links
    and extracts the IDs. Handles common app redirect services.
    Returns a dict: {'android_id': str|None, 'apple_id': str|None}
    """
    found = {'android_id': None, 'apple_id': None}
    
    if not url:
        return found
        
    if not url.startswith('http'):
        url = 'https://' + url
        
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
        response = requests.get(url, headers=headers, timeout=10)
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Potential redirect domains or patterns
        redirect_domains = ['go.link', 'onelink.me', 'page.link', 'app.link', 'adjust.com', 'appsflyer.com', 'bit.ly', 'tinyurl.com']
        
        links_to_check = []

        # Look for all links
        for link in soup.find_all('a', href=True):
            href = link['href']
            
            # Check for direct store links
            # Google Play
            if 'play.google.com' in href and 'id=' in href:
                match = re.search(r'id=([a-zA-Z0-9_.]+)$', href.split('&')[0])
                if match:
                    id_match = re.search(r'id=([a-zA-Z0-9_.]+)', href)
                    if id_match:
                        found['android_id'] = id_match.group(1)

            # App Store
            elif 'apps.apple.com' in href and '/id' in href:
                match = re.search(r'id(\d+)', href)
                if match:
                    found['apple_id'] = match.group(1)
            
            # Check for potential redirects
            elif any(d in href for d in redirect_domains) or ('app' in href.lower() and ('store' in href.lower() or 'download' in href.lower())):
                 # Avoid internal links or mailto
                 if href.startswith('http'):
                     links_to_check.append(href)

            if found['android_id'] and found['apple_id']:
                break
        
        # If still missing IDs, check the potential redirect links (limit to top 5 to avoid slowness)
        if (not found['android_id'] or not found['apple_id']) and links_to_check:
            for link_url in links_to_check[:5]:
                try:
                    # Use GET instead of HEAD as some redirectors block HEAD or behave differently
                    # Stream=True to avoid downloading large files if it's not a redirect
                    resp = requests.get(link_url, headers=headers, allow_redirects=True, timeout=5, stream=True)
                    final_url = resp.url
                    resp.close()
                    
                    # Check if final URL is a store link
                    if 'play.google.com' in final_url and 'id=' in final_url:
                        id_match = re.search(r'id=([a-zA-Z0-9_.]+)', final_url)
                        if id_match and not found['android_id']:
                            found['android_id'] = id_match.group(1)
                            
                    if 'apps.apple.com' in final_url and '/id' in final_url:
                         match = re.search(r'id(\d+)', final_url)
                         if match and not found['apple_id']:
                             found['apple_id'] = match.group(1)
                             
                except Exception:
                    continue
                
                if found['android_id'] and found['apple_id']:
                    break
                
    except Exception as e:
        logger.warning(f"Failed to scrape {url} for app links: {e}")
        
    return found

def validate_ids_with_llm(company_name, website, android_id, apple_id, openai_key):
    """
    Uses OpenAI to validate if the found IDs are correct for the company.
    """
    if not android_id and not apple_id:
        return {'android_id': None, 'apple_id': None}
        
    if not openai_key:
        return {'android_id': android_id, 'apple_id': apple_id}

    try:
        client = OpenAI(api_key=openai_key)
        prompt = f"""
        I found these mobile app IDs for the company "{company_name}" ({website}):
        - Android ID: {android_id}
        - Apple ID: {apple_id}
        
        Please verify these IDs.
        1. If an ID is clearly correct (e.g. matches company name), keep it.
        2. If an ID follows the pattern 'com.companyname' (e.g. com.rightbite for Right Bite), it is almost certainly CORRECT. Keep it.
        3. If the ID represents a GENERIC app (e.g. "Calorie Counter" by a 3rd party) when I asked for a SPECIFIC brand "Calo", set it to NULL.
        4. If an ID is definitely WRONG (e.g. a game, a different company, or a generic tool), set it to null.
        5. If you are unsure, default to keeping the ID.
        6. If an ID is missing but you know the correct official app ID (especially for GCC region like UAE/KSA), please provide it.
        
        Return JSON only: {{ "android_id": "...", "apple_id": "..." }}
        """
        
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are a helpful assistant that validates mobile app IDs. You favor keeping IDs unless they are clearly wrong."},
                {"role": "user", "content": prompt}
            ],
            response_format={ "type": "json_object" }
        )
        
        # content = response.choices[0].message.content
        content = response.choices[0].message.content
        data = json.loads(content)
        return data
        
    except Exception as e:
        logger.warning(f"LLM validation failed for {company_name}: {e}")
        # Return original if validation fails
        return {'android_id': android_id, 'apple_id': apple_id}

def resolve_app_ids(company_list, openai_key):
    """
    Takes a list of company objects and attempts to fill in missing 
    android_id and apple_id fields.
    """
    
    def process_company(company):
        name = company.get('company_name') or company.get('name')
        website = company.get('website')
        
        if not name:
            return company

        # 0. Try scraping website first
        if website and (not company.get('android_id') or not company.get('apple_id')):
            scraped_ids = find_app_links_on_website(website)
            if not company.get('android_id') and scraped_ids['android_id']:
                company['android_id'] = scraped_ids['android_id']
            if not company.get('apple_id') and scraped_ids['apple_id']:
                company['apple_id'] = scraped_ids['apple_id']
        
        # Clean name for search
        search_name = re.sub(r'[^a-zA-Z0-9\s]', ' ', name).strip()
        
        # 1. Try filling Android ID via search if still missing
        if not company.get('android_id'):
            found_id = search_google_play(name)
            if not found_id and search_name != name:
                 found_id = search_google_play(search_name)
            if found_id:
                company['android_id'] = found_id
                
        # 2. Try filling Apple ID via search if still missing
        if not company.get('apple_id'):
            found_id = search_app_store(name)
            if not found_id and search_name != name:
                found_id = search_app_store(search_name)
            if found_id:
                company['apple_id'] = found_id
                
        # 3. Fallback: Use OpenAI to find IDs if still missing
        if (not company.get('android_id') or not company.get('apple_id')) and openai_key:
            try:
                client = OpenAI(api_key=openai_key)
                prompt = f"""
                I need the Android App ID (package name) and iOS App ID for the company "{name}" (Website: {website}).
                
                Examples:
                - Calo: android_id="com.calo.webapp", apple_id="1497894777"
                - Talabat: android_id="com.talabat", apple_id="450534131"
                
                If the company has rebranded (e.g. Kcal Extra -> Kcal Life), use the new app.
                Return JSON only: {{ "android_id": "...", "apple_id": "..." }}
                Use null if not found.
                """
                
                response = client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": "You are a helpful assistant that finds mobile app IDs."},
                        {"role": "user", "content": prompt}
                    ],
                    response_format={ "type": "json_object" }
                )
                
                content = response.choices[0].message.content
                data = json.loads(content)
                
                if not company.get('android_id') and data.get('android_id'):
                    company['android_id'] = data.get('android_id')
                    
                if not company.get('apple_id') and data.get('apple_id'):
                    company['apple_id'] = data.get('apple_id')
                    
            except Exception as e:
                logger.warning(f"OpenAI fallback failed for {name}: {e}")

        # 4. Final Validation: Use LLM to verify found IDs and correct them if needed
        # Skip validation if IDs look very strong (contain company name) to avoid LLM false negatives
        strong_android = False
        strong_apple = False
        
        normalized_name = re.sub(r'[^a-zA-Z0-9]', '', name).lower()
        if company.get('android_id') and normalized_name in company.get('android_id').lower():
            strong_android = True
            
        if (strong_android and company.get('apple_id')) or (strong_android and not company.get('apple_id') and not openai_key):
             # If we have a strong match and don't need to check apple (or have it), skip LLM
             pass
        elif openai_key and (company.get('android_id') or company.get('apple_id')):
            # Only validate what needs validation
            val_android = None if strong_android else company.get('android_id')
            # Always validate apple if present, or if we need to find missing one
            
            validated = validate_ids_with_llm(name, website, val_android, company.get('apple_id'), openai_key)
            
            if not strong_android:
                company['android_id'] = validated.get('android_id')
                
            # For Apple, trusted search is usually good, but let's allow LLM to fill gaps
            if not company.get('apple_id') and validated.get('apple_id'):
                company['apple_id'] = validated.get('apple_id')
                
        return company

    # Run in parallel to speed up
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(process_company, company_list))
        
    return results
