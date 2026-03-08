import os
import psycopg2
from dotenv import load_dotenv

# Load main database URL
load_dotenv("backend/.env")

DATABASE_URL = os.getenv("DATABASE_URL")

sql_commands = [
    # 1. Create a Read-Only User
    "CREATE ROLE voc_readonly WITH LOGIN PASSWORD 'voc_readonly_pwd_321$';",
    
    # 2. Grant Connection and Usage
    "GRANT CONNECT ON DATABASE voc_db TO voc_readonly;",
    "GRANT USAGE ON SCHEMA public TO voc_readonly;",
    
    # 3. Grant Select Only
    "GRANT SELECT ON ALL TABLES IN SCHEMA public TO voc_readonly;",
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO voc_readonly;",
    
    # 4. Enable RLS on the target tables
    "ALTER TABLE companies ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE dimensions ENABLE ROW LEVEL SECURITY;",
    "ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;",
    
    # 5. Create Policies
    "DROP POLICY IF EXISTS readonly_companies_policy ON companies;",
    """CREATE POLICY readonly_companies_policy ON companies
       FOR SELECT TO voc_readonly
       USING (portfolio_id = NULLIF(current_setting('app.current_portfolio_id', true), '')::integer);""",
       
    "DROP POLICY IF EXISTS readonly_dimensions_policy ON dimensions;",
    """CREATE POLICY readonly_dimensions_policy ON dimensions
       FOR SELECT TO voc_readonly
       USING (portfolio_id = NULLIF(current_setting('app.current_portfolio_id', true), '')::integer);""",
       
    "DROP POLICY IF EXISTS readonly_reviews_policy ON reviews;",
    """CREATE POLICY readonly_reviews_policy ON reviews
       FOR SELECT TO voc_readonly
       USING (portfolio_id = NULLIF(current_setting('app.current_portfolio_id', true), '')::integer);""",
       
    # 6. Ensure the main admin user bypasses RLS
    "ALTER ROLE voc_admin BYPASSRLS;"
]

print("Connecting to DB:", DATABASE_URL)
try:
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = True
    cursor = conn.cursor()
    
    for cmd in sql_commands:
        print("Executing:", cmd.splitlines()[0][:50], "...")
        try:
            cursor.execute(cmd)
            print("  -> Success")
        except psycopg2.errors.DuplicateObject:
            print("  -> Skipped (Already exists)")
        except Exception as e:
            print("  -> Error:", e)
            
    cursor.close()
    conn.close()
    print("Finished.")
except Exception as e:
    print("Failed to connect:", e)
