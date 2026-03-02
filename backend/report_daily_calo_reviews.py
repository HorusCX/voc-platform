
import sys
import os
from datetime import datetime, timedelta
from sqlalchemy import func

# Add backend to path to import database
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, Review

def report_daily_calo_play_reviews():
    db = SessionLocal()
    brand_name = "Calo"
    
    # Calculate date range
    # Current date is 2026-03-02
    end_date = datetime(2026, 3, 2)
    start_date = end_date - timedelta(days=20)
    
    # Format as string for query
    start_date_str = start_date.strftime('%Y-%m-%d')
    
    try:
        # Query daily counts
        daily_counts = db.query(
            Review.date, 
            func.count(Review.id)
        ).filter(
            Review.brand == brand_name,
            Review.platform.like("Google Play%"),
            Review.date >= start_date_str
        ).group_by(Review.date).order_by(Review.date.asc()).all()
        
        print(f"Daily Google Play Store review count for {brand_name} (from {start_date_str} to 2026-03-02):")
        print("-" * 40)
        
        # Create a dictionary of results
        results_dict = {date: count for date, count in daily_counts}
        
        # Ensure we show all days in the range even if 0
        current_date = start_date
        while current_date <= end_date:
            date_str = current_date.strftime('%Y-%m-%d')
            count = results_dict.get(date_str, 0)
            print(f"{date_str}: {count}")
            current_date += timedelta(days=1)
            
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    report_daily_calo_play_reviews()
