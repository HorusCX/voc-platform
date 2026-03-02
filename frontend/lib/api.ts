import axios from 'axios';

// Create an instance processing with base URL
const api = axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL || '', // Empty string = relative path (proxied)
    headers: {
        'Content-Type': 'application/json',
    },
});

// Add a request interceptor to inject the JWT token
api.interceptors.request.use(
    (config) => {
        // Only run on the client side
        if (typeof window !== 'undefined') {
            const token = localStorage.getItem('access_token');
            if (token && config.headers) {
                config.headers['Authorization'] = `Bearer ${token}`;
            }
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Define Types
export interface WebsiteRequest {
    website: string;
}

export interface Company {
    id?: number;
    company_name?: string;
    website?: string;
    description?: string;
    android_id?: string;
    apple_id?: string;
    google_maps_links?: (string | { name: string; url: string; place_id?: string; reviews_count?: number; country?: string })[];
    trustpilot_link?: string;
    is_main?: boolean;
    portfolio_id?: number;
}

export interface Portfolio {
    id: number;
    name: string;
    created_at?: string;
    updated_at?: string;
}

export interface ScrapRequest {
    brands: Company[];
    job_id?: string;
}

export interface JobStatus {
    status: 'pending' | 'running' | 'completed' | 'failed' | 'processing' | 'error';
    message?: string;
    s3_key?: string;
    summary?: string;
    dashboard_link?: string;
    body?: unknown;
    result?: unknown;
    // New fields for analysis progress
    processed?: number;
    total?: number;
    job_id?: string;
    [key: string]: unknown;
}

export const VoCService = {
    analyzeWebsite: async (website: string) => {
        const response = await api.post<{ job_id: string; status: string }>('/api/analyze-website', { website });
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

    sendToWebhook: async (data: Record<string, unknown>) => {
        // Matches the /api/scrapped-data endpoint in main.py
        const response = await api.post('/api/scrapped-data', data);
        return response.data;
    },

    submitDimensions: async (payload: { job_id: string; dimensions: string[] } | Record<string, unknown>) => {
        const response = await api.post<{ status: string; message: string; job_id?: string }>('/api/final-analysis', payload);
        return response.data;
    },

    discoverMapsLinks: async (companyName: string, website: string, jobId?: string) => {
        const response = await api.post<{ job_id: string; status: string }>('/api/discover-maps', {
            company_name: companyName,
            website,
            job_id: jobId
        });
        return response.data;
    },

    // --- Auth & User Methods ---
    signup: async (data: Record<string, string>) => {
        const response = await api.post('/api/auth/signup', data);
        return response.data;
    },

    login: async (data: Record<string, string>) => {
        const response = await api.post<{ access_token: string; user: { id: number; email: string; role: 'free' | 'admin'; created_at: string; limits?: { max_companies: number | null; max_total_reviews: number | null; } } }>('/api/auth/login', data);
        return response.data;
    },

    getCurrentUser: async () => {
        const response = await api.get<{ id: number; email: string; role: 'free' | 'admin'; created_at: string; limits?: { max_companies: number | null; max_total_reviews: number | null; } }>('/api/auth/me');
        return response.data;
    },

    // --- Company Management Methods ---
    getCompanies: async (portfolioId?: number): Promise<Company[]> => {
        const url = portfolioId ? `/api/companies?portfolio_id=${portfolioId}` : '/api/companies';
        const response = await api.get<Company[]>(url);
        return response.data;
    },

    createCompany: async (data: Record<string, unknown>) => {
        const response = await api.post('/api/companies', data);
        return response.data;
    },

    updateCompany: async (id: number, data: Partial<Company>) => {
        const response = await api.put(`/api/companies/${id}`, data);
        return response.data;
    },

    deleteCompany: async (id: number) => {
        const response = await api.delete(`/api/companies/${id}`);
        return response.data;
    },

    // --- Dimension Management Methods ---
    getDimensions: async (portfolioId?: number) => {
        const url = portfolioId ? `/api/dimensions?portfolio_id=${portfolioId}` : '/api/dimensions';
        const response = await api.get(url);
        return response.data;
    },

    // --- Reviews Methods ---
    getReviewsPaginated: async (params: { portfolio_id?: number; page: number; page_size: number;[key: string]: unknown }) => {
        const response = await api.get('/api/user/reviews/paginated', { params });
        return response.data;
    },

    getDashboardStats: async (portfolioId?: number, brand?: string) => {
        const params: Record<string, unknown> = {};
        if (portfolioId) params.portfolio_id = portfolioId;
        if (brand) params.brand = brand;
        const response = await api.get('/api/user/dashboard-stats', { params });
        return response.data;
    },

    // --- Portfolio Management Methods ---
    getPortfolios: async (): Promise<Portfolio[]> => {
        const response = await api.get<Portfolio[]>('/api/portfolios');
        return response.data;
    },

    createPortfolio: async (name: string) => {
        const response = await api.post<Portfolio>('/api/portfolios', { name });
        return response.data;
    },

    updatePortfolio: async (id: number, name: string) => {
        const response = await api.put<Portfolio>(`/api/portfolios/${id}`, { name });
        return response.data;
    },

    deletePortfolio: async (id: number) => {
        const response = await api.delete(`/api/portfolios/${id}`);
        return response.data;
    },

    // --- Invitation Methods ---
    inviteToPortfolio: async (portfolioId: number, email: string) => {
        const response = await api.post(`/api/portfolios/${portfolioId}/invite`, { email });
        return response.data;
    },

    getInvitation: async (token: string) => {
        const response = await api.get<{ email: string; portfolio_name: string }>(`/api/invitations/${token}`);
        return response.data;
    },

    acceptInvitation: async (data: Record<string, string>) => {
        const response = await api.post('/api/invitations/accept', data);
        return response.data;
    },

    getPortfolioMembers: async (portfolioId: number) => {
        const response = await api.get<{ members: any[], invitations: any[] }>(`/api/portfolios/${portfolioId}/members`);
        return response.data;
    }
};
