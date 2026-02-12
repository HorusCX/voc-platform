import requests
import time
import sys
import os
import json

# Get URL from env or arg
BASE_URL = os.getenv("API_URL", "http://localhost:8000")
if len(sys.argv) > 1:
    BASE_URL = sys.argv[1]

def test_full_flow():
    print(f"🚀 Testing Full Flow against {BASE_URL}")
    
    # Step 1: Start Scraping
    print("\n--- Step 1: Starting Scraping Job ---")
    
    companies = [
        {
            "company_name": "Trustpilot",
            "website": "https://www.trustpilot.com/",
            "is_main": True,
            # Using Trustpilot's own review page which is stable
            "trustpilot_link": "https://www.trustpilot.com/review/www.trustpilot.com"
        }
    ]
    
    try:
        resp = requests.post(f"{BASE_URL}/api/scrap-reviews", json={"brands": companies})
        resp.raise_for_status()
        data = resp.json()
        job_id = data["job_id"]
        print(f"✅ Scraping Started. Job ID: {job_id}")
    except Exception as e:
        print(f"❌ Step 1 Failed: {e}")
        return

    # Step 2: Poll for Scraping Completion
    print("\n--- Step 2: Polling for Scraping Completion ---")
    s3_key = None
    
    start_time = time.time()
    while True:
        elapsed = time.time() - start_time
        if elapsed > 600: # 10 mins timeout
            print("❌ Timeout waiting for scraping.")
            return

        try:
            r = requests.get(f"{BASE_URL}/api/check-status?job_id={job_id}")
            r.raise_for_status()
            status_data = r.json()
            status = status_data.get("status")
            message = status_data.get("message")
            
            sys.stdout.write(f"\r[{status.upper()}] {message}   ")
            sys.stdout.flush()
            
            if status == "completed":
                print("\n✅ Scraping Completed!")
                s3_key = status_data.get("s3_key")
                print(f"🔑 S3 Key: {s3_key}")
                break
                
            if status == "error":
                print(f"\n❌ Scraping Failed: {message}")
                return
                
        except Exception as e:
            print(f"\nError polling: {e}")
        
        time.sleep(5)

    if not s3_key:
        print("❌ No S3 key returned.")
        return

    # Step 3: Trigger Analysis (Dimension Generation)
    print("\n--- Step 3: Generating Dimensions ---")
    try:
        resp = requests.post(f"{BASE_URL}/api/scrapped-data", json={"s3_key": s3_key})
        resp.raise_for_status()
        data = resp.json()
        
        body = data.get("body", {})
        dimensions = body.get("dimensions", [])
        
        print(f"✅ Dimensions Generated: {len(dimensions)} found")
        
    except Exception as e: 
        print(f"❌ Step 3 Failed: {e}")
        return

    # Step 4: Final Analysis
    print("\n--- Step 4: Triggering Final Analysis ---")
    payload = {
        "dimensions": dimensions,
        "file_key": s3_key 
    }
    
    try:
        resp = requests.post(f"{BASE_URL}/api/final-analysis", json=payload)
        resp.raise_for_status()
        job_data = resp.json()
        analysis_job_id = job_data["job_id"]
        print(f"✅ Analysis Started. Job ID: {analysis_job_id}")
    except Exception as e:
        print(f"❌ Step 4 Failed: {e}")
        return

    # Step 5: Poll for Final Results
    print("\n--- Step 5: Polling for Analysis Completion ---")
    start_time = time.time()
    while True:
        time.sleep(5)
        elapsed = time.time() - start_time
        if elapsed > 600: 
            print("❌ Timeout waiting for analysis.")
            return

        try:
            r = requests.get(f"{BASE_URL}/api/check-status?job_id={analysis_job_id}")
            r.raise_for_status()
            status_data = r.json()
            status = status_data.get("status")
            
            sys.stdout.write(f"\r[{status.upper()}] {status_data.get('message')}   ")
            sys.stdout.flush()
            
            if status == "completed":
                print("\n\n✅ Job Completed!")
                dashboard_link = status_data.get("dashboard_link")
                print(f"🔗 Dashboard Link: {dashboard_link}")
                return
                
            if status == "error":
                print(f"\n\n❌ Job Failed: {status_data.get('message')}")
                return
                
        except Exception as e:
            print(f"\nError polling: {e}")
        
        time.sleep(5)

if __name__ == "__main__":
    test_full_flow()
