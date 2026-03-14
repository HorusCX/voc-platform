import { Page } from '@playwright/test';
import {
    MOCK_USER, MOCK_ACCESS_TOKEN,
    MOCK_PORTFOLIOS,
    MOCK_ANALYZED_COMPANIES, MOCK_APPID_COMPANIES, MOCK_COMPANIES,
    MOCK_SCRAPED_DIMENSIONS, MOCK_DIMENSIONS,
    MOCK_DASHBOARD_STATS, MOCK_PAGINATED_REVIEWS,
} from '../data';

/** Provides reusable per-endpoint mock helpers. */
export class ApiMocks {
    constructor(private page: Page) {}

    // ── Auth ──────────────────────────────────────────────────────────────────

    async mockLogin() {
        await this.page.route('**/api/auth/login', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ access_token: MOCK_ACCESS_TOKEN, user: MOCK_USER }),
            })
        );
    }

    async mockAuthMe() {
        await this.page.route('**/api/auth/me', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
        );
    }

    async mockPortfolios() {
        await this.page.route('**/api/portfolios', (route) => {
            if (route.request().method() === 'GET') {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIOS) });
            }
            return route.continue();
        });
    }

    // ── Scraping pipeline ─────────────────────────────────────────────────────

    /** analyze-website returns job_id immediately (async job) */
    async mockAnalyzeWebsite(jobId = 'analyze-job-1') {
        await this.page.route('**/api/analyze-website', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ job_id: jobId }) })
        );
    }

    /** check-status: running once, then fails with an error — simulates Gemini API failure */
    async mockCheckStatusAnalyzeError(jobId = 'analyze-job-1', runningCount = 1) {
        let calls = 0;
        await this.page.route('**/api/check-status**', (route) => {
            if (!route.request().url().includes(jobId)) return route.fallback();
            calls++;
            if (calls <= runningCount) {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'running', message: 'Analyzing website...' }) });
            }
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'error', message: '404 Client Error: Not Found for url: generativelanguage.googleapis.com' }) });
        });
    }

    /** check-status: running once, then completed with analyzed companies */
    async mockCheckStatusForAnalyze(jobId = 'analyze-job-1', runningCount = 1) {
        let calls = 0;
        await this.page.route('**/api/check-status**', (route) => {
            // fallback() chains to the next Playwright route handler (e.g. mockCheckStatusForScraping).
            // route.continue() sends to real network — wrong here.
            if (!route.request().url().includes(jobId)) return route.fallback();
            calls++;
            if (calls <= runningCount) {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'running', message: 'Analyzing website...' }) });
            }
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'completed', result: MOCK_ANALYZED_COMPANIES }) });
        });
    }

    async mockAppIds() {
        await this.page.route('**/api/appids', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_APPID_COMPANIES) })
        );
    }

    async mockDiscoverMaps() {
        await this.page.route('**/api/discover-maps', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    links: ['https://goo.gl/maps/123'],
                    locations: [{ place_id: 'abc123', name: 'Calo Kitchen', url: 'https://goo.gl/maps/123', reviews_count: 100 }],
                }),
            })
        );
    }

    async mockScrapeReviews(jobId = 'scrape-job-1') {
        await this.page.route('**/api/scrap-reviews', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Scraping started', job_id: jobId }) })
        );
    }

    /** check-status for scraping: running twice, then completed with summary */
    async mockCheckStatusForScraping(jobId = 'scrape-job-1', runningCount = 2) {
        let calls = 0;
        await this.page.route('**/api/check-status**', (route) => {
            calls++;
            if (calls <= runningCount) {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'running', message: 'Scraping in progress...' }) });
            }
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    status: 'completed',
                    job_id: jobId,
                    s3_key: 'scrapped_data/test.csv',
                    s3_bucket: 'horus-voc-data-storage-v2-eu',
                    summary: 'Calo - Playstore: 100 - App Store: 50\nDiet Center - Playstore: 60',
                }),
            });
        });
    }

    async mockScrappedData() {
        await this.page.route('**/api/scrapped-data', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ dimensions: MOCK_SCRAPED_DIMENSIONS }) })
        );
    }

    async mockFinalAnalysis(jobId = 'analysis-job-1') {
        await this.page.route('**/api/final-analysis', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ job_id: jobId, message: 'Analysis started' }) })
        );
    }

    /** check-status for batch analysis: mode='batch' N times, then completed.
     *  Filters by jobId so it only intercepts the analysis job, not the scraping job. */
    async mockCheckStatusForBatchAnalysis(runningCount = 2, jobId = 'analysis-job-1') {
        let calls = 0;
        await this.page.route('**/api/check-status**', (route) => {
            if (!route.request().url().includes(jobId)) return route.fallback();
            calls++;
            if (calls <= runningCount) {
                return route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        status: 'running',
                        processed: 0,
                        total: 200,
                        message: 'Gemini is processing your reviews... (2m elapsed)',
                        mode: 'batch',
                    }),
                });
            }
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ status: 'completed', message: 'Analysis complete', mode: 'batch' }),
            });
        });
    }

    /** check-status for analysis: processing twice, then completed */
    async mockCheckStatusForAnalysis(runningCount = 2) {
        let calls = 0;
        await this.page.route('**/api/check-status**', (route) => {
            calls++;
            if (calls <= runningCount) {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'processing', processed: calls * 50, total: 200, message: 'Analyzing reviews...' }) });
            }
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'completed', message: 'Analysis complete' }) });
        });
    }

    // ── CRUD ──────────────────────────────────────────────────────────────────

    async mockCompanyCRUD() {
        await this.page.route('**/api/companies', (route) => {
            if (route.request().method() === 'POST') {
                const body = JSON.parse(route.request().postData() || '{}');
                return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 99, portfolio_id: 1, ...body }) });
            }
            if (route.request().method() === 'GET') {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_COMPANIES) });
            }
            return route.continue();
        });
        await this.page.route('**/api/companies/*', (route) => {
            const method = route.request().method();
            if (method === 'PUT' || method === 'PATCH') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
            if (method === 'DELETE') return route.fulfill({ status: 204, body: '' });
            return route.continue();
        });
    }

    async mockDimensionCRUD() {
        await this.page.route('**/api/dimensions', (route) => {
            if (route.request().method() === 'POST') {
                const body = JSON.parse(route.request().postData() || '{}');
                return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 99, portfolio_id: 1, ...body }) });
            }
            if (route.request().method() === 'GET') {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DIMENSIONS) });
            }
            return route.continue();
        });
        await this.page.route('**/api/dimensions/*', (route) => {
            const method = route.request().method();
            if (method === 'PUT' || method === 'PATCH') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
            if (method === 'DELETE') return route.fulfill({ status: 204, body: '' });
            return route.continue();
        });
    }

    async mockReanalyze(portfolioId = 1) {
        await this.page.route(`**/api/portfolios/${portfolioId}/reanalyze`, (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Re-analysis started in the background.' }) })
        );
        // Also mock the non-portfolio-scoped reanalyze endpoint
        await this.page.route('**/api/dimensions/reanalyze', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Re-analysis started in the background.' }) })
        );
    }

    // ── Chat ──────────────────────────────────────────────────────────────────

    async mockConversations(portfolioId = 1) {
        await this.page.route(`**/api/portfolios/${portfolioId}/conversations`, (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
        );
    }

    async mockConversationsWithHistory(portfolioId = 1) {
        await this.page.route(`**/api/portfolios/${portfolioId}/conversations`, (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    { id: 1, title: 'SQL Analytics test', updated_at: '2026-02-15T10:00:00Z', created_at: '2026-02-15T09:00:00Z' },
                ]),
            })
        );
    }

    async mockConversationMessages(conversationId = 1) {
        await this.page.route(`**/api/conversations/${conversationId}/messages`, (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    { id: 1, role: 'user', content: 'How many reviews?', created_at: '2026-02-15T09:01:00Z' },
                    { id: 2, role: 'ai', content: 'You have **1,250** reviews in this portfolio.', created_at: '2026-02-15T09:01:10Z' },
                ]),
            })
        );
    }

    /** Mock streaming chat — returns a complete SSE stream */
    async mockChatStream(portfolioId = 1, responseText = 'Based on your reviews, sentiment is mostly positive.') {
        const sseBody = [
            `data: ${JSON.stringify({ type: 'token', content: responseText })}\n\n`,
            `data: ${JSON.stringify({ type: 'done', conversation_id: 1 })}\n\n`,
        ].join('');

        await this.page.route(`**/api/portfolios/${portfolioId}/chat/stream`, (route) =>
            route.fulfill({
                status: 200,
                contentType: 'text/event-stream',
                body: sseBody,
            })
        );
    }

    async mockDeleteConversation(conversationId = 1) {
        await this.page.route(`**/api/conversations/${conversationId}`, (route) => {
            if (route.request().method() === 'DELETE') {
                return route.fulfill({ status: 204, body: '' });
            }
            return route.continue();
        });
    }

    // ── Team ──────────────────────────────────────────────────────────────────

    async mockTeamMembers(portfolioId = 1) {
        await this.page.route(`**/api/portfolios/${portfolioId}/members`, (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    members: [{ id: 1, email: 'owner@example.com', role: 'owner' }],
                    invitations: [{ id: 1, email: 'pending@example.com', status: 'pending', created_at: '2026-02-01T10:00:00Z' }],
                }),
            })
        );
    }

    async mockInvite(portfolioId = 1) {
        await this.page.route(`**/api/portfolios/${portfolioId}/invite`, (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: 'Invitation sent' }) })
        );
    }

    // ── Dashboard stats ───────────────────────────────────────────────────────

    async mockDashboardStats() {
        await this.page.route('**/api/user/dashboard-stats**', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DASHBOARD_STATS) })
        );
    }

    async mockPaginatedReviews() {
        await this.page.route('**/api/user/reviews/paginated**', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PAGINATED_REVIEWS) })
        );
    }
}
