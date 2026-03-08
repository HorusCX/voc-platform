import os
import logging
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from langchain_community.utilities.sql_database import SQLDatabase
from langchain_openai import ChatOpenAI

logger = logging.getLogger(__name__)

# Configure the Read-Only engine
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required")

# The DATABASE_URL is usually something like postgresql://voc_admin:pass@host:port/db
# We need to replace the voc_admin:pass with voc_readonly:voc_readonly_secure_pwd_123
# For security/robustness, we'll parse and replace the credentials string
try:
    # Example format: postgresql://user:pass@host:port/db
    parts = DATABASE_URL.split('@')
    protocol_and_creds = parts[0]
    host_and_db = parts[1]
    
    protocol = protocol_and_creds.split('://')[0]
    
    # We use the readonly credentials created in the migration script
    READONLY_URL = f"{protocol}://voc_readonly:voc_readonly_pwd_321$@{host_and_db}"
except Exception as e:
    logger.error(f"Failed to parse DATABASE_URL to create READONLY_URL: {e}")
    READONLY_URL = DATABASE_URL # Fallback, though RLS will still protect us

readonly_engine = create_engine(
    READONLY_URL,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True
)

def run_chat_agent(portfolio_id: int, user_message: str):
    """
    Runs the LangChain SQL Agent strictly isolated to the specified portfolio_id.
    Uses PostgreSQL Row Level Security (RLS) by injecting session variables.
    """
    openai_key = os.getenv("OPENAI_API_KEY")
    if not openai_key:
         return "Error: OPENAI_API_KEY is missing."

    logger.info(f"🤖 Starting SQL Agent for portfolio {portfolio_id}")

    try:
        # Create a specific connection for this session to inject RLS settings
        with readonly_engine.connect() as connection:
            # Inject session context BEFORE LangChain uses it
            # This triggers the RLS policies in the database
            connection.execute(text(f"SET LOCAL app.current_portfolio_id = '{portfolio_id}';"))
            
            # Pre-cache the schema definition for the LLM to save token latency
            custom_table_info = {
                "companies": '''
CREATE TABLE companies (
        id SERIAL NOT NULL, 
        company_name VARCHAR(255) NOT NULL, 
        website VARCHAR(500), 
        description TEXT, 
        android_id VARCHAR(255), 
        apple_id VARCHAR(255), 
        google_maps_links JSON, 
        trustpilot_link VARCHAR(500), 
        is_main BOOLEAN, 
        created_at TIMESTAMP WITHOUT TIME ZONE, 
        updated_at TIMESTAMP WITHOUT TIME ZONE, 
        portfolio_id INTEGER NOT NULL, 
        CONSTRAINT companies_pkey PRIMARY KEY (id)
)
''',
                "dimensions": '''
CREATE TABLE dimensions (
        id SERIAL NOT NULL, 
        name VARCHAR(255) NOT NULL, 
        description TEXT, 
        keywords JSON, 
        created_at TIMESTAMP WITHOUT TIME ZONE, 
        updated_at TIMESTAMP WITHOUT TIME ZONE, 
        portfolio_id INTEGER NOT NULL, 
        CONSTRAINT dimensions_pkey PRIMARY KEY (id)
)
''',
                "reviews": '''
CREATE TABLE reviews (
        id SERIAL NOT NULL, 
        job_id VARCHAR(100) NOT NULL, 
        company_id INTEGER, 
        brand VARCHAR(255) NOT NULL, 
        text TEXT, 
        rating INTEGER, 
        date DATE, 
        source_user VARCHAR(255), 
        platform VARCHAR(100) NOT NULL, 
        source_location VARCHAR(500), 
        sentiment VARCHAR(20), 
        emotion VARCHAR(50), 
        confidence DOUBLE PRECISION, 
        topics JSON, 
        created_at TIMESTAMP WITHOUT TIME ZONE, 
        analyzed_at TIMESTAMP WITHOUT TIME ZONE, 
        portfolio_id INTEGER NOT NULL, 
        CONSTRAINT reviews_pkey PRIMARY KEY (id)
)
'''
            }
            
            # Initialize LangChain SQLDatabase with this specific active connection
            # We explicitly include only the tables relevant to the context to prevent hallucinating system tables
            db = SQLDatabase(
                readonly_engine, 
                include_tables=["companies", "dimensions", "reviews"],
                sample_rows_in_table_info=3, # Shows LLM examples of data
                custom_table_info=custom_table_info
            )
            
            # Since LangChain's SQLDatabase manages its own connections for executes, 
            # we need to ensure every execution on its engine has the RLS variable set.
            # A cleaner approach in SQLAlchemy is using the engine event listener, 
            # but since we only need it during this function call, we can attach it temporarily
            
            from sqlalchemy import event
            
            def set_rls(dbapi_connection, connection_record, connection_proxy):
                cursor = dbapi_connection.cursor()
                cursor.execute(f"SET app.current_portfolio_id = '{portfolio_id}';")
                cursor.close()

            # Listen for new connections checked out of the pool during this agent run
            event.listen(readonly_engine, 'checkout', set_rls)

            from langchain_core.prompts import PromptTemplate
            from langchain_core.output_parsers import StrOutputParser
            
            # Combine schema for injection
            schema_text = f"companies table:\n{custom_table_info['companies']}\n\ndimensions table:\n{custom_table_info['dimensions']}\n\nreviews table:\n{custom_table_info['reviews']}"
            
            try:
                # Setup LLM
                llm = ChatOpenAI(model="gpt-4o", temperature=0, api_key=openai_key)
                
                # Step 1: Generate SQL Query
                query_prompt = PromptTemplate.from_template(
                    """You are a PostgreSQL expert Data Analysis Assistant for 'VoC Intelligence'.
Your dataset is read-only. Generate a clean, syntactically correct PostgreSQL query based on the input question.
IMPORTANT: The database connection already has Row Level Security enabled limiting data to Portfolio ID {portfolio_id}. You DO NOT need to filter `WHERE portfolio_id = {portfolio_id}` - it is applied automatically.

Use ONLY these table schemas:
{schema}

Question: {question}

Return ONLY the raw SQL query. Do not wrap it in markdown (i.e. DO NOT output ```sql ... ```). Just the code.
If a qualitative summary is requested, SELECT the relevant text fields.
When filtering the 'topics' JSON column, always cast it to jsonb (e.g. topics::jsonb) before applying operators like ? or @>.

CRITICAL SCHEMA RULES:
1. The `reviews.company_id` column is often NULL. To link a review to a company, match `reviews.brand` to `companies.company_name` (e.g., `WHERE r.brand ILIKE c.company_name`).
2. If grouping by company, group by `reviews.brand` directly. Do not rely on `company_id`.
"""
                )
                
                sql_chain = query_prompt | llm | StrOutputParser()
                logger.info(f"Generating query for user message: {user_message}")
                raw_sql = sql_chain.invoke({
                    "portfolio_id": portfolio_id,
                    "schema": schema_text,
                    "question": user_message
                })
                
                # Clean up any potential markdown formatting the LLM ignored
                clean_sql = raw_sql.replace("```sql", "").replace("```", "").strip()
                logger.info(f"Executing SQL: {clean_sql}")
                
                # Step 2: Execute SQL Query
                try:
                    query_result = db.run(clean_sql)
                    logger.info(f"Query executed successfully, rows returned.")
                except Exception as e:
                    logger.error(f"SQL execution failed: {e}")
                    query_result = f"Error executing query: {e}"
                
                # Step 3: Interpret SQL Result back into Natural Language
                answer_prompt = PromptTemplate.from_template(
                    """You are a helpful Data Analysis Assistant for 'VoC Intelligence'.
Answer the user's question clearly and concisely based on the executed SQL query's results.

Question: {question}
SQL Query executed: {query}
SQL Query result: {result}

Provide a helpful, human-readable response summarizing the result. Do not mention that you ran a query.
"""
                )
                
                answer_chain = answer_prompt | llm | StrOutputParser()
                final_answer = answer_chain.invoke({
                    "question": user_message,
                    "query": clean_sql,
                    "result": query_result
                })
                
                return final_answer
                
            finally:
                # Clean up the event listener so it doesn't affect subsequent calls with different portfolios
                event.remove(readonly_engine, 'checkout', set_rls)

    except Exception as e:
        logger.error(f"❌ Chat Agent Error: {e}")
        return f"Sorry, I encountered an error while processing your request: {e}"
