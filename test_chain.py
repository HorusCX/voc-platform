import os
import logging
from dotenv import load_dotenv

# Load main database URL
load_dotenv("backend/.env")

from sqlalchemy import create_engine
from langchain_community.utilities.sql_database import SQLDatabase
from langchain_openai import ChatOpenAI
from langchain.chains import create_sql_query_chain
from langchain_community.tools.sql_database.tool import QuerySQLDataBaseTool
from langchain_core.prompts import ChatPromptTemplate

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL")
READONLY_URL = DATABASE_URL.replace("voc_admin:voc_admin_pwd_123", "voc_readonly:voc_readonly_pwd_321$")
readonly_engine = create_engine(READONLY_URL)

custom_table_info = {
    "companies": "CREATE TABLE companies (company_name VARCHAR(255) NOT NULL, id SERIAL PRIMARY KEY)",
    "dimensions": "CREATE TABLE dimensions (name VARCHAR(255) NOT NULL, id SERIAL PRIMARY KEY)",
    "reviews": "CREATE TABLE reviews (id SERIAL PRIMARY KEY, company_id INTEGER, rating INTEGER, date VARCHAR(20), text TEXT, sentiment VARCHAR(20), topics JSON)"
}

with readonly_engine.connect() as connection:
    db = SQLDatabase(
        readonly_engine, 
        include_tables=["companies", "dimensions", "reviews"],
        sample_rows_in_table_info=3,
        custom_table_info=custom_table_info
    )
    llm = ChatOpenAI(model="gpt-4o", temperature=0)
    
    # 1. Generate SQL
    chain = create_sql_query_chain(llm, db)
    question = "how many reviews each company got for each month in the last 3 months"
    query = chain.invoke({"question": question})
    print(f"Generated Query: {query}")
    query = query.replace("```sql", "").replace("```", "").strip()

    # 2. Execute
    query_tool = QuerySQLDataBaseTool(db=db)
    result = query_tool.invoke(query)
    print(f"Result: {result}")

    # 3. Finalize
    final_prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a VoC data assistant. Given the question, query and DB result, write a human response."),
        ("user", "Question: {question}\nSQL Query: {query}\nSQL Result: {result}")
    ])
    final_chain = final_prompt | llm
    answer = final_chain.invoke({"question": question, "query": query, "result": result})
    print(f"Final Answer: {answer.content}")
