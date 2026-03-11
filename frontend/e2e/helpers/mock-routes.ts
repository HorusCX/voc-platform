import { Page } from '@playwright/test';

/**
 * Sets up a stateful polling mock that returns `running` for the first
 * `runningCount` calls, then switches to `completedPayload` for all subsequent calls.
 *
 * @param page        - Playwright page
 * @param urlPattern  - glob/regex pattern for the route (e.g. `'**\/api/check-status**'`)
 * @param completedPayload - The body to return once polling "completes"
 * @param runningCount - How many "running" responses to return before completing
 */
export async function mockPollingRoute(
    page: Page,
    urlPattern: string,
    completedPayload: Record<string, unknown>,
    runningCount = 2
) {
    let calls = 0;
    await page.route(urlPattern, (route) => {
        calls++;
        if (calls <= runningCount) {
            return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ status: 'running', message: 'In progress...' }),
            });
        }
        return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(completedPayload),
        });
    });
}
