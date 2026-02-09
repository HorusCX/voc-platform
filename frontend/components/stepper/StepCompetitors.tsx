"use client";

import { useState, useEffect } from "react";
import { Company, VoCService } from "@/lib/api";
import { Card } from "../ui/Card";
import { Loader2, Trash2, Plus, ArrowRight, Save, Info } from "lucide-react";

interface StepCompetitorsProps {
    initialData: Company[];
    onComplete: (data: Company[]) => void;
}

export function StepCompetitors({ initialData, onComplete }: StepCompetitorsProps) {
    const [items, setItems] = useState<Company[]>(initialData);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Sync items with initialData when it changes
    useEffect(() => {
        if (initialData && initialData.length > 0) {
            setItems(initialData);
        }
    }, [initialData]);

    const updateItem = (index: number, field: keyof Company, value: string) => {
        const newItems = [...items];
        newItems[index] = { ...newItems[index], [field]: value };
        setItems(newItems);
    };

    const removeItem = (index: number) => {
        const newItems = items.filter((_, i) => i !== index);
        setItems(newItems);
    };

    const addItem = () => {
        setItems([...items, { company_name: "New Company", website: "" }]);
    };

    const handleSubmit = async () => {
        if (items.length === 0) {
            setError("Please add at least one company.");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const result = await VoCService.resolveAppIds(items);
            onComplete(result);
        } catch (err) {
            console.error(err);
            setError("Failed to resolve App IDs. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card title="Step 2: Confirm Competitors" className="w-full max-w-3xl mx-auto">
            <div className="space-y-6">
                <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800 border border-blue-100 flex gap-2">
                    <Info className="h-5 w-5 shrink-0" />
                    <p>
                        We identified these competitors. Use the checkboxes to select which ones to include in the analysis.
                        You can add more manually.
                    </p>
                </div>

                <div className="space-y-3">
                    {items.map((item, index) => (
                        <div key={index} className="p-3 bg-card rounded-lg border border-border shadow-sm">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                    #{index + 1}
                                </span>
                                <button
                                    onClick={() => removeItem(index)}
                                    className="text-muted-foreground hover:text-destructive transition-colors"
                                    title="Remove"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <input
                                    type="text"
                                    placeholder="Company Name"
                                    value={item.company_name || ""}
                                    onChange={(e) => updateItem(index, "company_name", e.target.value)}
                                    className="w-full rounded border border-input px-3 py-1.5 text-sm focus:ring-1 focus:ring-ring text-foreground bg-background placeholder:text-muted-foreground"
                                />
                                <input
                                    type="text"
                                    placeholder="Website (Optional)"
                                    value={item.website || ""}
                                    onChange={(e) => updateItem(index, "website", e.target.value)}
                                    className="w-full rounded border border-input px-3 py-1.5 text-sm focus:ring-1 focus:ring-ring text-foreground bg-background placeholder:text-muted-foreground"
                                />
                            </div>
                        </div>
                    ))}
                </div>

                <button
                    onClick={addItem}
                    className="w-full py-2 border-2 border-dashed border-input rounded-lg text-muted-foreground hover:border-primary hover:text-primary flex items-center justify-center gap-2 transition-colors"
                >
                    <Plus className="h-4 w-4" /> Add Competitor
                </button>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="w-full mt-4 flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-4 px-6 rounded-full shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
                >
                    {loading ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Submitting...
                        </>
                    ) : (
                        <>
                            Confirm Competitors <ArrowRight className="h-4 w-4" />
                        </>
                    )}
                </button>
            </div>
        </Card>
    );
}
