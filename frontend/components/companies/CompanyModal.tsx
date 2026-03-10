"use client";

import { useState, useEffect } from "react";
import { Company } from "@/lib/api";
import { Loader2, X, ImageIcon } from "lucide-react";

interface CompanyModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (company: Partial<Company>) => Promise<void>;
    initialData?: Company | null;
}

export function CompanyModal({ isOpen, onClose, onSave, initialData }: CompanyModalProps) {
    const [formData, setFormData] = useState<Partial<Company>>({
        company_name: "",
        arabic_name: "",
        website: "",
        description: "",
        apple_id: "",
        android_id: "",
        trustpilot_link: "",
        logo_url: "",
        google_maps_links: [],
    });
    const [mapLinksInput, setMapLinksInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [logoPreviewError, setLogoPreviewError] = useState(false);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData(initialData);
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
                    arabic_name: "",
                    website: "",
                    description: "",
                    apple_id: "",
                    android_id: "",
                    trustpilot_link: "",
                    logo_url: "",
                    google_maps_links: [],
                });
                setMapLinksInput("");
            }
            setError(null);
            setLoading(false);
            setLogoPreviewError(false);
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        if (name === "logo_url") setLogoPreviewError(false);
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-zinc-200 flex flex-col max-h-[90vh] overflow-hidden">
                <div className="flex justify-between items-center px-8 py-6 border-b border-zinc-200">
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
                        className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-full transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-8 py-6 overflow-y-auto flex-1 custom-scrollbar">
                    <form id="company-form" onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">Company Name *</label>
                                <input
                                    type="text"
                                    name="company_name"
                                    value={formData.company_name || ""}
                                    onChange={handleChange}
                                    className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-zinc-400"
                                    placeholder="e.g. Acme Corp"
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">Arabic Name</label>
                                <input
                                    type="text"
                                    name="arabic_name"
                                    value={formData.arabic_name || ""}
                                    onChange={handleChange}
                                    className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-zinc-400"
                                    placeholder="e.g. أكمي كورب"
                                    dir="rtl"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">Official Website</label>
                                <input
                                    type="url"
                                    name="website"
                                    value={formData.website || ""}
                                    onChange={handleChange}
                                    className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-zinc-400"
                                    placeholder="https://acme.com"
                                />
                        </div>

                        {/* Logo Section */}
                        <div className="space-y-3">
                            <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">Company Logo</label>
                            <div className="flex items-center gap-4">
                                {/* Logo Preview */}
                                <div className="shrink-0 w-16 h-16 rounded-xl border border-zinc-300 bg-zinc-50 flex items-center justify-center overflow-hidden">
                                    {formData.logo_url && !logoPreviewError ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={formData.logo_url}
                                            alt="Logo preview"
                                            className="w-full h-full object-contain p-1"
                                            onError={() => setLogoPreviewError(true)}
                                        />
                                    ) : (
                                        <ImageIcon className="w-6 h-6 text-zinc-400" />
                                    )}
                                </div>
                                <div className="flex-1 space-y-2">
                                    <input
                                        type="url"
                                        name="logo_url"
                                        value={formData.logo_url || ""}
                                        onChange={handleChange}
                                        className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-zinc-400"
                                        placeholder="https://example.com/logo.png"
                                    />
                                    <p className="text-[11px] text-zinc-400 ml-1">
                                        Paste a direct URL to your company logo image.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">Description</label>
                            <textarea
                                name="description"
                                value={formData.description || ""}
                                onChange={handleChange}
                                rows={3}
                                className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none placeholder:text-zinc-400"
                                placeholder="What does this company do?"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">App Store ID (iOS)</label>
                                <input
                                    type="text"
                                    name="apple_id"
                                    value={formData.apple_id || ""}
                                    onChange={handleChange}
                                    className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-zinc-400"
                                    placeholder="e.g. 123456789"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">Play Store ID (Android)</label>
                                <input
                                    type="text"
                                    name="android_id"
                                    value={formData.android_id || ""}
                                    onChange={handleChange}
                                    className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-zinc-400"
                                    placeholder="e.g. com.example.app"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1">Trustpilot Link</label>
                            <input
                                type="url"
                                name="trustpilot_link"
                                value={formData.trustpilot_link || ""}
                                onChange={handleChange}
                                className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all placeholder:text-zinc-400"
                                placeholder="https://www.trustpilot.com/review/..."
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-1 flex items-center justify-between">
                                Google Maps Links
                                <span className="text-[10px] font-normal normal-case text-zinc-400">Comma-separated URLs</span>
                            </label>
                            <textarea
                                value={mapLinksInput}
                                onChange={(e) => setMapLinksInput(e.target.value)}
                                rows={2}
                                className="w-full rounded-xl border border-zinc-300 bg-zinc-50 px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none placeholder:text-zinc-400"
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

                <div className="px-8 py-6 border-t border-zinc-200 flex justify-end gap-3 bg-zinc-50">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={loading}
                        className="px-6 py-2.5 text-sm font-bold text-zinc-500 hover:text-zinc-800 transition-colors"
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
