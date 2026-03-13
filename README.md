# VoC Platform

Voice of Customer analysis platform — scrapes app store reviews from multiple sources, uses AI to extract sentiment/dimensions, and serves an analytics dashboard.

## Tech Stack

- **Frontend**: Next.js 15 (App Router) + React 19 + Tailwind v4 + TypeScript
- **Backend**: FastAPI (Python 3.10) + SQLAlchemy + PostgreSQL
- **AI**: OpenAI + Google Gemini
- **Storage**: AWS S3
- **Infra**: AWS ECS Fargate (backend), AWS Amplify (frontend)

---

## Getting Started

### 1. Clone the repo

```bash
git clone https://github.com/HorusCX/voc-platform.git
cd voc-platform
```

### 2. Set up environment variables

You need two `.env` files. Copy the examples and fill in the values (get them from the project owner):

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

**`backend/.env`** — required keys:

| Key | Description |
|-----|-------------|
| `OPENAI_API_KEY` | OpenAI API key for review analysis and chat |
| `GEMINI_API_KEY` | Google Gemini API key for metadata extraction |
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgresql://user:pass@host/db`) |
| `JWT_SECRET` | Secret key for signing JWT tokens (any long random string) |
| `S3_BUCKET_NAME` | AWS S3 bucket name for storing analysis results |
| `AWS_REGION` | AWS region (e.g. `eu-central-1`) |
| `MAIL_USERNAME` | SMTP email address for sending invitations |
| `MAIL_PASSWORD` | SMTP password |
| `DATAFORSEO_LOGIN` | DataForSEO API login for Google Maps scraping |
| `DATAFORSEO_PASSWORD` | DataForSEO API password |

**`frontend/.env.local`** — required keys:

| Key | Description |
|-----|-------------|
| `BACKEND_URL` | URL of the running backend (e.g. `http://localhost:8000`) |

### 3. Install backend dependencies

```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Install frontend dependencies

```bash
cd frontend
npm install
```

### 5. Run locally

Open two terminals:

**Terminal 1 — Backend:**
```bash
source venv/bin/activate
cd backend
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
```

Frontend runs at `http://localhost:3000`, backend at `http://localhost:8000`.

### 6. Install git hooks (one-time)

```bash
bash scripts/install-hooks.sh
```

This sets up a pre-push hook that runs lint and smoke E2E tests before every push.

---

## Running Tests

```bash
# Smoke tests (~2 min, no backend needed)
cd frontend && npx playwright test --project=smoke

# Full regression suite (~10 min)
cd frontend && npx playwright test --project=regression

# View last test report
cd frontend && npx playwright show-report
```

---

## Deployment

- **Backend**: `bash deploy_backend.sh` — builds Docker image, pushes to ECR, deploys to ECS Fargate
- **Frontend**: push to `main` — Amplify auto-builds and deploys

---

## Project Structure

```
backend/
  main.py              # FastAPI app — all API routes
  database.py          # SQLAlchemy models & DB connection
  auth.py              # JWT authentication
  services/            # Business logic (scraping, AI analysis, chat, email)

frontend/
  app/                 # Next.js App Router pages
  components/          # UI components
  lib/api.ts           # Centralized API client
  e2e/                 # Playwright E2E tests
```
