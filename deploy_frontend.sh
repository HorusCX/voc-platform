#!/bin/bash

# Configuration
BRANCH="main"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🚀 Starting Frontend Deployment...${NC}"

# 1. Check for changes
if [[ -z $(git status -s) ]]; then
    echo -e "${YELLOW}⚠️  No changes to deploy.${NC}"
    exit 0
fi

# 2. Add changes
echo -e "\n${GREEN}📦 Staging changes...${NC}"
git add .

# 3. Commit
echo -e "\n${GREEN}qd Committing changes...${NC}"
TIMESTAMP=$(date "+%Y-%m-%d %H:%M:%S")
read -p "Enter commit message (default: 'Deploy frontend $TIMESTAMP'): " COMMIT_MSG
COMMIT_MSG=${COMMIT_MSG:-"Deploy frontend $TIMESTAMP"}

git commit -m "$COMMIT_MSG"

# 4. Push to GitHub (triggers Amplify)
echo -e "\n${GREEN}🚀 Pushing to GitHub (triggers Amplify Build)...${NC}"
git push origin "$BRANCH"

echo -e "\n${GREEN}✅ Deployment triggered! Check Amplify Console for progress.${NC}"
