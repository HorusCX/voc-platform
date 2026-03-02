'use client';

import React, { useState } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useAuth } from '@/contexts/AuthContext';
import { VoCService } from '@/lib/api';
import {
    Plus,
    ChevronDown,
    Layers,
    Check,
    X,
    Loader2
} from 'lucide-react';

export function PortfolioSwitcher() {
    const { user } = useAuth();
    const { portfolios, currentPortfolio, setCurrentPortfolioId, refreshPortfolios, isLoading } = usePortfolio();
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newPortfolioName, setNewPortfolioName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!user) return null;

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPortfolioName.trim()) return;

        setIsSubmitting(true);
        try {
            await VoCService.createPortfolio(newPortfolioName.trim());
            await refreshPortfolios();
            setNewPortfolioName('');
            setIsCreating(false);
        } catch (error: any) {
            console.error('Failed to create portfolio:', error);
            alert(error.response?.data?.detail || 'Failed to create portfolio. You might have reached your plan limit.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="relative px-2 mb-6">
            <div className="flex items-center justify-between mb-1 px-1">
                <span className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">Portfolio</span>
                {user.role === 'admin' && (
                    <button
                        onClick={() => setIsCreating(true)}
                        className="p-1 hover:bg-accent rounded transition-colors text-muted-foreground hover:text-foreground"
                        title="Create New Portfolio"
                    >
                        <Plus size={12} />
                    </button>
                )}
            </div>

            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-3 py-2 bg-accent/50 hover:bg-accent rounded-lg border border-border transition-all text-sm font-medium"
            >
                <div className="flex items-center gap-2 truncate">
                    <Layers size={14} className="text-primary shrink-0" />
                    <span className="truncate">{currentPortfolio?.name || (isLoading ? 'Loading...' : 'Select Portfolio')}</span>
                </div>
                <ChevronDown size={14} className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown */}
            {isOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute left-2 right-2 mt-1 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                        <div className="max-h-[200px] overflow-y-auto py-1 custom-scrollbar">
                            {portfolios.length === 0 && !isLoading && (
                                <div className="px-4 py-2 text-xs text-muted-foreground italic">No portfolios found</div>
                            )}
                            {portfolios.map((p) => (
                                <button
                                    key={p.id}
                                    onClick={() => {
                                        setCurrentPortfolioId(p.id);
                                        setIsOpen(false);
                                    }}
                                    className={`w-full flex items-center justify-between px-3 py-2 text-sm transition-colors ${currentPortfolio?.id === p.id
                                        ? 'bg-primary/10 text-primary font-semibold'
                                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                                        }`}
                                >
                                    <span className="truncate">{p.name}</span>
                                    {currentPortfolio?.id === p.id && <Check size={14} />}
                                </button>
                            ))}
                        </div>
                        {user.role === 'admin' && (
                            <div className="p-1 border-t border-border">
                                <button
                                    onClick={() => {
                                        setIsOpen(false);
                                        setIsCreating(true);
                                    }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/5 rounded-md transition-colors"
                                >
                                    <Plus size={12} />
                                    New Portfolio
                                </button>
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Create Modal */}
            {isCreating && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-card border border-border rounded-xl w-full max-w-sm p-6 shadow-2xl animate-in zoom-in duration-200">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-foreground">New Portfolio</h3>
                            <button
                                onClick={() => setIsCreating(false)}
                                className="text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleCreate}>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">
                                        Portfolio Name
                                    </label>
                                    <input
                                        type="text"
                                        value={newPortfolioName}
                                        onChange={(e) => setNewPortfolioName(e.target.value)}
                                        placeholder="e.g., E-commerce Portfolios"
                                        className="w-full bg-accent/50 border border-border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                        autoFocus
                                        required
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setIsCreating(false)}
                                        className="flex-1 bg-accent hover:bg-accent/80 text-foreground font-medium py-2.5 rounded-lg transition-all text-sm"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={isSubmitting || !newPortfolioName.trim()}
                                        className="flex-[2] bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-primary-foreground font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
                                    >
                                        {isSubmitting ? (
                                            <Loader2 size={16} className="animate-spin" />
                                        ) : (
                                            <>
                                                <Plus size={16} />
                                                Create
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
