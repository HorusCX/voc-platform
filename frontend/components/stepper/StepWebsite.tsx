"use client";

import { useState } from "react";
import { VoCService } from "@/lib/api";
import { ArrowRight, Globe, Loader2 } from "lucide-react";
import { Card } from "../ui/Card";

interface StepWebsiteProps {
    onComplete: (data: any) => void;
}

export function StepWebsite({ onComplete }: StepWebsiteProps) {
    const [url, setUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        if (!url) return;

        try {
            new URL(url); // validation
        } catch {
            setError("Please enter a valid URL (e.g., https://example.com)");
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // 1. Submit Job
            const response: any = await VoCService.analyzeWebsite(url);

            if (response.job_id) {
                // Async Flow: Poll for result
                const jobId = response.job_id;
                let attempts = 0;
                const maxAttempts = 30; // 60 seconds (2s interval)

                const pollInterval = setInterval(async () => {
                    attempts++;
                    try {
                        const status: any = await VoCService.checkStatus(jobId);

                        if (status.status === 'completed' && status.result) {
                            clearInterval(pollInterval);
                            setLoading(false);
                            onComplete(status.result);
                        } else if (attempts >= maxAttempts) {
                            clearInterval(pollInterval);
                            setLoading(false);
                            setError("Analysis timed out. Please try again.");
                        }
                    } catch (e) {
                        console.error("Polling error", e);
                        // Don't stop polling on transient error? or stop?
                        // For now let's continue unless max attempts
                    }
                }, 2000);
            } else {
                // Sync Flow (Legacy support or if backend changed back)
                onComplete(response);
                setLoading(false);
            }

        } catch (err) {
            console.error(err);
            setError("Failed to analyze website. Please check the URL and try again.");
            setLoading(false);
        } finally {
            // setLoading(false) moved inside polling logic for async case
        }
    };

    return (
        <Card title="Step 1: Company Website" className="w-full max-w-2xl mx-auto">
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="website" className="block text-sm font-medium text-slate-700 mb-1">
                        Website URL
                    </label>
                    <div className="relative">
                        <Globe className="absolute left-3 top-3 h-5 w-5 text-slate-400" />
                        <input
                            id="website"
                            type="url"
                            placeholder="https://example.com"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            disabled={loading}
                            className="pl-10 w-full rounded-md border border-calo-border py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-calo-primary transition-colors disabled:opacity-50 text-calo-text-main"
                        />
                    </div>
                    {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                </div>

                <button
                    type="submit"
                    disabled={loading || !url}
                    className="w-full flex items-center justify-center gap-2 bg-calo-primary hover:bg-calo-dark text-white font-bold py-3 px-4 rounded-full transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
                >
                    {loading ? (
                        <>
                            <Loader2 className="h-4 w-4 animate-spin" /> Analyzing...
                        </>
                    ) : (
                        <>
                            Analyze Website <ArrowRight className="h-4 w-4" />
                        </>
                    )}
                </button>
            </form>
        </Card>
    );
}
