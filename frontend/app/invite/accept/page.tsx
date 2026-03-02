'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { VoCService } from '@/lib/api';
import { Loader2, CheckCircle2, AlertCircle, Building2, Lock, Mail } from 'lucide-react';

function AcceptInviteContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const initialEmail = searchParams.get('email') || '';

    const [invitationData, setInvitationData] = useState<{ email: string; portfolio_name: string } | null>(null);
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!token) {
            setError('Missing invitation token.');
            setIsLoading(false);
            return;
        }

        const verifyToken = async () => {
            try {
                const data = await VoCService.getInvitation(token);
                setInvitationData(data as { email: string; portfolio_name: string });
            } catch (err: unknown) {
                setError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Invalid or expired invitation token.');
            } finally {
                setIsLoading(false);
            }
        };

        verifyToken();
    }, [token]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setIsSubmitting(true);
        setError('');

        try {
            interface AcceptInvitationResponse {
                access_token: string;
                user: {
                    id: number;
                    email: string;
                    full_name: string;
                };
            }

            const result = (await VoCService.acceptInvitation({
                email: invitationData?.email || initialEmail,
                password,
                token: token!
            })) as AcceptInvitationResponse;

            // Store token and user info
            localStorage.setItem('access_token', result.access_token);
            localStorage.setItem('user', JSON.stringify(result.user));

            setSuccess(true);
            setTimeout(() => {
                router.push('/');
            }, 2000);
        } catch (err: unknown) {
            setError((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to accept invitation.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error && !invitationData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background p-4 text-center">
                <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 shadow-xl">
                    <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                    <h2 className="text-xl font-bold mb-2">Invitation Error</h2>
                    <p className="text-muted-foreground mb-6">{error}</p>
                    <button
                        onClick={() => router.push('/login')}
                        className="text-primary hover:underline font-medium"
                    >
                        Go to Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 shadow-xl animate-in zoom-in duration-300">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                        <Building2 className="h-8 w-8 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold text-foreground">Join the Team</h1>
                    <p className="text-muted-foreground mt-2">
                        You&apos;ve been invited to join <strong>{invitationData?.portfolio_name}</strong>
                    </p>
                </div>

                {success ? (
                    <div className="text-center py-4 bg-green-500/10 rounded-xl">
                        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                        <h3 className="text-lg font-bold text-green-500 mb-1">Welcome!</h3>
                        <p className="text-sm text-green-500/80">Account created. Redirecting to your dashboard...</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">
                                Email Address
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="email"
                                    value={invitationData?.email || initialEmail}
                                    readOnly
                                    className="w-full bg-accent/30 border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none opacity-70"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">
                                Create Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="At least 6 characters"
                                    className="w-full bg-accent/50 border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    required
                                    minLength={6}
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider ml-1">
                                Confirm Password
                            </label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Repeat your password"
                                    className="w-full bg-accent/50 border border-border rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                                    required
                                    minLength={6}
                                />
                            </div>
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-xl text-xs animate-shake">
                                <AlertCircle className="h-4 w-4" />
                                <span>{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3.5 rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 group"
                        >
                            {isSubmitting ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <>
                                    Accept Invitation
                                    <CheckCircle2 className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </>
                            )}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

export default function AcceptInvitePage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <AcceptInviteContent />
        </Suspense>
    );
}
