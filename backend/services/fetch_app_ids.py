import logging
import concurrent.futures
import requests
from bs4 import BeautifulSoup
import re
from urllib.parse import unquote

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def find_app_links_on_website(url):
    """Scrapes the website for app store links and returns IDs with high resilience."""
    found = {'android_id': None, 'apple_id': None}
    if not url: return found
    if not url.startswith('http'): url = 'https://' + url
        
    try:
        # Robust headers to mimic a real browser session
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Referer': 'https://www.google.com/'
        }
        
        session = requests.Session()
        soup = None
        html_content = ""
        
        # Some sites block initial request, retry once if needed
        try:
            response = session.get(url, headers=headers, timeout=12)
            if response.status_code == 403:
                headers['User-Agent'] = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
                response = session.get(url, headers=headers, timeout=12)
            
            # Print debug for verification
            print(f"DEBUG: Scraped status code: {response.status_code}")
            
            if response.status_code == 200:
                html_content = response.text
                soup = BeautifulSoup(html_content, 'html.parser')
        except Exception as e:
            print(f"DEBUG: Initial request failed for {url}: {e}")
            logger.warning(f"Initial request failed for {url}: {e}")
            # Do not return; let response/soup be None so we fall through to headless
        
        # Blacklist for generic package IDs that are not the actual app
        package_blacklist = [
            'com.google.android.gms', 'com.android.vending', 'com.google.android.apps.maps',
            'com.apple.mobilesafari', 'com.android.chrome', 'com.facebook.katana',
            'com.google.android.apps.messaging'
        ]

        if soup:
            # 1. Check meta tags for IDs (Apple Smart App Banners)
            meta_ios = soup.find('meta', attrs={'name': 'apple-itunes-app'})
            if meta_ios and meta_ios.get('content'):
                match = re.search(r'app-id=(\d+)', str(meta_ios['content']))
                if match:
                    found['apple_id'] = match.group(1)
                    logger.info(f"Found Apple ID in meta tag: {found['apple_id']}")

            # 2. Search defined <a> tags and follow redirects
            redirect_patterns = [
                'go.link', 'onelink.me', 'page.link', 'app.link', 'adjust.com', 
                'appsflyer.com', 'adj.st', 'link.me', 'smart.link', 'branch.io'
            ]
            
            for link in soup.find_all('a', href=True):
                if found['android_id'] and found['apple_id']: break
                href = link['href']
                
                # Simple direct patterns
                if not found['android_id'] and 'play.google.com' in href:
                    match = re.search(r'id=([a-zA-Z0-9_.]+)', href)
                    if match: found['android_id'] = match.group(1)
                elif not found['apple_id'] and ('apps.apple.com' in href or 'itunes.apple.com' in href):
                    match = re.search(r'id(\d+)', href)
                    if match: found['apple_id'] = match.group(1)
                
                # Tracker/Redirect detection
                if not found['android_id'] or not found['apple_id']:
                    decoded_href = unquote(href)
                    # Check for nested play/apple store URLs in params (Invygo style)
                    if not found['android_id']:
                        m = re.search(r'play\.google\.com/store/apps/details\?id=([a-zA-Z0-9_.]+)', decoded_href)
                        if m: found['android_id'] = m.group(1)
                    if not found['apple_id']:
                        m = re.search(r'(?:apps|itunes)\.apple\.com(?:/[a-z]{2})?/app(?:/[^/]+)?/id(\d+)', decoded_href)
                        if m: found['apple_id'] = m.group(1)

                    # Follow redirect if ID still missing and domain matches OR looks like a local app link (Deliveroo)
                    is_tracker = any(d in href for d in redirect_patterns)
                    is_local_app_link = href.startswith('/') and ('/app' in href or 'download' in href or 'platform=' in href)
                    
                    if (not found['android_id'] or not found['apple_id']) and (is_tracker or is_local_app_link):
                        # Handle relative links
                        if is_local_app_link:
                            if not url.endswith('/'):
                                base_url = url
                            else:
                                base_url = url[:-1]
                            # Construct full URL for local redirect, ensuring not to double slash if href starts with /
                            if href.startswith('/'):
                                full_redirect_url = f"https://{url.split('/')[2]}{href}"
                            else:
                                full_redirect_url = href
                        else:
                            full_redirect_url = href

                        for ua in [headers['User-Agent'], 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36']:
                            if found['android_id'] and found['apple_id']: break
                            try:
                                resp = session.get(full_redirect_url, headers={'User-Agent': ua}, allow_redirects=True, timeout=8)
                                final_url = unquote(resp.url)
                            except requests.exceptions.InvalidSchema as e:
                                final_url = unquote(str(e).split("'")[1] if "'" in str(e) else str(e))
                            except: continue
                            
                            if not found['android_id']:
                                m = re.search(r'play\.google\.com/store/apps/details\?id=([a-zA-Z0-9_.]+)', final_url)
                                if not m: m = re.search(r'(?:id|package|android_id|pkg)=([a-zA-Z0-9_.]+)', final_url)
                                if m and m.group(1) not in package_blacklist and ('.' in m.group(1) or 'play.google.com' in final_url):
                                    found['android_id'] = m.group(1)
                            if not found['apple_id']:
                                m = re.search(r'(?:apps|itunes)\.apple\.com(?:/[a-z]{2})?/app(?:/[^/]+)?/id(\d+)', final_url)
                                if not m: m = re.search(r'(?:id|apple_id|ios_id)=(\d{9,12})', final_url)
                                if not m: m = re.search(r'id(\d{9,12})', final_url)
                                if m: found['apple_id'] = m.group(1)

        # 3. Final Deep Fallback: Search the entire raw HTML/Scripts/JSON
        if (not found['android_id'] or not found['apple_id']) and html_content:
            # Search in common places like JSON blobs or scripts
            if not found['android_id']:
                android_patterns = [
                    r'play\.google\.com/store/apps/details\?id=([a-zA-Z0-9_.]+)',
                    r'"(?:package|appId|packageId|androidId|android_id)":\s*"([a-zA-Z0-9_.]+)"',
                    r'package=([a-zA-Z0-9_.]+)',
                    r'id=([a-zA-Z0-9_.]+)', # Generic id= pattern for some trackers
                    r'com\.[a-zA-Z0-9_]+\.[a-zA-Z0-9_.]+', # Broad package pattern
                    r'[a-zA-Z0-9_.]+\.[a-zA-Z0-9_.]+\.[a-zA-Z0-9_.]+'
                ]
                for p in android_patterns:
                    matches = re.findall(p, html_content)
                    for pkg_id in matches:
                        if pkg_id not in package_blacklist and len(pkg_id.split('.')) >= 2:
                            # Verify it looks like a package (at least one dot, no spaces, starts with letter)
                            if re.match(r'^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_.]*)*$', pkg_id):
                                found['android_id'] = pkg_id
                                logger.info(f"Deep fallback found Android ID on {url}: {pkg_id}")
                                break
                    if found['android_id']: break
            
            if not found['apple_id']:
                apple_patterns = [
                    r'(?:apps|itunes)\.apple\.com(?:/[a-z]{2})?/app(?:/[^/]+)?/id(\d+)',
                    r'"(?:appleId|iosId|trackId|itunesId|apple_id|ios_id)":\s*"?(\d+)"?',
                    r'id(\d{9,12})',
                    r'apple-itunes-app.*?content=".*?app-id=(\d+)'
                ]
                for p in apple_patterns:
                    matches = re.findall(p, html_content)
                    for app_id in matches:
                        if len(app_id) >= 9:
                            found['apple_id'] = app_id
                            logger.info(f"Deep fallback found Apple ID on {url}: {app_id}")
                            break
                    if found['apple_id']: break
                    
        # 4. HEADLESS BROWSER FALLBACK
        # If still missing IDs, try rendering the page with Playwright
        logger.debug(f"Found before fallback: {found}")
        if not found['android_id'] or not found['apple_id']:
            logger.info(f"Standard scraping failed for {url}. Attempting headless browser fallback...")
            try:
                browser_found = fetch_with_browser(url)
                if not found['android_id'] and browser_found['android_id']:
                    found['android_id'] = browser_found['android_id']
                if not found['apple_id'] and browser_found['apple_id']:
                    found['apple_id'] = browser_found['apple_id']
            except Exception as e:
                logger.error(f"Headless browser failed for {url}: {e}")
                
    except Exception as e:
        logger.warning(f"Failed to scrape {url}: {e}")
        
    return found

def fetch_with_browser(url):
    """Fetches the URL using a headless browser to handle JS-rendered content."""
    # Import inside function to avoid startup cost if not needed
    logger.debug("Inside fetch_with_browser")
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        logger.error("Playwright not installed. Skipping headless fallback.")
        return {'android_id': None, 'apple_id': None}
    
    found = {'android_id': None, 'apple_id': None}
    
    try:
        with sync_playwright() as p:
            # Launch browser (webkit is often more stable on mac/arm64 than chromium)
            logger.debug("Launching browser (WebKit)...")
            browser = p.webkit.launch(headless=True)
            # Use a realistic user agent context
            context = browser.new_context(
                user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                viewport={'width': 1920, 'height': 1080},
                locale='en-US',
                timezone_id='Asia/Dubai'
            )
            page = context.new_page()
            
            try:
                logger.info(f"Browser navigating to {url}...")
                # Go to page, wait for network idle to ensure redirection chains finish
                page.goto(url, wait_until='networkidle', timeout=30000)
                
                # Scroll to bottom to trigger lazy loading
                page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                page.wait_for_timeout(4000) # Wait for potential lazy content
                
                # Get final URL after potential frequent JS redirects
                final_url = page.url
                content = page.content()
                
                logger.info(f"Browser navigated to: {final_url}")
                logger.info(f"Page Title: {page.title()}")
                logger.info(f"Content Length: {len(content)}")
                
                # Check for bot protection or access denied
                if "Access Denied" in page.title() or "Security Challenge" in page.title():
                    logger.warning(f"Bot protection detected on {url}")
                
                # Check for IDs in final URL
                if 'play.google.com' in final_url:
                    m = re.search(r'id=([a-zA-Z0-9_.]+)', final_url)
                    if m: found['android_id'] = m.group(1)
                if 'apps.apple.com' in final_url or 'itunes.apple.com' in final_url:
                    m = re.search(r'id(\d+)', final_url)
                    if m: found['apple_id'] = m.group(1)
                    
                # Search within the rendered content (using same logic as deep search)
                if not found['android_id']:
                    matches = re.findall(r'play\.google\.com/store/apps/details\?id=([a-zA-Z0-9_.]+)', content)
                    for m in matches:
                        if m not in ['com.google.android.gms', 'com.android.vending']:
                            found['android_id'] = m
                            break
                
                if not found['apple_id']:
                    matches = re.findall(r'(?:apps|itunes)\.apple\.com(?:/[a-z]{2})?/app(?:/[^/]+)?/id(\d+)', content)
                    if matches: found['apple_id'] = matches[0]

            except Exception as e:
                logger.error(f"Browser error on {url}: {e}")
            finally:
                browser.close()
                
    except Exception as e:
        logger.error(f"Playwright initialization failed: {e}")

    return found

def resolve_app_ids(company_list, openai_key=None):
    """Main entry point to resolve app IDs for a list of companies using website scraping only."""
    
    def process_company(company):
        website = company.get('website')
        if not website: return company

        scraped_ids = find_app_links_on_website(website)
        
        company['android_id'] = scraped_ids.get('android_id')
        company['apple_id'] = scraped_ids.get('apple_id')
        
        return company

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        results = list(executor.map(process_company, company_list))
        
    return results
