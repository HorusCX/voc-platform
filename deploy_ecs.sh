#!/bin/bash

# Configuration
REGION="eu-central-1"
export AWS_DEFAULT_REGION=$REGION
CLUSTER_NAME="voc-cluster"
REPO_NAME="voc-backend"
ACCOUNT_ID="557395370110"
IMAGE_URI="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/$REPO_NAME:latest"
EXECUTION_ROLE_ARN="ecsTaskExecutionRole" 

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🚀 Starting ECS Deployment...${NC}"

# Check for ecsTaskExecutionRole
echo -e "\n${YELLOW}Checking IAM Role...${NC}"
aws iam get-role --role-name ecsTaskExecutionRole > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "❌ ecsTaskExecutionRole not found! Creating default role..."
    # Create trust policy
    cat > trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
    aws iam create-role --role-name ecsTaskExecutionRole --assume-role-policy-document file://trust-policy.json
    aws iam attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
    rm trust-policy.json
    echo "✅ Role created."
else
    echo "✅ Role exists."
fi

# Load Environment Variables from .env
echo -e "\n${GREEN}🔑 Loading Environment Variables from .env...${NC}"
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo "❌ .env file not found!"
    exit 1
fi

# Construct Environment JSON for Task Definition
# We select specific keys to avoid leaking everything if not needed, 
# but for simplicity let's include the main ones.
ENV_JSON=$(jq -n \
  --arg s3 "$S3_BUCKET_NAME" \
  --arg sqs "$SQS_QUEUE_URL" \
  --arg region "$AWS_REGION" \
  --arg openai "$OPENAI_API_KEY" \
  --arg gemini "$GEMINI_API_KEY" \
  --arg dataforseo_login "$DATAFORSEO_LOGIN" \
  --arg dataforseo_pass "$DATAFORSEO_PASSWORD" \
  '[
    {name: "S3_BUCKET_NAME", value: $s3},
    {name: "SQS_QUEUE_URL", value: $sqs},
    {name: "AWS_REGION", value: $region},
    {name: "OPENAI_API_KEY", value: $openai},
    {name: "GEMINI_API_KEY", value: $gemini},
    {name: "DATAFORSEO_LOGIN", value: $dataforseo_login},
    {name: "DATAFORSEO_PASSWORD", value: $dataforseo_pass}
  ]')

# 1. Create Cluster
echo -e "\n${GREEN}📦 Creating ECS Cluster: $CLUSTER_NAME${NC}"
aws ecs create-cluster --cluster-name "$CLUSTER_NAME" --region "$REGION"

# 2. Register Task Definitions
echo -e "\n${GREEN}📝 Registering Task Definitions...${NC}"

# API Task
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
    ]"

# Worker Task
aws ecs register-task-definition \
    --family "voc-worker-task" \
    --network-mode "awsvpc" \
    --requires-compatibilities "FARGATE" \
    --cpu "1024" \
    --memory "2048" \
    --execution-role-arn "ecsTaskExecutionRole" \
    --task-role-arn "ecsTaskExecutionRole" \
    --runtime-platform "cpuArchitecture=ARM64,operatingSystemFamily=LINUX" \
    --container-definitions "[
        {
            \"name\": \"voc-worker\",
            \"image\": \"$IMAGE_URI\",
            \"essential\": true,
            \"command\": [\"python\", \"backend/worker.py\"],
            \"logConfiguration\": {
                \"logDriver\": \"awslogs\",
                \"options\": {
                    \"awslogs-group\": \"/ecs/voc-worker\",
                    \"awslogs-region\": \"$REGION\",
                    \"awslogs-stream-prefix\": \"ecs\"
                }
            },
            \"environment\": $ENV_JSON
        }
    ]"

# 3. Create Log Groups
echo -e "\n${GREEN}Logs: Creating CloudWatch Log Groups...${NC}"
aws logs create-log-group --log-group-name "/ecs/voc-api" --region "$REGION" 2>/dev/null
aws logs create-log-group --log-group-name "/ecs/voc-worker" --region "$REGION" 2>/dev/null

echo -e "\n${GREEN}✅ Task Definitions Registered!${NC}"
echo "--------------------------------------------------------"
echo "To finish deployment:"
echo "1. Go to ECS Console -> Clusters -> voc-cluster"
echo "2. Create Service 'voc-api-service':"
echo "   - Launch Type: FARGATE"
echo "   - Task Definition: voc-api-task"
echo "   - Desired Tasks: 1"
echo "   - Networking: Select your default VPC & Subnets"
# echo "   - Load Balancer: Create an ALB mapping port 80 -> 8000"
echo "--------------------------------------------------------"
echo "3. Create Service 'voc-worker-service':"
echo "   - Launch Type: FARGATE"
echo "   - Task Definition: voc-worker-task"
echo "   - Desired Tasks: 1"
echo "   - Networking: Select VPC & Subnets"
echo "   - No Load Balancer needed."
echo "--------------------------------------------------------"
