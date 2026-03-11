import { Page, Locator } from '@playwright/test';

export class LoginPage {
    constructor(readonly page: Page) {}

    get emailInput(): Locator { return this.page.locator('#email-address'); }
    get passwordInput(): Locator { return this.page.locator('#password'); }
    get submitButton(): Locator { return this.page.getByRole('button', { name: /Sign in/i }); }
    get errorMessage(): Locator { return this.page.locator('[data-testid="login-error"]'); }
    get signUpLink(): Locator { return this.page.getByRole('link', { name: /Sign Up/i }); }

    async goto() { await this.page.goto('/login'); }

    async login(email: string, password: string) {
        await this.emailInput.fill(email);
        await this.passwordInput.fill(password);
        await this.submitButton.click();
    }

    async waitForRedirectToHome() {
        await this.page.waitForURL('/', { timeout: 10000 });
    }
}
