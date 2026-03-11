/** Shape from POST /api/scrapped-data (no IDs) */
export const MOCK_SCRAPED_DIMENSIONS = [
    { dimension: 'Food Quality', description: 'Taste, freshness, and variety of food offered.', keywords: ['taste', 'fresh', 'quality', 'flavor'] },
    { dimension: 'Delivery Speed', description: 'Speed and reliability of delivery service.', keywords: ['fast', 'delivery', 'late', 'on-time'] },
    { dimension: 'Customer Support', description: 'Responsiveness of support team.', keywords: ['support', 'help', 'response', 'service'] },
];

/** Shape from GET /api/dimensions (with IDs) */
export const MOCK_DIMENSIONS = [
    { id: 1, name: 'Food Quality', description: 'Taste, freshness, and variety of food offered.', keywords: ['taste', 'fresh', 'quality', 'flavor'], portfolio_id: 1 },
    { id: 2, name: 'Delivery Speed', description: 'Speed and reliability of delivery service.', keywords: ['fast', 'delivery', 'late', 'on-time'], portfolio_id: 1 },
    { id: 3, name: 'Customer Support', description: 'Responsiveness of support team.', keywords: ['support', 'help', 'response', 'service'], portfolio_id: 1 },
];
