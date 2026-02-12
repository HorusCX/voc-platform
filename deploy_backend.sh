#!/bin/bash

# Full Deployment Script for VoC Backend
# This script handles the complete deployment process including:
# 1. Building and pushing Docker image
# 2. Registering new task definitions
# 3. Updating ECS services
# 4. Forcing old tasks to stop to ensure new revision deploys immediately

# Configuration
REGION="eu-central-1"
export AWS_DEFAULT_REGION=$REGION
CLUSTER_NAME="voc-cluster"
REPO_NAME="voc-backend"
ACCOUNT_ID="557395370110"
IMAGE_URI="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:latest"
DASHBOARD_URL="https://main.d27d8jikm93xrx.amplifyapp.com"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}🚀 Starting Full Backend Deployment...${NC}"

# ============================================
# STEP 1: Build and Push Docker Image
# ============================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📦 Step 1: Building Docker Image${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Login to ECR
echo -e "\n${YELLOW}🔑 Logging in to ECR...${NC}"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

# Build Docker Image
echo -e "\n${YELLOW}🔨 Building Docker Image...${NC}"
docker build --platform linux/arm64 --provenance=false -t "$REPO_NAME" .

# Tag and Push
echo -e "\n${YELLOW}🏷️  Tagging and Pushing to ECR...${NC}"
docker tag "$REPO_NAME:latest" "$IMAGE_URI"
echo "Pushing $IMAGE_URI..."
docker push "$IMAGE_URI"

echo -e "${GREEN}✅ Docker image built and pushed successfully${NC}"

# ============================================
# STEP 2: Register New Task Definitions
# ============================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📝 Step 2: Registering Task Definitions${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Load Environment Variables
echo -e "\n${GREEN}🔑 Loading Environment Variables from .env...${NC}"
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "❌ .env file not found!"
    exit 1
fi

# Construct Environment JSON
ENV_JSON=$(jq -n \
  --arg s3 "$S3_BUCKET_NAME" \
  --arg region "$AWS_REGION" \
  --arg openai "$OPENAI_API_KEY" \
  --arg gemini "$GEMINI_API_KEY" \
  --arg dataforseo_login "$DATAFORSEO_LOGIN" \
  --arg dataforseo_pass "$DATAFORSEO_PASSWORD" \
  --arg dashboard_url "$DASHBOARD_URL" \
  '[
    {name: "S3_BUCKET_NAME", value: $s3},
    {name: "AWS_REGION", value: $region},
    {name: "OPENAI_API_KEY", value: $openai},
    {name: "GEMINI_API_KEY", value: $gemini},
    {name: "DATAFORSEO_LOGIN", value: $dataforseo_login},
    {name: "DATAFORSEO_PASSWORD", value: $dataforseo_pass},
    {name: "DASHBOARD_URL", value: $dashboard_url}
  ]')

# Register API Task Definition
echo -e "\n${YELLOW}Registering voc-api-task...${NC}"
aws ecs register-task-definition \
    --family "voc-api-task" \
    --network-mode "awsvpc" \
    --requires-compatibilities "FARGATE" \
    --cpu "512" \
    --memory "1024" \
    --execution-role-arn "ecsTaskExecutionRole" \
    --task-role-arn "ecsTaskExecutionRole" \
    --runtime-platform "cpuArchitecture=ARM64,operatingSystemFamily=LINUX" \
    --container-definitions "[
        {
            \"name\": \"voc-api\",
            \"image\": \"$IMAGE_URI\",
            \"essential\": true,
            \"portMappings\": [
                {
                    \"containerPort\": 8000,
                    \"hostPort\": 8000,
                    \"protocol\": \"tcp\"
                }
            ],
            \"logConfiguration\": {
                \"logDriver\": \"awslogs\",
                \"options\": {
                    \"awslogs-group\": \"/ecs/voc-api\",
                    \"awslogs-region\": \"$REGION\",
                    \"awslogs-stream-prefix\": \"ecs\"
                }
            },
            \"environment\": $ENV_JSON
        }
    ]" > /dev/null

echo -e "${GREEN}✅ Task definitions registered${NC}"

# ============================================
# STEP 3: Update Services with New Task Definitions
# ============================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🔄 Step 3: Updating ECS Services${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Get latest task definition revisions
API_TASK_DEF=$(aws ecs describe-task-definition --task-definition voc-api-task --query 'taskDefinition.taskDefinitionArn' --output text)
echo -e "\n${YELLOW}Latest API Task Definition: $API_TASK_DEF${NC}"

# Update API Service
echo -e "\n${YELLOW}Updating voc-api-service...${NC}"
aws ecs update-service \
    --cluster "$CLUSTER_NAME" \
    --service voc-api-service \
    --task-definition "$API_TASK_DEF" \
    --force-new-deployment \
    --region "$REGION" > /dev/null

echo -e "${GREEN}✅ Services updated${NC}"

# ============================================
# STEP 4: Force Stop Old Tasks
# ============================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🛑 Step 4: Forcing Old Tasks to Stop${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -e "\n${YELLOW}This ensures the new task definitions deploy immediately...${NC}"

# Get running tasks for API service
API_TASKS=$(aws ecs list-tasks \
    --cluster "$CLUSTER_NAME" \
    --service-name voc-api-service \
    --desired-status RUNNING \
    --region "$REGION" \
    --query 'taskArns' \
    --output text)

# Stop each API task
if [ -n "$API_TASKS" ]; then
    echo -e "\n${YELLOW}Stopping API service tasks...${NC}"
    for task in $API_TASKS; do
        echo "  Stopping task: $(basename $task)"
        aws ecs stop-task \
            --cluster "$CLUSTER_NAME" \
            --task "$task" \
            --reason "Forcing deployment of new task definition" \
            --region "$REGION" > /dev/null
    done
    echo -e "${GREEN}✅ API tasks stopped${NC}"
else
    echo -e "${YELLOW}No running API tasks to stop${NC}"
fi

# ============================================
# STEP 5: Monitor Deployment
# ============================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}👀 Step 5: Monitoring Deployment${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -e "\n${YELLOW}Waiting for new tasks to start (30 seconds)...${NC}"
sleep 30

# Check API service status
echo -e "\n${YELLOW}API Service Status:${NC}"
aws ecs describe-services \
    --cluster "$CLUSTER_NAME" \
    --services voc-api-service \
    --region "$REGION" \
    --query 'services[0].deployments[0].[status,runningCount,desiredCount,taskDefinition]' \
    --output table

# ============================================
# COMPLETION
# ============================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo "1. Monitor CloudWatch logs at /ecs/voc-api"
echo "2. Test the application at your frontend URL"
echo "3. Verify health checks are passing"

echo -e "\n${YELLOW}Useful Commands:${NC}"
echo "# Check service status:"
echo "  aws ecs describe-services --cluster $CLUSTER_NAME --services voc-api-service --region $REGION"
echo ""
echo "# View logs:"
echo "  aws logs tail /ecs/voc-api --follow --region $REGION"
echo ""
