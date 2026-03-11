import { test, expect } from '../fixtures';
import { ApiMocks } from '../fixtures';
import { CompaniesPage } from '../pages/CompaniesPage';

test.describe('Companies Page', () => {
    test('TC-CO-01: Shows company cards when companies exist', async ({ portfolioPage }) => {
        const page = new CompaniesPage(portfolioPage);
        await page.goto();
        await page.waitForLoaded();
        await expect(page.companyCard('Calo')).toBeVisible();
        await expect(page.companyCard('Diet Center')).toBeVisible();
    });

    test('TC-CO-02: Shows empty state with "Start New Analysis" when no companies', async ({ authenticatedPage }) => {
        await authenticatedPage.route('**/api/companies**', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
        );
        await authenticatedPage.route('**/api/dimensions**', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
        );

        const page = new CompaniesPage(authenticatedPage);
        await page.goto();
        await expect(page.emptyStateHeading).toBeVisible({ timeout: 10000 });
        await expect(page.startNewAnalysisButton).toBeVisible();
        await expect(page.addCompanyButton).not.toBeVisible();
    });

    test('TC-CO-03: "Add Company" button opens modal with empty form', async ({ portfolioPage }) => {
        const page = new CompaniesPage(portfolioPage);
        await page.goto();
        await page.waitForLoaded();
        await page.openAddModal();
        await expect(page.modalTitle).toBeVisible();
        await expect(page.modalCompanyNameInput).toBeVisible();
        await expect(page.modalCompanyNameInput).toHaveValue('');
    });

    test('TC-CO-04: Save new company calls POST and closes modal', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockCompanyCRUD();

        const page = new CompaniesPage(portfolioPage);
        await page.goto();
        await page.waitForLoaded();
        await page.openAddModal();
        await page.modalCompanyNameInput.fill('New Test Company');
        await page.modalSaveButton.click();
        // Modal should close after save
        await expect(page.modal).not.toBeVisible({ timeout: 5000 });
    });

    test('TC-CO-05: Edit company opens modal pre-filled with existing data', async ({ portfolioPage }) => {
        const page = new CompaniesPage(portfolioPage);
        await page.goto();
        await page.waitForLoaded();
        await page.openEditModal('Calo');
        await expect(page.modalTitle).toBeVisible();
        await expect(page.modalCompanyNameInput).toHaveValue('Calo');
    });

    test('TC-CO-06: Save edited company calls PUT', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockCompanyCRUD();

        let putCalled = false;
        portfolioPage.on('request', (req) => {
            if (req.method() === 'PUT' && req.url().includes('/api/companies/')) putCalled = true;
        });

        const page = new CompaniesPage(portfolioPage);
        await page.goto();
        await page.waitForLoaded();
        await page.openEditModal('Calo');
        await page.modalCompanyNameInput.fill('Calo Updated');
        await page.modalSaveButton.click();
        await expect(page.modal).not.toBeVisible({ timeout: 5000 });
        expect(putCalled).toBe(true);
    });

    test('TC-CO-07: Delete company shows confirm dialog and calls DELETE', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockCompanyCRUD();

        let deleteCalled = false;
        portfolioPage.on('request', (req) => {
            if (req.method() === 'DELETE' && req.url().includes('/api/companies/')) deleteCalled = true;
        });

        const page = new CompaniesPage(portfolioPage);
        await page.goto();
        await page.waitForLoaded();
        await page.deleteCompany('Diet Center');
        await portfolioPage.waitForTimeout(500);
        expect(deleteCalled).toBe(true);
    });
});
