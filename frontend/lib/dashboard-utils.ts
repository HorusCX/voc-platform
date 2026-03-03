import Papa from 'papaparse';
import { VoCService, RawReview, ReviewTopic, PaginatedResponse } from './api';

export interface ReviewData {
    text: string;
    rating: number;
    date: string;
    source_user: string;
    platform: string;
    brand: string;
    source_link: string;
    sentiment: string;
    emotion: string;
    confidence: number;
    topics: string;
}

export interface DimensionStats {
    dimension: string;
    total: number;
    positive: number;
    negative: number;
    neutral: number;
    positivePercent: number;
    negativePercent: number;
    neutralPercent: number;
    netSentiment: number;
    impact: number;
    brandStats?: Record<string, {
        positive: number;
        negative: number;
        neutral: number;
        positivePercent: number;
        negativePercent: number;
        neutralPercent: number;
        netSentiment: number;
    }>;
}

export interface BrandStats {
    brand: string;
    reviews: number;
    avgRating: number;
    negativePercent: number;
    positivePercent: number;
    neutralPercent: number;
    netSentiment: number;
}

export interface TrendDataPoint {
    week: string;
    positive: number;
    negative: number;
    neutral: number;
}

export interface DashboardData {
    totalReviews: number;
    avgRating: number;
    negativePercent: number;
    positivePercent: number;
    neutralPercent: number;
    netSentiment: number;
    sentimentTrend: TrendDataPoint[];
    brandStats: BrandStats[];
    dimensionStats: DimensionStats[];
    topStrengths: DimensionStats[];
    topWeaknesses: DimensionStats[];
    platformStats: Array<{ platform: string; count: number; percentage: number }>;
}

/**
 * Parse CSV file and return array of review objects
 */
export async function parseCSV(file: File): Promise<ReviewData[]> {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                resolve(results.data as ReviewData[]);
            },
            error: (error) => {
                reject(error);
            },
        });
    });
}

export async function parseCSVFromURL(url: string): Promise<ReviewData[]> {
    try {
        // Only use proxy for remote HTTP/S URLs. Blob URLs (from direct file uploads) should be fetched directly.
        let response: Response;
        // Only use proxy for remote HTTP/S URLs if they are NOT from our S3 bucket
        // If it's an S3 URL, we should fetch directly now that CORS is enabled.
        const isS3Url = url.includes('s3') || url.includes('amazonaws');


        if (url.startsWith('http') && !isS3Url) {
            console.log('Fetching CSV via proxy:', url);
            const csvText = await VoCService.proxyCSV(url);
            return new Promise((resolve, reject) => {
                Papa.parse(csvText as string, {
                    header: true,
                    skipEmptyLines: true,
                    complete: (results) => {
                        resolve(results.data as ReviewData[]);
                    },
                    error: (error: Error) => {
                        reject(error);
                    },
                });
            });
        } else {
            // Direct fetch for Blob URLs OR S3 URLs
            console.log('Fetching CSV directly:', url);
            response = await fetch(url);
        }

        if (!response.ok) {
            throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`);
        }

        const csvText = await response.text();

        // Then parse the text with papaparse
        return new Promise((resolve, reject) => {
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    resolve(results.data as ReviewData[]);
                },
                error: (error: Error) => {
                    reject(error);
                },
            });
        });
    } catch (error) {
        console.error('Error fetching CSV from URL:', error);
        throw error;
    }
}

/**
 * Fetch reviews from the backend API (database-backed)
 */
export async function fetchReviewsFromAPI(jobId: string): Promise<ReviewData[]> {
    const reviews: RawReview[] = await VoCService.getReviewsByJob(jobId);

    // Convert DB format to dashboard format
    // DB returns topics as JSON array [{dimension, sentiment, mentioned}]
    // Dashboard expects topics as string "Dimension1 (Positive); Dimension2 (Negative)"
    return reviews.map((r: Record<string, unknown>) => ({
        ...r,
        topics: Array.isArray(r.topics)
            ? (r.topics as ReviewTopic[])
                .filter((t) => t.mentioned !== false)
                .map((t) => `${t.dimension || 'Unknown'} (${t.sentiment || 'Neutral'})`)
                .join('; ')
            : (r.topics as string || '')
    })) as ReviewData[];
}

/**
 * Fetch all reviews for the current user from the backend API
 */
export async function fetchUserReviewsFromAPI(filters?: { brand?: string; start_date?: string; end_date?: string }): Promise<ReviewData[]> {
    const params: Record<string, unknown> = {};
    if (filters?.brand) params.brand = filters.brand;
    if (filters?.start_date) params.start_date = filters.start_date;
    if (filters?.end_date) params.end_date = filters.end_date;

    const reviews: RawReview[] = await VoCService.getReviews(params);

    return reviews.map((r: Record<string, unknown>) => ({
        ...r,
        topics: Array.isArray(r.topics)
            ? (r.topics as ReviewTopic[])
                .filter((t) => t.mentioned !== false)
                .map((t) => `${t.dimension || 'Unknown'} (${t.sentiment || 'Neutral'})`)
                .join('; ')
            : (r.topics as string || '')
    })) as ReviewData[];
}

export interface PaginatedReviewsResponse {
    items: ReviewData[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
}

/**
 * Fetch paginated reviews from the backend API
 */
export async function fetchPaginatedUserReviewsFromAPI(paramsObj: {
    page?: number;
    page_size?: number;
    sort_field?: string;
    sort_order?: string;
    search?: string;
    brand?: string;
    platform?: string;
    start_date?: string;
    end_date?: string;
    portfolio_id?: number;
}): Promise<PaginatedReviewsResponse> {
    const params: Record<string, unknown> = {};
    if (paramsObj.page) params.page = paramsObj.page;
    if (paramsObj.page_size) params.page_size = paramsObj.page_size;
    if (paramsObj.sort_field) params.sort_field = paramsObj.sort_field;
    if (paramsObj.sort_order) params.sort_order = paramsObj.sort_order;
    if (paramsObj.search) params.search = paramsObj.search;
    if (paramsObj.brand && paramsObj.brand !== 'all') params.brand = paramsObj.brand;
    if (paramsObj.platform && paramsObj.platform !== 'all') params.platform = paramsObj.platform;
    if (paramsObj.start_date) params.start_date = paramsObj.start_date;
    if (paramsObj.end_date) params.end_date = paramsObj.end_date;
    if (paramsObj.portfolio_id) params.portfolio_id = paramsObj.portfolio_id;

    const responseData: PaginatedResponse<RawReview> = await VoCService.getReviewsPaginated(params);
    return {
        ...responseData,
        items: responseData.items.map((r: Record<string, unknown>) => ({
            ...r,
            topics: Array.isArray(r.topics)
                ? (r.topics as ReviewTopic[])
                    .filter((t) => t.mentioned !== false)
                    .map((t) => `${t.dimension || 'Unknown'} (${t.sentiment || 'Neutral'})`)
                    .join('; ')
                : (r.topics as string || '')
        })) as ReviewData[],
    };
}

/**
 * Fetch pre-calculated dashboard stats directly from the backend
 */
export async function fetchDashboardStatsFromAPI(brand?: string, jobId?: string | null, portfolioId?: number): Promise<DashboardData | null> {
    try {
        const stats = await VoCService.getDashboardStats(portfolioId, brand === 'all' ? undefined : brand) as DashboardData | null;
        return stats;
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        return null;
    }
}

/**
 * Extract topics from a review's topics string
 * Format: "Dimension1 (Positive); Dimension2 (Negative)"
 */
function extractTopics(topicsString: string): Array<{ dimension: string; sentiment: string }> {
    if (!topicsString || topicsString.trim() === '') return [];

    const topics = topicsString.split(';').map(t => t.trim());
    return topics.map(topic => {
        const match = topic.match(/(.+?)\s*\((\w+)\)/);
        if (match) {
            return {
                dimension: match[1].trim(),
                sentiment: match[2].trim(),
            };
        }
        return null;
    }).filter(Boolean) as Array<{ dimension: string; sentiment: string }>;
}

/**
 * Calculate dimension statistics from reviews
 */
export function calculateDimensionStats(reviews: ReviewData[]): DimensionStats[] {
    const dimensionMap = new Map<string, {
        positive: number;
        negative: number;
        neutral: number;
        brands: Map<string, { positive: number; negative: number; neutral: number }>;
    }>();

    // Aggregate topic mentions
    reviews.forEach(review => {
        const topics = extractTopics(review.topics);
        const brand = review.brand || 'Unknown';

        topics.forEach(topic => {
            if (!dimensionMap.has(topic.dimension)) {
                dimensionMap.set(topic.dimension, {
                    positive: 0,
                    negative: 0,
                    neutral: 0,
                    brands: new Map()
                });
            }
            const stats = dimensionMap.get(topic.dimension)!;

            if (!stats.brands.has(brand)) {
                stats.brands.set(brand, { positive: 0, negative: 0, neutral: 0 });
            }
            const brandStats = stats.brands.get(brand)!;

            if (topic.sentiment.toLowerCase() === 'positive') {
                stats.positive++;
                brandStats.positive++;
            } else if (topic.sentiment.toLowerCase() === 'negative') {
                stats.negative++;
                brandStats.negative++;
            } else {
                stats.neutral++;
                brandStats.neutral++;
            }
        });
    });

    // Convert to array and calculate percentages
    const dimensionStats: DimensionStats[] = [];
    dimensionMap.forEach((stats, dimension) => {
        const total = stats.positive + stats.negative + stats.neutral;
        const positivePercent = total > 0 ? (stats.positive / total) * 100 : 0;
        const negativePercent = total > 0 ? (stats.negative / total) * 100 : 0;
        const neutralPercent = total > 0 ? (stats.neutral / total) * 100 : 0;
        const netSentiment = positivePercent - negativePercent;

        // Impact score: weighted by volume and sentiment strength
        const impact = (total / reviews.length) * netSentiment;

        const brandStatsObj: Record<string, {
            positive: number;
            negative: number;
            neutral: number;
            positivePercent: number;
            negativePercent: number;
            neutralPercent: number;
            netSentiment: number;
        }> = {};
        stats.brands.forEach((bStats, brandName) => {
            const bTotal = bStats.positive + bStats.negative + bStats.neutral;
            const bPosPct = bTotal > 0 ? (bStats.positive / bTotal) * 100 : 0;
            const bNegPct = bTotal > 0 ? (bStats.negative / bTotal) * 100 : 0;
            brandStatsObj[brandName] = {
                positive: bStats.positive,
                negative: bStats.negative,
                neutral: bStats.neutral,
                positivePercent: bPosPct,
                negativePercent: bNegPct,
                neutralPercent: bTotal > 0 ? (bStats.neutral / bTotal) * 100 : 0,
                netSentiment: bPosPct - bNegPct
            };
        });

        dimensionStats.push({
            dimension,
            total,
            positive: stats.positive,
            negative: stats.negative,
            neutral: stats.neutral,
            positivePercent,
            negativePercent,
            neutralPercent,
            netSentiment,
            impact,
            brandStats: brandStatsObj
        });
    });

    // Sort by impact (descending)
    return dimensionStats.sort((a, b) => b.impact - a.impact);
}

/**
 * Calculate brand-level statistics
 */
export function calculateBrandStats(reviews: ReviewData[]): BrandStats[] {
    const brandMap = new Map<string, ReviewData[]>();

    // Group reviews by brand
    reviews.forEach(review => {
        const brand = review.brand || 'Unknown';
        if (!brandMap.has(brand)) {
            brandMap.set(brand, []);
        }
        brandMap.get(brand)!.push(review);
    });

    // Calculate stats for each brand
    const brandStats: BrandStats[] = [];
    brandMap.forEach((brandReviews, brand) => {
        const totalReviews = brandReviews.length;
        const avgRating = brandReviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / totalReviews;

        const sentimentCounts = {
            positive: brandReviews.filter(r => r.sentiment?.toLowerCase() === 'positive').length,
            negative: brandReviews.filter(r => r.sentiment?.toLowerCase() === 'negative').length,
            neutral: brandReviews.filter(r => r.sentiment?.toLowerCase() === 'neutral').length,
        };

        const positivePercent = (sentimentCounts.positive / totalReviews) * 100;
        const negativePercent = (sentimentCounts.negative / totalReviews) * 100;
        const neutralPercent = (sentimentCounts.neutral / totalReviews) * 100;
        const netSentiment = positivePercent - negativePercent;

        brandStats.push({
            brand,
            reviews: totalReviews,
            avgRating,
            negativePercent,
            positivePercent,
            neutralPercent,
            netSentiment,
        });
    });

    return brandStats.sort((a, b) => b.reviews - a.reviews);
}

/**
 * Calculate sentiment trend over time (weekly)
 */
export function calculateSentimentTrend(reviews: ReviewData[]): TrendDataPoint[] {
    // Group reviews by week
    const weekMap = new Map<string, { positive: number; negative: number; neutral: number }>();

    reviews.forEach(review => {
        if (!review.date) return;

        const date = new Date(review.date);
        if (isNaN(date.getTime())) return;

        // Get week number (simplified - using ISO week)
        const weekNumber = getWeekNumber(date);
        const weekKey = `W-${weekNumber}`;

        if (!weekMap.has(weekKey)) {
            weekMap.set(weekKey, { positive: 0, negative: 0, neutral: 0 });
        }

        const weekStats = weekMap.get(weekKey)!;
        const sentiment = review.sentiment?.toLowerCase();

        if (sentiment === 'positive') weekStats.positive++;
        else if (sentiment === 'negative') weekStats.negative++;
        else weekStats.neutral++;
    });

    // Convert to array and sort by week
    const trendData: TrendDataPoint[] = [];
    weekMap.forEach((stats, week) => {
        trendData.push({
            week,
            positive: stats.positive,
            negative: stats.negative,
            neutral: stats.neutral,
        });
    });

    return trendData.sort((a, b) => {
        const weekA = parseInt(a.week.split('-')[1]);
        const weekB = parseInt(b.week.split('-')[1]);
        return weekA - weekB;
    }).slice(-12); // Last 12 weeks
}

/**
 * Get ISO week number
 */
function getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Calculate platform statistics
 */
function calculatePlatformStats(reviews: ReviewData[]): Array<{ platform: string; count: number; percentage: number }> {
    const platformMap = new Map<string, number>();
    const total = reviews.length;

    reviews.forEach(r => {
        // Group similar platforms (e.g. "App Store (US)" -> "App Store")
        let platform = r.platform || 'Unknown';
        if (platform.includes('App Store')) platform = 'App Store';
        if (platform.includes('Google Play')) platform = 'Google Play';
        if (platform.includes('Google Maps')) platform = 'Google Maps';
        if (platform.includes('Trustpilot')) platform = 'Trustpilot';

        platformMap.set(platform, (platformMap.get(platform) || 0) + 1);
    });

    const stats: Array<{ platform: string; count: number; percentage: number }> = [];
    platformMap.forEach((count, platform) => {
        stats.push({
            platform,
            count,
            percentage: total > 0 ? (count / total) * 100 : 0
        });
    });

    return stats.sort((a, b) => b.count - a.count);
}

/**
 * Process all reviews and generate complete dashboard data
 */
export function processDashboardData(reviews: ReviewData[]): DashboardData {
    const totalReviews = reviews.length;

    // Overall sentiment stats
    const sentimentCounts = {
        positive: reviews.filter(r => r.sentiment?.toLowerCase() === 'positive').length,
        negative: reviews.filter(r => r.sentiment?.toLowerCase() === 'negative').length,
        neutral: reviews.filter(r => r.sentiment?.toLowerCase() === 'neutral').length,
    };

    const positivePercent = (sentimentCounts.positive / totalReviews) * 100;
    const negativePercent = (sentimentCounts.negative / totalReviews) * 100;
    const neutralPercent = (sentimentCounts.neutral / totalReviews) * 100;
    const netSentiment = positivePercent - negativePercent;

    // Average rating
    const avgRating = reviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / totalReviews;

    // Calculate dimension stats
    const dimensionStats = calculateDimensionStats(reviews);

    // Top strengths (highest positive impact scores)
    const topStrengths = dimensionStats
        .filter(d => d.impact > 0)
        .sort((a, b) => b.impact - a.impact)
        .slice(0, 3);

    // Top weaknesses (lowest/most negative impact scores)
    const topWeaknesses = dimensionStats
        .filter(d => d.impact < 0)
        .sort((a, b) => a.impact - b.impact)
        .slice(0, 3);

    // Brand stats
    const brandStats = calculateBrandStats(reviews);

    // Sentiment trend
    const sentimentTrend = calculateSentimentTrend(reviews);

    return {
        totalReviews,
        avgRating,
        negativePercent,
        positivePercent,
        neutralPercent,
        netSentiment,
        sentimentTrend,
        brandStats,
        dimensionStats,
        topStrengths,
        topWeaknesses,
        platformStats: calculatePlatformStats(reviews),
    };
}
