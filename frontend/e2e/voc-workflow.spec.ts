import { test, expect } from '@playwright/test';

test('VoC Full Workflow - Scraping Initiation', async ({ page }) => {
    // Listen to console logs
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    // 1. Visit Landing Page
    console.log('Visiting landing page...');
    await page.goto('/');
    await expect(page.locator('text=VoC Intelligence Platform')).toBeVisible();

    // Mock endpoints with full URLs to match what axios uses (http://127.0.0.1:8000)
    // We use glob pattern to match both localhost and 127.0.0.1 just in case
    await page.route('**/api/analyze-website', async route => {
        console.log('Mock: analyze-website hit');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    "company_name": "Calo",
                    "website": "https://calo.app",
                    "description": "Healthy meal subscription service.",
                    "is_main": true
                },
                {
                    "company_name": "Diet Center",
                    "website": "https://dietcenter.com",
                    "description": "Diet food delivery.",
                    "is_main": false
                }
            ])
        });
    });

    await page.route('**/api/appids', async route => {
        console.log('Mock: appids hit');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    "company_name": "Calo",
                    "website": "https://calo.app",
                    "description": "Healthy meal subscription service.",
                    "is_main": true,
                    "android_id": "com.calo.app",
                    "apple_id": "1523456789"
                },
                {
                    "company_name": "Diet Center",
                    "website": "https://dietcenter.com",
                    "description": "Diet food delivery.",
                    "is_main": false,
                    "android_id": "com.dietcenter.app",
                    "apple_id": "987654321"
                }
            ])
        });
    });

    await page.route('**/api/discover-maps', async route => {
        console.log('Mock: discover-maps hit');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                links: ["https://goo.gl/maps/123", "https://goo.gl/maps/456"],
                locations: [
                    { place_id: "ChIJ...", name: "Calo Kitchen", url: "https://goo.gl/maps/123", reviews_count: 100 }
                ]
            })
        });
    });

    await page.route('**/api/scrap-reviews', async route => {
        console.log('Mock: scrap-reviews hit');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                message: "Scraping started",
                job_id: "test-job-id-123"
            })
        });
    });

    let checkStatusCount = 0;
    await page.route('**/api/check-status?job_id=*', async route => {
        console.log('Mock: check-status hit', checkStatusCount);
        checkStatusCount++;
        if (checkStatusCount <= 2) {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    status: "running",
                    message: "Scraping in progress..."
                })
            });
        } else {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    status: "completed",
                    message: "Scraping complete",
                    s3_key: "test_results.csv",
                    summary: "- Calo: 100 reviews\n- Diet Center: 50 reviews"
                })
            });
        }
    });

    await page.route('**/api/scrapped-data', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                dimensions: [
                    { dimension: "Quality", description: "Product quality", keywords: ["quality", "good"] },
                    { dimension: "Price", description: "Product price", keywords: ["price", "cheap"] }
                ]
            })
        });
    });

    // 2. Step 1: Company Website
    const urlInput = page.locator('input#website');
    await urlInput.fill('https://www.calo.app');

    const analyzeButton = page.locator('button[type="submit"]');
    await analyzeButton.click();

    // Wait for Step 2: Competitors
    await expect(page.locator('text=Step 2: Confirm Competitors')).toBeVisible({ timeout: 30000 });

    // 3. Step 2: verify and proceed
    const confirmCompetitorsButton = page.locator('button:has-text("Confirm Competitors")');
    await confirmCompetitorsButton.click();

    // Wait for Step 3: App IDs
    await expect(page.locator('text=Step 3: Verify App IDs & Links')).toBeVisible({ timeout: 30000 });

    // 4. Step 3: Verify App IDs
    await expect(page.locator('text=Step 3: Verify App IDs')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('h4:has-text("Calo")')).toBeVisible();

    const nextToStep4Button = page.locator('button:has-text("Next")');
    await nextToStep4Button.click();

    // 5. Step 4: Discover Locations
    await expect(page.locator('text=Step 4: Discover Locations')).toBeVisible({ timeout: 10000 });

    // Wait for auto-discovery (polling check-status for discover-maps)
    // In the mock, it should complete after a few pulses
    await expect(page.locator('button:has-text("Next")')).toBeEnabled({ timeout: 30000 });
    const nextToStep5Button = page.locator('button:has-text("Next")');
    await nextToStep5Button.click();

    // 6. Step 5: Trustpilot Integration
    // Note: The UI currently has a bug where it says "Step 4: Trustpilot Integration" even though it's step 5
    await expect(page.locator('text=Trustpilot Integration')).toBeVisible({ timeout: 10000 });

    const trustpilotInput = page.locator('input[placeholder*="trustpilot.com"]');
    await trustpilotInput.first().fill('https://www.trustpilot.com/review/calo.app');

    // Start Scraping
    const startScrapingButton = page.locator('button:has-text("Start Scraping")');
    await expect(startScrapingButton).toBeEnabled();
    await startScrapingButton.click();

    // Verify transition to progress view
    await expect(page.locator('h2:has-text("Scraping in Progress...")')).toBeVisible({ timeout: 10000 });

    // Wait for success view (after polling mock switches to completed)
    await expect(page.locator('h2:has-text("Scraping Complete!")')).toBeVisible({ timeout: 20000 });

    // --- VERIFY BUTTON FIX 1 ---
    const generateInsightsButton = page.locator('button:has-text("Analyze Reviews & Generate Insights ⚡")');
    await expect(generateInsightsButton).toBeVisible();
    await expect(generateInsightsButton).toHaveClass(/bg-indigo-600/);

    // Click it to trigger dimension generation
    await generateInsightsButton.click();

    // Wait for dimensions to appear
    await expect(page.locator('text=Dimensions Analysis')).toBeVisible({ timeout: 5000 });

    // --- VERIFY BUTTON FIX 2 ---
    const startAnalysisButton = page.locator('button:has-text("Start Analysis & Generate Dashboard 🚀")');
    await expect(startAnalysisButton).toBeVisible();
    await expect(startAnalysisButton).toHaveClass(/bg-indigo-600/);

    console.log('Scraping initiated AND buttons verified successfully.');
});
