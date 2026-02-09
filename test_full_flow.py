import requests
import time
import sys
import os

# Get URL from env or arg
BASE_URL = os.getenv("API_URL")
if len(sys.argv) > 1:
    BASE_URL = sys.argv[1]

if not BASE_URL:
    print("Usage: python test_full_flow.py <API_URL>")
    sys.exit(1)

# Known valid S3 key from previous logs
TEST_S3_KEY = "scrapped_data/job_1770589985932_282.csv"

def test_flow():
    print(f"🚀 Testing Full Flow against {BASE_URL}")
    print(f"📂 Using Test Key: {TEST_S3_KEY}")
    
    # 1. Get Dimensions (Simulate 'Process Extracted Data')
    print("\n--- Step 1: Generating Dimensions ---")
    try:
        resp = requests.post(f"{BASE_URL}/api/scrapped-data", json={"s3_key": TEST_S3_KEY})
        resp.raise_for_status()
        data = resp.json()
        
        # Verify fix: Check if s3_key in body matches our input and is not a local path
        body = data.get("body", {})
        returned_key = body.get("s3_key")
        dimensions = body.get("dimensions", [])
        
        print(f"✅ Dimensions Generated: {len(dimensions)} found")
        print(f"🔑 Returned S3 Key: {returned_key}")
        
        if returned_key != TEST_S3_KEY:
             print(f"❌ CRITICAL ERROR: Returned key '{returned_key}' does not match input '{TEST_S3_KEY}'")
             # If it looks like a local path (starts with data/), fail
             if returned_key.startswith("data/"):
                 print("❌ Failed: Backend returned local path instead of S3 key!")
                 return
        
    except Exception as e: 
        print(f"❌ Step 1 Failed: {e}")
        return

    # 2. Trigger Analysis
    print("\n--- Step 2: Triggering Analysis ---")
    payload = {
        "dimensions": dimensions,
        "file_key": returned_key 
    }
    
    try:
        resp = requests.post(f"{BASE_URL}/api/final-analysis", json=payload)
        resp.raise_for_status()
        job_data = resp.json()
        job_id = job_data["job_id"]
        print(f"✅ Analysis Started. Job ID: {job_id}")
    except Exception as e:
        print(f"❌ Step 2 Failed: {e}")
        return

    # 3. Poll for Results
    print("\n--- Step 3: Polling for Completion ---")
    start_time = time.time()
    while True:
        elapsed = time.time() - start_time
        if elapsed > 600: # 10 mins timeout
            print("❌ Timeout waiting for analysis.")
            return

        try:
            r = requests.get(f"{BASE_URL}/api/check-status?job_id={job_id}")
            r.raise_for_status()
            status_data = r.json()
            status = status_data.get("status")
            message = status_data.get("message")
            processed = status_data.get("processed", 0)
            total = status_data.get("total", 0)
            
            # Print progress bar
            sys.stdout.write(f"\r[{status.upper()}] {message} ({processed}/{total})   ")
            sys.stdout.flush()
            
            if status == "completed":
                print("\n\n✅ Job Completed!")
                dashboard_link = status_data.get("dashboard_link")
                print(f"🔗 Dashboard Link: {dashboard_link}")
                
                PRODUCTION_URL = "https://main.d27d8jikm93xrx.amplifyapp.com"
                if dashboard_link and dashboard_link.startswith(PRODUCTION_URL):
                    print("✅ SUCCESS: Valid Production Dashboard Link verified.")
                else:
                     print(f"❌ FAILURE: Dashboard link is invalid or local! Expected start with {PRODUCTION_URL}")
                return
                
            if status == "error":
                print(f"\n\n❌ Job Failed: {message}")
                return
                
        except Exception as e:
            print(f"\nError polling: {e}")
        
        time.sleep(5)

if __name__ == "__main__":
    test_flow()
