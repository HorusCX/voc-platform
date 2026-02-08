import axios from 'axios';

// Create an instance processing with base URL
const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || '', // Empty string = relative path (proxied)
    headers: {
        'Content-Type': 'application/json',
    },
});

// Define Types
export interface WebsiteRequest {
    website: string;
}

export interface Company {
    company_name?: string;
    website?: string;
    description?: string;
    android_id?: string;
    apple_id?: string;
    google_maps_links?: (string | { name: string; url: string; place_id?: string; reviews_count?: number })[];
    is_main?: boolean;
}

export interface ScrapRequest {
    brands: Company[];
    job_id?: string;
}

export interface JobStatus {
    status: 'pending' | 'running' | 'completed' | 'failed';
    message: string;
    s3_key?: string;
    summary?: string;
    dashboard_link?: string;
    body?: any;
    result?: any;
}

export const VoCService = {
    analyzeWebsite: async (website: string) => {
        const response = await api.post<Company[]>('/api/analyze-website', { website });
        return response.data;
    },

    resolveAppIds: async (companies: Company[]) => {
        const response = await api.post<Company[]>('/api/appids', companies);
        return response.data;
    },

    startScraping: async (data: ScrapRequest) => {
        const response = await api.post<{ message: string; job_id: string }>('/api/scrap-reviews', data);
        return response.data;
    },

    checkStatus: async (jobId: string) => {
        const response = await api.get<JobStatus>(`/api/check-status?job_id=${jobId}`);
        return response.data;
    },

    sendToWebhook: async (data: any) => {
        // Matches the /api/scrapped-data endpoint in main.py
        const response = await api.post('/api/scrapped-data', data);
        return response.data;
    },

    submitDimensions: async (payload: any) => {
        const response = await api.post('/api/final-analysis', payload);
        return response.data;
    },

    discoverMapsLinks: async (companyName: string, website: string) => {
        const response = await api.post<{ links?: string[]; locations?: Array<{ place_id: string; name: string; url: string }> }>('/api/discover-maps', { company_name: companyName, website });
        return response.data;
    }
};
