# E2E Testing Guide — VoC Platform

## Overview

This project uses [Playwright](https://playwright.dev/) for end-to-end tests, organized with Page Object Model, shared fixtures, and typed mock data.

**58 tests across 9 spec files** covering auth, companies, portfolio creation, success view, dimensions, reviews, dashboard, chat, and team management.

---

## Running Tests Locally

```bash
cd frontend

# Quick smoke check (auth + companies only) — ~2 min
npx playwright test --project=smoke

# Full regression suite — ~10 min
npx playwright test --project=regression

# Single spec file
npx playwright test tests/08-chat.spec.ts

# View HTML report with screenshots on failures
npx playwright show-report
```

Start the dev server first if it's not already running:
```bash
npm run dev
```

---

## Directory Structure

```
e2e/
├── fixtures/
│   ├── auth.fixture.ts       # authenticatedPage + portfolioPage fixtures
│   ├── api-mocks.fixture.ts  # ApiMocks class — per-endpoint mock helpers
│   └── index.ts              # barrel: { test, expect, ApiMocks }
├── pages/                    # Page Object Model (one class per page)
│   ├── LoginPage.ts
│   ├── CompaniesPage.ts
│   ├── StepperPage.ts
│   ├── SuccessViewPage.ts
│   ├── DimensionsPage.ts
│   ├── ReviewsPage.ts
│   ├── DashboardPage.ts
│   ├── ChatPage.ts
│   └── TeamPage.ts
├── tests/                    # One spec file per feature area
│   ├── 01-auth.spec.ts
│   ├── 02-companies.spec.ts
│   ├── 03-stepper.spec.ts
│   ├── 04-success-view.spec.ts
│   ├── 05-dimensions.spec.ts
│   ├── 06-reviews.spec.ts
│   ├── 07-dashboard.spec.ts
│   ├── 08-chat.spec.ts
│   └── 09-team.spec.ts
├── helpers/
│   ├── mock-routes.ts        # mockPollingRoute() utility
│   └── wait-helpers.ts       # dialog helpers, spinner waits
└── data/                     # Typed mock API response constants
    ├── mock-user.ts
    ├── mock-portfolio.ts
    ├── mock-companies.ts
    ├── mock-dimensions.ts
    ├── mock-reviews.ts
    ├── mock-dashboard.ts
    └── index.ts
```

---

## Conventions for Keeping Tests Up to Date

### 1. Adding `data-testid` attributes

Every new **interactive element** (button, input, card, modal) added to a feature **must** include a `data-testid` before the PR is merged.

Format: `kebab-case`, descriptive of the element's role.

Examples:
```tsx
<button data-testid="submit-analysis-btn">Submit</button>
<input data-testid="review-search-input" />
<div data-testid="company-card">...</div>
```

### 2. Adding tests for new features

- Every new page/feature gets a corresponding spec file in `e2e/tests/`.
- Name it `NN-feature-name.spec.ts` (next number in sequence).
- Every bug fix gets a regression test case in the relevant spec file.

### 3. Updating mock data

When backend API response shapes change, update the corresponding file in `e2e/data/`:

| API endpoint | Mock file |
|---|---|
| `GET /api/companies` | `mock-companies.ts` |
| `GET /api/dimensions` | `mock-dimensions.ts` |
| `GET /api/reviews` | `mock-reviews.ts` |
| `GET /api/dashboard-stats` | `mock-dashboard.ts` |
| `GET /api/auth/me` | `mock-user.ts` |
| `GET /api/portfolios` | `mock-portfolio.ts` |

Tests failing due to shape mismatch = mock data is stale. Fix the mock, not the test.

### 4. Adding new API endpoints

When a new backend endpoint is added:
1. Add a mock method to `ApiMocks` in `e2e/fixtures/api-mocks.fixture.ts`
2. Add the mock response data to the relevant `e2e/data/*.ts` file
3. Use the mock in the relevant page spec

### 5. Updating page objects

When a component's DOM structure or text changes:
1. Update the locator in the relevant `e2e/pages/*.ts` file
2. If a `data-testid` was renamed, update both the component and the page object

---

## Test ID Naming Convention

Format: `TC-{AREA}-{NUMBER}`

| Prefix | Feature area |
|---|---|
| TC-AUTH | Authentication |
| TC-CO | Companies |
| TC-ST | Stepper (portfolio creation) |
| TC-SV | Success View (scraping + analysis) |
| TC-DIM | Dimensions |
| TC-REV | Reviews |
| TC-DASH | Dashboard |
| TC-CHAT | AI Chat |
| TC-TEAM | Team Management |

---

## CI/CD

- **Smoke tests** run on every pull request (auth + companies only, ~2 min).
- **Regression tests** run on every merge to `main` (full 58-test suite, ~10 min).
- Failure artifacts (HTML report, screenshots, videos) are uploaded to GitHub Actions.

Workflow file: `.github/workflows/e2e.yml`

---

## Playwright Projects

| Project | Tests matched | When runs |
|---|---|---|
| `smoke` | `01-*.spec.ts`, `02-*.spec.ts` | PR checks |
| `regression` | All `*.spec.ts` | Main branch merges |

Run a specific project:
```bash
npx playwright test --project=smoke
npx playwright test --project=regression
```
