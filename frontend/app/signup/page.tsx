"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VoCService } from "@/lib/api";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";

export default function SignupPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const router = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (password !== confirmPassword) {
            setError("Passwords do not match");
            return;
        }

        if (password.length < 6) {
            setError("Password must be at least 6 characters long");
            return;
        }

        setIsSubmitting(true);

        try {
            await VoCService.signup({ email, password });
            // On success, redirect to login page
            router.push("/login?registered=true");
        } catch (err: unknown) {
            if (err && typeof err === 'object' && 'response' in err) {
                const axErr = err as { response?: { data?: { detail?: string } } };
                setError(axErr.response?.data?.detail || "Failed to create account. Email might already exist.");
            } else {
                setError("Failed to create account. Email might already exist.");
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
            {/* Subtle blue tint at top */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(60,131,246,0.06)_0%,_transparent_60%)] pointer-events-none" />
            <div className="absolute inset-0 bg-grid-pattern pointer-events-none opacity-60" />

            <div className="max-w-md w-full space-y-6 relative z-10">
                {/* Brand identity */}
                <div className="text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 mb-4">
                        <Sparkles className="h-6 w-6 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold text-foreground">HorusCX</h1>
                    <p className="text-sm text-muted-foreground mt-1">Voice of Customer Intelligence</p>
                </div>

                {/* Card */}
                <div className="bg-card p-8 rounded-2xl border border-border shadow-sm">
                    <h2 className="text-center text-2xl font-semibold tracking-tight text-foreground mb-2">
                        Create an account
                    </h2>
                    <p className="text-center text-sm text-muted-foreground mb-6">
                        Or{" "}
                        <Link href="/login" className="font-medium text-primary hover:text-primary/80 transition-colors">
                            sign in to your existing account
                        </Link>
                    </p>

                    <form className="space-y-4" onSubmit={handleSubmit}>
                        {error && (
                            <div className="rounded-lg bg-red-500/10 p-4 border border-red-500/20">
                                <h3 className="text-sm font-medium text-red-400">{error}</h3>
                            </div>
                        )}

                        <div className="space-y-3">
                            <div>
                                <label htmlFor="email-address" className="sr-only">
                                    Email address
                                </label>
                                <input
                                    id="email-address"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    className="appearance-none rounded-lg relative block w-full px-3 py-2.5 border border-input placeholder-muted-foreground text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm bg-background transition-colors"
                                    placeholder="Email address"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                            <div>
                                <label htmlFor="password" className="sr-only">
                                    Password
                                </label>
                                <input
                                    id="password"
                                    name="password"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    className="appearance-none rounded-lg relative block w-full px-3 py-2.5 border border-input placeholder-muted-foreground text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm bg-background transition-colors"
                                    placeholder="Password (min. 6 characters)"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>
                            <div>
                                <label htmlFor="confirm-password" className="sr-only">
                                    Confirm Password
                                </label>
                                <input
                                    id="confirm-password"
                                    name="confirm-password"
                                    type="password"
                                    autoComplete="new-password"
                                    required
                                    className="appearance-none rounded-lg relative block w-full px-3 py-2.5 border border-input placeholder-muted-foreground text-foreground focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm bg-background transition-colors"
                                    placeholder="Confirm password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                        >
                            {isSubmitting ? (
                                <span className="flex items-center">
                                    <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" />
                                    Creating account...
                                </span>
                            ) : (
                                "Sign up"
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
