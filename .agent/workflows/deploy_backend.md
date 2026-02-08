---
description: Deploy backend changes to AWS ECS Fargate
---

1. Build and push the Docker image to ECR
// turbo
2. bash deploy_backend.sh

3. Force a new deployment on ECS to pull the latest image
// turbo
4. aws ecs update-service --cluster voc-cluster --service voc-api-service --force-new-deployment --region eu-central-1 && aws ecs update-service --cluster voc-cluster --service voc-worker-service --force-new-deployment --region eu-central-1
