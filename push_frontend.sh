#!/bin/bash
git add frontend/lib/dashboard-utils.ts
git commit -m "fix: bypass proxy for S3 URLs to fix CORS fetch error"
git push origin main
