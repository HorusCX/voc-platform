import requests
from bs4 import BeautifulSoup
import pandas as pd
from datetime import datetime
import logging
import json
import re

logger = logging.getLogger(__name__)

def scrape_trustpilot(brand_name, trustpilot_link):
    if not trustpilot_link:
        return pd.DataFrame()

    logger.info(f"--- ⭐ Starting Trustpilot Scrape for {brand_name} ---")
    
    if "trustpilot.com" not in trustpilot_link:
         logger.warning(f"Invalid Trustpilot link for {brand_name}: {trustpilot_link}")
         return pd.DataFrame()

    # Ensure link ends with /reviews to be safe? No, trustpilot links are usually /review/domain.com
    # Standardize URL to sorting by recency if possible
    base_url = trustpilot_link.split('?')[0] # Remove existing params
    
    all_reviews = []
    page = 1
    max_pages = 20 # Reasonable limit
    six_months_ago = pd.Timestamp(datetime.now() - pd.DateOffset(months=6))
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    while page <= max_pages:
        url = f"{base_url}?page={page}&sort=recency&languages=all"
        try:
            response = requests.get(url, headers=headers, timeout=15)
            if response.status_code != 200:
                logger.error(f"Failed to fetch Trustpilot page {page}: {response.status_code}")
                break

            soup = BeautifulSoup(response.content, 'html.parser')
            
            # Strategy: Look for the JSON-LD script which contains the rich data
            # This is much more reliable than class names
            json_ld = soup.find('script', type='application/ld+json')
            
            found_reviews_this_step = False
            
            if json_ld:
                try:
                    data = json.loads(json_ld.string)
                    # Data can be a list or proper dict
                    if isinstance(data, list):
                        data = data[0] # Usually first item is the Organization/Product
                    
                    reviews = data.get('review', [])
                    if not reviews:
                        # Fallback: sometimes it's under '@graph' or similar? 
                        # Or maybe simply not in JSON-LD on pagination > 1?
                        # Trustpilot often only puts aggregate in JSON-LD on page 1.
                        # We must rely on HTML parsing for paginated reviews.
                        pass
                    
                except:
                    pass

            # HTML Parsing Strategy
            # Trustpilot reviews are in <article> tags generally or <section> in recent designs
            # We look for specific data attributes which are more stable
            
            articles = soup.find_all('article')
            if not articles:
                # Try finding by class partials if article tag is changed
                # But 'article' is semantic and likely to stay
                logger.info(f"No review articles found on page {page}.")
                break
                
            for article in articles:
                try:
                    # Extract Date
                    # <time datetime="2023-10-27T10:00:00.000Z">
                    time_elem = article.find('time')
                    if not time_elem or not time_elem.get('datetime'):
                        continue
                        
                    review_date = pd.to_datetime(time_elem.get('datetime'))

                    # Check date barrier
                    if review_date.tz_localize(None) < six_months_ago:
                        continue
                        
                    # Extract Rating
                    # Look for star image alt text or data-service-review-rating
                    rating = 0
                    star_img = article.find('img', alt=re.compile(r'Rated \d out of 5 stars'))
                    if star_img:
                        alt_text = star_img.get('alt', '')
                        rating_match = re.search(r'Rated (\d) out of 5', alt_text)
                        if rating_match:
                            rating = int(rating_match.group(1))
                    else:
                        # Try data attribute
                        rate_div = article.find(attrs={"data-service-review-rating": True})
                        if rate_div:
                            rating = int(rate_div['data-service-review-rating'])
                            
                    # Extract Text
                    # Usually h2 is title, p is body
                    title_elem = article.find('h2')
                    title = title_elem.get_text(strip=True) if title_elem else ""
                    
                    content_elem = article.find('p', attrs={"data-service-review-text-typography": True})
                    if not content_elem:
                        # Fallback
                        content_elem = article.find('p')
                        
                    body = content_elem.get_text(strip=True) if content_elem else ""
                    
                    full_text = f"{title}. {body}".strip()
                    if full_text == ".": full_text = ""
                    
                    # Extract Author
                    author_elem = article.find('span', attrs={"data-consumer-name-typography": True})
                    author = author_elem.get_text(strip=True) if author_elem else "Anonymous"
                    
                    all_reviews.append({
                        'text': full_text,
                        'rating': rating,
                        'date': review_date.strftime('%Y-%m-%d'),
                        'source_user': author,
                        'platform': 'Trustpilot',
                        'brand': brand_name
                    })
                    found_reviews_this_step = True
                    
                except Exception as e:
                    continue
            
            if not found_reviews_this_step:
                break
                
            # Pagination Check
            # Check if there is a next button that is not disabled
            next_btn = soup.find('a', attrs={'name': 'pagination-button-next'})
            if not next_btn or 'aria-disabled' in next_btn.attrs:
                # If aria-disabled="true", we are done
                 if next_btn and next_btn.get('aria-disabled') == 'true':
                     break
                 if not next_btn:
                     break

            page += 1
            
        except Exception as e:
            logger.error(f"Error scraping Trustpilot page {page}: {e}")
            break

    df = pd.DataFrame(all_reviews)
    if df.empty:
        return pd.DataFrame()
        
    return df
