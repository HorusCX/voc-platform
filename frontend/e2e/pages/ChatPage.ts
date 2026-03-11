import { Page, Locator, expect } from '@playwright/test';

export class ChatPage {
    constructor(readonly page: Page) {}

    get messagesArea(): Locator { return this.page.locator('[data-testid="chat-messages"]'); }
    get chatInput(): Locator { return this.page.locator('[data-testid="chat-input"]'); }
    get sendButton(): Locator { return this.page.locator('[data-testid="chat-send-btn"]'); }
    get newChatButton(): Locator { return this.page.locator('[data-testid="new-chat-btn"]'); }
    get typingIndicator(): Locator { return this.page.locator('[data-testid="chat-typing-indicator"]'); }
    get userMessages(): Locator { return this.page.locator('[data-testid="chat-user-message"]'); }
    get aiMessages(): Locator { return this.page.locator('[data-testid="chat-ai-message"]'); }
    get conversationItems(): Locator { return this.page.locator('[data-testid="conversation-item"]'); }

    async goto() { await this.page.goto('/chat?new=1'); }

    async waitForLoaded(timeout = 10000) {
        await this.chatInput.waitFor({ state: 'visible', timeout });
    }

    async sendMessage(text: string) {
        await this.chatInput.fill(text);
        await expect(this.sendButton).toBeEnabled({ timeout: 15000 });
        await this.sendButton.click();
    }

    async waitForUserMessageVisible(text: string, timeout = 5000) {
        await expect(this.page.locator('[data-testid="chat-user-message"]', { hasText: text })).toBeVisible({ timeout });
    }

    async waitForAiResponse(timeout = 30000) {
        // Wait for typing indicator to appear then disappear, or directly wait for AI message
        await this.page.waitForSelector('[data-testid="chat-ai-message"]', { timeout }).catch(() => {});
    }

    async startNewConversation() {
        await this.newChatButton.click();
    }
}
