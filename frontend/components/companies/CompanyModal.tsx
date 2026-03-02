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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-card w-full max-w-2xl rounded-xl shadow-xl border border-border flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-6 border-b border-border">
                    <h2 className="text-xl font-semibold">{initialData ? "Edit Company" : "Add Company"}</h2>
                    <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    <form id="company-form" onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Company Name *</label>
                                <input
                                    type="text"
                                    name="company_name"
                                    value={formData.company_name || ""}
                                    onChange={handleChange}
                                    className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder="e.g. Acme Corp"
                                    required
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Website</label>
                                <input
                                    type="url"
                                    name="website"
                                    value={formData.website || ""}
                                    onChange={handleChange}
                                    className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder="https://"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium">Description</label>
                            <textarea
                                name="description"
                                value={formData.description || ""}
                                onChange={handleChange}
                                rows={3}
                                className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                placeholder="Brief description of the company..."
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label className="text-sm font-medium">App Store ID (iOS)</label>
                                <input
                                    type="text"
                                    name="apple_id"
                                    value={formData.apple_id || ""}
                                    onChange={handleChange}
                                    className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder="e.g. 123456789"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-sm font-medium">Play Store ID (Android)</label>
                                <input
                                    type="text"
                                    name="android_id"
                                    value={formData.android_id || ""}
                                    onChange={handleChange}
                                    className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder="e.g. com.example.app"
                                />
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium">Trustpilot Link</label>
                            <input
                                type="url"
                                name="trustpilot_link"
                                value={formData.trustpilot_link || ""}
                                onChange={handleChange}
                                className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                placeholder="https://www.trustpilot.com/review/..."
                            />
                        </div>

                        <div className="space-y-1">
                            <label className="text-sm font-medium flex items-center justify-between">
                                Google Maps Links
                                <span className="text-xs text-muted-foreground font-normal">Comma-separated</span>
                            </label>
                            <textarea
                                value={mapLinksInput}
                                onChange={(e) => setMapLinksInput(e.target.value)}
                                rows={3}
                                className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                                placeholder="https://maps.google.com/..., https://..."
                            />
                        </div>

                        {error && (
                            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-md">
                                {error}
                            </div>
                        )}
                    </form>
                </div>

                <div className="p-6 border-t border-border flex justify-end gap-3 bg-muted/20">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="company-form"
                        disabled={loading}
                        className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors flex items-center gap-2"
                    >
                        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                        {initialData ? "Save Changes" : "Create Company"}
                    </button>
                </div>
            </div>
        </div>
    );
}
