import { test, expect } from '../fixtures';
import { ApiMocks } from '../fixtures';
import { CompaniesPage } from '../pages/CompaniesPage';
import { StepperPage } from '../pages/StepperPage';

// Helper: navigate to empty companies page and trigger the stepper
async function openStepper(authenticatedPage: Parameters<Parameters<typeof test>[2]>[0]['authenticatedPage']) {
    await authenticatedPage.route('**/api/companies**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );
    await authenticatedPage.route('**/api/dimensions**', (route) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
    );
    const companiesPage = new CompaniesPage(authenticatedPage);
    await companiesPage.goto();
    await expect(companiesPage.startNewAnalysisButton).toBeVisible({ timeout: 10000 });
    await companiesPage.startNewAnalysisButton.click();
}

test.describe('Portfolio Creation Stepper', () => {
    test('TC-ST-01: Step 1 — website input and Analyze button are visible', async ({ authenticatedPage }) => {
        await openStepper(authenticatedPage);
        const stepper = new StepperPage(authenticatedPage);
        await expect(stepper.websiteInput).toBeVisible({ timeout: 10000 });
        await expect(stepper.analyzeWebsiteButton).toBeVisible();
    });

    test('TC-ST-02: Step 1→2 — website analysis advances to competitors screen', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockAnalyzeWebsite('analyze-job-1');
        await mocks.mockCheckStatusForAnalyze('analyze-job-1', 1);
        await openStepper(authenticatedPage);

        const stepper = new StepperPage(authenticatedPage);
        await stepper.fillWebsiteAndAnalyze('https://calo.app');
        await expect(stepper.step2Title).toBeVisible({ timeout: 20000 });
    });

    test('TC-ST-03: Step 2 — competitor list shown with edit controls', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockAnalyzeWebsite('analyze-job-1');
        await mocks.mockCheckStatusForAnalyze('analyze-job-1', 1);
        await openStepper(authenticatedPage);

        const stepper = new StepperPage(authenticatedPage);
        await stepper.fillWebsiteAndAnalyze('https://calo.app');
        await expect(stepper.step2Title).toBeVisible({ timeout: 20000 });
        // Competitor inputs should be visible
        await expect(stepper.allCompetitorNames.first()).toBeVisible();
        await expect(stepper.addCompetitorButton).toBeVisible();
    });

    test('TC-ST-03b: Step 2 — competitor name inputs are populated (not empty)', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockAnalyzeWebsite('analyze-job-1');
        await mocks.mockCheckStatusForAnalyze('analyze-job-1', 1);
        await openStepper(authenticatedPage);

        const stepper = new StepperPage(authenticatedPage);
        await stepper.fillWebsiteAndAnalyze('https://calo.app');
        await expect(stepper.step2Title).toBeVisible({ timeout: 20000 });
        // Names must match mock data — catches silent backend errors that return empty/null names
        await expect(stepper.competitorNameInput(0)).toHaveValue('Calo');
        await expect(stepper.competitorNameInput(1)).toHaveValue('Diet Center');
    });

    test('TC-ST-09: Step 1 — backend analysis error shows error message, stays on step 1', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockAnalyzeWebsite('analyze-job-1');
        await mocks.mockCheckStatusAnalyzeError('analyze-job-1', 1);
        await openStepper(authenticatedPage);

        const stepper = new StepperPage(authenticatedPage);
        await stepper.fillWebsiteAndAnalyze('https://calo.app');
        // Step 2 must NOT appear
        await expect(stepper.step2Title).not.toBeVisible({ timeout: 20000 });
        // An error message must be visible on step 1
        await expect(authenticatedPage.locator('text=/Analysis failed|failed|error/i').first()).toBeVisible({ timeout: 20000 });
    });

    test('TC-ST-04: Step 2→3 — Confirm Competitors advances to App IDs', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockAnalyzeWebsite('analyze-job-1');
        await mocks.mockCheckStatusForAnalyze('analyze-job-1', 1);
        await mocks.mockAppIds();
        await openStepper(authenticatedPage);

        const stepper = new StepperPage(authenticatedPage);
        await stepper.fillWebsiteAndAnalyze('https://calo.app');
        await expect(stepper.step2Title).toBeVisible({ timeout: 20000 });
        await stepper.confirmCompetitorsButton.click();
        await expect(stepper.step3Title).toBeVisible({ timeout: 20000 });
    });

    test('TC-ST-05: Step 3 — App IDs visible and editable', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockAnalyzeWebsite('analyze-job-1');
        await mocks.mockCheckStatusForAnalyze('analyze-job-1', 1);
        await mocks.mockAppIds();
        await openStepper(authenticatedPage);

        const stepper = new StepperPage(authenticatedPage);
        await stepper.fillWebsiteAndAnalyze('https://calo.app');
        await expect(stepper.step2Title).toBeVisible({ timeout: 20000 });
        await stepper.confirmCompetitorsButton.click();
        await expect(stepper.step3Title).toBeVisible({ timeout: 20000 });
        // Step 3 should show company entries with app IDs
        await expect(authenticatedPage.getByText('Calo')).toBeVisible();
    });

    test('TC-ST-06: Step 3→4 — Next advances to Discover Locations', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockAnalyzeWebsite('analyze-job-1');
        await mocks.mockCheckStatusForAnalyze('analyze-job-1', 1);
        await mocks.mockAppIds();
        await mocks.mockDiscoverMaps();
        await openStepper(authenticatedPage);

        const stepper = new StepperPage(authenticatedPage);
        await stepper.fillWebsiteAndAnalyze('https://calo.app');
        await expect(stepper.step2Title).toBeVisible({ timeout: 20000 });
        await stepper.confirmCompetitorsButton.click();
        await expect(stepper.step3Title).toBeVisible({ timeout: 20000 });
        await stepper.nextButton.click();
        await expect(stepper.step4Title).toBeVisible({ timeout: 20000 });
    });

    test('TC-ST-07: Step 4→5 — locations discovered, Next advances to Trustpilot', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockAnalyzeWebsite('analyze-job-1');
        await mocks.mockCheckStatusForAnalyze('analyze-job-1', 1);
        await mocks.mockAppIds();
        await mocks.mockDiscoverMaps();
        await openStepper(authenticatedPage);

        const stepper = new StepperPage(authenticatedPage);
        await stepper.fillWebsiteAndAnalyze('https://calo.app');
        await expect(stepper.step2Title).toBeVisible({ timeout: 20000 });
        await stepper.confirmCompetitorsButton.click();
        await expect(stepper.step3Title).toBeVisible({ timeout: 20000 });
        await stepper.nextButton.click();
        await expect(stepper.step4Title).toBeVisible({ timeout: 20000 });
        // Wait for Next to become enabled (locations loaded)
        await expect(stepper.nextButton).toBeEnabled({ timeout: 15000 });
        await stepper.nextButton.click();
        await expect(stepper.step5Title).toBeVisible({ timeout: 20000 });
    });

    test('TC-ST-08: Step 5 — Trustpilot input and Start Scraping button are present', async ({ authenticatedPage }) => {
        const mocks = new ApiMocks(authenticatedPage);
        await mocks.mockAnalyzeWebsite('analyze-job-1');
        await mocks.mockCheckStatusForAnalyze('analyze-job-1', 1);
        await mocks.mockAppIds();
        await mocks.mockDiscoverMaps();
        await openStepper(authenticatedPage);

        const stepper = new StepperPage(authenticatedPage);
        await stepper.fillWebsiteAndAnalyze('https://calo.app');
        await expect(stepper.step2Title).toBeVisible({ timeout: 20000 });
        await stepper.confirmCompetitorsButton.click();
        await expect(stepper.step3Title).toBeVisible({ timeout: 20000 });
        await stepper.nextButton.click();
        await expect(stepper.step4Title).toBeVisible({ timeout: 20000 });
        await expect(stepper.nextButton).toBeEnabled({ timeout: 15000 });
        await stepper.nextButton.click();
        await expect(stepper.step5Title).toBeVisible({ timeout: 20000 });
        await expect(stepper.startScrapingButton).toBeVisible();
    });
});
