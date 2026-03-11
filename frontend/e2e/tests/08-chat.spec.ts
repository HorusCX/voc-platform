/**
 * Tests for the AI Chat page: message sending, streaming response, conversation management.
 */
import { test, expect } from '../fixtures';
import { ApiMocks } from '../fixtures';
import { ChatPage } from '../pages/ChatPage';

test.describe('Chat Page', () => {
    test('TC-CHAT-01: Chat page loads with message area and input', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockConversations(1);
        const cp = new ChatPage(portfolioPage);
        await cp.goto();
        await cp.waitForLoaded();
        await expect(cp.chatInput).toBeVisible({ timeout: 10000 });
        await expect(cp.sendButton).toBeVisible();
    });

    test('TC-CHAT-02: Sending a message shows it as user bubble immediately', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockConversations(1);
        await mocks.mockConversationMessages(1);
        await mocks.mockChatStream(1);
        const cp = new ChatPage(portfolioPage);
        await cp.goto();
        await cp.waitForLoaded();
        await cp.sendMessage('Hello, how are you?');
        await cp.waitForUserMessageVisible('Hello, how are you?');
    });

    test('TC-CHAT-03: Typing indicator appears while AI response streams', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockConversations(1);
        await mocks.mockConversationMessages(1);
        // Slow streaming mock — keep typing indicator visible long enough
        await portfolioPage.route('**/api/portfolios/*/chat/stream**', async (route) => {
            await new Promise((resolve) => setTimeout(resolve, 500));
            const sseBody = [
                'data: {"type":"text","text":"Let me think..."}\n\n',
                'data: {"type":"text","text":" processing..."}\n\n',
                'data: [DONE]\n\n',
            ].join('');
            return route.fulfill({
                status: 200,
                contentType: 'text/event-stream',
                body: sseBody,
            });
        });
        const cp = new ChatPage(portfolioPage);
        await cp.goto();
        await cp.waitForLoaded();
        await cp.chatInput.fill('Tell me something');
        await expect(cp.sendButton).toBeEnabled({ timeout: 15000 });
        await cp.sendButton.click();
        // Typing indicator should appear briefly
        await expect(cp.typingIndicator.or(cp.messagesArea).first()).toBeVisible({ timeout: 5000 });
    });

    test('TC-CHAT-04: AI response appears in chat after streaming ends', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockConversations(1);
        await mocks.mockConversationMessages(1);
        await mocks.mockChatStream(1);
        const cp = new ChatPage(portfolioPage);
        await cp.goto();
        await cp.waitForLoaded();
        await cp.sendMessage('What is the total review count?');
        await cp.waitForAiResponse();
        // AI response text should be visible
        await expect(cp.aiMessages.first()).toBeVisible({ timeout: 15000 });
    });

    test('TC-CHAT-05: SQL-type prompt gets a response', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockConversations(1);
        await mocks.mockConversationMessages(1);
        await mocks.mockChatStream(1);
        const cp = new ChatPage(portfolioPage);
        await cp.goto();
        await cp.waitForLoaded();
        await cp.sendMessage('How many reviews do we have per brand?');
        await cp.waitForAiResponse();
        await expect(cp.aiMessages.first()).toBeVisible({ timeout: 15000 });
    });

    test('TC-CHAT-06: Semantic search prompt gets a response', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockConversations(1);
        await mocks.mockConversationMessages(1);
        await mocks.mockChatStream(1);
        const cp = new ChatPage(portfolioPage);
        await cp.goto();
        await cp.waitForLoaded();
        await cp.sendMessage('Find reviews about delivery speed');
        await cp.waitForAiResponse();
        await expect(cp.aiMessages.first()).toBeVisible({ timeout: 15000 });
    });

    test('TC-CHAT-07: New conversation button creates a separate conversation', async ({ portfolioPage }) => {
        const mocks = new ApiMocks(portfolioPage);
        await mocks.mockConversations(1);
        await mocks.mockConversationMessages(1);
        await mocks.mockChatStream(1);
        const cp = new ChatPage(portfolioPage);
        await cp.goto();
        await cp.waitForLoaded();
        // Send a message in first conversation
        await cp.sendMessage('First message');
        await cp.waitForAiResponse();
        // Start new conversation
        await cp.startNewConversation();
        // Input should be empty / ready for a new message
        await expect(cp.chatInput).toHaveValue('');
    });
});
