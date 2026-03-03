
import sys
import os

# Add backend to path to import database
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, Review

def cleanup_calo_reviews():
    db = SessionLocal()
    brand_name = "Calo"
    
    # Criteria:
    # Google Play Store: Last 10 days (>= 2026-02-21)
    # Apple Store: Last 20 days (>= 2026-02-11)
    # Google Maps Location: Last 30 days (>= 2026-02-01)
    # Trustpilot: Everything
    
    try:
        # 1. Google Play Store
        play_query = db.query(Review).filter(
            Review.brand == brand_name,
            Review.platform.like("Google Play%"),
            Review.date >= "2026-02-21"
        )
        play_count = play_query.count()
        play_query.delete(synchronize_session=False)
        
        # 2. App Store
        app_query = db.query(Review).filter(
            Review.brand == brand_name,
            Review.platform.like("App Store%"),
            Review.date >= "2026-02-11"
        )
        app_count = app_query.count()
        app_query.delete(synchronize_session=False)
        
        # 3. Google Maps
        maps_query = db.query(Review).filter(
            Review.brand == brand_name,
            Review.platform.like("Google Maps%"),
            Review.date >= "2026-02-01"
        )
        maps_count = maps_query.count()
        maps_query.delete(synchronize_session=False)
        
        # 4. Trustpilot
        tp_query = db.query(Review).filter(
            Review.brand == brand_name,
            Review.platform == "Trustpilot"
        )
        tp_count = tp_query.count()
        tp_query.delete(synchronize_session=False)
        
        db.commit()
        
        print(f"Cleanup completed for brand: {brand_name}")
        print(f"Google Play Store reviews deleted: {play_count}")
        print(f"App Store reviews deleted: {app_count}")
        print(f"Google Maps reviews deleted: {maps_count}")
        print(f"Trustpilot reviews deleted: {tp_count}")
        print(f"Total reviews deleted: {play_count + app_count + maps_count + tp_count}")
        
    except Exception as e:
        db.rollback()
        print(f"Error during cleanup: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    cleanup_calo_reviews()
