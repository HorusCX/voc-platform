/**
 * Tests for the SuccessView component: scraping progress → dimension generation → AI analysis.
 *
 * These tests navigate through the full stepper and into SuccessView.
 * All external calls are mocked.
 */
import { test, expect } from '../fixtures';
import { ApiMocks } from '../fixtures';
import { CompaniesPage } from '../pages/CompaniesPage';
import { StepperPage } from '../pages/StepperPage';
import { SuccessViewPage } from '../pages/SuccessViewPage';

/** Advance through stepper steps 1-5 and click Start Scraping */
async function reachSuccessView(page: Awaited<Parameters<Parameters<typeof test>[2]>[0]['authenticatedPage']>) {
    const mocks = new ApiMocks(page);
    await mocks.mockAnalyzeWebsite('analyze-job-1');
    await mocks.mockCheckStatusForAnalyze('analyze-job-1', 1);
    await mocks.mockAppIds();
    await mocks.mockDiscoverMaps();
    await mocks.mockScrapeReviews('scrape-job-1');

    // Empty companies → trigger stepper
    await page.route('**/api/companies**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );
    await page.route('**/api/dimensions**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );

    const companiesPage = new CompaniesPage(page);
    const stepper = new StepperPage(page);

    await companiesPage.goto();
    await companiesPage.startNewAnalysisButton.click({ timeout: 10000 });
    await stepper.fillWebsiteAndAnalyze('https://calo.app');
    await expect(stepper.step2Title).toBeVisible({ timeout: 20000 });
    await stepper.confirmCompetitorsButton.click();
    await expect(stepper.step3Title).toBeVisible({ timeout: 20000 });
    await stepper.nextButton.click();
    await expect(stepper.step4Title).toBeVisible({ timeout: 20000 });
    await expect(stepper.nextButton).toBeEnabled({ timeout: 15000 });
    await stepper.nextButton.click();
    await expect(stepper.step5Title).toBeVisible({ timeout: 20000 });
    await stepper.startScrapingButton.click();
}

test.describe('Success View — Scraping & Analysis', () => {
    test('TC-SV-01: Shows "Scraping in Progress" heading during polling', async ({ authenticatedPage }) => {
        // Keep polling in running state forever for this test
        await authenticatedPage.route('**/api/check-status**', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'running', message: 'Scraping reviews...' }) })
        );
        await reachSuccessView(authenticatedPage);
        const sv = new SuccessViewPage(authenticatedPage);
        await expect(sv.scrapingHeading).toBeVisible({ timeout: 10000 });
    });

    test('TC-SV-02: Transitions to "Scraping Complete!" when status = completed', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockCheckStatusForScraping('scrape-job-1', 1);
        await reachSuccessView(authenticatedPage);
        const sv = new SuccessViewPage(authenticatedPage);
        await sv.waitForScrapingComplete(25000);
    });

    test('TC-SV-03: Review summary shown after scraping completes', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockCheckStatusForScraping('scrape-job-1', 1);
        await reachSuccessView(authenticatedPage);
        const sv = new SuccessViewPage(authenticatedPage);
        await sv.waitForScrapingComplete(25000);
        // Summary contains brand names
        await expect(authenticatedPage.getByText('Calo')).toBeVisible();
    });

    test('TC-SV-04: "Analyze Reviews" button appears after scraping completes', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockCheckStatusForScraping('scrape-job-1', 1);
        await reachSuccessView(authenticatedPage);
        const sv = new SuccessViewPage(authenticatedPage);
        await sv.waitForScrapingComplete(25000);
        await expect(sv.generateInsightsButton).toBeVisible();
    });

    test('TC-SV-05: Clicking "Analyze Reviews" shows auto-generated dimensions form', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockCheckStatusForScraping('scrape-job-1', 1);
        await mocks.mockScrappedData();
        await reachSuccessView(authenticatedPage);
        const sv = new SuccessViewPage(authenticatedPage);
        await sv.waitForScrapingComplete(25000);
        await sv.generateAndWaitForDimensions();
        await expect(sv.dimensionRows.first()).toBeVisible();
    });

    test('TC-SV-06: Can edit a dimension name inline', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockCheckStatusForScraping('scrape-job-1', 1);
        await mocks.mockScrappedData();
        await reachSuccessView(authenticatedPage);
        const sv = new SuccessViewPage(authenticatedPage);
        await sv.waitForScrapingComplete(25000);
        await sv.generateAndWaitForDimensions();
        await sv.editDimension(0, 'Edited Dimension Name');
        await expect(sv.dimensionNameInput(0)).toHaveValue('Edited Dimension Name');
    });

    test('TC-SV-07: Can add a new dimension row', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockCheckStatusForScraping('scrape-job-1', 1);
        await mocks.mockScrappedData();
        await reachSuccessView(authenticatedPage);
        const sv = new SuccessViewPage(authenticatedPage);
        await sv.waitForScrapingComplete(25000);
        await sv.generateAndWaitForDimensions();
        const countBefore = await sv.dimensionRows.count();
        await sv.addDimensionButton.click();
        await expect(sv.dimensionRows).toHaveCount(countBefore + 1);
    });

    test('TC-SV-09: Batch-mode analysis shows pulsing waiting card without progress bar', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockCheckStatusForScraping('scrape-job-1', 1);
        await mocks.mockScrappedData();
        await mocks.mockFinalAnalysis('analysis-job-1');
        await mocks.mockCheckStatusForBatchAnalysis(2);
        await reachSuccessView(authenticatedPage);

        const sv = new SuccessViewPage(authenticatedPage);
        await sv.waitForScrapingComplete(25000);
        await sv.generateAndWaitForDimensions();
        await sv.startAnalysisButton.click();

        // Batch heading should appear (no progress bar)
        await expect(sv.batchAnalysisHeading).toBeVisible({ timeout: 10000 });
        // Progress bar fill element must NOT be present in batch mode
        await expect(authenticatedPage.locator('.bg-indigo-600.h-2\\.5.rounded-full')).not.toBeVisible();
        // After mock completes → final success card appears
        await expect(authenticatedPage.getByText('VoC Magic is Complete!')).toBeVisible({ timeout: 20000 });
    });

    test('TC-SV-08: Can delete a dimension row and submit analysis', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockCheckStatusForScraping('scrape-job-1', 1);
        await mocks.mockScrappedData();
        await mocks.mockFinalAnalysis('analysis-job-1');
        await mocks.mockCheckStatusForAnalysis(2);
        await reachSuccessView(authenticatedPage);
        const sv = new SuccessViewPage(authenticatedPage);
        await sv.waitForScrapingComplete(25000);
        await sv.generateAndWaitForDimensions();
        const countBefore = await sv.dimensionRows.count();
        await sv.deleteDimension(0);
        await expect(sv.dimensionRows).toHaveCount(countBefore - 1);
        await sv.startAnalysisButton.click();
        // Analysis progress should appear
        await expect(sv.analysisHeading).toBeVisible({ timeout: 10000 });
    });
});
