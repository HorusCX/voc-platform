const REVIEW_BASE = {
    sentiment: 'Positive',
    emotion: 'Delighted',
    confidence: 0.92,
    source_user: 'user123',
    source_link: '',
};

export const MOCK_REVIEWS = [
    { id: 1, ...REVIEW_BASE, text: 'Great food, fast delivery! Highly recommend.', rating: 5, date: '2026-02-15T10:00:00Z', brand: 'Calo', platform: 'Google Play', topics: 'Food Quality; Delivery Speed' },
    { id: 2, ...REVIEW_BASE, sentiment: 'Negative', emotion: 'Frustrated', text: 'Order was late and cold. Very disappointed.', rating: 1, date: '2026-02-10T08:00:00Z', brand: 'Calo', platform: 'App Store', topics: 'Delivery Speed; Food Quality' },
    { id: 3, ...REVIEW_BASE, sentiment: 'Neutral', emotion: 'Indifferent', text: 'Decent service overall, nothing special.', rating: 3, date: '2026-02-05T12:00:00Z', brand: 'Diet Center', platform: 'Google Play', topics: 'Customer Support' },
    { id: 4, ...REVIEW_BASE, text: 'Love the variety of meals available every week.', rating: 5, date: '2026-01-28T09:00:00Z', brand: 'Calo', platform: 'Google Maps', topics: 'Food Quality' },
    { id: 5, ...REVIEW_BASE, sentiment: 'Positive', text: 'Customer support was very helpful resolving my issue.', rating: 4, date: '2026-01-20T15:00:00Z', brand: 'Diet Center', platform: 'Trustpilot', topics: 'Customer Support' },
];

export const MOCK_PAGINATED_REVIEWS = {
    items: MOCK_REVIEWS,
    total: 1250,
    page: 1,
    page_size: 50,
    total_pages: 25,
};
