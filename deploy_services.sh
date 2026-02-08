#!/bin/bash

# Configuration
REGION="eu-central-1"
export AWS_DEFAULT_REGION=$REGION
CLUSTER_NAME="voc-cluster"
VPC_ID=$(aws ec2 describe-vpcs --filters Name=isDefault,Values=true --query "Vpcs[0].VpcId" --output text | xargs)
SUBNETS_RAW=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" --query "Subnets[*].SubnetId" --output text)
SUBNETS_SPACE=$(echo "$SUBNETS_RAW" | tr '\t' ' ')
SUBNETS_COMMA=$(echo "$SUBNETS_RAW" | tr '\t' ',')

# Colors
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}🚀 Starting Service Deployment...${NC}"
echo "VPC: $VPC_ID"
echo "Subnets: $SUBNETS"

# 1. Security Groups
echo -e "\n${GREEN}🛡️ Creating Security Groups...${NC}"

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
    # Allow logic direct access for testing? Optional, but safer to restrict.
    # For Worker output internet access: default SG allows all outbound.
    echo "Created ECS SG: $ECS_SG_ID"
fi

# 2. Load Balancer (ALB)
echo -e "\n${GREEN}⚖️ Creating Load Balancer...${NC}"
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

# 3. Create Services
echo -e "\n${GREEN}🚀 Creating ECS Services...${NC}"

# API Service
echo "Creating API Service..."
aws ecs create-service \
    --cluster "$CLUSTER_NAME" \
    --service-name "voc-api-service" \
    --task-definition "voc-api-task" \
    --desired-count 1 \
    --launch-type "FARGATE" \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS_COMMA],securityGroups=[$ECS_SG_ID],assignPublicIp=ENABLED}" \
    --load-balancers "targetGroupArn=$TG_ARN,containerName=voc-api,containerPort=8000" \
    --region "$REGION"

# Worker Service
echo "Creating Worker Service..."
aws ecs create-service \
    --cluster "$CLUSTER_NAME" \
    --service-name "voc-worker-service" \
    --task-definition "voc-worker-task" \
    --desired-count 1 \
    --launch-type "FARGATE" \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS_COMMA],securityGroups=[$ECS_SG_ID],assignPublicIp=ENABLED}" \
    --region "$REGION"

# 4. Output
DNS_NAME=$(aws elbv2 describe-load-balancers --load-balancer-arns "$ALB_ARN" --query "LoadBalancers[0].DNSName" --output text)
echo -e "\n${GREEN}✅ Deployment Complete!${NC}"
echo "API URL: http://$DNS_NAME"
echo "You can update your Frontend to point to this URL."
