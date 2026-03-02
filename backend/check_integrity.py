import logging
from sqlalchemy import text
from database import SessionLocal, User, Portfolio

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_db_integrity():
    db = SessionLocal()
    try:
        # Check users
        users = db.query(User).all()
        logger.info(f"Found {len(users)} users.")
        
        for u in users:
            portfolios = u.portfolios
            logger.info(f"User {u.email} (ID: {u.id}) has {len(portfolios)} portfolios.")
            for p in portfolios:
                # Count companies for this portfolio
                count = db.execute(text(f"SELECT COUNT(*) FROM companies WHERE portfolio_id = {p.id}")).scalar()
                logger.info(f"  - Portfolio '{p.name}' (ID: {p.id}) has {count} companies.")

        # Check if any companies have portfolio_id = NULL
        null_count = db.execute(text("SELECT COUNT(*) FROM companies WHERE portfolio_id IS NULL")).scalar()
        if null_count > 0:
            logger.error(f"❌ Found {null_count} companies with portfolio_id IS NULL!")
        else:
            logger.info("✅ All companies have a portfolio_id.")

    except Exception as e:
        logger.error(f"❌ Integrity check failed: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    check_db_integrity()
