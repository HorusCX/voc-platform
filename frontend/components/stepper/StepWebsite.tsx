"use client";

import { useState } from "react";
import { Company, VoCService } from "@/lib/api";
import { ArrowRight, Globe, Loader2 } from "lucide-react";
import { Card } from "../ui/Card";

interface StepWebsiteProps {
    onComplete: (data: Company[], job_id?: string) => void;
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
            const response = await VoCService.analyzeWebsite(url) as Company[] | { job_id: string };

            if ('job_id' in response) {
                // Async Flow: Poll for result
                const jobId = response.job_id;
                let attempts = 0;
                const maxAttempts = 90; // 180 seconds (3 mins)

                const pollInterval = setInterval(async () => {
                    attempts++;
                    try {
                        const status = await VoCService.checkStatus(jobId);

                        if (status.status === 'completed' && status.result) {
                            clearInterval(pollInterval);
                            setLoading(false);
                            onComplete(status.result as Company[], jobId);
                        } else if (status.status === 'error' || status.status === 'failed') {
                            clearInterval(pollInterval);
                            setLoading(false);
                            setError(status.message || "Analysis failed. Please try again.");
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
                    <label htmlFor="website" className="block text-sm font-medium text-foreground mb-1">
                        Website URL
                    </label>
                    <div className="relative">
                        <Globe className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                        <input
                            id="website"
                            type="url"
                            placeholder="https://example.com"
                            value={url}
                            onChange={(e) => setUrl(e.target.value)}
                            disabled={loading}
                            className="pl-10 w-full rounded-md border border-input py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring transition-colors disabled:opacity-50 text-foreground bg-background placeholder:text-muted-foreground"
                        />
                    </div>
                    {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
                </div>

                <button
                    type="submit"
                    disabled={loading || !url}
                    className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-4 px-6 rounded-full shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed transform hover:-translate-y-0.5"
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
