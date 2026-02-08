import { test, expect } from '@playwright/test';

test('VoC Integration Test (Real Backend)', async ({ page }) => {
    // 1. Visit Landing Page
    console.log('Visiting landing page...');
    await page.goto('http://localhost:3000/');

    // 2. Step 1: Input Company
    console.log('Step 1: Analyzing website...');
    const urlInput = page.locator('input[placeholder="e.g., https://www.calo.app"]');
    await urlInput.fill('https://www.calo.app');

    const analyzeButton = page.locator('button:has-text("Analyze Website ⚡")');
    await analyzeButton.click();

    // Wait for Step 2
    console.log('Waiting for Step 2: Competitors...');
    await expect(page.locator('text=Step 2: Confirm Competitors')).toBeVisible({ timeout: 60000 });

    // 3. Step 2: Confirm Competitors
    console.log('Step 2: Confirming competitors...');
    const confirmButton = page.locator('button:has-text("Confirm Competitors")');
    await confirmButton.click();

    // Wait for Step 3
    console.log('Waiting for Step 3: App IDs...');
    await expect(page.locator('text=Step 3: Verify App IDs & Links')).toBeVisible({ timeout: 60000 });

    // 4. Step 3: Start Scraping (Discovery happens automatically now, right?)
    // Need to wait for discovery to finish. The UI should show locations.
    console.log('Step 3: Waiting for locations...');

    // In TEST_MODE, we expect at least 1 location to appear.
    // Wait for the "Found X locations" text or similar, or just wait for the button to be enabled.
    // The "Start Scraping" button is disabled while scanning? Let's check state.

    // Assuming button is enabled eventually
    const scrapeButton = page.locator('button:has-text("Start Scraping")');
    await expect(scrapeButton).toBeEnabled({ timeout: 60000 });

    console.log('Starting Scraping...');
    await scrapeButton.click();

    // 5. Success/Progress Screen
    console.log('Waiting for scraping progress...');
    await expect(page.locator('text=Scraping in Progress')).toBeVisible({ timeout: 10000 });

    // Poll for completion (TEST_MODE should be fast)
    console.log('Waiting for completion...');
    // completion might show "Process Extracted Data" button or "Analysis"
    await expect(page.locator('text=Process Extracted Data')).toBeVisible({ timeout: 120000 });

    console.log('✅ Integration Test Completed Successfully!');
});
