"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Company, VoCService } from "@/lib/api";
import { Card } from "../ui/Card";
import { Loader2, Play, AlertCircle, MapPin, Plus, X, Search } from "lucide-react";

interface MapsLink {
    name: string;
    url: string;
    place_id?: string;
    reviews_count?: number;
}

interface StepAppIdsProps {
    initialData: Company[];
    onComplete: (data: { job_id: string; brands: Company[] }) => void;
}

export function StepAppIds({ initialData, onComplete }: StepAppIdsProps) {
    const [items, setItems] = useState<Company[]>(initialData);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // State to track which items are currently discovering maps
    const [discoveringIndices, setDiscoveringIndices] = useState<Set<number>>(new Set());
    const [discoveryStatuses, setDiscoveryStatuses] = useState<{ [key: number]: string }>({});

    // State for new link inputs (map of index -> string)
    const [newLinkInputs, setNewLinkInputs] = useState<{ [key: number]: string }>({});

    // Use ref to ensure auto-discovery only runs once per mount
    const hasAutoDiscovered = useRef(false);

    const updateItem = useCallback((index: number, field: keyof Company, value: string | boolean | (string | MapsLink)[]) => {
        setItems(currentItems => {
            const newItems = [...currentItems];
            if (newItems[index]) {
                newItems[index] = { ...newItems[index], [field]: value };
            }
            return newItems;
        });
    }, []);

    const handleDiscoverMaps = useCallback(async (index: number) => {
        const item = items[index];
        if (!item?.company_name) return;

        setDiscoveringIndices(prev => {
            const newSet = new Set(prev);
            newSet.add(index);
            return newSet;
        });
        setDiscoveryStatuses(prev => ({ ...prev, [index]: "Starting..." }));

        try {
            const { job_id } = await VoCService.discoverMapsLinks(
                item.company_name,
                item.website || ""
            );

            const pollInterval = setInterval(async () => {
                try {
                    const statusData = await VoCService.checkStatus(job_id);

                    if (statusData.status === "running" && statusData.message) {
                        setDiscoveryStatuses(prev => ({ ...prev, [index]: statusData.message || "Running..." }));
                    } else if (statusData.status === "pending" || statusData.status === "processing") {
                        setDiscoveryStatuses(prev => ({ ...prev, [index]: "Processing..." }));
                    }

                    if (statusData.status === "completed") {
                        clearInterval(pollInterval);

                        const result = statusData.result as { locations?: (string | MapsLink)[] };
                        const newLocations = result?.locations || [];

                        if (newLocations.length === 0) {
                            setDiscoveryStatuses(prev => ({ ...prev, [index]: "No maps links found." }));
                        } else {
                            setDiscoveryStatuses(prev => ({ ...prev, [index]: "Completed." }));

                            const existingLinks = item.google_maps_links || [];
                            const newLinks: MapsLink[] = newLocations.map((loc: MapsLink | string) => {
                                if (typeof loc === 'string') {
                                    return { name: loc, url: '', reviews_count: undefined, place_id: '' };
                                }
                                return {
                                    name: loc.name || loc.url || '',
                                    url: loc.url || '',
                                    reviews_count: loc.reviews_count ?? undefined,
                                    place_id: loc.place_id || undefined
                                };
                            }).filter((loc: MapsLink) => loc.name);

                            const existingNames = new Set(existingLinks.map((l: string | MapsLink) => typeof l === 'string' ? l : l.name));
                            const mergedLinks: (string | MapsLink)[] = [
                                ...existingLinks.map((l: string | MapsLink) => typeof l === 'string' ? { name: l, url: '', reviews_count: undefined, place_id: undefined } : l),
                                ...newLinks.filter((l: MapsLink) => !existingNames.has(l.name))
                            ];

                            updateItem(index, 'google_maps_links', mergedLinks);
                        }

                        setDiscoveringIndices(prev => {
                            const newSet = new Set(prev);
                            newSet.delete(index);
                            return newSet;
                        });
                    } else if (statusData.status === "error" || statusData.status === "failed") {
                        clearInterval(pollInterval);
                        setDiscoveryStatuses(prev => ({ ...prev, [index]: `Failed: ${statusData.message || "Unknown error"}` }));
                        setDiscoveringIndices(prev => {
                            const newSet = new Set(prev);
                            newSet.delete(index);
                            return newSet;
                        });
                    }
                } catch (pollErr) {
                    console.error("Polling error:", pollErr);
                }
            }, 5000);
        } catch (err) {
            console.error("Discovery failed to start", err);
            setDiscoveringIndices(prev => {
                const newSet = new Set(prev);
                newSet.delete(index);
                return newSet;
            });
        }
    }, [items, updateItem]);

    useEffect(() => {
        if (hasAutoDiscovered.current || !items.length) return;

        const runAutoDiscovery = async () => {
            hasAutoDiscovered.current = true;
            await Promise.all(items.map(async (item, i) => {
                if (!item.google_maps_links || item.google_maps_links.length === 0) {
                    await handleDiscoverMaps(i);
                }
            }));
        };

        runAutoDiscovery();
    }, [items, handleDiscoverMaps]);

    const addLink = (index: number) => {
        const url = newLinkInputs[index]?.trim();
        if (!url) return;

        const item = items[index];
        const currentLinks = item.google_maps_links || [];
        const exists = currentLinks.some((l: string | MapsLink) =>
            (typeof l === 'string' ? l : l.name || l.url) === url
        );

        if (!exists) {
            updateItem(index, "google_maps_links", [...currentLinks, { name: url, url: url, reviews_count: undefined, place_id: '' }]);
        }
        setNewLinkInputs(prev => ({ ...prev, [index]: "" }));
    };

    const removeLink = (index: number, linkToRemove: string | MapsLink) => {
        const item = items[index];
        const currentLinks = item.google_maps_links || [];
        const linkName = typeof linkToRemove === 'string' ? linkToRemove : linkToRemove.name;
        updateItem(index, "google_maps_links", (currentLinks as (string | MapsLink)[]).filter((l: string | MapsLink) =>
            (typeof l === 'string' ? l : l.name) !== linkName
        ));
    };

    const handleStartScraping = async () => {
        setLoading(true);
        setError(null);
        const jobId = `job_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        try {
            await VoCService.startScraping({ brands: items, job_id: jobId });
            onComplete({ job_id: jobId, brands: items });
        } catch (err) {
            console.error(err);
            setError("Failed to start scraping job. Check backend connection.");
            setLoading(false);
        }
    };

    const getLinkInfo = (link: string | MapsLink) => {
        if (typeof link === 'string') {
            return { name: link, url: '', reviews_count: null };
        }
        return {
            name: link.name || link.url || '',
            url: link.url || '',
            reviews_count: link.reviews_count ?? null
        };
    };

    return (
        <Card title="Step 3: Verify App IDs & Links" className="w-full max-w-3xl mx-auto">
            <div className="space-y-6">
                <div className="bg-muted/50 p-3 rounded-md flex flex-col gap-2 text-sm text-muted-foreground border border-border">
                    <div className="flex gap-2">
                        <AlertCircle className="h-5 w-5 shrink-0 text-primary" />
                        <p>
                            Verify App IDs and Google Maps locations.
                        </p>
                    </div>
                </div>

                <div className="space-y-4">
                    {items.map((item, index) => (
                        <div key={index} className="p-4 bg-card rounded-lg border border-border">
                            <h4 className="font-semibold text-lg mb-3 flex items-center gap-2">
                                {item.company_name}
                                {item.is_main && <span className="text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Main</span>}
                            </h4>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Android App ID</label>
                                    <input
                                        type="text"
                                        value={item.android_id || ""}
                                        onChange={(e) => updateItem(index, "android_id", e.target.value)}
                                        className="w-full rounded border border-input px-3 py-2 text-sm font-mono"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Apple App ID</label>
                                    <input
                                        type="text"
                                        value={item.apple_id || ""}
                                        onChange={(e) => updateItem(index, "apple_id", e.target.value)}
                                        className="w-full rounded border border-input px-3 py-2 text-sm font-mono"
                                    />
                                </div>
                            </div>

                            <div className="border-t border-border pt-3">
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                        <MapPin className="w-3 h-3" /> Google Maps Locations
                                    </label>
                                    {discoveringIndices.has(index) ? (
                                        <span className="text-xs flex items-center gap-1 text-muted-foreground">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            {discoveryStatuses[index] || "Loading..."}
                                        </span>
                                    ) : (
                                        <button
                                            onClick={() => handleDiscoverMaps(index)}
                                            className="text-xs text-primary hover:underline"
                                        >
                                            <Search className="w-3 h-3 inline mr-1" />
                                            Auto-Discover
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {((item.google_maps_links as (string | MapsLink)[]) || []).map((link, i) => {
                                        const info = getLinkInfo(link);
                                        return (
                                            <div key={i} className="flex items-center gap-2">
                                                <div className="flex-1 bg-muted/30 text-xs px-2 py-1.5 rounded border border-border flex items-center justify-between truncate">
                                                    <span className="truncate">{info.name}</span>
                                                    {info.reviews_count && <span className="text-[10px] opacity-60 ml-2">{info.reviews_count} reviews</span>}
                                                </div>
                                                <button onClick={() => removeLink(index, link)} className="text-muted-foreground hover:text-destructive">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={newLinkInputs[index] || ""}
                                            onChange={(e) => setNewLinkInputs(prev => ({ ...prev, [index]: e.target.value }))}
                                            placeholder="Paste Google Maps link..."
                                            className="flex-1 rounded border border-input px-2 py-1.5 text-xs"
                                        />
                                        <button onClick={() => addLink(index)} className="p-1.5 border rounded">
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
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-4 px-6 rounded-full disabled:opacity-50"
                >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Play className="h-5 w-5" /> Start Scraping</>}
                </button>
            </div>
        </Card>
    );
}
