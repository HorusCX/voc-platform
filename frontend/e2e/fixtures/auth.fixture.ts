/* eslint-disable react-hooks/rules-of-hooks */
import { test as base, Page } from '@playwright/test';
import { MOCK_USER, MOCK_ACCESS_TOKEN } from '../data/mock-user';
import { MOCK_PORTFOLIOS } from '../data/mock-portfolio';
import { MOCK_COMPANIES } from '../data/mock-companies';
import { MOCK_DIMENSIONS } from '../data/mock-dimensions';
import { MOCK_DASHBOARD_STATS } from '../data/mock-dashboard';
import { MOCK_PAGINATED_REVIEWS } from '../data/mock-reviews';

type AuthFixtures = {
    /** Page with JWT injected + /api/auth/me and /api/portfolios mocked */
    authenticatedPage: Page;
    /** authenticatedPage + companies, dimensions, dashboard-stats, reviews mocked */
    portfolioPage: Page;
};

export const test = base.extend<AuthFixtures>({
    authenticatedPage: async ({ page }, use) => {
        await page.addInitScript((token) => {
            window.localStorage.setItem('access_token', token);
        }, MOCK_ACCESS_TOKEN);

        await page.route('**/api/auth/me', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
        );

        await page.route('**/api/portfolios', (route) => {
            if (route.request().method() === 'GET') {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIOS) });
            }
            return route.continue();
        });

        await page.route('**/api/portfolios/*/sync-status', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sync_status: 'idle', last_sync_at: null }) })
        );

        await use(page);
    },

    portfolioPage: async ({ page }, use) => {
        await page.addInitScript((token) => {
            window.localStorage.setItem('access_token', token);
        }, MOCK_ACCESS_TOKEN);

        await page.route('**/api/auth/me', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_USER) })
        );

        await page.route('**/api/portfolios', (route) => {
            if (route.request().method() === 'GET') {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PORTFOLIOS) });
            }
            return route.continue();
        });

        await page.route('**/api/portfolios/*/sync-status', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sync_status: 'idle', last_sync_at: null }) })
        );

        await page.route('**/api/companies**', (route) => {
            if (route.request().method() === 'GET') {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_COMPANIES) });
            }
            return route.continue();
        });

        await page.route('**/api/dimensions**', (route) => {
            if (route.request().method() === 'GET') {
                return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DIMENSIONS) });
            }
            return route.continue();
        });

        await page.route('**/api/user/dashboard-stats**', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DASHBOARD_STATS) })
        );

        await page.route('**/api/user/reviews/paginated**', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_PAGINATED_REVIEWS) })
        );

        await use(page);
    },
});

export { expect } from '@playwright/test';
