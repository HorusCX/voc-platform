"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { VoCService } from '@/lib/api';

export interface User {
    id: number;
    email: string;
    role: 'free' | 'admin';
    created_at: string;
    limits?: {
        max_companies: number | null;
        max_total_reviews: number | null;
    };
}

interface AuthContextType {
    user: User | null;
    isLoading: boolean;
    login: (token: string, userData: User) => void;
    logout: () => void;
    refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    isLoading: true,
    login: () => { },
    logout: () => { },
    refreshUser: async () => { },
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Run on mount to check if user has a token in localStorage
        const initAuth = async () => {
            const token = localStorage.getItem('access_token');
            if (token) {
                try {
                    const userData = await VoCService.getCurrentUser();
                    setUser(userData);
                } catch (error) {
                    console.error("Failed to restore session:", error);
                    localStorage.removeItem('access_token');
                }
            }
            setIsLoading(false);
        };

        initAuth();
    }, []);

    const login = (token: string, userData: User) => {
        localStorage.setItem('access_token', token);
        setUser(userData);
    };

    const logout = () => {
        localStorage.removeItem('access_token');
        setUser(null);
    };

    const refreshUser = async () => {
        try {
            const userData = await VoCService.getCurrentUser();
            setUser(userData);
        } catch (error) {
            console.error("Failed to refresh user:", error);
            logout();
        }
    };

    return (
        <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
