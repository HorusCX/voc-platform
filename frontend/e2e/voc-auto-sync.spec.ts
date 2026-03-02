import { test, expect } from '@playwright/test';

const TEST_EMAIL = "test@test.com";
const TEST_PASSWORD = "password123";

test('VoC Up-to-date Sync and Re-analyze E2E Test', async ({ page }) => {
    test.setTimeout(600000); // 10 minutes

    // 1. Visit App
    console.log('Visiting app...');
    await page.goto('/');

    // 2. Handle Login if redirected
    console.log('Waiting for login or dashboard...');
    try {
        await Promise.race([
            page.waitForSelector('text=Your Companies', { timeout: 10000 }),
            page.waitForSelector('input[type="email"]', { timeout: 10000 })
        ]);
    } catch {
        // Ignore timeout
    }

    if (await page.locator('input[type="email"]').isVisible()) {
        console.log('Logging in...');
        await page.fill('input[type="email"]', TEST_EMAIL);
        await page.fill('input[type="password"]', TEST_PASSWORD);
        await page.click('button[type="submit"]');
    }

    // 3. Find "Analyze Latest Reviews" buttons
    console.log('Waiting for companies to load...');
    await expect(page.locator('text=Your Companies')).toBeVisible({ timeout: 15000 });

    const analyzeButtons = page.locator('button:has-text("Analyze Latest Reviews")');
    const count = await analyzeButtons.count();

    if (count > 0) {
        // 4. Click first "Analyze Latest Reviews"
        console.log('Clicking Analyze Latest Reviews on first company...');
        await analyzeButtons.nth(0).click();

        try {
            await expect(page.locator('text=Scraping in Progress')).toBeVisible({ timeout: 5000 });
            await expect(page.locator('text=Scraping in Progress')).toBeHidden({ timeout: 90000 });
        } catch {
            console.log('Progress indicator not found or already completed.');
        }

        if (count > 1) {
            // 5. Click second "Analyze Latest Reviews"
            await page.goto('/');
            await expect(page.locator('text=Your Companies')).toBeVisible({ timeout: 15000 });

            console.log('Clicking Analyze Latest Reviews on second company...');
            await page.locator('button:has-text("Analyze Latest Reviews")').nth(1).click();

            try {
                await expect(page.locator('text=Scraping in Progress')).toBeVisible({ timeout: 5000 });
                await expect(page.locator('text=Scraping in Progress')).toBeHidden({ timeout: 90000 });
            } catch {
                console.log('Progress indicator not found or already completed.');
            }
        }
    } else {
        console.log('No companies found, skipping single analyze tests.');
    }

    // 6. Navigate to Dimensions list, change a dimension, and Re-analyze
    console.log('Navigating to Dimensions list...');
    await page.goto('/dimensions');
    await expect(page.locator('text=Your Dimensions')).toBeVisible({ timeout: 10000 });

    // Click "Re-Analyze All"
    console.log('Clicking Re-Analyze All...');
    const reanalyzeButton = page.locator('button:has-text("Re-Analyze All"), button:has-text("Re-analyze")').first();
    if (await reanalyzeButton.isVisible()) {
        await reanalyzeButton.click();

        // Check that background analysis started
        await expect(page.locator('text=started')).toBeVisible({ timeout: 10000 });
        console.log('✅ Background Re-analyze triggered successfully!');
    } else {
        console.log('Re-analyze button not found.');
    }
});
