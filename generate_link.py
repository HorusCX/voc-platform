import boto3
import os
import urllib.parse
from dotenv import load_dotenv

load_dotenv()

S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "horus-voc-data-storage-v2-eu")
AWS_REGION = os.getenv("AWS_REGION", "eu-central-1")
DASHBOARD_URL = "https://main.d27d8jikm93xrx.amplifyapp.com/dashboard"

s3_client = boto3.client(
    's3', 
    region_name=AWS_REGION,
    endpoint_url=f"https://s3.{AWS_REGION}.amazonaws.com",
    config=boto3.session.Config(signature_version='s3v4')
)

key = "analyzed_data/analyzed_reviews_20260212_193439.csv"

try:
    url = s3_client.generate_presigned_url(
        'get_object',
        Params={'Bucket': S3_BUCKET_NAME, 'Key': key},
        ExpiresIn=86400  # 24 hours
    )
    
    encoded_url = urllib.parse.quote(url, safe='')
    print(f"\n✅ IMMEDIATE ACCESS LINK (Valid for 24h):")
    print(f"{DASHBOARD_URL}?csv_url={encoded_url}")
    
except Exception as e:
    print(f"Error: {e}")
