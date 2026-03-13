from google import genai
import json
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def analyze_url(url: str, gemini_key: str):
    """
    Uses Gemini 3.1 Pro to extract company details and suggested competitors based on the URL.
    """
    try:
        # Initialize Gemini Client
        genai.Client(api_key=gemini_key)
        
        import requests
        system_prompt = """
        You are an intelligent business research assistant with access to Google Search.
        Your task is to take **a single input: a company website URL**, then:
        
        1. **Identify the company** behind that URL.
        2. **Determine its industry, core products/services, and primary markets.**
        3. **Find competitors** that operate in the **same industry** and **serve markets in either GCC countries or Egypt** (e.g., UAE, Saudi Arabia, Qatar, Kuwait, Bahrain, Oman, Egypt).
        4. **Return a structured list** of competitors.
        
        Avoid listing companies that do not operate in Egypt or any GCC country.
        
        **CRITICAL: You must return ONLY valid JSON.**
        Do not include markdown formatting (```json ... ```). Just the raw JSON object.
        
        Structure:
        {
            "name": "Main Company Name",
            "description": "A short description of the main company (max 1 sentence)",
            "competitors": [
                {
                    "name": "Competitor Name",
                    "website": "Competitor Website URL",
                    "region": "Country/Region"
                }
            ]
        }
        """
        user_message = f"Here is the company website URL: {url}"

        # Use gemini-2.0-flash via REST API to avoid thread deadlocks with the SDK
        endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={gemini_key}"
        payload = {
            "contents": [{
                "role": "user",
                "parts": [{"text": system_prompt + "\n\n" + user_message}]
            }],
            "generationConfig": {
                "responseMimeType": "application/json"
            }
        }
        resp = requests.post(endpoint, json=payload, timeout=60)
        resp.raise_for_status()
        resp_data = resp.json()
        
        # Extract text content
        content = resp_data["candidates"][0]["content"]["parts"][0]["text"]
        logger.info(f"Raw JSON Content (first 200 chars): {content[:200]}...")

        data = json.loads(content)

        # Format the result to match what the frontend expects (list of companies)
        # First item is the main company — accept both "name" and "company_name" keys
        company_name = data.get("name") or data.get("company_name") or data.get("company")
        output = [{
            "company_name": company_name,
            "website": url,
            "description": data.get("description"),
            "android_id": None,
            "apple_id": None,
            "is_main": True
        }]

        # Add competitors — accept both "name" and "company_name" keys
        for comp in data.get("competitors", []):
            comp_name = comp.get("name") or comp.get("company_name") or comp.get("company")
            output.append({
                "company_name": comp_name,
                "website": comp.get("website"),
                "description": f"Competitor ({comp.get('region', 'Region Unknown')})",
                "android_id": None,
                "apple_id": None,
                "is_main": False
            })

        logger.info(f"analyze_url: found {len(output) - 1} competitors for {url}")
        return output

    except Exception as e:
        logger.error(f"Error analyzing website with Gemini: {e}")
        raise
