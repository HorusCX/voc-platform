/**
 * Tests for the Team Management page: member list, pending invitations, invite flow.
 */
import { test, expect } from '../fixtures';
import { ApiMocks } from '../fixtures';
import { TeamPage } from '../pages/TeamPage';

test.describe('Team Management Page', () => {
    test('TC-TEAM-01: Team page shows current members list', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockTeamMembers(1);
        const tp = new TeamPage(portfolioPage);
        await tp.goto();
        await tp.waitForLoaded();
        await expect(tp.memberRows.first()).toBeVisible({ timeout: 10000 });
    });

    test('TC-TEAM-02: Pending invitations shown with email and status', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockTeamMembers(1);
        const tp = new TeamPage(portfolioPage);
        await tp.goto();
        await tp.waitForLoaded();
        await expect(tp.invitationRows.first()).toBeVisible({ timeout: 10000 });
        // Pending invitation should show "Pending" or similar status
        await expect(portfolioPage.getByText(/pending/i).first()).toBeVisible({ timeout: 5000 });
    });

    test('TC-TEAM-03: Invite form visible with email input and Send button', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockTeamMembers(1);
        const tp = new TeamPage(portfolioPage);
        await tp.goto();
        await tp.waitForLoaded();
        await expect(tp.inviteEmailInput).toBeVisible({ timeout: 10000 });
        await expect(tp.sendInviteButton).toBeVisible();
    });

    test('TC-TEAM-04: Valid email invite shows success confirmation', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockTeamMembers(1);
        await mocks.mockInvite(1);
        const tp = new TeamPage(portfolioPage);
        await tp.goto();
        await tp.waitForLoaded();
        await tp.inviteUser('newmember@example.com');
        await expect(tp.inviteSuccessMessage).toBeVisible({ timeout: 10000 });
    });

    test('TC-TEAM-05: Empty email does not send an invitation', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockTeamMembers(1);
        const tp = new TeamPage(portfolioPage);
        await tp.goto();
        await tp.waitForLoaded();
        // Send button is disabled when no email is entered — this IS the validation
        await expect(tp.sendInviteButton).toBeDisabled();
    });
});
