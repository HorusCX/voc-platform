/** Shape returned by POST /api/analyze-website (before app IDs resolved) */
export const MOCK_ANALYZED_COMPANIES = [
    {
        company_name: 'Calo',
        website: 'https://calo.app',
        description: 'Healthy meal subscription service.',
        is_main: true,
    },
    {
        company_name: 'Diet Center',
        website: 'https://dietcenter.com',
        description: 'Diet food delivery.',
        is_main: false,
    },
];

/** Shape returned by POST /api/appids */
export const MOCK_APPID_COMPANIES = [
    {
        company_name: 'Calo',
        website: 'https://calo.app',
        description: 'Healthy meal subscription service.',
        is_main: true,
        android_id: 'com.calo.app',
        apple_id: '1523456789',
    },
    {
        company_name: 'Diet Center',
        website: 'https://dietcenter.com',
        description: 'Diet food delivery.',
        is_main: false,
        android_id: 'com.dietcenter.app',
        apple_id: '987654321',
    },
];

/** Shape returned by GET /api/companies (saved, with IDs and stats) */
export const MOCK_COMPANIES = [
    {
        id: 1,
        company_name: 'Calo',
        website: 'https://calo.app',
        description: 'Healthy meal subscription service.',
        is_main: true,
        android_id: 'com.calo.app',
        apple_id: '1523456789',
        google_maps_links: [{ name: 'Calo Kitchen', url: 'https://goo.gl/maps/123', place_id: 'abc123' }],
        trustpilot_link: 'https://www.trustpilot.com/review/calo.app',
        logo_url: null,
        arabic_name: null,
        review_count: 1250,
        avg_rating: 4.2,
        portfolio_id: 1,
    },
    {
        id: 2,
        company_name: 'Diet Center',
        website: 'https://dietcenter.com',
        description: 'Diet food delivery.',
        is_main: false,
        android_id: 'com.dietcenter.app',
        apple_id: '987654321',
        google_maps_links: [],
        trustpilot_link: null,
        logo_url: null,
        arabic_name: null,
        review_count: 340,
        avg_rating: 3.8,
        portfolio_id: 1,
    },
];
