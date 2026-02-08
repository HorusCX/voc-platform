#!/bin/bash

# Configuration
REGION="eu-central-1"
export AWS_DEFAULT_REGION=$REGION
S3_BUCKET_NAME="horus-voc-data-storage-v2-eu"
SQS_QUEUE_NAME="voc-analysis-queue"

# Colors for output
GREEN='\033[0;32m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Starting VoC Infrastructure Setup...${NC}"

# 1. Create S3 Bucket
echo -e "\n${GREEN}📦 Creating S3 Bucket: $S3_BUCKET_NAME${NC}"
if aws s3api head-bucket --bucket "$S3_BUCKET_NAME" 2>/dev/null; then
    echo "Bucket already exists."
else
    aws s3api create-bucket \
        --bucket "$S3_BUCKET_NAME" \
        --region "$REGION" \
        --create-bucket-configuration LocationConstraint="$REGION"
    
    # Block public access
    aws s3api put-public-access-block \
        --bucket "$S3_BUCKET_NAME" \
        --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
    
    echo "Bucket created successfully."
fi

# 2. Create SQS Queue
echo -e "\n${GREEN}📨 Creating SQS Queue: $SQS_QUEUE_NAME${NC}"
QUEUE_URL=$(aws sqs get-queue-url --queue-name "$SQS_QUEUE_NAME" --query 'QueueUrl' --output text 2>/dev/null)

if [ -z "$QUEUE_URL" ]; then
    # Create queue with long polling (20s) and visibility timeout (6 hours = 21600s for long scraping jobs)
    # Default visibility is 30s, which is too short for our 1-2 hour jobs.
    # Setting to 6 hours (21600 seconds) to be safe.
    OPTIONS="VisibilityTimeout=21600,MessageRetentionPeriod=1209600,ReceiveMessageWaitTimeSeconds=20"
    
    QUEUE_URL=$(aws sqs create-queue \
        --queue-name "$SQS_QUEUE_NAME" \
        --attributes "$OPTIONS" \
        --region "$REGION" \
        --query 'QueueUrl' \
        --output text)
    
    echo "Queue created: $QUEUE_URL"
else
    echo "Queue already exists: $QUEUE_URL"
    # Update attributes just in case
    aws sqs set-queue-attributes \
        --queue-url "$QUEUE_URL" \
        --attributes "VisibilityTimeout=21600"
    echo "Updated VisibilityTimeout to 6 hours."
fi

# 3. Output .env snippet
echo -e "\n${GREEN}✅ Infrastructure Ready!${NC}"
echo -e "Add these to your .env file:"
echo "--------------------------------"
echo "S3_BUCKET_NAME=$S3_BUCKET_NAME"
echo "SQS_QUEUE_URL=$QUEUE_URL"
echo "AWS_REGION=$REGION"
echo "--------------------------------"
