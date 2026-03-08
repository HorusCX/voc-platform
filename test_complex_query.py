import os
import logging
from dotenv import load_dotenv

# Load main database URL
load_dotenv("backend/.env")

from services.chat_agent import run_chat_agent

logging.basicConfig(level=logging.ERROR)
logger = logging.getLogger("services.chat_agent")
logger.setLevel(logging.INFO)

test_questions = [
    "1. How many reviews do we have for each company in this portfolio?",
    "2. Group the reviews by platforms. How many are from Apple vs Google Play?",
    "3. What is our average rating overall?",
    "4. Are people mentioning pricing or quality more? Can you summarize what they say about those topics?",
    "5. For the Negative reviews only, what is the most common emotion?"
]

print("Starting LCEL Tests without Agent Tools...")
for eq in test_questions:
    print(f"\n============================")
    print(f"QUESTION: {eq}")
    try:
        response = run_chat_agent(3, eq)
        print(f"ANSWER:\n{response}")
    except Exception as e:
        print("Error:", e)
