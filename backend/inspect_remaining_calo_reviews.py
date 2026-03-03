
import sys
import os

# Add backend to path to import database
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, Review

def inspect_remaining_calo_reviews():
    db = SessionLocal()
    brand_name = "Calo"
    
    try:
        # 1. Google Play Store
        play_reviews = db.query(Review).filter(
            Review.brand == brand_name,
            Review.platform.like("Google Play%"),
            Review.date >= "2026-02-21"
        ).all()
        
        print("--- Google Play Store (>= 2026-02-21) ---")
        for r in play_reviews:
            print(f"ID: {r.id}, Date: {r.date}, Created At: {r.created_at}, Job ID: {r.job_id}")
        
        # 2. App Store
        app_reviews = db.query(Review).filter(
            Review.brand == brand_name,
            Review.platform.like("App Store%"),
            Review.date >= "2026-02-11"
        ).all()
        
        print("\n--- App Store (>= 2026-02-11) ---")
        for r in app_reviews[:5]: # Show first 5
             print(f"ID: {r.id}, Date: {r.date}, Created At: {r.created_at}, Job ID: {r.job_id}")
        print(f"Total: {len(app_reviews)}")

        # 3. Google Maps
        maps_reviews = db.query(Review).filter(
            Review.brand == brand_name,
            Review.platform.like("Google Maps%"),
            Review.date >= "2026-02-01"
        ).all()
        
        print("\n--- Google Maps (>= 2026-02-01) ---")
        for r in maps_reviews[:5]:
            print(f"ID: {r.id}, Date: {r.date}, Created At: {r.created_at}, Job ID: {r.job_id}")
        print(f"Total: {len(maps_reviews)}")

        # 4. Trustpilot
        tp_reviews = db.query(Review).filter(
            Review.brand == brand_name,
            Review.platform == "Trustpilot"
        ).all()
        
        print("\n--- Trustpilot (Lifetime) ---")
        for r in tp_reviews[:5]:
            print(f"ID: {r.id}, Date: {r.date}, Created At: {r.created_at}, Job ID: {r.job_id}")
        print(f"Total: {len(tp_reviews)}")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    inspect_remaining_calo_reviews()
