"use client";

import { useState, useEffect, useCallback } from "react";
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

type TabType = 'executive' | 'operational' | 'data';

export default function DashboardPage() {
    const [activeTab, setActiveTab] = useState<TabType>('data');
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [allReviews, setAllReviews] = useState<ReviewData[]>([]);
    const [availableBrands, setAvailableBrands] = useState<string[]>([]);
    const [selectedBrands, setSelectedBrands] = useState<string[]>([]);

    const processReviews = useCallback((reviews: ReviewData[]) => {
        // Filter reviews by selected brands
        const filteredReviews = selectedBrands.length > 0
            ? reviews.filter(r => selectedBrands.includes(r.brand))
            : reviews;

        const processedData = processDashboardData(filteredReviews);
        setDashboardData(processedData);
    }, [selectedBrands]);

    const loadDataFromUrl = useCallback(async (url: string) => {
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
            setActiveTab('executive');
        } catch (err) {
            console.error('Error loading data:', err);
            setError(err instanceof Error ? err.message : 'Failed to load data');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Check for URL parameter on mount
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const csvUrl = params.get('csv_url');
        const jobId = params.get('job_id');

        if (csvUrl) {
            loadDataFromUrl(csvUrl);
        } else if (jobId) {
            // New Logic: Check status to get fresh URL
            const checkJobStatus = async () => {
                setIsLoading(true);
                try {
                    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
                    const res = await fetch(`${apiUrl}/api/check-status?job_id=${jobId}`);
                    if (!res.ok) throw new Error("Failed to check job status");

                    const data = await res.json();
                    if (data.csv_download_url) {
                        loadDataFromUrl(data.csv_download_url);
                    } else if (data.status === 'completed' && data.s3_key) {
                        // If for some reason url is missing but key exists
                        setError("Analysis found but download link missing. Please try again.");
                        setIsLoading(false);
                    } else if (data.status === 'error') {
                        throw new Error(data.message || "Analysis failed");
                    } else {
                        // Still processing?
                        setError(`Analysis status: ${data.status}. Please refresh shortly.`);
                        setIsLoading(false);
                    }
                } catch (e) {
                    console.error("Error fetching job:", e);
                    setError(e instanceof Error ? e.message : "Failed to load analysis");
                    setIsLoading(false);
                }
            };
            checkJobStatus();
        }
    }, [loadDataFromUrl]);

    // Reprocess data when brand filter changes
    useEffect(() => {
        if (allReviews.length > 0) {
            processReviews(allReviews);
        }
    }, [selectedBrands, allReviews, processReviews]);

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
        <main className="min-h-screen bg-background">
            {/* Header / Navigation */}
            <header className="bg-background/80 border-b border-border sticky top-0 z-50 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
                <div className="max-w-7xl mx-auto px-6 py-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
                        <div>
                            <h1 className="text-xl font-semibold text-foreground tracking-tight">
                                VoC Intelligence
                            </h1>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Last updated: {new Date().toLocaleDateString()}
                            </p>
                        </div>

                        {/* Tab Navigation */}
                        <nav className="flex items-center gap-1 bg-muted p-1 rounded-lg self-start md:self-auto">
                            <TabButton
                                active={activeTab === 'executive'}
                                onClick={() => setActiveTab('executive')}
                                label="Executive"
                            />
                            <TabButton
                                active={activeTab === 'operational'}
                                onClick={() => setActiveTab('operational')}
                                label="Operational"
                            />
                            <TabButton
                                active={activeTab === 'data'}
                                onClick={() => setActiveTab('data')}
                                label="Data Source"
                            />
                        </nav>
                    </div>

                    {/* Brand Filter */}
                    {availableBrands.length > 0 && (
                        <div className="pt-3 mt-1">
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
            <div className="max-w-7xl mx-auto px-6 py-10">
                {isLoading && (
                    <div className="flex flex-col items-center justify-center py-32 animate-in fade-in duration-500">
                        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin mb-4" />
                        <p className="text-sm font-medium text-muted-foreground">Processing insights...</p>
                    </div>
                )}

                {error && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-6 mb-6 max-w-lg mx-auto text-center">
                        <h3 className="font-semibold text-destructive mb-1">Unable to Load Data</h3>
                        <p className="text-sm text-destructive/80 mb-4">{error}</p>
                        <button
                            onClick={() => setActiveTab('data')}
                            className="text-xs font-medium bg-background border border-destructive/30 text-destructive px-4 py-2 rounded-lg hover:bg-destructive/5 transition-colors shadow-sm"
                        >
                            Try uploading again
                        </button>
                    </div>
                )}

                {!isLoading && !error && (
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {activeTab === 'executive' && dashboardData && (
                            <ExecutiveDashboard data={dashboardData} />
                        )}

                        {activeTab === 'operational' && dashboardData && (
                            <OperationalDashboard data={dashboardData} />
                        )}

                        {activeTab === 'data' && (
                            <div className="max-w-2xl mx-auto">
                                <UploadData onDataLoaded={loadDataFromUrl} />
                            </div>
                        )}

                        {!dashboardData && activeTab !== 'data' && (
                            <div className="text-center py-32">
                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
                                    <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-semibold text-foreground mb-2">No Data Available</h3>
                                <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                                    Upload a CSV file or provide an S3 URL to generate the dashboard.
                                </p>
                                <button
                                    onClick={() => setActiveTab('data')}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium py-2.5 px-6 rounded-lg transition-colors shadow-sm"
                                >
                                    Upload Data
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer */}
            <footer className="border-t border-border mt-auto bg-card">
                <div className="max-w-7xl mx-auto px-6 py-8 text-center">
                    <p className="text-xs font-medium text-muted-foreground">
                        © {new Date().getFullYear()} HorusCX. All rights reserved.
                    </p>
                </div>
            </footer>
        </main>
    );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
    return (
        <button
            onClick={onClick}
            className={`
                relative px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-200
                ${active
                    ? 'text-foreground bg-background shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                }
            `}
        >
            {label}
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
        <div className="relative brand-filter-container inline-block">
            <div className="flex items-center gap-3">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-background border border-dashed border-input rounded-md hover:border-ring/50 hover:bg-accent transition-colors text-xs font-medium text-muted-foreground group"
                >
                    <span className="text-muted-foreground">Filter:</span>
                    <span className="text-foreground">
                        {isAllSelected
                            ? `All Brands`
                            : `${selectedCount} Selected`}
                    </span>
                    <svg
                        className={`w-3.5 h-3.5 text-muted-foreground transition-transform group-hover:text-foreground ${isOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {!isAllSelected && (
                    <button
                        onClick={onSelectAll}
                        className="text-xs text-muted-foreground hover:text-foreground font-medium transition-colors"
                    >
                        Reset
                    </button>
                )}
            </div>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-2 bg-popover border border-border rounded-xl shadow-lg shadow-black/5 z-50 w-64 max-h-[400px] overflow-y-auto p-1.5">
                    <div className="px-2 py-1.5 border-b border-border mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Brands</span>
                        <div className="flex gap-2">
                            <button
                                onClick={onSelectAll}
                                className="text-[10px] bg-accent hover:bg-accent/80 text-accent-foreground px-2 py-0.5 rounded border border-input transition-colors"
                            >
                                All
                            </button>
                            <button
                                onClick={onDeselectAll}
                                className="text-[10px] hover:bg-accent text-muted-foreground hover:text-accent-foreground px-2 py-0.5 rounded transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                    {availableBrands.map((brand) => {
                        const isSelected = isAllSelected || selectedBrands.includes(brand);
                        return (
                            <label
                                key={brand}
                                className={`flex items-center gap-3 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-accent' : 'hover:bg-accent'
                                    }`}
                            >
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-primary border-primary' : 'border-input bg-background'
                                    }`}>
                                    {isSelected && (
                                        <svg className="w-2.5 h-2.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </div>
                                <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => onToggleBrand(brand)}
                                    className="hidden"
                                />
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
                                        {brand}
                                    </p>
                                </div>
                                <span className="text-xs text-muted-foreground font-mono">
                                    {brandCounts[brand]}
                                </span>
                            </label>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
