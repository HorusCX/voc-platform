
import sys
import os
from sqlalchemy import func

# Add backend to path to import database
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, Review

def check_play_reviews():
    db = SessionLocal()
    brand_name = "Calo"
    
    try:
        # Check remaining Google Play Store reviews for Calo
        play_reviews = db.query(Review.date, func.count(Review.id)).filter(
            Review.brand == brand_name,
            Review.platform.like("Google Play%")
        ).group_by(Review.date).order_by(Review.date.desc()).limit(20).all()
        
        print(f"Sample of remaining Google Play Store reviews for {brand_name}:")
        for date, count in play_reviews:
            print(f"Date: {date}, Count: {count}")
            
        # Check if any reviews with date >= 2026-02-21 still exist
        deleted_check = db.query(Review).filter(
            Review.brand == brand_name,
            Review.platform.like("Google Play%"),
            Review.date >= "2026-02-21"
        ).count()
        print(f"\nRemaining reviews with date >= 2026-02-21: {deleted_check}")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_play_reviews()
