import { test, expect } from '@playwright/test';

test('Portfolio UI - Confirm buttons logic when companies exist', async ({ page }) => {
    // Mock user info
    await page.route('**/api/auth/me', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                id: 1,
                email: 'test@example.com',
                role: 'admin',
                created_at: new Date().toISOString()
            })
        });
    });

    // Mock portfolios
    await page.route('**/api/portfolios', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                { id: 1, name: 'Test Portfolio' }
            ])
        });
    });

    // Mock companies for the portfolio
    await page.route('**/api/companies?portfolio_id=1', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    id: 1,
                    company_name: 'Test Company',
                    website: 'https://test.com',
                    description: 'A test company',
                    portfolio_id: 1,
                    is_main: true
                }
            ])
        });
    });

    // Mock dimensions
    await page.route('**/api/dimensions?portfolio_id=1', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([])
        });
    });

    // Mock dashboard stats
    await page.route('**/api/user/dashboard-stats?portfolio_id=1', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                total_reviews: 0,
                average_rating: 0,
                sentiment_score: 0,
                brands_count: 1
            })
        });
    });

    // Set mock token in localStorage
    await page.addInitScript(() => {
        window.localStorage.setItem('access_token', 'mock-token');
    });

    // Visit the dashboard/companies page
    // The default page seems to be the companies list if logged in
    await page.goto('/');

    // Wait for the portfolio context to load and companies to be fetched
    await expect(page.locator('text=Your Companies')).toBeVisible({ timeout: 10000 });

    // Verify "Add Company" button is present
    const addCompanyButton = page.locator('button:has-text("Add Company")');
    await expect(addCompanyButton).toBeVisible();

    // Verify "New Analysis" button is NOT present
    const newAnalysisButton = page.locator('button:has-text("New Analysis")');
    await expect(newAnalysisButton).not.toBeVisible();

    console.log('✅ Portfolio UI button verification successful.');
});

test('Portfolio UI - Confirm buttons logic when NO companies exist', async ({ page }) => {
    // Mock user info
    await page.route('**/api/auth/me', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
                id: 1,
                email: 'test@example.com',
                role: 'admin',
                created_at: new Date().toISOString()
            })
        });
    });

    // Mock portfolios
    await page.route('**/api/portfolios', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                { id: 1, name: 'Empty Portfolio' }
            ])
        });
    });

    // Mock companies for the portfolio (Empty)
    await page.route('**/api/companies?portfolio_id=1', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([])
        });
    });

    // Mock dimensions
    await page.route('**/api/dimensions?portfolio_id=1', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([])
        });
    });

    // Set mock token in localStorage
    await page.addInitScript(() => {
        window.localStorage.setItem('access_token', 'mock-token');
    });

    // Visit the dashboard/companies page
    await page.goto('/');

    // Wait for the "No Companies Yet" state
    await expect(page.locator('text=No Companies Yet')).toBeVisible({ timeout: 10000 });

    // Verify "Start New Analysis" button IS present in the empty state card
    const startNewAnalysisButton = page.locator('button:has-text("Start New Analysis")');
    await expect(startNewAnalysisButton).toBeVisible();

    console.log('✅ Portfolio UI empty state button verification successful.');
});
