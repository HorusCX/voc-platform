"use client";

import { useState, useEffect } from "react";
import { ReviewData, fetchPaginatedUserReviewsFromAPI, fetchDashboardStatsFromAPI } from "@/lib/dashboard-utils";
import UserMenu from "@/components/auth/UserMenu";
import { Loader2, Search, ArrowUpDown, ChevronDown, FilterX } from "lucide-react";
import { usePortfolio } from "@/contexts/PortfolioContext";

type SortField = 'date' | 'rating' | 'brand' | 'platform' | 'sentiment';
type SortOrder = 'asc' | 'desc';

export default function ReviewsPage() {
    const [reviews, setReviews] = useState<ReviewData[]>([]);
    const [totalReviews, setTotalReviews] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [availableBrands, setAvailableBrands] = useState<string[]>([]);
    const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Sorting state
    const [sortField, setSortField] = useState<SortField>('date');
    const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

    // Filter state
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedBrand, setSelectedBrand] = useState<string>("all");
    const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
    const [startDate, setStartDate] = useState<string>("");
    const [endDate, setEndDate] = useState<string>("");

    // Modal state
    const [selectedReview, setSelectedReview] = useState<ReviewData | null>(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const { currentPortfolio } = usePortfolio();

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

    // Reset pagination to page 1 whenever filters or sorting change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, selectedBrand, selectedPlatform, startDate, endDate, sortField, sortOrder]);

    useEffect(() => {
        async function fetchBrands() {
            if (!currentPortfolio?.id) return;
            try {
                // Fetch stats which is much lighter, just to extract available brands and platforms
                const stats = await fetchDashboardStatsFromAPI(undefined, undefined, currentPortfolio.id);
                if (stats) {
                    if (stats.brandStats) {
                        setAvailableBrands(stats.brandStats.map(b => b.brand).sort());
                    }
                    if (stats.platformStats) {
                        setAvailablePlatforms(stats.platformStats.map(p => p.platform).sort());
                    }
                }
            } catch (err) {
                console.error("Failed to load brands:", err);
            }
        }
        fetchBrands();
    }, [currentPortfolio?.id]);

    useEffect(() => {
        const timeoutId = setTimeout(async () => {
            setIsLoading(true);
            try {
                if (!currentPortfolio?.id) {
                    setReviews([]);
                    setTotalPages(1);
                    setTotalReviews(0);
                    setIsLoading(false);
                    return;
                }
                const data = await fetchPaginatedUserReviewsFromAPI({
                    portfolio_id: currentPortfolio.id,
                    page: currentPage,
                    page_size: itemsPerPage,
                    sort_field: sortField,
                    sort_order: sortOrder,
                    search: searchQuery,
                    brand: selectedBrand,
                    platform: selectedPlatform,
                    start_date: startDate,
                    end_date: endDate
                });
                setReviews(data.items);
                setTotalPages(data.total_pages);
                setTotalReviews(data.total);
            } catch (err) {
                console.error("Failed to load reviews:", err);
                setError("Failed to load your reviews. Please try again later.");
            } finally {
                setIsLoading(false);
            }
        }, 300); // 300ms debounce

        return () => clearTimeout(timeoutId);
    }, [currentPage, itemsPerPage, sortField, sortOrder, searchQuery, selectedBrand, selectedPlatform, startDate, endDate, currentPortfolio?.id]);

    // Handle sort click
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortOrder('desc'); // Default new field to desc
        }
    };

    // Memoize the filtered reviews out; backend handles it now.

    const clearFilters = () => {
        setSearchQuery("");
        setSelectedBrand("all");
        setSelectedPlatform("all");
        setStartDate("");
        setEndDate("");
    };

    const openReviewModal = (review: ReviewData) => {
        setSelectedReview(review);
        setIsModalOpen(true);
    };

    const closeReviewModal = () => {
        setIsModalOpen(false);
        setTimeout(() => setSelectedReview(null), 300); // Wait for transition if any
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground text-sm font-medium">Loading reviews...</p>
            </div>
        );
    }

    return (
        <main className="flex-1 min-h-screen bg-background relative flex flex-col font-sans">
            <UserMenu />

            <div className="max-w-7xl mx-auto px-6 py-12 w-full mt-10 md:mt-0">
                <div className="mb-8">
                    <h1 className="text-3xl font-semibold text-foreground tracking-tight mb-2">Reviews</h1>
                    <p className="text-muted-foreground">View and analyze all collected customer reviews.</p>
                </div>

                {error && (
                    <div className="bg-destructive/10 text-destructive text-sm p-4 rounded-lg mb-6 border border-destructive/20">
                        {error}
                    </div>
                )}

                {/* Filters Section */}
                <div className="bg-card border border-border rounded-xl p-4 mb-6 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                    <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto flex-wrap">
                        {/* Search Input */}
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Search reviews..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-4 py-2 w-fullbg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            />
                        </div>

                        {/* Brand Filter */}
                        <div className="relative">
                            <select
                                value={selectedBrand}
                                onChange={(e) => setSelectedBrand(e.target.value)}
                                className="pl-3 pr-8 py-2 w-full sm:w-48 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none text-foreground"
                            >
                                <option value="all">All Brands</option>
                                {availableBrands.map(b => (
                                    <option key={b} value={b}>{b}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        </div>

                        {/* Platform Filter */}
                        <div className="relative">
                            <select
                                value={selectedPlatform}
                                onChange={(e) => setSelectedPlatform(e.target.value)}
                                className="pl-3 pr-8 py-2 w-full sm:w-48 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 appearance-none text-foreground"
                            >
                                <option value="all">All Platforms</option>
                                {availablePlatforms.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                        </div>

                        {/* Date Range Filter */}
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="px-3 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                            />
                            <span className="text-muted-foreground text-sm">to</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="px-3 py-2 bg-background border border-input rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground"
                            />
                        </div>
                    </div>

                    {/* Clear Filters */}
                    {(searchQuery || selectedBrand !== "all" || selectedPlatform !== "all" || startDate || endDate) && (
                        <button
                            onClick={clearFilters}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors w-full md:w-auto justify-center whitespace-nowrap"
                        >
                            <FilterX className="h-4 w-4" />
                            Clear Filters
                        </button>
                    )}
                </div>

                {/* Table Section */}
                <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                                <tr>
                                    <th className="px-6 py-4 font-medium" onClick={() => handleSort('date')}>
                                        <div className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                                            Date
                                            <ArrowUpDown className="h-3 w-3" />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-medium" onClick={() => handleSort('brand')}>
                                        <div className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                                            Brand
                                            <ArrowUpDown className="h-3 w-3" />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-medium" onClick={() => handleSort('platform')}>
                                        <div className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                                            Platform
                                            <ArrowUpDown className="h-3 w-3" />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-medium" onClick={() => handleSort('rating')}>
                                        <div className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                                            Rating
                                            <ArrowUpDown className="h-3 w-3" />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-medium" onClick={() => handleSort('sentiment')}>
                                        <div className="flex items-center gap-2 cursor-pointer hover:text-foreground">
                                            Sentiment
                                            <ArrowUpDown className="h-3 w-3" />
                                        </div>
                                    </th>
                                    <th className="px-6 py-4 font-medium w-1/3">Analysis Topics</th>
                                    <th className="px-6 py-4 font-medium w-1/3">Review Text</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {reviews.length > 0 ? (
                                    reviews.map((review, i) => (
                                        <tr key={i} className="bg-card hover:bg-muted/30 transition-colors">
                                            <td className="px-6 py-4 whitespace-nowrap text-muted-foreground">
                                                {new Date(review.date).toLocaleDateString()}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-medium text-foreground">{review.brand || 'Unknown'}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-muted-foreground">{review.platform || 'Unknown'}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-1">
                                                    <span className="font-medium text-foreground">{review.rating}</span>
                                                    <span className="text-amber-400 text-xs">★</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium 
                                                    ${review.sentiment?.toLowerCase() === 'positive' ? 'bg-emerald-500/10 text-emerald-500' :
                                                        review.sentiment?.toLowerCase() === 'negative' ? 'bg-red-500/10 text-red-500' :
                                                            'bg-gray-500/10 text-gray-500'}`}
                                                >
                                                    {review.sentiment || 'Neutral'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-xs text-muted-foreground truncate max-w-xs" title={review.topics}>
                                                    {review.topics || '-'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div
                                                    className="text-sm text-foreground line-clamp-3 cursor-pointer hover:text-primary transition-colors group"
                                                    onClick={() => openReviewModal(review)}
                                                    title="Click to view full review"
                                                >
                                                    {review.text || '-'}
                                                    {review.text && review.text.length > 150 && (
                                                        <span className="text-xs text-primary ml-1 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                                                            View More
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={7} className="px-6 py-12 text-center text-muted-foreground">
                                            No reviews found matching your filters.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination Controls */}
                    {totalPages > 1 && (
                        <div className="px-6 py-4 border-t border-border bg-card flex flex-col sm:flex-row items-center justify-between gap-4">
                            <span className="text-sm text-muted-foreground">
                                Page <span className="font-medium text-foreground">{currentPage}</span> of <span className="font-medium text-foreground">{totalPages}</span>
                            </span>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className="px-3 py-1.5 text-sm font-medium rounded-md border border-input disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent hover:text-accent-foreground transition-colors text-foreground shadow-sm"
                                >
                                    Previous
                                </button>
                                <button
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className="px-3 py-1.5 text-sm font-medium rounded-md border border-input disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent hover:text-accent-foreground transition-colors text-foreground shadow-sm"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Summary Footer */}
                    <div className="px-6 py-4 border-t border-border bg-muted/20 text-xs text-muted-foreground flex justify-between items-center">
                        <span>Showing {reviews.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0} to {Math.min(currentPage * itemsPerPage, totalReviews)} of {totalReviews} matching reviews</span>
                    </div>
                </div>
            </div>

            {/* Review Detail Modal */}
            {isModalOpen && selectedReview && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    onClick={closeReviewModal}
                >
                    <div
                        className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-muted/30">
                            <div>
                                <h3 className="text-xl font-bold text-foreground">Review Details</h3>
                                <p className="text-xs text-muted-foreground">
                                    {selectedReview.brand} • {selectedReview.platform} • {new Date(selectedReview.date).toLocaleDateString()}
                                </p>
                            </div>
                            <button
                                onClick={closeReviewModal}
                                className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="p-6 overflow-y-auto custom-scrollbar">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 rounded-lg">
                                    <span className="font-bold text-amber-500">{selectedReview.rating}</span>
                                    <span className="text-amber-500 text-sm">★</span>
                                </div>
                                <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider
                                    ${selectedReview.sentiment?.toLowerCase() === 'positive' ? 'bg-emerald-500/10 text-emerald-500' :
                                        selectedReview.sentiment?.toLowerCase() === 'negative' ? 'bg-red-500/10 text-red-500' :
                                            'bg-slate-500/10 text-slate-500'}`}
                                >
                                    {selectedReview.sentiment || 'Neutral'}
                                </span>
                            </div>

                            <div className="mb-8">
                                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-3">Analysis Topics</h4>
                                <div className="flex flex-wrap gap-2">
                                    {selectedReview.topics ? selectedReview.topics.split(';').map((topic, idx) => (
                                        <span key={idx} className="px-3 py-1 bg-muted border border-border rounded-full text-xs font-medium text-foreground">
                                            {topic.trim()}
                                        </span>
                                    )) : <span className="text-sm text-muted-foreground italic">No topics analyzed</span>}
                                </div>
                            </div>

                            <div className="bg-muted/20 p-6 rounded-xl border border-border/50">
                                <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest mb-4">Review Content</h4>
                                <p className="text-base text-foreground leading-relaxed whitespace-pre-wrap">
                                    {selectedReview.text}
                                </p>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="px-6 py-4 border-t border-border bg-muted/30 flex justify-end">
                            <button
                                onClick={closeReviewModal}
                                className="px-6 py-2 bg-primary text-primary-foreground font-medium rounded-xl hover:opacity-90 transition-opacity"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
