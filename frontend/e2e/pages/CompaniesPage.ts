import { Page, Locator } from '@playwright/test';

export class CompaniesPage {
    constructor(readonly page: Page) {}

    get heading(): Locator { return this.page.getByRole('heading', { name: 'Your Companies' }); }
    get emptyStateHeading(): Locator { return this.page.getByRole('heading', { name: 'No Companies Yet' }); }
    get addCompanyButton(): Locator { return this.page.locator('[data-testid="add-company-btn"]'); }
    get startNewAnalysisButton(): Locator { return this.page.getByRole('button', { name: /Start New Analysis/i }); }
    get syncButton(): Locator { return this.page.getByRole('button', { name: /Sync Latest Reviews|Syncing/i }); }

    // Company cards
    companyCard(name: string): Locator {
        return this.page.locator('[data-testid="company-card"]', { hasText: name });
    }
    editButtonForCompany(name: string): Locator {
        return this.companyCard(name).locator('[data-testid="company-edit-btn"]');
    }
    deleteButtonForCompany(name: string): Locator {
        return this.companyCard(name).locator('[data-testid="company-delete-btn"]');
    }
    get allCompanyCards(): Locator { return this.page.locator('[data-testid="company-card"]'); }

    // Modal
    get modal(): Locator { return this.page.locator('[data-testid="company-modal"]'); }
    get modalTitle(): Locator { return this.page.locator('[data-testid="company-modal-title"]'); }
    get modalCompanyNameInput(): Locator { return this.page.locator('input[name="company_name"]'); }
    get modalSaveButton(): Locator { return this.page.locator('[data-testid="company-modal-save"]'); }
    get modalCancelButton(): Locator { return this.page.getByRole('button', { name: /Cancel/i }); }

    async goto() { await this.page.goto('/'); }

    async waitForLoaded(timeout = 10000) {
        await this.heading.waitFor({ state: 'visible', timeout });
    }

    async openAddModal() {
        await this.addCompanyButton.click();
        await this.modalTitle.waitFor({ state: 'visible' });
    }

    async openEditModal(companyName: string) {
        await this.editButtonForCompany(companyName).click({ force: true });
        await this.modalTitle.waitFor({ state: 'visible' });
    }

    async deleteCompany(companyName: string) {
        this.page.once('dialog', (dialog) => dialog.accept());
        await this.deleteButtonForCompany(companyName).click({ force: true });
    }
}
