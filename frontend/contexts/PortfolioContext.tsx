'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { VoCService, Portfolio } from '@/lib/api';
import { useAuth } from './AuthContext';

interface PortfolioContextType {
    portfolios: Portfolio[];
    currentPortfolio: Portfolio | null;
    setCurrentPortfolioId: (id: number) => void;
    refreshPortfolios: () => Promise<void>;
    isLoading: boolean;
}

const PortfolioContext = createContext<PortfolioContextType | undefined>(undefined);

export function PortfolioProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
    const [currentPortfolio, setCurrentPortfolio] = useState<Portfolio | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const fetchPortfolios = useCallback(async () => {
        if (!user) return;
        setIsLoading(true);
        try {
            const data = await VoCService.getPortfolios();
            setPortfolios(data);

            // If we have portfolios and no current one is selected, pick the first
            const savedId = localStorage.getItem('last_portfolio_id');
            const found = savedId ? data.find(p => p.id === parseInt(savedId)) : null;

            if (data.length > 0) {
                setCurrentPortfolio(found || data[0]);
            } else {
                setCurrentPortfolio(null);
            }
        } catch (error) {
            console.error('Failed to fetch portfolios:', error);
        } finally {
            setIsLoading(false);
        }
    }, [user]);

    useEffect(() => {
        if (user) {
            fetchPortfolios();
        } else {
            setPortfolios([]);
            setCurrentPortfolio(null);
        }
    }, [user, fetchPortfolios]);

    const setCurrentPortfolioId = (id: number) => {
        const portfolio = portfolios.find(p => p.id === id);
        if (portfolio) {
            setCurrentPortfolio(portfolio);
            localStorage.setItem('last_portfolio_id', id.toString());
        }
    };

    return (
        <PortfolioContext.Provider value={{
            portfolios,
            currentPortfolio,
            setCurrentPortfolioId,
            refreshPortfolios: fetchPortfolios,
            isLoading
        }}>
            {children}
        </PortfolioContext.Provider>
    );
}

export function usePortfolio() {
    const context = useContext(PortfolioContext);
    if (context === undefined) {
        throw new Error('usePortfolio must be used within a PortfolioProvider');
    }
    return context;
}
