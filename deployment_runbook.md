# Deployment Runbook (macOS Environment)

This runbook provides a step-by-step guide to deploying the VoC platform when standard workflows fail due to macOS file permissions or Docker keychain issues.

## 1. Backend Deployment (ECR & ECS)

If `bash deploy_backend.sh` fails with `Operation not permitted` or `Keychain Error`:

### Step A: Prepare Build Context
Create a script `prepare_build.py` to isolate the necessary files and avoid restricted ones (like `.env`).
```python
import os, shutil
dst = 'build_ctx'
if os.path.exists(dst): shutil.rmtree(dst)
os.makedirs(dst)
# Only copy necessary items
items = ['Dockerfile', 'requirements.txt', 'backend']
ignore = shutil.ignore_patterns('__pycache__', '*.pyc', '.env', '.DS_Store')
for i in items:
    if os.path.exists(i):
        if os.path.isdir(i): shutil.copytree(i, os.path.join(dst, i), ignore=ignore)
        else: shutil.copy2(i, os.path.join(dst, i))
```

### Step B: Configure Docker Credentials
If `docker login` fails with a Keychain error, use an isolated config:
1. Create a `config.json` in the project root:
   ```json
   { "auths": {}, "credsStore": "" }
   ```
2. Run deployment with the `--config` flag:
   ```bash
   export DOCKER_BUILDKIT=0
   python3 prepare_build.py
   aws ecr get-login-password --region eu-central-1 | docker --config . login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.eu-central-1.amazonaws.com
   bash deploy_backend.sh
   ```

## 2. Frontend Deployment (Amplify)

### Preventive Checklist
- **Avoid `git add .`**: Temporary files like `config.json` or `.deploy_env` can trigger GitHub Secret Scanning.
- **Cleanup Before Push**:
  ```bash
  rm -rf build_ctx config.json prepare_build.py .deploy_env
  git add .
  git commit -m "Deploy: <message>"
  git push origin main
  ```

---
*Last Updated: 2026-03-09*
