"use client";

import { useState, useEffect, useCallback } from "react";
import UserMenu from "@/components/auth/UserMenu";
import { Loader2, Plus, Edit2, Trash2, AlertTriangle, RefreshCcw } from "lucide-react";
import { usePortfolio } from "@/contexts/PortfolioContext";
import { VoCService } from "@/lib/api";

interface Dimension {
    id: number;
    name: string;
    description: string;
    keywords: string[];
}

export default function DimensionsPage() {
    const [dimensions, setDimensions] = useState<Dimension[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isReanalyzing, setIsReanalyzing] = useState(false);
    const [reanalyzeMessage, setReanalyzeMessage] = useState<string | null>(null);

    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [editingDim, setEditingDim] = useState<Dimension | null>(null);
    const [formData, setFormData] = useState({ name: "", description: "", keywords: "" });
    const { currentPortfolio } = usePortfolio();

    // API Helpers
    const fetchDimensions = useCallback(async () => {
        if (!currentPortfolio?.id) {
            setDimensions([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        try {
            const data = await VoCService.getDimensions(currentPortfolio.id) as Dimension[];
            setDimensions(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error loading dimensions");
        } finally {
            setIsLoading(false);
        }
    }, [currentPortfolio?.id]);

    useEffect(() => {
        fetchDimensions();
    }, [currentPortfolio?.id, fetchDimensions]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentPortfolio?.id) return;

        try {
            const payload = {
                name: formData.name,
                description: formData.description,
                keywords: formData.keywords.split(",").map((k: string) => k.trim()).filter(Boolean),
                portfolio_id: currentPortfolio.id
            };

            const apiUrl = process.env.NEXT_PUBLIC_API_URL || ''; // Empty string = relative path (proxied)
            const token = localStorage.getItem('access_token');
            const method = editingDim ? "PUT" : "POST";
            const url = editingDim
                ? `${apiUrl}/api/dimensions/${editingDim.id}`
                : `${apiUrl}/api/dimensions`;

            const res = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error("Failed to save dimension");

            setIsModalOpen(false);
            setEditingDim(null);
            fetchDimensions();
        } catch (err) {
            alert("Error saving dimension: " + (err instanceof Error ? err.message : ""));
        }
    };

    const handleDelete = async () => {
        if (!editingDim) return;
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
            const token = localStorage.getItem('access_token');
            const res = await fetch(`${apiUrl}/api/dimensions/${editingDim.id}`, {
                method: "DELETE",
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error("Failed to delete dimension");

            setIsDeleteModalOpen(false);
            setEditingDim(null);
            fetchDimensions();
        } catch (err) {
            alert("Error deleting: " + (err instanceof Error ? err.message : ""));
        }
    };

    const triggerReanalyze = async () => {
        const confirmMsg = "Warning: Changing these dimensions means all previous review analyses will be redone to ensure consistency. This process may take some time. Do you wish to proceed?";
        if (!window.confirm(confirmMsg)) return;
        if (!currentPortfolio?.id) return;

        setIsReanalyzing(true);
        setReanalyzeMessage(null);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
            const token = localStorage.getItem('access_token');
            const res = await fetch(`${apiUrl}/api/dimensions/reanalyze?portfolio_id=${currentPortfolio.id}`, {
                method: "POST",
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error("Failed to trigger re-analysis");
            setReanalyzeMessage("Re-analysis started in the background. Your dashboard will update automatically as it progresses.");
        } catch (err) {
            alert("Error starting re-analysis: " + (err instanceof Error ? err.message : ""));
        } finally {
            setIsReanalyzing(false);
        }
    };

    const openEditModal = (dim?: Dimension) => {
        if (dim) {
            setEditingDim(dim);
            setFormData({
                name: dim.name,
                description: dim.description || "",
                keywords: dim.keywords ? dim.keywords.join(", ") : ""
            });
        } else {
            setEditingDim(null);
            setFormData({ name: "", description: "", keywords: "" });
        }
        setIsModalOpen(true);
    };

    return (
        <main className="flex-1 min-h-screen bg-background relative flex flex-col font-sans">
            <UserMenu />

            <div className="max-w-5xl mx-auto px-6 py-12 w-full mt-10 md:mt-0">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-3xl font-semibold text-foreground tracking-tight mb-2">Dimensions</h1>
                        <p className="text-muted-foreground">Manage the dimensions (topics) used by AI to analyze your reviews.</p>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={triggerReanalyze}
                            disabled={isReanalyzing}
                            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            {isReanalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                            Re-analyze Active Data
                        </button>
                        <button
                            onClick={() => openEditModal()}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                            <Plus className="h-4 w-4" />
                            Add Dimension
                        </button>
                    </div>
                </div>

                {reanalyzeMessage && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 px-4 py-3 rounded-lg mb-6 text-sm flex items-start gap-3">
                        <RefreshCcw className="h-5 w-5 mt-0.5 flex-shrink-0 animate-spin" />
                        <div>{reanalyzeMessage}</div>
                    </div>
                )}

                <div className="bg-blue-500/10 border border-blue-500/20 text-blue-500 px-4 py-3 rounded-lg mb-6 text-sm flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                    <div>
                        <strong className="block mb-1">Consistency Warning</strong>
                        Modifying dimensions affects how your incoming reviews are categorized by the AI. If you add, edit, or delete a dimension, make sure to click <strong>&quot;Re-analyze Active Data&quot;</strong> to apply the changes retroactively to all your historical reviews.
                    </div>
                </div>

                {error && (
                    <div className="bg-destructive/10 text-destructive text-sm p-4 rounded-lg mb-6 border border-destructive/20">
                        {error}
                    </div>
                )}

                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                        <p className="text-muted-foreground text-sm font-medium">Loading dimensions...</p>
                    </div>
                ) : (
                    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
                        {dimensions.length === 0 ? (
                            <div className="p-8 text-center text-muted-foreground">
                                No dimensions created yet. The AI will auto-generate them during your first data collection if none exist.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border">
                                        <tr>
                                            <th className="px-6 py-4 font-medium w-1/4">Name</th>
                                            <th className="px-6 py-4 font-medium w-1/3">Description</th>
                                            <th className="px-6 py-4 font-medium w-1/4">Keywords</th>
                                            <th className="px-6 py-4 font-medium w-1/12 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        {dimensions.map((dim: Dimension) => (
                                            <tr key={dim.id} className="bg-card hover:bg-muted/30 transition-colors">
                                                <td className="px-6 py-4 font-medium text-foreground">
                                                    {dim.name}
                                                </td>
                                                <td className="px-6 py-4 text-muted-foreground">
                                                    {dim.description || '-'}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-wrap gap-1">
                                                        {dim.keywords?.map((k: string, i: number) => (
                                                            <span key={i} className="bg-muted px-2 py-0.5 rounded-md text-xs text-muted-foreground border border-border">
                                                                {k}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        <button
                                                            onClick={() => openEditModal(dim)}
                                                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
                                                            title="Edit"
                                                        >
                                                            <Edit2 className="h-4 w-4" />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                setEditingDim(dim);
                                                                setIsDeleteModalOpen(true);
                                                            }}
                                                            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
                                                            title="Delete"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Form Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <div className="bg-card border border-border shadow-lg rounded-xl w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-border bg-muted/30 flex justify-between items-center">
                            <h3 className="text-lg font-semibold text-foreground">
                                {editingDim ? "Edit Dimension" : "New Dimension"}
                            </h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                                &times;
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Name</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-primary/50 text-foreground"
                                        placeholder="e.g. Food Quality"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Description</label>
                                    <textarea
                                        rows={2}
                                        value={formData.description}
                                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                                        className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-primary/50 text-foreground"
                                        placeholder="What does this dimension measure?"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-foreground mb-1">Keywords (Comma separated)</label>
                                    <input
                                        type="text"
                                        value={formData.keywords}
                                        onChange={e => setFormData({ ...formData, keywords: e.target.value })}
                                        className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:ring-2 focus:ring-primary/50 text-foreground"
                                        placeholder="taste, temperature, flavor"
                                    />
                                </div>
                            </div>
                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-muted-foreground bg-accent hover:bg-accent/80 rounded-md transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 rounded-md transition-colors"
                                >
                                    Save
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && editingDim && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                    <div className="bg-card border border-border shadow-lg rounded-xl w-full max-sm overflow-hidden">
                        <div className="p-6">
                            <div className="flex items-center gap-3 text-destructive mb-4">
                                <AlertTriangle className="h-6 w-6" />
                                <h3 className="text-lg font-semibold">Delete Dimension</h3>
                            </div>
                            <p className="text-sm text-muted-foreground mb-6">
                                Are you sure you want to delete the dimension <strong>{editingDim.name}</strong>?
                                This dimension will no longer be tracked in future analyses.
                            </p>
                            <div className="flex justify-end gap-3">
                                <button
                                    onClick={() => setIsDeleteModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-muted-foreground bg-accent hover:bg-accent/80 rounded-md transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="px-4 py-2 text-sm font-medium text-white bg-destructive hover:bg-destructive/90 rounded-md transition-colors"
                                >
                                    Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
