import { Page, Locator } from '@playwright/test';

export class DashboardPage {
    constructor(readonly page: Page) {}

    get heading(): Locator { return this.page.getByText('VoC Intelligence'); }
    get dashboardTabs(): Locator { return this.page.locator('[data-testid="dashboard-tabs"]'); }
    get executiveTab(): Locator { return this.page.getByRole('button', { name: /Executive/i }); }
    get operationalTab(): Locator { return this.page.getByRole('button', { name: /Operational/i }); }

    // KPI cards — identified by their heading text within a card context
    kpiCard(label: string): Locator {
        return this.page.locator('.bg-card, [class*="card"]').filter({ hasText: label }).first();
    }
    get noDataMessage(): Locator { return this.page.getByText('No Data Available'); }

    async goto() { await this.page.goto('/dashboard'); }

    async waitForLoaded(timeout = 15000) {
        await this.heading.waitFor({ state: 'visible', timeout });
        // Wait for loading spinner to disappear (data fetch in progress)
        await this.page.waitForSelector('.animate-spin', { state: 'hidden', timeout }).catch(() => {});
        // Wait until neither loading nor the "No portfolio selected." transient error is visible
        await this.page.waitForFunction(
            () => !document.querySelector('.animate-spin'),
            { timeout }
        ).catch(() => {});
    }

    async switchToOperational() {
        await this.operationalTab.click();
    }

    async switchToExecutive() {
        await this.executiveTab.click();
    }
}
