#!/bin/bash

# VoC Infrastructure Setup Script
# This script initializes all AWS resources required for the VoC Platform:
# 1. S3 Bucket for data storage
# 2. Networking (VPC, Security Groups, ALB)
# 3. ECS Cluster and Service

# Configuration
REGION="eu-central-1"
export AWS_DEFAULT_REGION=$REGION
CLUSTER_NAME="voc-cluster"
S3_BUCKET_NAME="horus-voc-data-storage-v2-eu"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}🚀 Starting VoC Infrastructure Setup...${NC}"

# ============================================
# STEP 1: S3 Bucket Setup
# ============================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}📦 Step 1: Setting up S3 Bucket: $S3_BUCKET_NAME${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if aws s3api head-bucket --bucket "$S3_BUCKET_NAME" 2>/dev/null; then
    echo "✅ Bucket already exists."
else
    aws s3api create-bucket \
        --bucket "$S3_BUCKET_NAME" \
        --region "$REGION" \
        --create-bucket-configuration LocationConstraint="$REGION"
    
    # Block public access
    aws s3api put-public-access-block \
        --bucket "$S3_BUCKET_NAME" \
        --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"
    
    echo "✅ Bucket created successfully."
fi

# ============================================
# STEP 2: Networking Setup
# ============================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🌐 Step 2: Setting up Networking (VPC, Security Groups, ALB)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Get VPC and Subnets
VPC_ID=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query "Vpcs[0].VpcId" --output text | xargs)
SUBNETS_RAW=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[*].SubnetId" --output text)
SUBNETS_SPACE=$(echo "$SUBNETS_RAW" | tr '\t' ' ')
SUBNETS_COMMA=$(echo "$SUBNETS_RAW" | tr '\t' ',')

echo "VPC: $VPC_ID"

# 1. Security Groups
echo -e "\n${YELLOW}Creating Security Groups...${NC}"

# ALB SG (Allow 80 from world)
ALB_SG_ID=$(aws ec2 create-security-group --group-name voc-alb-sg --description "Allow HTTP" --vpc-id "$VPC_ID" --query "GroupId" --output text 2>/dev/null)
if [ -z "$ALB_SG_ID" ]; then
    ALB_SG_ID=$(aws ec2 describe-security-groups --filter Name=group-name,Values=voc-alb-sg --query "SecurityGroups[0].GroupId" --output text)
    echo "Using existing ALB SG: $ALB_SG_ID"
else
    aws ec2 authorize-security-group-ingress --group-id "$ALB_SG_ID" --protocol tcp --port 80 --cidr 0.0.0.0/0
    echo "Created ALB SG: $ALB_SG_ID"
fi

# ECS SG (Allow 8000 from ALB, and All Outbound)
ECS_SG_ID=$(aws ec2 create-security-group --group-name voc-ecs-sg --description "Allow 8000 from ALB" --vpc-id "$VPC_ID" --query "GroupId" --output text 2>/dev/null)
if [ -z "$ECS_SG_ID" ]; then
    ECS_SG_ID=$(aws ec2 describe-security-groups --filter Name=group-name,Values=voc-ecs-sg --query "SecurityGroups[0].GroupId" --output text)
    echo "Using existing ECS SG: $ECS_SG_ID"
else
    # Ingress from ALB
    aws ec2 authorize-security-group-ingress --group-id "$ECS_SG_ID" --protocol tcp --port 8000 --source-group "$ALB_SG_ID"
    echo "Created ECS SG: $ECS_SG_ID"
fi

# 2. Load Balancer (ALB)
echo -e "\n${YELLOW}Creating Load Balancer...${NC}"
ALB_ARN=$(aws elbv2 create-load-balancer --name voc-alb --subnets $SUBNETS_SPACE --security-groups $ALB_SG_ID --query "LoadBalancers[0].LoadBalancerArn" --output text 2>/dev/null)
if [ -z "$ALB_ARN" ]; then
    # It might verify the name uniqueness but arn is needed.
    # If exists, we query it.
    ALB_ARN=$(aws elbv2 describe-load-balancers --names voc-alb --query "LoadBalancers[0].LoadBalancerArn" --output text)
    echo "Using existing ALB: $ALB_ARN"
else
    echo "Created ALB: $ALB_ARN"
fi

# Target Group (IP type for Fargate)
TG_ARN=$(aws elbv2 create-target-group --name voc-api-tg --protocol HTTP --port 8000 --vpc-id "$VPC_ID" --target-type ip --health-check-path "/" --query "TargetGroups[0].TargetGroupArn" --output text 2>/dev/null)
if [ -z "$TG_ARN" ]; then
     TG_ARN=$(aws elbv2 describe-target-groups --names voc-api-tg --query "TargetGroups[0].TargetGroupArn" --output text)
     echo "Using existing Target Group: $TG_ARN"
else
    echo "Created Target Group: $TG_ARN"
fi

# Listener (HTTP:80 -> TG)
LISTENER_ARN=$(aws elbv2 create-listener --load-balancer-arn "$ALB_ARN" --protocol HTTP --port 80 --default-actions Type=forward,TargetGroupArn="$TG_ARN" --query "Listeners[0].ListenerArn" --output text 2>/dev/null)
# If fails (e.g. exists), we assume it's there. 
if [ $? -ne 0 ]; then
     echo "Listener likely exists."
else
     echo "Created Listener."
fi

# ============================================
# STEP 3: ECS Cluster & Service
# ============================================
echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}🚀 Step 3: Creating ECS Cluster and Services${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Create Cluster
echo -e "\n${YELLOW}Creating ECS Cluster: $CLUSTER_NAME...${NC}"
aws ecs create-cluster --cluster-name "$CLUSTER_NAME" --region "$REGION"

# API Service
echo -e "\n${YELLOW}Creating/Updating API Service...${NC}"
# Note: This assumes the task definition 'voc-api-task' already exists. 
# If running for the very first time, you might need to run deploy_backend.sh (Step 2 of that script) first 
# or ensure the task def is registered. 
# However, usually infrastructure is set up before code deployment.
# For a pure clean start, you'd need a dummy task def or register it here. 
# Assuming task definition handles via deploy_backend.sh, we will try to create service only if it doesn't exist.

if aws ecs describe-services --cluster "$CLUSTER_NAME" --services "voc-api-service" | grep -q "ACTIVE"; then
    echo "Service 'voc-api-service' already exists."
else
    echo "Creating 'voc-api-service'..."
    aws ecs create-service \
        --cluster "$CLUSTER_NAME" \
        --service-name "voc-api-service" \
        --task-definition "voc-api-task" \
        --desired-count 1 \
        --launch-type "FARGATE" \
        --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS_COMMA],securityGroups=[$ECS_SG_ID],assignPublicIp=ENABLED}" \
        --load-balancers "targetGroupArn=$TG_ARN,containerName=voc-api,containerPort=8000" \
        --region "$REGION"
fi

# ============================================
# COMPLETION
# ============================================
DNS_NAME=$(aws elbv2 describe-load-balancers --load-balancer-arns "$ALB_ARN" --query "LoadBalancers[0].DNSName" --output text)

echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Infrastructure Setup Complete!${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

echo "API URL: http://$DNS_NAME"
echo ""
echo "Next Steps:"
echo "1. Update your .env file with S3_BUCKET_NAME=$S3_BUCKET_NAME"
echo "2. Run './deploy_backend.sh' to deploy your code to this infrastructure."
