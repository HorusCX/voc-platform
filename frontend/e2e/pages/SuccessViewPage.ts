import { Page, Locator, expect } from '@playwright/test';

export class SuccessViewPage {
    constructor(readonly page: Page) {}

    get scrapingProgressCard(): Locator { return this.page.locator('[data-testid="scraping-progress"]'); }
    get scrapingHeading(): Locator { return this.page.getByRole('heading', { name: /Scraping in Progress/i }); }
    get scrapingCompleteHeading(): Locator { return this.page.getByRole('heading', { name: /Scraping Complete/i }); }

    get generateInsightsButton(): Locator { return this.page.locator('[data-testid="generate-insights-btn"]'); }

    // Dimension form (shown after clicking generate insights)
    get dimensionsFormTitle(): Locator { return this.page.getByText('Dimensions Analysis'); }
    get dimensionRows(): Locator { return this.page.locator('[data-testid="dimension-row"]'); }
    dimensionNameInput(index: number): Locator {
        return this.page.locator('[data-testid="dimension-name-input"]').nth(index);
    }
    deleteDimensionButton(index: number): Locator {
        return this.page.locator('[data-testid="delete-dimension-btn"]').nth(index);
    }
    get addDimensionButton(): Locator { return this.page.locator('[data-testid="add-dimension-btn"]'); }
    get startAnalysisButton(): Locator { return this.page.locator('[data-testid="start-analysis-btn"]'); }

    // Analysis progress
    get analysisProgressCard(): Locator { return this.page.locator('[data-testid="analysis-progress"]'); }
    get analysisHeading(): Locator { return this.page.getByRole('heading', { name: /Analyzing Reviews/i }); }
    get batchAnalysisHeading(): Locator { return this.page.locator('[data-testid="batch-analysis-heading"]'); }

    async waitForScrapingComplete(timeout = 30000) {
        await expect(this.scrapingCompleteHeading).toBeVisible({ timeout });
    }

    async generateAndWaitForDimensions(timeout = 10000) {
        await this.generateInsightsButton.click();
        await expect(this.dimensionsFormTitle).toBeVisible({ timeout });
    }

    async editDimension(index: number, newName: string) {
        const input = this.dimensionNameInput(index);
        await input.clear();
        await input.fill(newName);
    }

    async deleteDimension(index: number) {
        await this.deleteDimensionButton(index).click();
    }
}
