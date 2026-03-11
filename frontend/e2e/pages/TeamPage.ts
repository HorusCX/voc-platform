import { Page, Locator } from '@playwright/test';

export class TeamPage {
    constructor(readonly page: Page) {}

    get heading(): Locator { return this.page.getByRole('heading', { name: /Team Management/i }); }
    get inviteEmailInput(): Locator { return this.page.getByPlaceholder(/collaborator@example.com/i); }
    get sendInviteButton(): Locator { return this.page.getByRole('button', { name: /Send Invitation/i }); }
    get inviteSuccessMessage(): Locator { return this.page.getByText(/Invitation sent/i); }
    get inviteErrorMessage(): Locator { return this.page.locator('[data-testid="invite-error"]'); }
    get activeMembersHeading(): Locator { return this.page.getByRole('heading', { name: /Active Members/i }); }
    get pendingInvitationsHeading(): Locator { return this.page.getByRole('heading', { name: /Pending Invitations/i }); }
    get memberRows(): Locator { return this.page.locator('[data-testid="member-row"]'); }
    get invitationRows(): Locator { return this.page.locator('[data-testid="invitation-row"]'); }

    memberRow(email: string): Locator {
        return this.page.locator('[data-testid="member-row"]', { hasText: email });
    }
    invitationRow(email: string): Locator {
        return this.page.locator('[data-testid="invitation-row"]', { hasText: email });
    }

    async goto() { await this.page.goto('/team'); }

    async waitForLoaded(timeout = 10000) {
        await this.heading.waitFor({ state: 'visible', timeout });
    }

    async inviteUser(email: string) {
        await this.inviteEmailInput.fill(email);
        await this.sendInviteButton.click();
    }
}
