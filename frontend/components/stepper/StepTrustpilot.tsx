"use client";

import { useState } from "react";
import { Company, VoCService } from "@/lib/api";
import { Card } from "../ui/Card";
import { Loader2, Play, Star, ExternalLink } from "lucide-react";

interface StepTrustpilotProps {
    initialData: Company[];
    onComplete: (data: { job_id: string; brands: Company[] }) => void;
}

export function StepTrustpilot({ initialData, onComplete }: StepTrustpilotProps) {
    const [items, setItems] = useState<Company[]>(initialData);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const updateItem = (index: number, value: string) => {
        setItems(currentItems => {
            const newItems = [...currentItems];
            if (newItems[index]) {
                newItems[index] = { ...newItems[index], trustpilot_link: value };
            }
            return newItems;
        });
    };

    const handleStartScraping = async () => {
        setLoading(true);
        setError(null);
        // Generate a temporary job ID for immediate feedback or use backend response
        // But scraping starts here, so we really just want to trigger it.
        // Wait, previously StepAppIds triggered scraping. 
        // Now StepTrustpilot is the last step before success?
        // Yes, checking VocStepper.tsx: Step 3 was AppIds (calling `startScraping`).
        // Now Step 4 (Trustpilot) will call `startScraping`.
        // I need to ensure StepAppIds DOES NOT call startScraping anymore, just passes data!

        try {
            const response = await VoCService.startScraping({ brands: items });
            onComplete({ job_id: response.job_id, brands: items });
        } catch (err) {
            console.error(err);
            setError("Failed to start scraping job. Check backend connection.");
            setLoading(false);
        }
    };

    return (
        <Card title="Step 5: Trustpilot Integration" className="w-full max-w-3xl mx-auto">
            <div className="space-y-6">
                <div className="bg-muted/50 p-3 rounded-md flex flex-col gap-2 text-sm text-muted-foreground border border-border">
                    <div className="flex gap-2">
                        <Star className="h-5 w-5 shrink-0 text-yellow-500" />
                        <p>
                            Add Trustpilot profile links for the brands to include standard reviews.
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

                            <div>
                                <label className="text-xs font-semibold text-muted-foreground block mb-1">Trustpilot URL</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={item.trustpilot_link || ""}
                                        onChange={(e) => updateItem(index, e.target.value)}
                                        placeholder="https://www.trustpilot.com/review/example.com"
                                        className="w-full rounded border border-input px-3 py-2 text-sm"
                                    />
                                    {item.trustpilot_link && (
                                        <a
                                            href={item.trustpilot_link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-2 border rounded hover:bg-muted"
                                        >
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {error && <p className="text-sm text-red-500 text-center">{error}</p>}

                <button
                    onClick={handleStartScraping}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-4 px-6 rounded-full disabled:opacity-50 hover:opacity-90 transition-opacity"
                >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Play className="h-5 w-5" /> Start Scraping</>}
                </button>
            </div>
        </Card>
    );
}
