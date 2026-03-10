Deploy the backend to AWS ECS Fargate. Follow these steps in order:

1. Run ruff linting on the backend code:
   ```
   ruff check backend
   ```

2. If there are linting errors, fix them before proceeding.

3. Run the backend deployment script:
   ```
   bash deploy_backend.sh
   ```

4. After deployment completes, verify service status:
   ```
   aws ecs describe-services --cluster voc-cluster --services voc-api-service --region eu-central-1 --query 'services[0].deployments[0].[status,runningCount,desiredCount]' --output table
   ```

5. Report the deployment result.
