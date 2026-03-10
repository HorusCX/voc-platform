"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Check, ChevronDown, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterOption {
    value: string;
    label: string;
    icon?: React.ReactNode;
    count?: number;
}

// ─── Single-select ────────────────────────────────────────────────────────────
interface SingleSelectProps {
    multiSelect?: false;
    value: string;
    onChange: (value: string) => void;
    options: FilterOption[];
    placeholder?: string;
    icon?: React.ReactNode;
    size?: "sm" | "md";
    className?: string;
    searchable?: boolean;
}

// ─── Multi-select ─────────────────────────────────────────────────────────────
interface MultiSelectProps {
    multiSelect: true;
    value: string[];
    onChange: (value: string[]) => void;
    options: FilterOption[];
    placeholder?: string;
    allLabel?: string;
    icon?: React.ReactNode;
    size?: "sm" | "md";
    className?: string;
    searchable?: boolean;
}

type FilterDropdownProps = SingleSelectProps | MultiSelectProps;

export function FilterDropdown(props: FilterDropdownProps) {
    const {
        options,
        placeholder = "Select...",
        icon,
        size = "md",
        className,
        searchable = true,
    } = props;

    const [isOpen, setIsOpen] = useState(false);
    const [search, setSearch] = useState("");
    const containerRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
                setSearch("");
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    // Focus search when opening
    useEffect(() => {
        if (isOpen && searchable) {
            setTimeout(() => searchRef.current?.focus(), 50);
        }
    }, [isOpen, searchable]);

    const filtered = options.filter(o =>
        o.label.toLowerCase().includes(search.toLowerCase())
    );

    const h = size === "sm" ? "h-8 text-xs" : "h-9 text-sm";
    const isMulti = props.multiSelect === true;

    // Determine trigger label
    let triggerLabel: string;
    let triggerIcon: React.ReactNode = icon;

    if (isMulti) {
        const p = props as MultiSelectProps;
        const allLabel = p.allLabel ?? "All";
        const isAllSelected = p.value.length === 0;
        triggerLabel = isAllSelected
            ? `${placeholder}: ${allLabel}`
            : `${placeholder}: ${p.value.length} selected`;
    } else {
        const p = props as SingleSelectProps;
        const selected = options.find(o => o.value === p.value);
        triggerLabel = selected ? selected.label : placeholder;
        if (selected?.icon) triggerIcon = selected.icon;
    }

    const handleSingleSelect = (value: string) => {
        if (!isMulti) {
            (props as SingleSelectProps).onChange(value);
            setIsOpen(false);
            setSearch("");
        }
    };

    const handleMultiToggle = (value: string) => {
        if (!isMulti) return;
        const p = props as MultiSelectProps;
        const allValues = options.map(o => o.value);
        // "all" option → reset to empty (= all selected)
        if (value === "__all__") {
            p.onChange([]);
            return;
        }
        const isAllSelected = p.value.length === 0;
        const current = isAllSelected ? allValues : [...p.value];
        const next = current.includes(value)
            ? current.filter(v => v !== value)
            : [...current, value];
        // If everything is selected, store empty to mean "all"
        p.onChange(next.length === allValues.length ? [] : next);
    };

    return (
        <div ref={containerRef} className={cn("relative inline-block", className)}>
            {/* Trigger */}
            <button
                type="button"
                onClick={() => setIsOpen(prev => !prev)}
                className={cn(
                    "flex items-center gap-2 px-3 bg-background border rounded-xl font-medium transition-all",
                    h,
                    isOpen
                        ? "border-primary/60 ring-2 ring-primary/15 text-foreground"
                        : "border-input hover:border-primary/40 text-foreground"
                )}
            >
                {triggerIcon && <span className="text-muted-foreground shrink-0">{triggerIcon}</span>}
                <span className="truncate max-w-[160px]">{triggerLabel}</span>
                <ChevronDown
                    className={cn(
                        "h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform duration-200",
                        isOpen && "rotate-180"
                    )}
                />
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div className="absolute top-full left-0 mt-1.5 z-50 w-60 bg-popover border border-border rounded-xl shadow-xl shadow-black/10 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
                    {/* Search */}
                    {searchable && (
                        <div className="p-2 border-b border-border">
                            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-background border border-border rounded-lg">
                                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <input
                                    ref={searchRef}
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search..."
                                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 text-foreground"
                                />
                            </div>
                        </div>
                    )}

                    {/* Multi-select header */}
                    {isMulti && !search && (
                        <div className="px-2 pt-2">
                            {(() => {
                                const p = props as MultiSelectProps;
                                const isAllSelected = p.value.length === 0;
                                return (
                                    <button
                                        onClick={() => handleMultiToggle("__all__")}
                                        className={cn(
                                            "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-sm",
                                            isAllSelected
                                                ? "bg-primary/10 text-primary font-medium"
                                                : "hover:bg-muted text-muted-foreground"
                                        )}
                                    >
                                        <div className={cn(
                                            "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                                            isAllSelected ? "bg-primary border-primary" : "border-input"
                                        )}>
                                            {isAllSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />}
                                        </div>
                                        <span>{p.allLabel ?? "All"}</span>
                                        <span className="ml-auto text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md">
                                            {options.length}
                                        </span>
                                    </button>
                                );
                            })()}
                            <div className="h-px bg-border my-1.5 mx-1" />
                        </div>
                    )}

                    {/* Options List */}
                    <div className={cn("overflow-y-auto px-2 py-2", isMulti && !search ? "pt-0" : "")}>
                        {filtered.length === 0 ? (
                            <p className="text-xs text-muted-foreground text-center py-4">No results</p>
                        ) : (
                            filtered.map(option => {
                                const isSelected = isMulti
                                    ? ((props as MultiSelectProps).value.length === 0 || (props as MultiSelectProps).value.includes(option.value))
                                    : (props as SingleSelectProps).value === option.value;

                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => isMulti ? handleMultiToggle(option.value) : handleSingleSelect(option.value)}
                                        className={cn(
                                            "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-sm text-left",
                                            isSelected && !isMulti
                                                ? "bg-primary/8 text-primary font-medium"
                                                : "hover:bg-muted text-foreground"
                                        )}
                                    >
                                        {/* Icon or multi-checkbox */}
                                        {isMulti ? (
                                            <div className={cn(
                                                "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                                                isSelected ? "bg-primary border-primary" : "border-input bg-background"
                                            )}>
                                                {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground" strokeWidth={3} />}
                                            </div>
                                        ) : option.icon ? (
                                            <span className="text-base leading-none shrink-0">{option.icon}</span>
                                        ) : null}

                                        <span className="flex-1 truncate">{option.label}</span>

                                        {/* Single select checkmark */}
                                        {!isMulti && isSelected && (
                                            <Check className="h-3.5 w-3.5 text-primary shrink-0" strokeWidth={2.5} />
                                        )}

                                        {/* Count badge */}
                                        {option.count !== undefined && (
                                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-md shrink-0">
                                                {option.count}
                                            </span>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Platform icons ────────────────────────────────────────────────────────────
export function PlatformIcon({ platform }: { platform: string }) {
    switch (platform.toLowerCase()) {
        case "app store":
            return (
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-[#0D96F6]">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                </svg>
            );
        case "google play":
            return (
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-[#34A853]">
                    <path d="M3.18 23.76c.3.17.64.22.97.14l11.4-11.4-2.54-2.54-9.83 13.8zM.5 1.1C.19 1.45 0 1.97 0 2.64v18.72c0 .67.19 1.19.5 1.54l.08.07L10.97 12.5v-.28L.58 1.03.5 1.1zm19.77 10.64L17.5 10l-2.75 2.75 2.75 2.75 2.78-1.74c.79-.49.79-1.29 0-1.78zm-8.22 8.51L.98 23.9c.33.09.69.05 1-.15l10.07-10.07-2.54-2.54 2.54 2.11z" />
                </svg>
            );
        case "google maps":
            return (
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-[#EA4335]">
                    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
            );
        default:
            return <Globe className="w-4 h-4 text-muted-foreground" />;
    }
}
