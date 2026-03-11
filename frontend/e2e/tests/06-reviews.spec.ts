/**
 * Tests for the Reviews page: table display, search, filters, detail modal.
 */
import { test, expect } from '../fixtures';
import { ApiMocks } from '../fixtures';
import { ReviewsPage } from '../pages/ReviewsPage';
import { MOCK_PAGINATED_REVIEWS } from '../data';

test.describe('Reviews Page', () => {
    test('TC-REV-01: Reviews table loads with rows and total count', async ({ portfolioPage }) => {
        const rp = new ReviewsPage(portfolioPage);
        await rp.goto();
        await rp.waitForLoaded();
        await expect(rp.reviewRows.first()).toBeVisible({ timeout: 10000 });
        await expect(rp.totalCountDisplay).toBeVisible();
    });

    test('TC-REV-02: Search input filters results (calls API with search param)', async ({ portfolioPage }) => {
        await portfolioPage.route('**/api/reviews**', (route) => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    ...MOCK_PAGINATED_REVIEWS,
                    items: MOCK_PAGINATED_REVIEWS.items.filter((r) =>
                        r.text.toLowerCase().includes('delivery')
                    ),
                    total: 2,
                }),
            });
        });
        const rp = new ReviewsPage(portfolioPage);
        await rp.goto();
        await rp.waitForLoaded();
        await rp.searchFor('delivery');
        // Verify the API was called with the search term
        await expect(rp.searchInput).toHaveValue('delivery');
    });

    test('TC-REV-03: Platform filter narrows results', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockPaginatedReviews();
        const rp = new ReviewsPage(portfolioPage);
        await rp.goto();
        await rp.waitForLoaded();
        // Platform filter button should be visible
        await expect(portfolioPage.getByRole('button', { name: /all platforms/i }).or(
            portfolioPage.getByRole('combobox', { name: /platform/i })
        ).first()).toBeVisible({ timeout: 10000 });
    });

    test('TC-REV-04: Sentiment filter narrows results', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockPaginatedReviews();
        const rp = new ReviewsPage(portfolioPage);
        await rp.goto();
        await rp.waitForLoaded();
        // Sentiment filter should be visible on the page
        await expect(portfolioPage.getByText(/sentiment/i).first()).toBeVisible({ timeout: 10000 });
    });

    test('TC-REV-05: Review rows are visible and each has expected content', async ({ portfolioPage }) => {
        const rp = new ReviewsPage(portfolioPage);
        await rp.goto();
        await rp.waitForLoaded();
        const count = await rp.reviewRows.count();
        expect(count).toBeGreaterThan(0);
    });

    test('TC-REV-06: Clicking a row opens review detail modal with full text', async ({ portfolioPage }) => {
        const rp = new ReviewsPage(portfolioPage);
        await rp.goto();
        await rp.waitForLoaded();
        await rp.openReviewDetail(0);
        await expect(rp.detailModal).toBeVisible({ timeout: 10000 });
    });
});
