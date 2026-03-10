"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ExecutiveDashboard } from "@/components/dashboard/ExecutiveDashboard";
import { OperationalDashboard } from "@/components/dashboard/OperationalDashboard";
import {
    DashboardData,
} from "@/lib/dashboard-utils";
import { Loader2 } from "lucide-react";
import { usePortfolio } from "@/contexts/PortfolioContext";
import { VoCService } from "@/lib/api";

type TabType = 'executive' | 'operational';

export default function DashboardPage() {
    const [activeTab, setActiveTab] = useState<TabType>('executive');
    const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [availableBrands, setAvailableBrands] = useState<string[]>([]);
    const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
    const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);
    const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
    const [startDate, setStartDate] = useState<string>("");
    const [endDate, setEndDate] = useState<string>("");
    const initialLoadDone = useRef(false);

    const { currentPortfolio } = usePortfolio();

    // Filter reviews by selected brands using a server-side request
    const processReviews = useCallback(async () => {
        setIsLoading(true);
        try {
            // Convert selected array to comma-separated string, unless empty
            const brandStr = selectedBrands.length > 0 && selectedBrands.length < availableBrands.length
                ? selectedBrands.join(',')
                : 'all';

            if (!currentPortfolio?.id) {
                setError("No portfolio selected.");
                setIsLoading(false);
                return;
            }

            const stats = await VoCService.getDashboardStats(
                currentPortfolio.id,
                brandStr === 'all' ? undefined : brandStr,
                selectedPlatform === 'all' ? undefined : selectedPlatform,
                startDate || undefined,
                endDate || undefined
            ) as DashboardData | null;

            if (stats && stats.brandStats) {
                // Update available brands and platforms if it's the very first load
                if (!initialLoadDone.current) {
                    const brands = stats.brandStats.map(b => b.brand).sort();
                    setAvailableBrands(brands);

                    if (stats.platformStats) {
                        setAvailablePlatforms(stats.platformStats.map(p => p.platform).sort());
                    }

                    setSelectedBrands([]); // Default to all selected
                    initialLoadDone.current = true;
                }

                setDashboardData(stats);
            } else {
                setError("No data found for this analysis.");
            }
        } catch (err) {
            console.error('API fetch failed:', err);
            setError(err instanceof Error ? err.message : "Failed to load dashboard data");
        } finally {
            setIsLoading(false);
        }
    }, [selectedBrands, availableBrands.length, currentPortfolio?.id, selectedPlatform, startDate, endDate]);

    useEffect(() => {
        processReviews();
    }, [processReviews]); // We refetch when selectedBrands or portfolio changes

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
                        </nav>
                    </div>

                    {/* Filters Row */}
                    <div className="flex flex-wrap items-center gap-2 pt-3 mt-1">
                        {/* Brand Filter */}
                        {availableBrands.length > 0 && (
                            <BrandFilter
                                availableBrands={availableBrands}
                                selectedBrands={selectedBrands}
                                onToggleBrand={toggleBrand}
                                onSelectAll={selectAllBrands}
                                onDeselectAll={deselectAllBrands}
                            />
                        )}

                        {/* Platform Filter */}
                        <div className="relative">
                            <select
                                value={selectedPlatform}
                                onChange={(e) => setSelectedPlatform(e.target.value)}
                                className="h-8 pl-3 pr-8 bg-background border border-input rounded-lg text-xs font-medium text-foreground appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-colors hover:border-primary/40 min-w-[130px]"
                            >
                                <option value="all">All Platforms</option>
                                {availablePlatforms.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                            <svg className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        </div>

                        {/* Date Range Filter */}
                        <div className="flex items-center gap-1.5 h-8 bg-background border border-input rounded-lg px-3 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50 transition-colors hover:border-primary/40">
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="bg-transparent text-xs font-medium text-foreground focus:outline-none w-28 [color-scheme:light]"
                            />
                            <span className="text-muted-foreground text-xs px-0.5">→</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="bg-transparent text-xs font-medium text-foreground focus:outline-none w-28 [color-scheme:light]"
                            />
                        </div>

                        {/* Clear Filters Button */}
                        {(selectedPlatform !== 'all' || startDate !== '' || endDate !== '' || selectedBrands.length > 0) && (
                            <button
                                onClick={() => {
                                    setSelectedPlatform('all');
                                    setStartDate('');
                                    setEndDate('');
                                    setSelectedBrands([]);
                                }}
                                className="h-8 px-3 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/5 border border-input rounded-lg transition-colors"
                            >
                                Clear filters
                            </button>
                        )}
                    </div>
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
                        <h3 className="font-semibold text-destructive mb-1">Notice</h3>
                        <p className="text-sm text-destructive/80 mb-4">{error}</p>
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

                        {!dashboardData && (
                            <div className="text-center py-32">
                                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted mb-4">
                                    <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-semibold text-foreground mb-2">No Data Available</h3>
                                <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                                    You don&apos;t have any review data yet. Please go to Companies and scrape some reviews first.
                                </p>
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
    onToggleBrand: (brand: string) => void;
    onSelectAll: () => void;
    onDeselectAll: () => void;
}

function BrandFilter({
    availableBrands,
    selectedBrands,
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

    const isAllSelected = selectedBrands.length === 0;
    const selectedCount = isAllSelected ? availableBrands.length : selectedBrands.length;

    return (
        <div className="relative brand-filter-container inline-block">
            <div className="flex items-center gap-2">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={`h-8 flex items-center gap-2 px-3 bg-background border rounded-lg transition-colors text-xs font-medium group ${isOpen ? 'border-primary/50 ring-2 ring-primary/20' : 'border-input hover:border-primary/40'}`}
                >
                    <span className="text-muted-foreground">Brands:</span>
                    <span className="text-foreground">
                        {isAllSelected ? `All` : `${selectedCount} selected`}
                    </span>
                    <svg
                        className={`w-3 h-3 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {!isAllSelected && (
                    <button
                        onClick={onSelectAll}
                        className="h-8 px-2 text-xs font-medium text-primary hover:bg-primary/5 rounded-lg transition-colors"
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
                            </label>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
