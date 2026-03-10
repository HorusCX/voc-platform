"use client";

import { Globe } from "lucide-react";
import { FilterDropdown, PlatformIcon } from "@/components/ui/FilterDropdown";
import { DateRangePicker } from "@/components/ui/DateRangePicker";

interface FiltersBarProps {
    // Brand filter
    availableBrands: string[];
    selectedBrands: string[];
    onBrandsChange: (brands: string[]) => void;

    // Platform filter
    availablePlatforms: string[];
    selectedPlatform: string;
    onPlatformChange: (platform: string) => void;

    // Date range
    startDate: string;
    endDate: string;
    onStartDateChange: (date: string) => void;
    onEndDateChange: (date: string) => void;

    size?: "sm" | "md";
}

export function FiltersBar({
    availableBrands,
    selectedBrands,
    onBrandsChange,
    availablePlatforms,
    selectedPlatform,
    onPlatformChange,
    startDate,
    endDate,
    onStartDateChange,
    onEndDateChange,
    size = "sm",
}: FiltersBarProps) {
    const hasActiveFilters =
        selectedBrands.length > 0 ||
        selectedPlatform !== "all" ||
        startDate !== "" ||
        endDate !== "";

    return (
        <>
            {/* Brand Filter */}
            {availableBrands.length > 0 && (
                <FilterDropdown
                    multiSelect
                    placeholder="Brands"
                    allLabel="All"
                    value={selectedBrands}
                    onChange={onBrandsChange}
                    options={availableBrands.map(b => ({ value: b, label: b }))}
                    size={size}
                />
            )}

            {/* Platform Filter */}
            <FilterDropdown
                value={selectedPlatform}
                onChange={onPlatformChange}
                icon={<Globe className="w-4 h-4" />}
                options={[
                    { value: "all", label: "All Platforms", icon: <Globe className="w-4 h-4 text-muted-foreground" /> },
                    ...availablePlatforms.map(p => ({
                        value: p,
                        label: p,
                        icon: <PlatformIcon platform={p} />,
                    })),
                ]}
                size={size}
            />

            {/* Date Range Filter */}
            <DateRangePicker
                startDate={startDate}
                endDate={endDate}
                onStartChange={onStartDateChange}
                onEndChange={onEndDateChange}
                variant="D"
                size={size}
            />

            {/* Clear Filters */}
            {hasActiveFilters && (
                <button
                    onClick={() => {
                        onBrandsChange([]);
                        onPlatformChange("all");
                        onStartDateChange("");
                        onEndDateChange("");
                    }}
                    className="h-8 px-3 text-xs font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/5 border border-input rounded-lg transition-colors"
                >
                    Clear filters
                </button>
            )}
        </>
    );
}
