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

    await page.route('**/api/check-status?job_id=*', async route => {
        console.log('Mock: check-status hit');
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                status: "running",
                message: "Scraping in progress..."
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

    // 4. Step 3: verify data populated (Calo specific or generic)
    // We expect at least the company name "Calo" to be visible
    await expect(page.locator('h4:has-text("Calo")')).toBeVisible();

    // Start Scraping
    // Note: We need to wait for discover-maps to finish updating validation probably? 
    // But button is enabled. 
    const startScrapingButton = page.locator('button:has-text("Start Scraping")');

    // Wait for button to be enabled (loading might be true for a split second)
    await expect(startScrapingButton).toBeEnabled();
    await startScrapingButton.click();

    // Verify transition to success/progress view
    await expect(page.locator('h2:has-text("Scraping in Progress...")')).toBeVisible({ timeout: 10000 });

    console.log('Scraping initiated successfully (Test Complete).');
});
