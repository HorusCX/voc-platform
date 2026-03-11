import { test, expect } from '../fixtures';
import { ApiMocks } from '../fixtures';
import { LoginPage } from '../pages/LoginPage';
import { MOCK_COMPANIES } from '../data';

test.describe('Authentication', () => {
    test('TC-AUTH-01: Login form renders at /login', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await expect(loginPage.emailInput).toBeVisible();
        await expect(loginPage.passwordInput).toBeVisible();
        await expect(loginPage.submitButton).toBeVisible();
    });

    test('TC-AUTH-02: Valid credentials redirect to /', async ({ page }) => {
        const mocks = new ApiMocks(page);
        await mocks.mockLogin();
        await mocks.mockAuthMe();
        await mocks.mockPortfolios();
        await page.route('**/api/companies**', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_COMPANIES) })
        );
        await page.route('**/api/dimensions**', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
        );
        await page.route('**/api/portfolios/*/sync-status', (route) =>
            route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sync_status: 'idle', last_sync_at: null }) })
        );

        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('test@example.com', 'password123');
        await loginPage.waitForRedirectToHome();
        await expect(page).toHaveURL('/');
    });

    test('TC-AUTH-03: Invalid credentials show error message', async ({ page }) => {
        await page.route('**/api/auth/login', (route) =>
            route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Invalid email or password' }) })
        );

        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.login('wrong@example.com', 'wrongpass');
        await expect(loginPage.errorMessage).toBeVisible();
    });

    test('TC-AUTH-04: Unauthenticated user is redirected to /login from /', async ({ page }) => {
        await page.route('**/api/auth/me', (route) =>
            route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ detail: 'Unauthorized' }) })
        );
        await page.goto('/');
        await page.waitForURL('/login', { timeout: 10000 });
        await expect(page).toHaveURL('/login');
    });

    test('TC-AUTH-05: Sign up link navigates to /signup', async ({ page }) => {
        const loginPage = new LoginPage(page);
        await loginPage.goto();
        await loginPage.signUpLink.click();
        await expect(page).toHaveURL('/signup');
    });
});
