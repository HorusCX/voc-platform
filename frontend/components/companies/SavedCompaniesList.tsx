"use client";

import { useEffect, useState, useCallback } from "react";
import { Company, VoCService } from "@/lib/api";
import { Card } from "../ui/Card";
import { Loader2, Plus, Globe, Smartphone, MapPin, Star, Building2, Pencil, Trash2, RefreshCw, Clock, MessageSquare } from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { CompanyModal } from "./CompanyModal";
import { usePortfolio } from "@/contexts/PortfolioContext";

interface SavedCompaniesListProps {
    onStartNew: () => void;
}

function CompanyLogo({ company }: { company: Company }) {
    const [imgError, setImgError] = useState(false);

    if (company.logo_url && !imgError) {
        return (
            <div className="shrink-0 w-12 h-12 rounded-xl border border-border bg-white flex items-center justify-center overflow-hidden shadow-sm">
                <Image
                    src={company.logo_url}
                    alt={company.company_name || "logo"}
                    width={48}
                    height={48}
                    className="w-full h-full object-contain p-1"
                    onError={() => setImgError(true)}
                    unoptimized
                />
            </div>
        );
    }

    return (
        <div className="shrink-0 w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-lg uppercase select-none">
            {(company.company_name ?? '').charAt(0) || '?'}
        </div>
    );
}

export function SavedCompaniesList({ onStartNew }: SavedCompaniesListProps) {
    const [companies, setCompanies] = useState<Company[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);
    const [autoSyncChecked, setAutoSyncChecked] = useState(false);
    const { currentPortfolio, refreshPortfolios } = usePortfolio();

    // Derive sync state from the server-side portfolio data
    const isSyncing = currentPortfolio?.sync_status === "syncing";
    const lastSyncAt = currentPortfolio?.last_sync_at;

    // Poll server-side sync status while syncing
    useEffect(() => {
        if (!currentPortfolio?.id || !isSyncing) return;

        const interval = setInterval(async () => {
            try {
                const status = await VoCService.getSyncStatus(currentPortfolio.id);
                if (status.sync_status !== "syncing") {
                    refreshPortfolios(); // Refresh to get new sync_status and last_sync_at
                }
            } catch (err) {
                console.error("Error polling sync status:", err);
            }
        }, 5000);

        return () => clearInterval(interval);
    }, [currentPortfolio?.id, isSyncing, refreshPortfolios]);

    const handleSync = useCallback(async () => {
        if (!currentPortfolio?.id || isSyncing) return;

        try {
            await VoCService.syncPortfolio(currentPortfolio.id);
            refreshPortfolios(); // Refresh to pick up the new sync_status = "syncing"
        } catch (err) {
            console.error("Sync failed:", err);
        }
    }, [currentPortfolio?.id, isSyncing, refreshPortfolios]);

    const fetchCompanies = useCallback(async () => {
        if (!currentPortfolio?.id) {
            setCompanies([]);
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        try {
            const data = await VoCService.getCompanies(currentPortfolio.id);
            setCompanies(data);
        } catch (err) {
            console.error("Failed to fetch companies:", err);
            setError("Failed to load your saved companies.");
        } finally {
            setIsLoading(false);
        }
    }, [currentPortfolio?.id]);

    // Auto-sync logic: check once when companies finish loading
    useEffect(() => {
        if (!currentPortfolio?.id || isSyncing || isLoading || autoSyncChecked) return;
        if (companies.length === 0) return;

        setAutoSyncChecked(true);

        if (!lastSyncAt) {
            handleSync();
        } else {
            const diffInHours = (Date.now() - new Date(lastSyncAt).getTime()) / (1000 * 60 * 60);
            if (diffInHours >= 24) {
                handleSync();
            }
        }
    }, [currentPortfolio?.id, isSyncing, isLoading, companies.length, autoSyncChecked, lastSyncAt, handleSync]);

    // Reset auto-sync check when portfolio changes
    useEffect(() => {
        setAutoSyncChecked(false);
    }, [currentPortfolio?.id]);

    useEffect(() => {
        fetchCompanies();
    }, [currentPortfolio?.id, fetchCompanies]);

    const handleSaveCompany = async (companyData: Partial<Company>) => {
        try {
            if (editingCompany?.id) {
                await VoCService.updateCompany(editingCompany.id, companyData);
            } else {
                // Ensure new companies are linked to current portfolio
                const payload = { ...companyData, portfolio_id: currentPortfolio?.id };
                await VoCService.createCompany(payload);
            }
            await fetchCompanies(); // Refresh the list
        } catch (error) {
            console.error("Error saving company:", error);
            throw error; // Let the modal handle the error display
        }
    };

    const handleDelete = async (id?: number) => {
        if (!id) return;
        if (!confirm("Are you sure you want to delete this company?")) return;

        try {
            await VoCService.deleteCompany(id);
            await fetchCompanies();
        } catch (error) {
            console.error("Error deleting company:", error);
            alert("Failed to delete company.");
        }
    };

    const handleEdit = (company: Company) => {
        setEditingCompany(company);
        setIsModalOpen(true);
    };

    const handleAdd = () => {
        setEditingCompany(null);
        setIsModalOpen(true);
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="h-8 w-8 text-primary animate-spin mb-4" />
                <p className="text-muted-foreground">Loading your companies...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-10">
                <p className="text-destructive mb-4">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="text-primary hover:underline"
                >
                    Try again
                </button>
            </div>
        );
    }

    if (companies.length === 0) {
        return (
            <Card className="max-w-xl mx-auto text-center py-12 bg-muted/30 border-dashed">
                <div className="bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Building2 className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2 text-foreground">No Companies Yet</h3>
                <p className="text-muted-foreground mb-6">
                    Start your first analysis to add a company to your workspace.
                </p>
                <button
                    onClick={onStartNew}
                    className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3 px-6 rounded-full shadow-md transition-transform hover:-translate-y-0.5"
                >
                    <Plus className="h-5 w-5" />
                    Start New Analysis
                </button>
            </Card>
        );
    }

    return (
        <div className="w-full">
            <div className="flex flex-col sm:flex-row items-center justify-between mb-8 gap-4">
                <div>
                    <h2 className="text-2xl font-semibold text-foreground tracking-tight">Your Companies</h2>
                    <p className="text-muted-foreground">Select a company to analyze or generate a new report.</p>
                </div>
                <div className="flex flex-col sm:flex-row items-center sm:items-end gap-3">
                    {currentPortfolio?.last_sync_at && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1 sm:mb-2 text-right">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Last synced: {new Date(currentPortfolio.last_sync_at).toLocaleString()}</span>
                        </div>
                    )}
                    <div className="flex gap-2">
                        <button
                            onClick={handleSync}
                            disabled={isSyncing}
                            className={cn(
                                "inline-flex items-center gap-2 font-medium py-2 px-4 rounded-full border transition-all text-sm",
                                isSyncing
                                    ? "border-border text-muted-foreground cursor-not-allowed bg-muted/30"
                                    : "border-border text-foreground hover:border-primary/60 hover:text-primary hover:bg-primary/5"
                            )}
                        >
                            <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
                            {isSyncing ? "Syncing..." : "Sync Latest Reviews"}
                        </button>
                        <button
                            onClick={handleAdd}
                            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-2 px-4 rounded-full shadow-sm transition-all hover:-translate-y-0.5 text-sm"
                        >
                            <Plus className="h-4 w-4" />
                            Add Company
                        </button>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                {companies.map((company, idx) => (
                    <div
                        key={idx}
                        onClick={() => handleEdit(company)}
                        className="group bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md hover:shadow-primary/5 hover:border-primary/40 hover:-translate-y-0.5 transition-all duration-200 flex flex-col h-full relative overflow-hidden cursor-pointer"
                    >
                        {/* Status bar */}
                        <div className={cn(
                            "absolute top-0 left-0 right-0 h-1",
                            company.is_main ? "bg-primary" : "bg-muted-foreground/30"
                        )} />

                        <div className="mb-4">
                            <div className="flex items-start justify-between mb-1">
                                {/* Logo + Name */}
                                <div className="flex items-center gap-3 min-w-0">
                                    {/* Company logo avatar */}
                                    <CompanyLogo company={company} />

                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <h3 className="text-lg font-semibold text-foreground line-clamp-1" title={company.company_name}>
                                                {company.company_name}
                                            </h3>
                                            {company.is_main && (
                                                <span className="text-[10px] font-bold uppercase tracking-wider bg-primary text-primary-foreground px-2 py-0.5 rounded-full shrink-0 shadow-sm">
                                                    Main
                                                </span>
                                            )}
                                        </div>
                                        {company.website && (
                                            <a
                                                href={company.website}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-sm text-muted-foreground hover:text-primary flex items-center gap-1.5 line-clamp-1 w-fit transition-colors"
                                            >
                                                <Globe className="h-3 w-3 shrink-0" />
                                                <span className="truncate">{company.website.replace(/^https?:\/\/(www\.)?/, '')}</span>
                                            </a>
                                        )}
                                    </div>
                                </div>
                                {/* Action buttons */}
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleEdit(company); }}
                                        className="p-1.5 text-muted-foreground hover:text-primary hover:bg-muted rounded-md transition-colors"
                                        title="Edit Company"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(company.id); }}
                                        className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                        title="Delete Company"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {company.description && (
                            <p className="text-sm text-muted-foreground/80 line-clamp-2 mb-4 flex-grow">
                                {company.description}
                            </p>
                        )}

                        {/* Metrics */}
                        <div className="flex items-center gap-4 mb-4 mt-auto">
                            <div className="flex items-center gap-1.5 text-sm">
                                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="font-semibold text-foreground">{(company.review_count ?? 0).toLocaleString()}</span>
                                <span className="text-muted-foreground">reviews</span>
                            </div>
                            {company.avg_rating != null && (
                                <div className="flex items-center gap-1.5 text-sm">
                                    <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                                    <span className="font-semibold text-foreground">{company.avg_rating.toFixed(1)}</span>
                                    <span className="text-muted-foreground">avg</span>
                                </div>
                            )}
                        </div>

                        {/* Integration Badges */}
                        <div className="flex flex-wrap gap-2 pt-3 border-t border-border">
                            {company.android_id && (
                                <span className="inline-flex items-center gap-1.5 bg-green-500/10 text-green-700 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full">
                                    <Smartphone className="h-3 w-3" />
                                    Android
                                </span>
                            )}
                            {company.apple_id && (
                                <span className="inline-flex items-center gap-1.5 bg-slate-500/10 text-slate-600 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full">
                                    <Smartphone className="h-3 w-3" />
                                    iOS
                                </span>
                            )}
                            {company.google_maps_links && company.google_maps_links.length > 0 && (
                                <span className="inline-flex items-center gap-1.5 bg-rose-500/10 text-rose-600 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full">
                                    <MapPin className="h-3 w-3" />
                                    Maps
                                </span>
                            )}
                            {company.trustpilot_link && (
                                <span className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-600 text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full">
                                    <Star className="h-3 w-3" />
                                    Trustpilot
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <CompanyModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveCompany}
                initialData={editingCompany}
            />
        </div>
    );
}
