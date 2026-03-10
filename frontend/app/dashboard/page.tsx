"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { ExecutiveDashboard } from "@/components/dashboard/ExecutiveDashboard";
import { OperationalDashboard } from "@/components/dashboard/OperationalDashboard";
import {
    DashboardData,
} from "@/lib/dashboard-utils";
import { Loader2, BarChart2, List, Globe } from "lucide-react";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { FilterDropdown, PlatformIcon } from "@/components/ui/FilterDropdown";
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


    return (
        <main className="min-h-screen bg-background">
            {/* Header / Navigation */}
            <header className="bg-background/80 border-b border-border sticky top-0 z-50 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
                <div className="w-full max-w-[1600px] mx-auto px-6 2xl:px-12 py-4">
                    <div className="flex items-start justify-between gap-4 mb-4">
                        <div>
                            <h1 className="text-xl font-semibold text-foreground tracking-tight">
                                VoC Intelligence
                            </h1>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Last updated: {new Date().toLocaleDateString()}
                            </p>
                        </div>
                    </div>

                    {/* Dashboard View Toggle + Filters Row */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Dashboard View Toggle */}
                        <nav className="flex items-center gap-1 bg-muted p-1 rounded-xl border border-border/60">
                            <TabButton
                                active={activeTab === 'executive'}
                                onClick={() => setActiveTab('executive')}
                                label="Executive"
                                icon={<BarChart2 className="w-3.5 h-3.5" />}
                            />
                            <TabButton
                                active={activeTab === 'operational'}
                                onClick={() => setActiveTab('operational')}
                                label="Operational"
                                icon={<List className="w-3.5 h-3.5" />}
                            />
                        </nav>

                        {/* Divider */}
                        <div className="w-px h-6 bg-border mx-1" />

                        {/* Brand Filter */}
                        {availableBrands.length > 0 && (
                            <FilterDropdown
                                multiSelect
                                placeholder="Brands"
                                allLabel="All"
                                value={selectedBrands}
                                onChange={setSelectedBrands}
                                options={availableBrands.map(b => ({ value: b, label: b }))}
                                size="sm"
                            />
                        )}

                        {/* Platform Filter */}
                        <FilterDropdown
                            value={selectedPlatform}
                            onChange={setSelectedPlatform}
                            icon={<Globe className="w-4 h-4" />}
                            options={[
                                { value: "all", label: "All Platforms", icon: <Globe className="w-4 h-4 text-muted-foreground" /> },
                                ...availablePlatforms.map(p => ({
                                    value: p,
                                    label: p,
                                    icon: <PlatformIcon platform={p} />,
                                }))
                            ]}
                            size="sm"
                        />

                        {/* Date Range Filter */}
                        <DateRangePicker
                            startDate={startDate}
                            endDate={endDate}
                            onStartChange={setStartDate}
                            onEndChange={setEndDate}
                            variant="D"
                            size="sm"
                        />

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
            <div className="w-full max-w-[1600px] mx-auto px-6 2xl:px-12 py-10">
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
                <div className="w-full max-w-[1600px] mx-auto px-6 2xl:px-12 py-8 text-center">
                    <p className="text-xs font-medium text-muted-foreground">
                        © {new Date().getFullYear()} HorusCX. All rights reserved.
                    </p>
                </div>
            </footer>
        </main>
    );
}

function TabButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon?: React.ReactNode }) {
    return (
        <button
            onClick={onClick}
            className={`
                relative flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200
                ${active
                    ? 'text-primary bg-primary/10 shadow-sm border border-primary/25 ring-1 ring-primary/10'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/70'
                }
            `}
        >
            {icon && <span>{icon}</span>}
            {label}
        </button>
    );
}

