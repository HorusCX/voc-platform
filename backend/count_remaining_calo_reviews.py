
import sys
import os
from datetime import datetime, timedelta
from sqlalchemy import func

# Add backend to path to import database
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, Review

def count_remaining_calo_reviews():
    db = SessionLocal()
    brand_name = "Calo"
    
    # Criteria:
    # 1. Google Play Store: Last 10 days (>= 2026-02-21)
    # 2. App Store: Last 20 days (>= 2026-02-11)
    # 3. Google Maps: Last 30 days (>= 2026-02-01)
    # 4. Trustpilot: Lifetime
    
    try:
        # 1. Google Play Store
        play_count = db.query(Review).filter(
            Review.brand == brand_name,
            Review.platform.like("Google Play%"),
            Review.date >= "2026-02-21"
        ).count()
        
        # 2. App Store
        app_count = db.query(Review).filter(
            Review.brand == brand_name,
            Review.platform.like("App Store%"),
            Review.date >= "2026-02-11"
        ).count()
        
        # 3. Google Maps
        maps_count = db.query(Review).filter(
            Review.brand == brand_name,
            Review.platform.like("Google Maps%"),
            Review.date >= "2026-02-01"
        ).count()
        
        # 4. Trustpilot
        tp_count = db.query(Review).filter(
            Review.brand == brand_name,
            Review.platform == "Trustpilot"
        ).count()
        
        print(f"--- Current Review Counts for brand: {brand_name} ---")
        print(f"Google Play Store (>= 2026-02-21): {play_count}")
        print(f"App Store (>= 2026-02-11): {app_count}")
        print(f"Google Maps (>= 2026-02-01): {maps_count}")
        print(f"Trustpilot (Lifetime): {tp_count}")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    count_remaining_calo_reviews()
