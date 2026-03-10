"use client";

import { useState, useEffect } from "react";
import { Company } from "@/lib/api";
import { Loader2, X } from "lucide-react";

interface CompanyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (company: Partial<Company>) => Promise<void>;
    initialData?: Company | null;
}

export function CompanyModal({ isOpen, onClose, onSave, initialData }: CompanyModalProps) {
    const [formData, setFormData] = useState<Partial<Company>>({
        company_name: "",
        website: "",
        description: "",
        apple_id: "",
        android_id: "",
        trustpilot_link: "",
        google_maps_links: [],
    });
    const [mapLinksInput, setMapLinksInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData(initialData);
                // Convert maps links to a comma-separated string for easy editing
                if (initialData.google_maps_links && initialData.google_maps_links.length > 0) {
                    const linksStr = initialData.google_maps_links
                        .map(l => typeof l === 'string' ? l : l.url || l.name)
                        .join(", ");
                    setMapLinksInput(linksStr);
                } else {
                    setMapLinksInput("");
                }
            } else {
                setFormData({
                    company_name: "",
                    website: "",
                    description: "",
                    apple_id: "",
                    android_id: "",
                    trustpilot_link: "",
                    google_maps_links: [],
                });
                setMapLinksInput("");
            }
            setError(null);
            setLoading(false);
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.company_name?.trim()) {
            setError("Company Name is required.");
            return;
        }

        setLoading(true);
        setError(null);

        // Process map links
        const rawLinks = mapLinksInput.split(',').map(s => s.trim()).filter(Boolean);
        const mapLinks = rawLinks.map(url => ({ name: url, url }));

        try {
            await onSave({
                ...formData,
                google_maps_links: mapLinks
            });
            onClose();
        } catch (err) {
            console.error(err);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const e = err as any;
            setError(e.response?.data?.detail || e.message || "Failed to save company");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/5 p-4 backdrop-blur-[2px] animate-in fade-in duration-300">
            <div className="bg-white/80 backdrop-blur-2xl w-full max-w-2xl rounded-[2rem] shadow-glass border border-glass-border flex flex-col max-h-[90vh] overflow-hidden">
                <div className="flex justify-between items-center px-8 py-6 border-b border-black/5">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground">
                            {initialData ? "Refine Company" : "Connect Company"}
                        </h2>
                        <p className="text-sm text-muted-foreground font-medium">
                            {initialData ? "Update your company metadata and integrations." : "Add a new company to start syncing reviews."}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-muted-foreground hover:bg-black/5 rounded-full transition-colors bg-black/5 sm:bg-transparent"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-8 py-6 overflow-y-auto flex-1 custom-scrollbar">
                    <form id="company-form" onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80 ml-1">Company Name *</label>
                                <input
                                    type="text"
                                    name="company_name"
                                    value={formData.company_name || ""}
                                    onChange={handleChange}
                                    className="w-full rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40"
                                    placeholder="e.g. Acme Corp"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80 ml-1">Official Website</label>
                                <input
                                    type="url"
                                    name="website"
                                    value={formData.website || ""}
                                    onChange={handleChange}
                                    className="w-full rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40"
                                    placeholder="https://acme.com"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80 ml-1">Description</label>
                            <textarea
                                name="description"
                                value={formData.description || ""}
                                onChange={handleChange}
                                rows={3}
                                className="w-full rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none placeholder:text-muted-foreground/40"
                                placeholder="What does this company do?"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80 ml-1">App Store ID (iOS)</label>
                                <input
                                    type="text"
                                    name="apple_id"
                                    value={formData.apple_id || ""}
                                    onChange={handleChange}
                                    className="w-full rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40"
                                    placeholder="e.g. 123456789"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80 ml-1">Play Store ID (Android)</label>
                                <input
                                    type="text"
                                    name="android_id"
                                    value={formData.android_id || ""}
                                    onChange={handleChange}
                                    className="w-full rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40"
                                    placeholder="e.g. com.example.app"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80 ml-1">Trustpilot Link</label>
                            <input
                                type="url"
                                name="trustpilot_link"
                                value={formData.trustpilot_link || ""}
                                onChange={handleChange}
                                className="w-full rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/40"
                                placeholder="https://www.trustpilot.com/review/..."
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground/80 ml-1 flex items-center justify-between">
                                Google Maps Links
                                <span className="text-[10px] font-normal normal-case opacity-40">Comma-separated URLs</span>
                            </label>
                            <textarea
                                value={mapLinksInput}
                                onChange={(e) => setMapLinksInput(e.target.value)}
                                rows={2}
                                className="w-full rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all resize-none placeholder:text-muted-foreground/40"
                                placeholder="https://maps.google.com/..."
                            />
                        </div>

                        {error && (
                            <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold rounded-xl animate-in shake duration-300">
                                {error}
                            </div>
                        )}
                    </form>
                </div>

                <div className="px-8 py-6 border-t border-black/5 flex justify-end gap-3 bg-black/[0.02]">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="px-6 py-2.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="company-form"
                        disabled={loading}
                        className="px-8 py-2.5 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90 rounded-full shadow-md transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-2"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {initialData ? "Save Changes" : "Connect"}
                    </button>
                </div>
            </div>
        </div>
    );
}
