'use client';

import React, { useState } from 'react';
import { UserPlus, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { VoCService } from '@/lib/api';

export function TeamManagement() {
    const { currentPortfolio } = usePortfolio();
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error' | null, message: string }>({ type: null, message: '' });

    if (!currentPortfolio) return null;

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim() || !currentPortfolio) return;

        setIsSubmitting(true);
        setStatus({ type: null, message: '' });

        try {
            console.log("📤 Sending invite for portfolio:", currentPortfolio.id, "to:", email.trim());
            // We need to add this method to VoCService
            await VoCService.inviteToPortfolio(currentPortfolio.id, email.trim());
            setStatus({ type: 'success', message: 'Invitation sent!' });
            setEmail('');
            // Reset status after 3 seconds
            setTimeout(() => setStatus({ type: null, message: '' }), 3000);
        } catch (error: any) {
            console.error("❌ Invite failed:", error);
            const errorMsg = error.response?.data?.error || error.response?.data?.detail || error.message || 'Invitation failed';
            setStatus({
                type: 'error',
                message: errorMsg
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-4">
            <form className="flex flex-col gap-3" onSubmit={handleInvite}>
                <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">
                        Email Address
                    </label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="collaborator@example.com"
                        className="w-full px-4 py-2.5 bg-background border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                        required
                        disabled={isSubmitting}
                    />
                </div>
                <button
                    type="submit"
                    disabled={isSubmitting || !email.trim()}
                    className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2"
                >
                    {isSubmitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        <>
                            <UserPlus className="h-4 w-4" />
                            Send Invitation
                        </>
                    )}
                </button>
            </form>

            {status.type && (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs animate-in fade-in slide-in-from-top-1 duration-200 ${status.type === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'
                    }`}>
                    {status.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                    <span className="flex-1 font-medium">{status.message}</span>
                </div>
            )}
        </div>
    );
}
