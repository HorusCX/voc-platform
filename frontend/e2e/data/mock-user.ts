export const MOCK_USER = {
    id: 1,
    email: 'test@example.com',
    role: 'admin' as const,
    created_at: '2026-01-01T00:00:00Z',
    limits: { max_companies: null, max_total_reviews: null },
};

export const MOCK_ACCESS_TOKEN = 'mock-e2e-test-token';
