# VoC Backend Deployment Guide

This guide explains how to deploy the VoC backend to AWS ECS.

## Deployment Scripts

### `deploy_backend.sh` - Backend Deployment (Recommended)

This is the **main** script for deploying backend updates. It handles the entire deployment process:

1. **Builds** the Docker image
2. **Pushes** to Amazon ECR
3. **Registers** new task definitions
4. **Updates** ECS services
5. **Forces old tasks to stop** (prevents stuck deployments)
6. **Monitors** deployment status

**Usage:**
```bash
./deploy_backend.sh
```

### `deploy_frontend.sh` - Frontend Deployment

Deploys the Next.js frontend to AWS Amplify (via GitHub push).

**Usage:**
```bash
./deploy_frontend.sh
```

### `setup_aws.sh` - Infrastructure Setup (One-Time)

Initializes all required AWS resources (S3, VPC, ALB, ECS Cluster/Service). Run this only once when setting up a new environment.

**Usage:**
```bash
./setup_aws.sh
```

---

## Deployment Workflow

### For Regular Updates (Code Changes)

Use the backend deployment script:

```bash
./deploy_backend.sh
```

---

## Deployment Workflow

### For Regular Updates (Code Changes)

Use the complete deployment script:

```bash
./deploy_full.sh
```

This will:
- Build your latest code changes
- Deploy them to ECS
- Force immediate task replacement
- Show deployment status

### Manual Step-by-Step Deployment

If you need more control, you can run the steps separately:

```bash
# Step 1: Build and push Docker image
./deploy_backend.sh

# Step 2: Register new task definitions
./deploy_ecs.sh

# Step 3: Update services and force task restart
aws ecs update-service --cluster voc-cluster --service voc-api-service --task-definition voc-api-task --force-new-deployment --region eu-central-1

# Get running tasks
API_TASK=$(aws ecs list-tasks --cluster voc-cluster --service-name voc-api-service --desired-status RUNNING --region eu-central-1 --query 'taskArns[0]' --output text)

# Force stop old task
aws ecs stop-task --cluster voc-cluster --task $API_TASK --reason "Deploying new revision" --region eu-central-1

# Repeat for worker service
aws ecs update-service --cluster voc-cluster --service voc-worker-service --task-definition voc-worker-task --force-new-deployment --region eu-central-1

WORKER_TASK=$(aws ecs list-tasks --cluster voc-cluster --service-name voc-worker-service --desired-status RUNNING --region eu-central-1 --query 'taskArns[0]' --output text)

aws ecs stop-task --cluster voc-cluster --task $WORKER_TASK --reason "Deploying new revision" --region eu-central-1
```

---

## Monitoring Deployment

### Check Service Status

```bash
aws ecs describe-services --cluster voc-cluster --services voc-api-service voc-worker-service --region eu-central-1 --query 'services[*].[serviceName,deployments[0].status,deployments[0].runningCount,deployments[0].taskDefinition]' --output table
```

### View Logs

```bash
# API logs
aws logs tail /ecs/voc-api --follow --region eu-central-1

# Worker logs
aws logs tail /ecs/voc-worker --follow --region eu-central-1
```

### List Running Tasks

```bash
# API tasks
aws ecs list-tasks --cluster voc-cluster --service-name voc-api-service --desired-status RUNNING --region eu-central-1

# Worker tasks
aws ecs list-tasks --cluster voc-cluster --service-name voc-worker-service --desired-status RUNNING --region eu-central-1
```

---

## Troubleshooting

### Deployment Stuck in "PRIMARY" Status

If a deployment shows `PRIMARY` status but `runningCount` is 0, the new task isn't starting. This usually happens when:

1. The service is updated but old tasks aren't stopping
2. Health checks are failing
3. Resource constraints

**Solution:** Use `deploy_full.sh` which automatically forces old tasks to stop.

### Task Keeps Restarting

Check the logs for errors:

```bash
aws logs tail /ecs/voc-api --follow --region eu-central-1
```

Common issues:
- Missing environment variables in `.env`
- Docker image build errors
- Application crashes on startup

### Health Check Failures

The API service has a health check on `/`. Ensure:
- The FastAPI app is running on port 8000
- The root endpoint returns a 200 status code
- The container has network access

---

## Environment Variables

Ensure your `.env` file contains:

```env
OPENAI_API_KEY=your-key
GEMINI_API_KEY=your-key
S3_BUCKET_NAME=horus-voc-data-storage-v2-eu
AWS_REGION=eu-central-1
SQS_QUEUE_URL=https://sqs.eu-central-1.amazonaws.com/557395370110/voc-analysis-queue
DATAFORSEO_LOGIN=your-login
DATAFORSEO_PASSWORD=your-password
```

These are automatically injected into the ECS task definitions during deployment.
