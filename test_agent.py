import os
from dotenv import load_dotenv

# Load main database URL
load_dotenv("backend/.env")

from services.chat_agent import run_chat_agent

# Test portfolio 1
print("Running Agent against Portfolio 1...")
try:
    response = run_chat_agent(1, "How many reviews are there in this portfolio?")
    print("Response:", response)
except Exception as e:
    print("Error:", e)
    
print("-" * 50)
print("Testing cross-contamination with Portfolio 2...")
try:
    response = run_chat_agent(1, "What are the dimensions/topics tracked by Portfolio ID 2?")
    print("Response:", response)
except Exception as e:
    print("Error:", e)
