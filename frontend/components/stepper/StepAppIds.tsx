"use client";

import { useState } from "react";
import { Company } from "@/lib/api";
import { Card } from "../ui/Card";
import { Loader2, Play, AlertCircle } from "lucide-react";

interface StepAppIdsProps {
    initialData: Company[];
    onComplete: (data: { job_id: string; brands: Company[] }) => void;
}

export function StepAppIds({ initialData, onComplete }: StepAppIdsProps) {
    const [items, setItems] = useState<Company[]>(initialData);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const updateItem = (index: number, field: keyof Company, value: string) => {
        setItems(currentItems => {
            const newItems = [...currentItems];
            if (newItems[index]) {
                newItems[index] = { ...newItems[index], [field]: value };
            }
            return newItems;
        });
    };

    const handleNextStep = () => {
        // Just pass data to next step
        onComplete({ job_id: "", brands: items });
    };

    return (
        <Card title="Step 3: Verify App IDs" className="w-full max-w-3xl mx-auto">
            <div className="space-y-6">
                <div className="bg-muted/50 p-3 rounded-md flex flex-col gap-2 text-sm text-muted-foreground border border-border">
                    <div className="flex gap-2">
                        <AlertCircle className="h-5 w-5 shrink-0 text-primary" />
                        <p>
                            Verify Android and Apple App IDs for each brand.
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

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Android App ID</label>
                                    <input
                                        type="text"
                                        value={item.android_id || ""}
                                        onChange={(e) => updateItem(index, "android_id", e.target.value)}
                                        className="w-full rounded border border-input px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                        placeholder="com.example.app"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Apple App ID</label>
                                    <input
                                        type="text"
                                        value={item.apple_id || ""}
                                        onChange={(e) => updateItem(index, "apple_id", e.target.value)}
                                        className="w-full rounded border border-input px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                                        placeholder="123456789"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {error && <p className="text-sm text-red-500 text-center">{error}</p>}

                <button
                    onClick={handleNextStep}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-semibold py-4 px-6 rounded-full disabled:opacity-50 transition-all hover:shadow-lg"
                >
                    {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Next <Play className="h-5 w-5" /></>}
                </button>
            </div>
        </Card>
    );
}
