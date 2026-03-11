import { Page, Locator } from '@playwright/test';

export class ReviewsPage {
    constructor(readonly page: Page) {}

    get heading(): Locator { return this.page.getByRole('heading', { name: /^Reviews$/i }); }
    get searchInput(): Locator { return this.page.locator('[data-testid="review-search-input"]'); }
    get reviewRows(): Locator { return this.page.locator('[data-testid="review-row"]'); }
    get totalCountDisplay(): Locator { return this.page.locator('[data-testid="reviews-total-count"]'); }
    get detailModal(): Locator { return this.page.locator('[data-testid="review-detail-modal"]'); }

    async goto() { await this.page.goto('/reviews'); }

    async waitForLoaded(timeout = 15000) {
        await this.heading.waitFor({ state: 'visible', timeout });
        // Wait for loading spinner to disappear
        await this.page.waitForSelector('.animate-spin', { state: 'hidden', timeout }).catch(() => {});
    }

    async searchFor(text: string) {
        await this.searchInput.fill(text);
    }

    async openReviewDetail(index: number) {
        // The modal is triggered by clicking the review text div inside the row,
        // not the <tr> itself. The clickable element has title="Click to view full review".
        await this.reviewRows.nth(index).getByTitle('Click to view full review').click();
        await this.detailModal.waitFor({ state: 'visible' });
    }

    async closeDetailModal() {
        await this.page.getByRole('button', { name: /Close/i }).click();
    }
}
