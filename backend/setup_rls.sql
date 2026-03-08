-- 1. Create a Read-Only User
-- Generate a random password and replace 'YOUR_SECURE_PASSWORD' before running in production
CREATE ROLE voc_readonly WITH LOGIN PASSWORD 'voc_readonly_secure_pwd_123';

-- 2. Grant Connection and Usage
GRANT CONNECT ON DATABASE voc_db TO voc_readonly;
GRANT USAGE ON SCHEMA public TO voc_readonly;

-- 3. Grant Select Only
GRANT SELECT ON ALL TABLES IN SCHEMA public TO voc_readonly;
-- Ensure future tables also get select privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO voc_readonly;

-- ==========================================
-- ROW LEVEL SECURITY (RLS) CONFIGURATION
-- ==========================================

-- 4. Enable RLS on the target tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE dimensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- 5. Create Policies for the Read-Only user
-- These policies force the DB to only return rows where portfolio_id matches
-- the custom session variable 'app.current_portfolio_id'

-- Policy for Companies
DROP POLICY IF EXISTS readonly_companies_policy ON companies;
CREATE POLICY readonly_companies_policy ON companies
    FOR SELECT
    TO voc_readonly
    USING (
        portfolio_id = NULLIF(current_setting('app.current_portfolio_id', true), '')::integer
    );

-- Policy for Dimensions    
DROP POLICY IF EXISTS readonly_dimensions_policy ON dimensions;
CREATE POLICY readonly_dimensions_policy ON dimensions
    FOR SELECT
    TO voc_readonly
    USING (
        portfolio_id = NULLIF(current_setting('app.current_portfolio_id', true), '')::integer
    );

-- Policy for Reviews
DROP POLICY IF EXISTS readonly_reviews_policy ON reviews;
CREATE POLICY readonly_reviews_policy ON reviews
    FOR SELECT
    TO voc_readonly
    USING (
        portfolio_id = NULLIF(current_setting('app.current_portfolio_id', true), '')::integer
    );

-- 6. Ensure the main admin user bypasses RLS
-- So that the regular backend API isn't affected by these strict rules.
ALTER ROLE voc_admin BYPASSRLS;
