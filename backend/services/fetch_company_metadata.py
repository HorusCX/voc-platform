from google import genai
from google.genai import types
import json
import logging
import os
import re

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def analyze_url(url: str, gemini_key: str):
    """
    Uses Gemini 3.0 Pro to extract company details and suggested competitors based on the URL.
    """
    if not url.startswith('http'):
        url = 'https://' + url

    try:
        # Initialize Gemini Client
        client = genai.Client(api_key=gemini_key)
        
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
                },
                ... (limit to 5 competitors)
            ]
        }
        """

        user_message = f"Here is the company website URL: {url}"
        
        # Using Gemini 1.5 Flash for speed (avoid 504 timeouts)
        # Enabling Google Search Tool
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=[
                types.Content(
                    role="user",
                    parts=[
                        types.Part(text=system_prompt + "\n\n" + user_message)
                    ]
                )
            ],
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                response_modalities=["TEXT"], 
            )
        )
        
        # Extract text content
        content = response.text
        
        # Enhanced JSON extraction
        # Try to find JSON block bounded by ```json ... ```
        json_match = re.search(r'```json\s*(\{.*?\})\s*```', content, re.DOTALL)
        if json_match:
            content = json_match.group(1)
        else:
            # Try to find any JSON-like block if explicitly marked json wasn't found
            # Look for first `{` and last `}`
            start = content.find('{')
            end = content.rfind('}')
            if start != -1 and end != -1:
                content = content[start:end+1]
            
        logger.info(f"Cleaned JSON Content (first 200 chars): {content[:200]}...")

        data = json.loads(content)
        
        # Format the result to match what the frontend expects (list of companies)
        # First item is the main company
        output = [{
            "company_name": data.get("name"),
            "website": url,
            "description": data.get("description"),
            "android_id": None, 
            "apple_id": None,   
            "is_main": True
        }]
        
        # Add competitors
        for comp in data.get("competitors", []):
            output.append({
                "company_name": comp.get("name"),
                "website": comp.get("website"), 
                "description": f"Competitor ({comp.get('region', 'Region Unknown')})",
                "android_id": None,
                "apple_id": None,
                "is_main": False
            })
            
        return output

    except Exception as e:
        logger.error(f"Error analyzing website with Gemini: {e}")
        return [{"error": str(e)}]
