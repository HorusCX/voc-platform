# VoC Platform

Voice of Customer analysis platform — scrapes app store reviews from multiple sources, uses AI to extract sentiment/dimensions, and serves an analytics dashboard.

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + React 19 + Tailwind v4 + TypeScript
- **Backend**: FastAPI (Python 3.10) + SQLAlchemy + PostgreSQL (AWS RDS)
- **Storage**: AWS S3 (`horus-voc-data-storage-v2-eu`)
- **Infra**: AWS ECS Fargate (backend), AWS Amplify (frontend), region `eu-central-1`

## Key Paths

```
backend/
  main.py              # FastAPI app — all API routes (~40 endpoints)
  database.py          # SQLAlchemy models & DB connection
  auth.py              # JWT authentication
  services/            # Business logic (scraping, analysis, chat, email)

frontend/
  app/                 # Next.js App Router pages
    api/               # Proxy routes (HTTPS→HTTP, see gotchas below)
    dashboard/         # Main dashboard
    dimensions/        # Dimension analysis
    reviews/           # Reviews display
    login/ signup/     # Auth pages
  components/          # UI components by domain (companies/, dashboard/, layout/, ui/)
  lib/api.ts           # Centralized API client (VoCService) with all backend calls
  lib/utils.ts         # cn() utility (clsx + tailwind-merge)
  contexts/            # React context providers
  e2e/                 # Playwright E2E tests
```

## Development

```bash
# Backend
cd backend && uvicorn main:app --reload --port 8000

# Frontend
cd frontend && npm run dev

# Lint
cd frontend && npm run lint
pip install ruff && ruff check backend

# Build
cd frontend && npm run build

# E2E tests
cd frontend && npx playwright test
```

## Deployment

```bash
# Backend: Docker → ECR → ECS Fargate
bash deploy_backend.sh

# Frontend: commit & push to main → triggers Amplify auto-build
# Use the /deploy-frontend command instead of deploy_frontend.sh (see gotchas)
```

- ECS cluster: `voc-cluster`, service: `voc-api-service`
- ECR repo: `557395370110.dkr.ecr.eu-central-1.amazonaws.com/voc-backend`
- Amplify dashboard: `main.d27d8jikm93xrx.amplifyapp.com`

## Conventions

- **Design system**: Dark glassmorphic theme documented in `DESIGN.md`. Colors: Deep Space Black (#0F1115) bg, Electric Blue (#3C83F6) primary, translucent white cards. Inter font. 8px border-radius, 12px backdrop blur.
- **Class merging**: Always use `cn()` from `lib/utils.ts` for combining Tailwind classes.
- **API proxy pattern**: Frontend cannot call backend directly (HTTPS→HTTP mixed content). Every backend endpoint needs a matching Next.js proxy route in `frontend/app/api/`. See proxy route template below.
- **Environment variables**: Root `.env` has deploy secrets, `backend/.env` has runtime secrets, `frontend/.env.local` has `BACKEND_URL`.
- **Python deps**: `requirements.txt` at project root. Virtual env at `venv/`.

## Gotchas

### Proxy routes are mandatory
Every new backend API endpoint **must** have a corresponding `frontend/app/api/.../route.ts` proxy. Without it, the frontend gets 404s. Template:

```typescript
import { NextRequest, NextResponse } from "next/server";
const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    if (!BACKEND_URL) return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });
    try {
        const { id } = await params;
        const body = await request.json();
        const authHeader = request.headers.get("Authorization");
        const response = await fetch(`${BACKEND_URL}/api/your-endpoint/${id}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(authHeader && { "Authorization": authHeader }),
            },
            body: JSON.stringify(body),
        });
        const data = await response.json();
        return NextResponse.json(data, { status: response.status });
    } catch (error) {
        return NextResponse.json({ detail: "Failed to connect to backend" }, { status: 500 });
    }
}
```

### BACKEND_URL in Amplify
`BACKEND_URL` must be exposed in `next.config.ts` env block for Amplify SSR:
```typescript
const nextConfig = { env: { BACKEND_URL: process.env.BACKEND_URL } };
```

### deploy_frontend.sh hangs in non-interactive mode
The script uses `read -p` for commit message input. Use the `/deploy-frontend` slash command instead, which handles git operations directly.

### macOS Docker issues
If `deploy_backend.sh` fails with `Operation not permitted` or `Keychain Error`:
1. Use `prepare_build.py` to create an isolated `build_ctx` directory
2. Set `"credsStore": ""` in Docker config (or use `docker --config .` with a local config.json)

### Git push safety
Never `git add .` during deployment — temp files like `.deploy_env` or `config.json` can trigger GitHub secret scanning. Always stage specific files.
