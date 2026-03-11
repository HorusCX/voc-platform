import { Page, Locator } from '@playwright/test';

export class StepperPage {
    constructor(readonly page: Page) {}

    // Step titles
    get step1Title(): Locator { return this.page.getByText('Step 1: Company Website'); }
    get step2Title(): Locator { return this.page.getByText('Step 2: Confirm Competitors'); }
    get step3Title(): Locator { return this.page.getByText('Step 3: Verify App IDs'); }
    get step4Title(): Locator { return this.page.getByText('Step 4: Discover Locations'); }
    get step5Title(): Locator { return this.page.getByText(/Trustpilot Integration/i); }

    // Step 1
    get websiteInput(): Locator { return this.page.locator('#website'); }
    get analyzeWebsiteButton(): Locator { return this.page.getByRole('button', { name: /Analyze Website/i }); }

    // Step 2
    get confirmCompetitorsButton(): Locator { return this.page.getByRole('button', { name: /Confirm Competitors/i }); }
    get addCompetitorButton(): Locator { return this.page.getByRole('button', { name: /Add Competitor/i }); }
    competitorNameInput(index: number): Locator {
        return this.page.locator('[data-testid="competitor-name-input"]').nth(index);
    }
    get allCompetitorNames(): Locator { return this.page.locator('[data-testid="competitor-name-input"]'); }

    // Step 3 / 4 / 5
    get nextButton(): Locator { return this.page.getByRole('button', { name: /^Next$/i }); }
    get startScrapingButton(): Locator { return this.page.getByRole('button', { name: /Start Scraping/i }); }
    trustpilotInput(index = 0): Locator {
        return this.page.locator('input[placeholder*="trustpilot.com"]').nth(index);
    }

    async fillWebsiteAndAnalyze(url: string) {
        await this.websiteInput.fill(url);
        await this.analyzeWebsiteButton.click();
    }
}
