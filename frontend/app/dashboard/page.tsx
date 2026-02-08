"use client";

import { useState, useEffect } from "react";
import { ExecutiveDashboard } from "@/components/dashboard/ExecutiveDashboard";
import { OperationalDashboard } from "@/components/dashboard/OperationalDashboard";
import { UploadData } from "@/components/dashboard/UploadData";
import {
    parseCSVFromURL,
    processDashboardData,
    DashboardData,
    ReviewData
} from "@/lib/dashboard-utils";
import { Loader2 } from "lucide-react";

type TabType = 'executive' | 'operational' | 'upload';

export default function DashboardPage() {
    const [activeTab, setActiveTab] = useState<TabType>('upload');
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<string>('');
    const [allReviews, setAllReviews] = useState<ReviewData[]>([]);
    const [availableBrands, setAvailableBrands] = useState<string[]>([]);
    const [selectedBrands, setSelectedBrands] = useState<string[]>([]);

    // Check for URL parameter on mount
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const csvUrl = params.get('csv_url');
        if (csvUrl) {
            loadDataFromUrl(csvUrl);
        }
    }, []);

    // Reprocess data when brand filter changes
    useEffect(() => {
        if (allReviews.length > 0) {
            processReviews(allReviews);
        }
    }, [selectedBrands, allReviews]);

    const loadDataFromUrl = async (url: string) => {
        setIsLoading(true);
        setError(null);

        try {
            const reviews: ReviewData[] = await parseCSVFromURL(url);

            if (!reviews || reviews.length === 0) {
                throw new Error('No data found in CSV file');
            }

            // Extract unique brands
            const brands = [...new Set(reviews.map(r => r.brand))].filter(Boolean).sort();
            setAvailableBrands(brands);
            setSelectedBrands([]); // Start with all brands (empty = all)
            setAllReviews(reviews);

            // Process initial data
            const processedData = processDashboardData(reviews);
            setDashboardData(processedData);
            setLastUpdated(new Date().toLocaleDateString('en-US', {
                month: 'numeric',
                day: 'numeric',
                year: 'numeric'
            }));
            setActiveTab('executive');
        } catch (err) {
            console.error('Error loading data:', err);
            setError(err instanceof Error ? err.message : 'Failed to load data');
        } finally {
            setIsLoading(false);
        }
    };

    const processReviews = (reviews: ReviewData[]) => {
        // Filter reviews by selected brands
        const filteredReviews = selectedBrands.length > 0
            ? reviews.filter(r => selectedBrands.includes(r.brand))
            : reviews;

        const processedData = processDashboardData(filteredReviews);
        setDashboardData(processedData);
    };

    const toggleBrand = (brand: string) => {
        setSelectedBrands(prev =>
            prev.includes(brand)
                ? prev.filter(b => b !== brand)
                : [...prev, brand]
        );
    };

    const selectAllBrands = () => {
        setSelectedBrands([]);
    };

    const deselectAllBrands = () => {
        setSelectedBrands(availableBrands.length > 0 ? [availableBrands[0]] : []);
    };

    return (
        <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-800">
                                CALO VOICE OF CUSTOMER
                            </h1>
                            {lastUpdated && (
                                <p className="text-sm text-slate-500 mt-1">
                                    Last Updated: {lastUpdated}
                                </p>
                            )}
                        </div>

                        {/* Tab Navigation */}
                        <nav className="flex gap-2">
                            <TabButton
                                active={activeTab === 'executive'}
                                onClick={() => setActiveTab('executive')}
                                disabled={!dashboardData}
                            >
                                Executive
                            </TabButton>
                            <TabButton
                                active={activeTab === 'operational'}
                                onClick={() => setActiveTab('operational')}
                                disabled={!dashboardData}
                            >
                                Operational
                            </TabButton>
                            <TabButton
                                active={activeTab === 'upload'}
                                onClick={() => setActiveTab('upload')}
                            >
                                Upload Data
                            </TabButton>
                        </nav>
                    </div>

                    {/* Brand Filter */}
                    {availableBrands.length > 0 && (
                        <div className="border-t border-slate-200 pt-4">
                            <BrandFilter
                                availableBrands={availableBrands}
                                selectedBrands={selectedBrands}
                                allReviews={allReviews}
                                onToggleBrand={toggleBrand}
                                onSelectAll={selectAllBrands}
                                onDeselectAll={deselectAllBrands}
                            />
                        </div>
                    )}
                </div>
            </header>

            {/* Content */}
            <div className="max-w-7xl mx-auto px-4 py-8">
                {isLoading && (
                    <div className="flex items-center justify-center py-24">
                        <div className="text-center">
                            <Loader2 className="h-12 w-12 text-teal-500 animate-spin mx-auto mb-4" />
                            <p className="text-lg font-semibold text-slate-700">Loading dashboard data...</p>
                            <p className="text-sm text-slate-500 mt-2">This may take a few moments</p>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
                        <h3 className="font-bold text-red-900 mb-2">❌ Error Loading Data</h3>
                        <p className="text-red-800">{error}</p>
                        <button
                            onClick={() => setActiveTab('upload')}
                            className="mt-4 text-sm text-red-700 underline hover:text-red-900"
                        >
                            Try uploading again
                        </button>
                    </div>
                )}

                {!isLoading && !error && (
                    <>
                        {activeTab === 'executive' && dashboardData && (
                            <ExecutiveDashboard data={dashboardData} />
                        )}

                        {activeTab === 'operational' && dashboardData && (
                            <OperationalDashboard data={dashboardData} />
                        )}

                        {activeTab === 'upload' && (
                            <UploadData onDataLoaded={loadDataFromUrl} />
                        )}

                        {!dashboardData && activeTab !== 'upload' && (
                            <div className="text-center py-24">
                                <p className="text-lg font-semibold text-slate-700 mb-2">
                                    No data loaded yet
                                </p>
                                <p className="text-sm text-slate-500 mb-6">
                                    Please upload a CSV file or provide an S3 URL to view the dashboard
                                </p>
                                <button
                                    onClick={() => setActiveTab('upload')}
                                    className="bg-teal-500 hover:bg-teal-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
                                >
                                    Upload Data
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Footer */}
            <footer className="bg-white border-t border-slate-200 mt-16">
                <div className="max-w-7xl mx-auto px-4 py-6 text-center">
                    <p className="text-xs text-slate-400">
                        © 2026 HorusCX. All rights reserved.
                    </p>
                </div>
            </footer>
        </main>
    );
}

interface TabButtonProps {
    active: boolean;
    onClick: () => void;
    disabled?: boolean;
    children: React.ReactNode;
}

function TabButton({ active, onClick, disabled = false, children }: TabButtonProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`px-6 py-2 font-semibold rounded-lg transition-all ${active
                ? 'bg-teal-500 text-white shadow-md'
                : disabled
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
        >
            {children}
        </button>
    );
}

interface BrandFilterProps {
    availableBrands: string[];
    selectedBrands: string[];
    allReviews: ReviewData[];
    onToggleBrand: (brand: string) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
}

function BrandFilter({
    availableBrands,
    selectedBrands,
    allReviews,
    onToggleBrand,
    onSelectAll,
    onDeselectAll
}: BrandFilterProps) {
    const [isOpen, setIsOpen] = useState(false);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (isOpen && !target.closest('.brand-filter-container')) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    // Calculate review counts per brand
    const brandCounts = availableBrands.reduce((acc, brand) => {
        acc[brand] = allReviews.filter(r => r.brand === brand).length;
        return acc;
    }, {} as Record<string, number>);

    const isAllSelected = selectedBrands.length === 0;
    const selectedCount = isAllSelected ? availableBrands.length : selectedBrands.length;

    return (
        <div className="relative brand-filter-container">
            <div className="flex items-center gap-4">
                <label className="text-sm font-bold text-slate-700">Filter by Brand:</label>

                {/* Dropdown Button */}
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium text-slate-700"
                >
                    <span>
                        {isAllSelected
                            ? `All Brands (${availableBrands.length})`
                            : `${selectedCount} Brand${selectedCount !== 1 ? 's' : ''} Selected`}
                    </span>
                    <svg
                        className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {/* Quick Actions */}
                <div className="flex gap-2">
                    <button
                        onClick={onSelectAll}
                        className="text-xs text-teal-600 hover:text-teal-700 font-semibold underline"
                    >
                        Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                        onClick={onDeselectAll}
                        className="text-xs text-slate-600 hover:text-slate-700 font-semibold underline"
                    >
                        Clear
                    </button>
                </div>
            </div>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[300px] max-h-[400px] overflow-y-auto">
                    <div className="p-2">
                        {availableBrands.map((brand) => {
                            const isSelected = isAllSelected || selectedBrands.includes(brand);
                            return (
                                <label
                                    key={brand}
                                    className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 rounded-md cursor-pointer transition-colors"
                                >
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => onToggleBrand(brand)}
                                        className="w-4 h-4 text-teal-500 border-slate-300 rounded focus:ring-teal-500"
                                    />
                                    <span className="flex-1 text-sm font-medium text-slate-700">
                                        {brand}
                                    </span>
                                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                                        {brandCounts[brand]} reviews
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
