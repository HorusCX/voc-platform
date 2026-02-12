"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Company, VoCService } from "@/lib/api";
import { Card } from "../ui/Card";
import { Loader2, Play, MapPin, Plus, X, Search } from "lucide-react";

interface MapsLink {
    name: string;
    url: string;
    place_id?: string;
    reviews_count?: number;
}

interface StepLocationsProps {
    initialData: Company[];
    jobId?: string;
    onComplete: (data: { brands: Company[] }) => void;
}

export function StepLocations({ initialData, jobId, onComplete }: StepLocationsProps) {
    const [items, setItems] = useState<Company[]>(initialData);

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
                item.website || "",
                jobId
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

                            // Prioritize new links if they have more data (like reviews_count)
                            const newLinksMap = new Map(newLinks.map((l: MapsLink) => [l.name, l]));

                            const mergedLinks: (string | MapsLink)[] = [
                                // Keep existing links ONLY if they are NOT in new links (by name)
                                ...existingLinks.map((l: string | MapsLink) => {
                                    const name = typeof l === 'string' ? l : l.name;
                                    // If new link has this name, use the NEW link (it has reviews)
                                    if (newLinksMap.has(name)) {
                                        return newLinksMap.get(name)!;
                                    }
                                    // Otherwise keep existing
                                    return typeof l === 'string' ? { name: l, url: '', reviews_count: undefined, place_id: undefined } : l;
                                }),
                                // Add new links that were NOT in existing (by name)
                                ...newLinks.filter((l: MapsLink) => !existingLinks.some((el: string | MapsLink) => (typeof el === 'string' ? el : el.name) === l.name))
                            ];

                            // Remove duplicates just in case
                            const uniqueLinks = Array.from(new Map(mergedLinks.map((l: string | MapsLink) => [(typeof l === 'string' ? l : l.name), l])).values());

                            updateItem(index, 'google_maps_links', uniqueLinks as MapsLink[]);
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
            }, 3000); // Poll every 3 seconds
        } catch (err) {
            console.error("Discovery failed to start", err);
            setDiscoveringIndices(prev => {
                const newSet = new Set(prev);
                newSet.delete(index);
                return newSet;
            });
        }
    }, [items, updateItem, jobId]);

    // Auto-discover on mount if links are missing
    useEffect(() => {
        if (hasAutoDiscovered.current || !items.length) return;

        const runAutoDiscovery = async () => {
            hasAutoDiscovered.current = true;

            // Sequential start to avoid overwhelming if many items
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (!item.google_maps_links || item.google_maps_links.length === 0) {
                    // Small delay between starts
                    await new Promise(r => setTimeout(r, 500));
                    handleDiscoverMaps(i);
                }
            }
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

    const handleNextStep = () => {
        onComplete({ brands: items });
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
        <Card title="Step 4: Discover Locations" className="w-full max-w-3xl mx-auto">
            <div className="space-y-6">
                <div className="bg-muted/50 p-3 rounded-md flex flex-col gap-2 text-sm text-muted-foreground border border-border">
                    <div className="flex gap-2">
                        <MapPin className="h-5 w-5 shrink-0 text-primary" />
                        <p>
                            We&apos;re automatically discovering Google Maps locations for each brand.
                            You can also add specific location links manually if needed.
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
                                            Re-Discover
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-2 max-h-64 overflow-y-auto">
                                    {((item.google_maps_links as (string | MapsLink)[]) || []).length === 0 && !discoveringIndices.has(index) && (
                                        <div className="text-xs text-muted-foreground italic py-2">No locations found yet.</div>
                                    )}

                                    {((item.google_maps_links as (string | MapsLink)[]) || []).map((link, i) => {
                                        const info = getLinkInfo(link);
                                        return (
                                            <div key={i} className="flex items-center gap-2">
                                                <div className="flex-1 bg-muted/30 text-xs px-2 py-1.5 rounded border border-border flex items-center justify-between truncate">
                                                    <span className="truncate">
                                                        {info.url ? (
                                                            <a
                                                                href={info.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="hover:underline text-primary"
                                                            >
                                                                {info.name}
                                                            </a>
                                                        ) : (
                                                            info.name
                                                        )}
                                                    </span>
                                                    {(info.reviews_count !== null && info.reviews_count !== undefined) && <span className="text-[10px] opacity-60 ml-2">{info.reviews_count} reviews</span>}
                                                </div>
                                                <button onClick={() => removeLink(index, link)} className="text-muted-foreground hover:text-destructive">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                    <div className="flex gap-2 mt-2">
                                        <input
                                            type="text"
                                            value={newLinkInputs[index] || ""}
                                            onChange={(e) => setNewLinkInputs(prev => ({ ...prev, [index]: e.target.value }))}
                                            placeholder="Paste Google Maps link..."
                                            className="flex-1 rounded border border-input px-2 py-1.5 text-xs"
                                        />
                                        <button onClick={() => addLink(index)} className="p-1.5 border rounded hover:bg-muted">
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <button
                    onClick={handleNextStep}
                    disabled={discoveringIndices.size > 0}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-4 px-6 rounded-full disabled:opacity-50 transition-all hover:shadow-lg"
                >
                    {discoveringIndices.size > 0 ? <><Loader2 className="h-5 w-5 animate-spin" /> Processing...</> :
                        <>Next <Play className="h-5 w-5" /></>}
                </button>
            </div>
        </Card>
    );
}
