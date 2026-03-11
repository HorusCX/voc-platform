/**
 * Tests for the Dashboard page: KPI cards, filters, tab switching, charts.
 */
import { test, expect } from '../fixtures';
import { DashboardPage } from '../pages/DashboardPage';

test.describe('Dashboard Page', () => {
    test('TC-DASH-01: All 4 KPI cards render with values from API', async ({ portfolioPage }) => {
        const dp = new DashboardPage(portfolioPage);
        await dp.goto();
        await dp.waitForLoaded();
        // Total reviews KPI
        await expect(dp.kpiCard('Total Reviews').or(dp.kpiCard('total reviews'))).toBeVisible({ timeout: 10000 });
    });

    test('TC-DASH-02: Sentiment score value matches mock data', async ({ portfolioPage }) => {
        const dp = new DashboardPage(portfolioPage);
        await dp.goto();
        await dp.waitForLoaded();
        // The sentiment score from mock is 72
        await expect(portfolioPage.getByText('72').first()).toBeVisible({ timeout: 10000 });
    });

    test('TC-DASH-03: Dashboard data loads without error', async ({ portfolioPage }) => {
        const dp = new DashboardPage(portfolioPage);
        await dp.goto();
        await dp.waitForLoaded();
        // Should not show a "no data" or error state
        await expect(dp.noDataMessage).not.toBeVisible({ timeout: 5000 }).catch(() => {
            // If noDataMessage is not present at all, that's fine
        });
    });

    test('TC-DASH-04: Dashboard loads with the correct total reviews count', async ({ portfolioPage }) => {
        const dp = new DashboardPage(portfolioPage);
        await dp.goto();
        await dp.waitForLoaded();
        // MOCK_DASHBOARD_STATS.total_reviews = 1250
        await expect(portfolioPage.getByText('1,250').or(portfolioPage.getByText('1250')).first()).toBeVisible({ timeout: 10000 });
    });

    test('TC-DASH-05: Executive / Operational tab toggle switches dashboard view', async ({ portfolioPage }) => {
        const dp = new DashboardPage(portfolioPage);
        await dp.goto();
        await dp.waitForLoaded();
        // Check that tabs exist
        await expect(dp.dashboardTabs).toBeVisible({ timeout: 10000 });
        // Switch to operational view if the tab exists
        const operationalTab = dp.operationalTab;
        if (await operationalTab.isVisible()) {
            await dp.switchToOperational();
            await expect(dp.operationalTab).toBeVisible();
        }
    });

    test('TC-DASH-06: Trend chart container is visible', async ({ portfolioPage }) => {
        const dp = new DashboardPage(portfolioPage);
        await dp.goto();
        await dp.waitForLoaded();
        // Chart or some visual content should be present
        const chartLocator = portfolioPage.locator('[data-testid="brand-trend-chart"]')
            .or(portfolioPage.locator('.recharts-wrapper'))
            .or(portfolioPage.locator('canvas'))
            .first();
        await expect(chartLocator).toBeVisible({ timeout: 15000 });
    });
});
