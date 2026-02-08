#!/bin/bash

# Configuration
REGION="eu-central-1"
export AWS_DEFAULT_REGION=$REGION
REPO_NAME="voc-backend"

# Colors
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}🚀 Starting Backend Deployment Build...${NC}"

# 1. Get Account ID
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
if [ -z "$ACCOUNT_ID" ]; then
    echo "❌ Failed to get AWS Account ID. Check your credentials."
    exit 1
fi
echo "AWS Account ID: $ACCOUNT_ID"

# 2. Create ECR Repo (if not exists)
echo -e "\n${GREEN}📦 Checking ECR Repository: $REPO_NAME${NC}"
aws ecr describe-repositories --repository-names "$REPO_NAME" --region "$REGION" > /dev/null 2>&1

if [ $? -ne 0 ]; then
    echo "Creating repository..."
    aws ecr create-repository --repository-name "$REPO_NAME" --region "$REGION"
else
    echo "Repository already exists."
fi

ECR_URI="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"
IMAGE_URI="$ECR_URI/$REPO_NAME:latest"

# 3. Login to ECR
echo -e "\n${GREEN}🔑 Logging in to ECR...${NC}"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ECR_URI"

# 4. Build Docker Image
echo -e "\n${GREEN}🔨 Building Docker Image...${NC}"
# Use --platform linux/arm64 for compatibility with Fargate ARM64
docker build --platform linux/arm64 --provenance=false -t "$REPO_NAME" .

# 5. Tag and Push
echo -e "\n${GREEN}🏷️ Tagging and Pushing to: $IMAGE_URI${NC}"
docker tag "$REPO_NAME:latest" "$IMAGE_URI"
docker push "$IMAGE_URI"

echo -e "\n${GREEN}✅ Build and Push Complete!${NC}"
echo "Image URI: $IMAGE_URI"
