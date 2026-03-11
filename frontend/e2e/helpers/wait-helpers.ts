import { Page, expect } from '@playwright/test';

/**
 * Accepts the next browser dialog (confirm/alert/prompt) automatically.
 * Must be called before the action that triggers the dialog.
 */
export function acceptNextDialog(page: Page) {
    page.once('dialog', (dialog) => dialog.accept());
}

/**
 * Dismisses the next browser dialog automatically.
 */
export function dismissNextDialog(page: Page) {
    page.once('dialog', (dialog) => dialog.dismiss());
}

/**
 * Waits for a loading spinner to disappear from the page.
 */
export async function waitForSpinnerGone(page: Page, timeout = 10000) {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout }).catch(() => {});
}

/**
 * Waits until an element matching `selector` is visible within `timeout` ms.
 */
export async function waitForVisible(page: Page, selector: string, timeout = 10000) {
    await expect(page.locator(selector)).toBeVisible({ timeout });
}

/**
 * Injects a mock JWT token into localStorage before page navigation.
 * Call this with `page.addInitScript` before `page.goto()`.
 */
export function injectToken(token: string) {
    return () => {
        window.localStorage.setItem('access_token', token);
    };
}
