import { Page, Locator } from '@playwright/test';

export class DimensionsPage {
    constructor(readonly page: Page) {}

    get heading(): Locator { return this.page.getByRole('heading', { name: /^Dimensions$/i }); }
    get addDimensionButton(): Locator { return this.page.locator('[data-testid="add-dimension-btn"]'); }
    get reanalyzeButton(): Locator { return this.page.locator('[data-testid="reanalyze-btn"]'); }
    get reanalyzeSuccessMessage(): Locator { return this.page.getByText(/Re-analysis started/i); }
    get dimensionRows(): Locator { return this.page.locator('[data-testid="dimension-row"]'); }

    dimensionEditButton(index: number): Locator {
        return this.page.locator('[data-testid="dimension-edit-btn"]').nth(index);
    }
    dimensionDeleteButton(index: number): Locator {
        return this.page.locator('[data-testid="dimension-delete-btn"]').nth(index);
    }

    // Modal
    get modalNameInput(): Locator { return this.page.locator('input[placeholder="e.g. Food Quality"]'); }
    get modalDescInput(): Locator { return this.page.locator('textarea[placeholder*="What does this dimension measure"]'); }
    get modalKeywordsInput(): Locator { return this.page.locator('input[placeholder*="taste, temperature"]'); }
    get modalSaveButton(): Locator { return this.page.getByRole('button', { name: /^Save$/i }); }
    get modalCancelButton(): Locator { return this.page.getByRole('button', { name: /Cancel/i }); }
    get deleteConfirmButton(): Locator { return this.page.locator('[data-testid="delete-confirm-btn"]'); }

    async goto() { await this.page.goto('/dimensions'); }

    async waitForLoaded(timeout = 10000) {
        await this.heading.waitFor({ state: 'visible', timeout });
    }

    async openAddModal() {
        await this.addDimensionButton.click();
        await this.modalNameInput.waitFor({ state: 'visible' });
    }

    async triggerReanalyze() {
        this.page.once('dialog', (dialog) => dialog.accept());
        await this.reanalyzeButton.click();
    }
}
