# E2E Testing Framework — Full Reference

This document is the authoritative guide for understanding, running, and maintaining the Playwright E2E test suite for the VoC platform. It is written to be read by Claude Code as a reference in future conversations.

---

## Directory Map

```
frontend/e2e/
├── E2E_FRAMEWORK.md          ← you are here
├── data/                     ← typed mock API response constants (single source of truth)
│   ├── mock-user.ts          → MOCK_USER, MOCK_ACCESS_TOKEN
│   ├── mock-portfolio.ts     → MOCK_PORTFOLIO, MOCK_PORTFOLIOS
│   ├── mock-companies.ts     → MOCK_ANALYZED_COMPANIES, MOCK_APPID_COMPANIES, MOCK_COMPANIES
│   ├── mock-dimensions.ts    → MOCK_SCRAPED_DIMENSIONS, MOCK_DIMENSIONS
│   ├── mock-reviews.ts       → MOCK_REVIEWS, MOCK_PAGINATED_REVIEWS
│   ├── mock-dashboard.ts     → MOCK_DASHBOARD_STATS
│   └── index.ts              → barrel export
├── fixtures/
│   ├── auth.fixture.ts       → extends Playwright test with authenticatedPage + portfolioPage
│   ├── api-mocks.fixture.ts  → ApiMocks class (all mock helper methods)
│   └── index.ts              → exports { test, expect, ApiMocks }
├── pages/                    ← Page Object Model
│   ├── LoginPage.ts
│   ├── CompaniesPage.ts
│   ├── StepperPage.ts
│   ├── SuccessViewPage.ts
│   ├── DimensionsPage.ts
│   ├── ReviewsPage.ts
│   ├── DashboardPage.ts
│   ├── ChatPage.ts
│   └── TeamPage.ts
├── helpers/
│   ├── mock-routes.ts        → mockPollingRoute() for stateful polling mocks
│   └── wait-helpers.ts       → acceptNextDialog(), waitForSpinnerGone(), injectToken()
└── tests/                    ← spec files (one per feature area)
    ├── 01-auth.spec.ts       → TC-AUTH-01..05 (5 tests)
    ├── 02-companies.spec.ts  → TC-CO-01..07   (7 tests)
    ├── 03-stepper.spec.ts    → TC-ST-01..08   (8 tests)
    ├── 04-success-view.spec.ts → TC-SV-01..08 (8 tests)
    ├── 05-dimensions.spec.ts → TC-DIM-01..06  (6 tests)
    ├── 06-reviews.spec.ts    → TC-REV-01..06  (6 tests)
    ├── 07-dashboard.spec.ts  → TC-DASH-01..06 (6 tests)
    ├── 08-chat.spec.ts       → TC-CHAT-01..07 (7 tests)
    └── 09-team.spec.ts       → TC-TEAM-01..05 (5 tests)
                                               Total: 58 tests
```

---

## Playwright Config (`playwright.config.ts`)

Two test projects:

| Project | Matches | Purpose | CI trigger |
|---|---|---|---|
| `smoke` | `01-*.spec.ts`, `02-*.spec.ts` | Fast check (auth + companies) | Every PR |
| `regression` | All `*.spec.ts` | Full suite | Every merge to `main` |

Base URL: `http://localhost:3000` (or `$BASE_URL` env var)
Timeout: 60s per test
Workers: 1 (sequential, no parallelism)
On failure: screenshot + video saved to `playwright-report/`

---

## Fixtures

### `authenticatedPage`
Used with `{ authenticatedPage }` in test signatures. Provides a `Page` with:
- Mock JWT token injected into `localStorage` (`access_token`)
- `GET /api/auth/me` → returns `MOCK_USER`
- `GET /api/portfolios` → returns `MOCK_PORTFOLIOS`

### `portfolioPage`
Used with `{ portfolioPage }`. Everything in `authenticatedPage` plus:
- `GET /api/companies` → returns `MOCK_COMPANIES`
- `GET /api/dimensions` → returns `MOCK_DIMENSIONS`
- `GET /api/dashboard-stats*` → returns `MOCK_DASHBOARD_STATS`
- `GET /api/reviews*` → returns `MOCK_PAGINATED_REVIEWS`
- `GET /api/portfolios/*/sync-status` → returns idle status

Use `portfolioPage` for tests on dashboard, reviews, dimensions, chat, team pages.
Use `authenticatedPage` for tests that need to control data themselves (stepper, companies CRUD).

---

## ApiMocks Class

Located in `frontend/e2e/fixtures/api-mocks.fixture.ts`.
Instantiate with `const mocks = new ApiMocks(page)` inside a test.

### Available mock methods

| Method | Mocks | Notes |
|---|---|---|
| `mockLogin()` | `POST /api/auth/login` | Returns `MOCK_ACCESS_TOKEN` |
| `mockAuthMe()` | `GET /api/auth/me` | Returns `MOCK_USER` |
| `mockPortfolios()` | `GET /api/portfolios` | Returns `MOCK_PORTFOLIOS` |
| `mockAnalyzeWebsite(jobId)` | `POST /api/analyze-website` | Returns `{ job_id: jobId }` |
| `mockCheckStatusForAnalyze(jobId, runningCount)` | `GET /api/check-status?job_id=jobId` | Stateful: running×N then completed with `MOCK_ANALYZED_COMPANIES` |
| `mockAppIds()` | `POST /api/get-appids` | Returns `MOCK_APPID_COMPANIES` |
| `mockDiscoverMaps()` | `POST /api/discover-maps` | Returns companies with maps data |
| `mockScrapeReviews(jobId)` | `POST /api/scrape-reviews` | Returns `{ job_id: jobId }` |
| `mockCheckStatusForScraping(jobId, runningCount)` | `GET /api/check-status?job_id=jobId` | Stateful: running×N then completed with scraping summary |
| `mockScrappedData()` | `GET /api/scrapped-data` | Returns `MOCK_SCRAPED_DIMENSIONS` |
| `mockFinalAnalysis(jobId)` | `POST /api/analyze-reviews` | Returns `{ job_id: jobId }` |
| `mockCheckStatusForAnalysis(runningCount)` | `GET /api/check-status*` | Stateful: processing×N then completed |
| `mockCompanyCRUD()` | `POST/PUT/DELETE /api/companies*` | All return success responses |
| `mockDimensionCRUD()` | `POST/PUT/DELETE /api/dimensions*` | All return success responses |
| `mockReanalyze()` | `POST /api/reanalyze` | Returns `{ message: "Re-analysis started" }` |
| `mockConversations(portfolioId)` | `GET /api/portfolios/:id/conversations` | Returns sample conversations |
| `mockChatStream(portfolioId)` | `POST /api/portfolios/:id/chat/stream` | Returns SSE text/event-stream |
| `mockTeamMembers(portfolioId)` | `GET /api/portfolios/:id/team` | Returns members + pending invitations |
| `mockInvite(portfolioId)` | `POST /api/portfolios/:id/team/invite` | Returns `{ message: "Invitation sent" }` |
| `mockDashboardStats()` | `GET /api/dashboard-stats*` | Returns `MOCK_DASHBOARD_STATS` |
| `mockPaginatedReviews()` | `GET /api/reviews*` | Returns `MOCK_PAGINATED_REVIEWS` |

**When to add a new method:** Every time a new backend API endpoint is created, add a corresponding mock method here and export mock data from `e2e/data/`.

---

## Page Object Model

Each page class has:
- **Locator getters** — lazy, not pre-evaluated (use `get` keyword)
- **Action methods** — multi-step interactions encapsulated as functions
- **`goto()`** — navigates directly to the page
- **`waitForLoaded()`** — waits for the page's primary heading/element to be visible

### Selector strategy (priority order)
1. `data-testid` attributes — most stable, decoupled from text/structure
2. ARIA roles (`getByRole`) — semantic, resilient
3. Label text (`getByLabel`) — good for form fields
4. Text content (`getByText`) — last resort, breaks on copy changes

---

## data-testid Inventory

These `data-testid` attributes exist in the codebase. When modifying components, preserve these or update the corresponding page object locator.

### `frontend/components/companies/SavedCompaniesList.tsx`
- `company-card` — each company card div
- `company-edit-btn` — edit icon button per card
- `company-delete-btn` — delete icon button per card
- `add-company-btn` — header "Add Company" button

### `frontend/components/companies/CompanyModal.tsx`
- `company-modal` — modal root div
- `company-modal-title` — h2 heading
- `company-modal-save` — save/submit button

### `frontend/components/stepper/StepCompetitors.tsx`
- `competitor-name-input` — each competitor name input (nth-indexed)

### `frontend/components/results/SuccessView.tsx`
- `scraping-progress` — polling progress card
- `generate-insights-btn` — "Analyze Reviews & Generate Insights" button
- `analysis-progress` — analysis in-progress card
- `dimension-row` — each dimension row div (nth-indexed)
- `dimension-name-input` — dimension name input inside each row
- `delete-dimension-btn` — delete button inside each row
- `add-dimension-btn` — "Add New Dimension" button
- `start-analysis-btn` — "Start Analysis & Generate Dashboard" button

### `frontend/app/dimensions/page.tsx`
- `reanalyze-btn` — "Re-analyze All" button
- `add-dimension-btn` — "Add Dimension" button
- `dimension-row` — each `<tr>` in the table (nth-indexed)
- `dimension-edit-btn` — edit button per row
- `dimension-delete-btn` — delete button per row

### `frontend/app/reviews/page.tsx`
- `review-search-input` — search input
- `review-row` — each `<tr>` in the table
- `reviews-total-count` — total count span
- `review-detail-modal` — detail modal div

### `frontend/app/chat/page.tsx`
- `new-chat-btn` — "New Chat" sidebar button
- `conversation-item` — each sidebar conversation div
- `chat-messages` — messages scroll container
- `chat-user-message` — each user message div
- `chat-ai-message` — each AI message div
- `chat-typing-indicator` — bounce dots loading animation
- `chat-input` — message textarea
- `chat-send-btn` — send button

### `frontend/app/dashboard/page.tsx`
- `dashboard-tabs` — nav tabs container

### `frontend/components/layout/TeamMembersList.tsx`
- `member-row` — each active member div
- `invitation-row` — each pending invitation div

### `frontend/app/login/page.tsx`
- `login-error` — error message div

---

## Mock Data Shapes

### `MOCK_USER`
```typescript
{ id: 1, email: 'test@example.com', role: 'admin', created_at: '2026-01-01T00:00:00Z',
  limits: { max_companies: null, max_total_reviews: null } }
```

### `MOCK_PORTFOLIO`
```typescript
{ id: 1, name: 'Test Portfolio', sync_status: 'idle', last_sync_at: null, created_at: '...' }
```

### `MOCK_COMPANIES` (saved, with IDs)
```typescript
[{ id: 1, name: 'Calo', website: 'https://calo.app', play_store_id: 'com.calo.app',
   app_store_id: '1234567890', maps_place_id: 'ChIJ...', review_count: 450,
   trustpilot_url: null }]
```

### `MOCK_DIMENSIONS`
```typescript
[{ id: 1, name: 'Food Quality', description: 'Taste, freshness, portion size', keywords: 'taste, food' },
 { id: 2, name: 'Delivery Speed', ... }, ...]
```

### `MOCK_PAGINATED_REVIEWS`
```typescript
{ items: [...5 reviews...], total: 1250, page: 1, page_size: 50, total_pages: 25 }
```
Each review: `{ id, text, rating, date, brand, platform, topics, sentiment, emotion, confidence, source_user, source_link }`

### `MOCK_DASHBOARD_STATS`
```typescript
{ total_reviews: 1250, average_rating: 4.2, sentiment_score: 72, net_sentiment: 58,
  brandStats: [...], platformStats: [...], dimensionStats: [...] }
```

---

## CI/CD Workflow (`.github/workflows/e2e.yml`)

```
PR opened/updated   → smoke job  → tests/01-auth, tests/02-companies
Merge to main       → regression job → all 58 tests
```

Artifacts (HTML report, screenshots, videos) are uploaded on failure.

---

## Adding Tests for a New Feature — Checklist

When a new feature is built, follow this checklist before the PR is merged:

1. **Add `data-testid` attributes** to every new interactive element in the component
2. **Add mock data** to the relevant `e2e/data/*.ts` file (or create a new one)
3. **Add a mock method** to `ApiMocks` in `e2e/fixtures/api-mocks.fixture.ts`
4. **Add a page object** method or locator getter to the relevant `e2e/pages/*.ts` class (or create a new page class)
5. **Add test cases** to the relevant spec file (or create `NN-feature.spec.ts`)
6. **Run smoke locally** before pushing: `cd frontend && npx playwright test --project=smoke`

---

## Troubleshooting Common Failures

| Symptom | Likely cause | Fix |
|---|---|---|
| `Locator not found` | `data-testid` removed/renamed or text changed | Update the locator in the page object |
| `Expected X but got Y` in mock response | API shape changed | Update `e2e/data/*.ts` mock |
| `Timeout exceeded` waiting for element | Component render is slow or conditional logic changed | Check the component, increase timeout if justified |
| Test passes locally, fails in CI | Timing difference | Add explicit `waitFor` calls, avoid fixed `sleep` |
| `page.route()` not intercepting | URL pattern doesn't match | Use `**/api/endpoint**` glob pattern |
| Auth redirect loop | `authenticatedPage` fixture not used | Use `{ authenticatedPage }` or `{ portfolioPage }` not `{ page }` |

---

## Running Tests

```bash
cd frontend

# Start dev server first (if not running)
npm run dev

# Smoke tests only (auth + companies) — ~2 min
npx playwright test --project=smoke

# Full regression — ~10 min
npx playwright test --project=regression

# Single spec file
npx playwright test tests/04-success-view.spec.ts

# Single test by name
npx playwright test --grep "TC-SV-02"

# With visible browser (useful for debugging)
npx playwright test --headed

# Step-by-step debug mode
npx playwright test --debug

# View HTML report with screenshots
npx playwright show-report
```
