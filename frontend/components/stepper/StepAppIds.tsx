"use client";

import { useState, useEffect, useRef } from "react";
import { Company, VoCService } from "@/lib/api";
import { Card } from "../ui/Card";
import { Loader2, Play, AlertCircle, MapPin, Plus, X, Search } from "lucide-react";

interface StepAppIdsProps {
    initialData: Company[];
    onComplete: (data: { job_id: string; brands: Company[] }) => void;
}

export function StepAppIds({ initialData, onComplete }: StepAppIdsProps) {
    const [items, setItems] = useState<Company[]>(initialData);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // State to track which item is currently discovering maps
    const [discoveringIndex, setDiscoveringIndex] = useState<number | null>(null);

    // State for new link inputs (map of index -> string)
    const [newLinkInputs, setNewLinkInputs] = useState<{ [key: number]: string }>({});

    // Use ref to ensure auto-discovery only runs once per mount
    const hasAutoDiscovered = useRef(false);

    useEffect(() => {
        if (hasAutoDiscovered.current || !items.length) return;

        const runAutoDiscovery = async () => {
            hasAutoDiscovered.current = true;

            // Sequential discovery to avoid overwhelming the backend/browser
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                // Only discover if no links exist
                if (!item.google_maps_links || item.google_maps_links.length === 0) {
                    await handleDiscoverMaps(i);
                }
            }
        };

        runAutoDiscovery();
    }, []); // Empty dependency array to run only on mount

    const updateItem = (index: number, field: keyof Company, value: any) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };

    const handleDiscoverMaps = async (index: number) => {
        const item = items[index];
        if (!item.company_name) return;

        setDiscoveringIndex(index);
        try {
            const data = await VoCService.discoverMapsLinks(item.company_name, item.website || "");

            // Handle new format: locations is array of {place_id, name, url, reviews_count}
            const existingLinks = item.google_maps_links || [];
            const newLocations = data.locations || data.links || [];

            // Convert location objects to structured format for display
            const newLinks = newLocations.map((loc: any) => {
                if (typeof loc === 'string') {
                    return { name: loc, url: '', reviews_count: null, place_id: '' };
                }
                return {
                    name: loc.name || loc.url || '',
                    url: loc.url || '',
                    reviews_count: loc.reviews_count || null,
                    place_id: loc.place_id || ''
                };
            }).filter((loc: any) => loc.name);

            // Merge with existing, avoiding duplicates by name
            const existingNames = new Set(existingLinks.map((l: any) => typeof l === 'string' ? l : l.name));
            const mergedLinks = [
                ...existingLinks.map((l: any) => typeof l === 'string' ? { name: l, url: '', reviews_count: null, place_id: '' } : l),
                ...newLinks.filter((l: any) => !existingNames.has(l.name))
            ];

            // Use functional update to ensure fresh state if called in loop
            setItems(currentItems => {
                const newItems = [...currentItems];
                if (newItems[index]) {
                    newItems[index] = { ...newItems[index], google_maps_links: mergedLinks };
                }
                return newItems;
            });

        } catch (err) {
            console.error("Discovery failed", err);
        } finally {
            setDiscoveringIndex(null);
        }
    };

    const addLink = (index: number) => {
        const url = newLinkInputs[index]?.trim();
        if (!url) return;

        const item = items[index];
        const currentLinks = item.google_maps_links || [];

        // Check if already exists
        const exists = currentLinks.some((l: any) =>
            (typeof l === 'string' ? l : l.name || l.url) === url
        );

        if (!exists) {
            // Add as structured object
            updateItem(index, "google_maps_links", [...currentLinks, { name: url, url: url, reviews_count: null, place_id: '' }]);
        }

        setNewLinkInputs(prev => ({ ...prev, [index]: "" }));
    };

    const removeLink = (index: number, linkToRemove: any) => {
        const item = items[index];
        const currentLinks = item.google_maps_links || [];
        const linkName = typeof linkToRemove === 'string' ? linkToRemove : linkToRemove.name;
        updateItem(index, "google_maps_links", currentLinks.filter((l: any) =>
            (typeof l === 'string' ? l : l.name) !== linkName
        ));
    };

    const handleStartScraping = async () => {
        setLoading(true);
        setError(null);

        // Generate Job ID
        const jobId = `job_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        try {
            const response = await VoCService.startScraping({
                brands: items,
                job_id: jobId
            });

            onComplete({ job_id: jobId, brands: items });

        } catch (err) {
            console.error(err);
            setError("Failed to start scraping job. Check backend connection.");
            setLoading(false);
        }
    };

    // Helper to get display info from a link (handles both old string format and new object format)
    const getLinkInfo = (link: any) => {
        if (typeof link === 'string') {
            return { name: link, url: '', reviews_count: null };
        }
        return {
            name: link.name || link.url || '',
            url: link.url || '',
            reviews_count: link.reviews_count || null
        };
    };

    return (
        <Card title="Step 3: Verify App IDs & Links" className="w-full max-w-3xl mx-auto">
            <div className="space-y-6">
                <div className="bg-calo-mint p-3 rounded-md flex gap-2 text-sm text-green-800 border border-calo-green-primary/20">
                    <AlertCircle className="h-5 w-5 shrink-0 text-calo-green-primary" />
                    <p>
                        Verify App IDs and Google Maps locations.
                        Use <strong>Auto-Discover</strong> to find all maps branches for deeper insights.
                    </p>
                </div>

                <div className="space-y-4">
                    {items.map((item, index) => (
                        <div key={index} className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm transition-all hover:shadow-md">
                            <h4 className="font-semibold text-lg text-calo-text-main mb-3 flex items-center gap-2">
                                {item.company_name}
                                {item.is_main && <span className="text-xs bg-calo-primary text-white px-2 py-0.5 rounded-full">Main</span>}
                            </h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="text-xs font-semibold text-calo-text-secondary block mb-1">Android App ID</label>
                                    <input
                                        type="text"
                                        value={item.android_id || ""}
                                        onChange={(e) => updateItem(index, "android_id", e.target.value)}
                                        placeholder="com.example.app"
                                        className="w-full rounded border border-calo-border px-3 py-2 text-sm font-mono text-calo-text-main focus:ring-1 focus:ring-calo-primary"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-calo-text-secondary block mb-1">Apple App ID</label>
                                    <input
                                        type="text"
                                        value={item.apple_id || ""}
                                        onChange={(e) => updateItem(index, "apple_id", e.target.value)}
                                        placeholder="123456789"
                                        className="w-full rounded border border-calo-border px-3 py-2 text-sm font-mono text-calo-text-main focus:ring-1 focus:ring-calo-primary"
                                    />
                                </div>
                            </div>

                            {/* Google Maps Section */}
                            <div className="border-t border-slate-100 pt-3">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-semibold text-calo-text-secondary flex items-center gap-1">
                                        <MapPin className="w-3 h-3" /> Google Maps Locations
                                        {(item.google_maps_links || []).length > 0 && (
                                            <span className="ml-1 text-calo-primary">({(item.google_maps_links || []).length})</span>
                                        )}
                                    </label>
                                    <button
                                        onClick={() => handleDiscoverMaps(index)}
                                        disabled={discoveringIndex === index}
                                        className="text-xs flex items-center gap-1 text-calo-primary hover:text-calo-dark disabled:opacity-50 font-medium"
                                    >
                                        {discoveringIndex === index ? (
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                            <Search className="w-3 h-3" />
                                        )}
                                        {discoveringIndex === index ? "Discovering..." : "Auto-Discover Locations"}
                                    </button>
                                </div>

                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {/* Existing Links List */}
                                    {(item.google_maps_links || []).map((link: any, i: number) => {
                                        const info = getLinkInfo(link);
                                        return (
                                            <div key={i} className="flex items-center gap-2 group">
                                                <div className="flex-1 bg-slate-50 text-xs px-2 py-1.5 rounded border border-slate-200 flex items-center justify-between min-w-0">
                                                    {/* Clickable name with URL */}
                                                    {info.url ? (
                                                        <a
                                                            href={info.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-calo-primary hover:text-calo-dark hover:underline truncate font-medium"
                                                            title={info.url}
                                                        >
                                                            {info.name}
                                                        </a>
                                                    ) : (
                                                        <span className="text-slate-700 truncate">{info.name}</span>
                                                    )}
                                                    {/* Reviews count badge */}
                                                    {info.reviews_count && (
                                                        <span className="ml-2 shrink-0 text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-medium border border-slate-200">
                                                            {info.reviews_count} reviews
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    onClick={() => removeLink(index, link)}
                                                    className="text-slate-400 hover:text-red-500 transition-colors px-2"
                                                    title="Remove link"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        );
                                    })}

                                    {/* Add New Link */}
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newLinkInputs[index] || ""}
                                            onChange={(e) => setNewLinkInputs(prev => ({ ...prev, [index]: e.target.value }))}
                                            placeholder="Paste Google Maps link..."
                                            className="flex-1 rounded border border-calo-border px-2 py-1.5 text-xs text-calo-text-main focus:ring-1 focus:ring-calo-primary"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    addLink(index);
                                                }
                                            }}
                                        />
                                        <button
                                            onClick={() => addLink(index)}
                                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 transition-colors"
                                        >
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {error && <p className="text-sm text-red-500 text-center">{error}</p>}

                <button
                    onClick={handleStartScraping}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-calo-primary hover:bg-calo-dark text-white font-bold py-4 px-6 rounded-full shadow-lg hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                >
                    {loading ? (
                        <>
                            <Loader2 className="h-5 w-5 animate-spin" /> Starting Scraping Job...
                        </>
                    ) : (
                        <>
                            <Play className="h-5 w-5" /> Start Scraping
                        </>
                    )}
                </button>
            </div>
        </Card>
    );
}
