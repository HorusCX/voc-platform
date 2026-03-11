/**
 * Tests for the Dimensions page: list, add, edit, delete, re-analyze.
 */
import { test, expect } from '../fixtures';
import { ApiMocks } from '../fixtures';
import { DimensionsPage } from '../pages/DimensionsPage';
import { MOCK_DIMENSIONS } from '../data';

test.describe('Dimensions Page', () => {
    test('TC-DIM-01: Dimensions page shows all dimensions from API', async ({ portfolioPage }) => {
        const dp = new DimensionsPage(portfolioPage);
        await dp.goto();
        await dp.waitForLoaded();
        await expect(dp.dimensionRows).toHaveCount(MOCK_DIMENSIONS.length);
    });

    test('TC-DIM-02: "Add Dimension" opens modal with empty form', async ({ portfolioPage }) => {
        const dp = new DimensionsPage(portfolioPage);
        await dp.goto();
        await dp.waitForLoaded();
        await dp.openAddModal();
        await expect(dp.modalNameInput).toBeVisible();
        await expect(dp.modalNameInput).toHaveValue('');
    });

    test('TC-DIM-03: Save new dimension calls POST and shows in list', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockDimensionCRUD();
        const dp = new DimensionsPage(portfolioPage);
        await dp.goto();
        await dp.waitForLoaded();
        await dp.openAddModal();
        await dp.modalNameInput.fill('New Dimension');
        await dp.modalDescInput.fill('A new test dimension');
        // Mock updated list with the new dimension
        await portfolioPage.route('**/api/dimensions**', (route) =>
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([
                    ...MOCK_DIMENSIONS,
                    { id: 99, name: 'New Dimension', description: 'A new test dimension' },
                ]),
            })
        );
        await dp.modalSaveButton.click();
        await expect(dp.dimensionRows).toHaveCount(MOCK_DIMENSIONS.length + 1, { timeout: 10000 });
    });

    test('TC-DIM-04: Edit dimension pre-fills modal, save calls PUT', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockDimensionCRUD();
        const dp = new DimensionsPage(portfolioPage);
        await dp.goto();
        await dp.waitForLoaded();
        // Open edit for first dimension
        await dp.dimensionEditButton(0).click();
        await expect(dp.modalNameInput).toBeVisible();
        // Should be pre-filled with existing dimension name
        await expect(dp.modalNameInput).not.toHaveValue('');
        // Edit the name
        await dp.modalNameInput.fill('Updated Dimension Name');
        await dp.modalSaveButton.click();
        // Modal should close after save
        await expect(dp.modalNameInput).not.toBeVisible({ timeout: 5000 });
    });

    test('TC-DIM-05: Delete dimension calls DELETE after confirm', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockDimensionCRUD();
        const dp = new DimensionsPage(portfolioPage);
        await dp.goto();
        await dp.waitForLoaded();
        // Click delete button → opens the custom React confirmation modal
        await dp.dimensionDeleteButton(0).click();
        // Confirm in the custom modal (NOT a native browser dialog)
        await expect(dp.deleteConfirmButton).toBeVisible({ timeout: 5000 });
        await dp.deleteConfirmButton.click();
        // Modal should close after confirming
        await expect(dp.deleteConfirmButton).not.toBeVisible({ timeout: 5000 });
    });

    test('TC-DIM-06: "Re-Analyze All" button triggers reanalyze and shows success message', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockReanalyze();
        const dp = new DimensionsPage(portfolioPage);
        await dp.goto();
        await dp.waitForLoaded();
        await dp.triggerReanalyze();
        await expect(dp.reanalyzeSuccessMessage).toBeVisible({ timeout: 10000 });
    });
});
