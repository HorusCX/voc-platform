export const MOCK_DASHBOARD_STATS = {
    totalReviews: 1250,
    avgRating: 4.2,
    positivePercent: 72.5,
    negativePercent: 15.3,
    neutralPercent: 12.2,
    netSentiment: 57.2,
    sentimentTrend: [],
    brandTrend: [],
    brandStats: [
        { brand: 'Calo', reviews: 910, avgRating: 4.3, positivePercent: 74.7, negativePercent: 14.3, neutralPercent: 11.0, netSentiment: 60.4 },
        { brand: 'Diet Center', reviews: 340, avgRating: 3.8, positivePercent: 66.2, negativePercent: 18.2, neutralPercent: 15.6, netSentiment: 48.0 },
    ],
    dimensionStats: [
        { dimension: 'Food Quality', total: 600, positive: 450, negative: 80, neutral: 70, positivePercent: 75.0, negativePercent: 13.3, neutralPercent: 11.7, netSentiment: 61.7, impact: 30 },
        { dimension: 'Delivery Speed', total: 560, positive: 310, negative: 190, neutral: 60, positivePercent: 55.4, negativePercent: 33.9, neutralPercent: 10.7, netSentiment: 21.4, impact: -10 },
        { dimension: 'Customer Support', total: 240, positive: 150, negative: 60, neutral: 30, positivePercent: 62.5, negativePercent: 25.0, neutralPercent: 12.5, netSentiment: 37.5, impact: 15 },
    ],
    topStrengths: [],
    topWeaknesses: [],
    platformStats: [
        { platform: 'Google Play', count: 520, percentage: 41.6 },
        { platform: 'App Store', count: 380, percentage: 30.4 },
        { platform: 'Google Maps', count: 210, percentage: 16.8 },
        { platform: 'Trustpilot', count: 140, percentage: 11.2 },
    ],
};
