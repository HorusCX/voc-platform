"use client";

import { useEffect, useState } from "react";
import { VoCService } from "@/lib/api";
import { Card } from "../ui/Card";
import { Loader2, CheckCircle, ExternalLink, Send, BarChart3, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface SuccessViewProps {
    jobId: string;
    onReset: () => void;
}

export function SuccessView({ jobId, onReset }: SuccessViewProps) {
    const [status, setStatus] = useState<'polling' | 'completed' | 'failed'>('polling');
    const [data, setData] = useState<any>(null);
    const [dimensions, setDimensions] = useState<any[]>([]); // To hold the dimension form data
    const [submittingDims, setSubmittingDims] = useState(false);

    // Analysis State
    const [analysisJobId, setAnalysisJobId] = useState<string | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState<{
        processed: number;
        total: number;
        message: string;
    } | null>(null);
    const [finalResult, setFinalResult] = useState<any>(null);

    // Polling Logic for Scraper
    useEffect(() => {
        if (status !== 'polling') return;

        let interval: NodeJS.Timeout;
        let attempts = 0;
        const maxAttempts = 60; // 10 mins

        const check = async () => {
            try {
                attempts++;
                const res = await VoCService.checkStatus(jobId);

                if (res.status === 'completed' || res.s3_key) {
                    setData(res);
                    setStatus('completed');
                    clearInterval(interval);
                } else if (res.status === 'running') {
                    // Update data to show progress message
                    setData(res);
                } else if (res.status === 'failed' || attempts > maxAttempts) {
                    setStatus('failed');
                    clearInterval(interval);
                }
            } catch (e) {
                console.error("Poll error", e);
            }
        };

        interval = setInterval(check, 10000); // 10s
        check(); // initial

        return () => clearInterval(interval);
    }, [jobId, status]);

    // Polling Logic for Analysis
    useEffect(() => {
        if (!analyzing || !analysisJobId) return;

        const interval = setInterval(async () => {
            try {
                const res = await VoCService.checkStatus(analysisJobId);
                console.log("Analysis Status:", res);

                if (res.status === 'completed') {
                    setFinalResult(res);
                    setAnalyzing(false);
                    setAnalysisJobId(null);
                } else if (res.status === 'running' || res.status === 'processing') {
                    setAnalysisProgress({
                        processed: res.processed || 0,
                        total: res.total || 0,
                        message: res.message || "Analyzing reviews..."
                    });
                } else if (res.status === 'error' || res.status === 'failed') {
                    alert(`Analysis failed: ${res.message || "Unknown error"}`);
                    setAnalyzing(false);
                    setAnalysisJobId(null);
                }
            } catch (e) {
                console.error("Analysis poll error", e);
            }
        }, 5000); // Poll every 5s

        return () => clearInterval(interval);
    }, [analyzing, analysisJobId]);


    // Handle "Process Extracted Data"
    const handleProcessData = async () => {
        setSubmittingDims(true);
        try {
            // Data extraction helper
            const extract = (field: string) => {
                // simplified logic based on voc.js
                if (data[field]) return data[field];
                return null;
            };

            const payload = {
                s3_bucket: extract('s3_bucket'),
                s3_key: extract('s3_key'),
                description: extract('description'),
                sample_reviews: extract('sample_reviews'),
                // Fallback if direct fields aren't populated but we have access to metadata
                job_id: jobId
            };

            const result = await VoCService.sendToWebhook(payload);

            // Parse dimensions result
            let dims = [];
            // Type assertion to handle "unknown" response from webhook
            const resAny = result as any;

            // Logic from voc.js renderDimensionsForm normalization
            const body = resAny.body || resAny.output || resAny.dimensions || resAny;
            if (Array.isArray(body)) dims = body;
            else if (typeof body === 'object' && body && (body as any).dimensions) dims = (body as any).dimensions;

            if (dims.length === 0) {
                console.warn("No dimensions returned from webhook");
                alert("No dimensions were generated. Please check if the extracted data is sufficient.");
            }

            setDimensions(dims);

            // CRITICAL: Update data state with any return file info so it's available for submission
            if (resAny.body?.s3_key || resAny.s3_key) {
                setData((prev: any) => ({
                    ...prev,
                    s3_key: resAny.body?.s3_key || resAny.s3_key,
                    s3_bucket: resAny.body?.s3_bucket || resAny.s3_bucket || prev?.s3_bucket
                }));
            }

        } catch (e) {
            console.error(e);
            alert("Failed to process data. The server might be busy or returned an error.");
        } finally {
            setSubmittingDims(false);
        }
    };

    const handleSubmitDimensions = async () => {
        setSubmittingDims(true);
        try {
            const response = await VoCService.submitDimensions({
                dimensions: dimensions,
                bucket_name: data?.s3_bucket,
                file_key: data?.s3_key || data?.file_path
            });

            // Start analysis tracking
            if (response.job_id) {
                setAnalysisJobId(response.job_id);
                setAnalyzing(true);
            } else {
                // Fallback if no job_id returned (legacy behavior), though backend is updated
                alert("Analysis started but no Job ID returned. Check your email for results.");
            }
        } catch (e) {
            alert("Submission failed");
        } finally {
            setSubmittingDims(false);
        }
    };

    const updateDimension = (idx: number, field: string, val: any) => {
        const newDims = [...dimensions];
        newDims[idx] = { ...newDims[idx], [field]: val };
        setDimensions(newDims);
    };

    // --- RENDER STATES ---

    if (status === 'polling') {
        return (
            <Card className="max-w-xl mx-auto text-center py-12">
                <Loader2 className="h-12 w-12 text-calo-primary animate-spin mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Scraping in Progress...</h2>
                <div className="bg-slate-50 p-4 rounded-md border border-slate-100 max-w-sm mx-auto">
                    <p className="text-calo-text-secondary animate-pulse text-sm font-medium">
                        {data?.message || "Initializing job..."}
                    </p>
                </div>
                <p className="text-xs text-calo-text-secondary mt-6">
                    This usually takes 3-5 minutes depending on the number of reviews.
                    <br />You can leave this page open.
                </p>
                <div className="mt-4 text-xs text-slate-400 font-mono">Job ID: {jobId}</div>
            </Card>
        );
    }

    if (status === 'failed') {
        return (
            <Card className="max-w-xl mx-auto text-center py-12 border-red-200 bg-red-50">
                <h2 className="text-xl font-bold text-red-700 mb-2">Job Failed or Timed Out</h2>
                <button onClick={onReset} className="mt-4 text-sm underline text-red-600">Try Again</button>
            </Card>
        );
    }

    // --- FINAL SUCCESS WITH DASHBOARD ---

    if (finalResult) {
        return (
            <Card className="max-w-2xl mx-auto text-center py-16 bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 shadow-xl">
                <div className="mb-6 inline-flex p-4 bg-white rounded-full shadow-sm">
                    <span className="text-4xl">✨</span>
                </div>

                <h2 className="text-3xl font-extrabold text-green-800 mb-4 tracking-tight">
                    VoC Magic is Complete!
                </h2>

                <p className="text-slate-600 text-lg mb-8 max-w-md mx-auto">
                    We've analyzed your reviews and generated actionable insights.
                </p>

                {/* Action Section */}
                {(finalResult.dashboard_link || finalResult.csv_download_url) && (
                    <div className="mb-8 flex flex-col items-center gap-4 transform hover:scale-105 transition-transform duration-300">
                        <a
                            href={finalResult.dashboard_link || `/dashboard?csv_url=${encodeURIComponent(finalResult.csv_download_url)}`}
                            target="_blank"
                            className="inline-flex items-center justify-center gap-3 bg-green-600 hover:bg-green-700 text-white px-10 py-4 rounded-xl font-bold text-xl shadow-lg hover:shadow-green-500/30 transition-all"
                        >
                            <BarChart3 className="w-6 h-6" />
                            Dashboard
                        </a>
                        {(finalResult.dashboard_link || finalResult.csv_download_url) && (
                            <div className="text-xs text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-100 max-w-sm truncate text-center">
                                Link: <span className="font-mono text-[10px] opacity-70">
                                    {finalResult.dashboard_link || finalResult.csv_download_url}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                <div className="bg-white/60 backdrop-blur-sm rounded-lg p-4 max-w-sm mx-auto border border-green-100 mb-8">
                    <p className="text-sm text-slate-500">
                        {finalResult.email_sent
                            ? "📧 A copy of this report has also been sent to info@horuscx.com"
                            : "ℹ️ Analysis complete."}
                    </p>
                </div>

                <button
                    onClick={onReset}
                    className="text-green-700 hover:text-green-800 font-medium hover:underline text-sm"
                >
                    Start New Analysis
                </button>
            </Card>
        );
    }

    // --- ANALYSIS PROGRESS ---

    if (analyzing) {
        const percent = analysisProgress && analysisProgress.total > 0
            ? Math.round((analysisProgress.processed / analysisProgress.total) * 100)
            : 0;

        return (
            <Card className="max-w-xl mx-auto text-center py-12">
                <div className="mb-6 relative w-20 h-20 mx-auto">
                    <Loader2 className="h-20 w-20 text-indigo-100 animate-spin absolute" />
                    <Loader2 className="h-20 w-20 text-indigo-600 animate-spin absolute top-0 left-0 opacity-20" />
                    <div className="absolute inset-0 flex items-center justify-center font-bold text-indigo-600">
                        {percent}%
                    </div>
                </div>

                <h2 className="text-xl font-bold text-slate-800 mb-2">Analyzing Reviews...</h2>
                <p className="text-slate-500 mb-6 text-sm">
                    {analysisProgress?.message || "Starting analysis engine..."}
                </p>

                {/* Progress Bar */}
                <div className="w-full max-w-sm mx-auto bg-slate-100 rounded-full h-2.5 mb-1 overflow-hidden">
                    <div
                        className="bg-indigo-600 h-2.5 rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${percent}%` }}
                    />
                </div>
                <div className="flex justify-between max-w-sm mx-auto text-xs text-slate-400 mb-8">
                    <span>0%</span>
                    <span>{analysisProgress?.processed || 0} / {analysisProgress?.total || "?"}</span>
                    <span>100%</span>
                </div>

                <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg text-left text-sm text-blue-800 max-w-sm mx-auto">
                    <p className="font-semibold mb-1">ℹ️ This usually takes 2-3 hours.</p>
                    <p className="opacity-80">
                        You can close this tab. We will email <strong>info@horuscx.com</strong> when the dashboard is ready.
                    </p>
                </div>
            </Card>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* COMPLETED SCRAPING CARD */}
            <div className="bg-white rounded-xl shadow-lg border border-green-100 p-8 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="mx-auto bg-green-100 w-16 h-16 rounded-full flex items-center justify-center mb-4">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Scraping Complete!</h2>
                <p className="text-slate-500 mb-6">Your data has been successfully collected.</p>

                {/* SUMMARY TEXT */}
                {data?.summary && (
                    <div className="bg-slate-50 rounded-lg p-5 text-left text-sm border border-slate-200 mb-6 shadow-inner">
                        <h3 className="font-bold text-slate-700 mb-3 uppercase tracking-wider text-xs">Collection Summary</h3>
                        <div className="space-y-1 font-mono text-slate-600">
                            {data.summary.split('\n').map((line: string, i: number) => (
                                <div key={i} className={cn(
                                    "py-1",
                                    line.trim() === "" ? "h-2" : "",
                                    line.startsWith("    -") ? "pl-6 text-xs text-slate-500" : "font-semibold text-slate-800 border-b border-slate-100 pb-1 mt-2 first:mt-0"
                                )}>
                                    {line}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    {/* 1. Dashboard Link if available (from Scraper!?) usually not, but fallback */}
                    {data?.dashboard_link && (
                        <a
                            href={data.dashboard_link}
                            target="_blank"
                            className="inline-flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-6 py-3 rounded-lg font-bold shadow-md transition-colors"
                        >
                            Open Dashboard Report 🚀
                        </a>
                    )}

                    {/* 1.5 CSV Download Link */}
                    {data?.csv_download_url && (
                        <a
                            href={data.csv_download_url.startsWith('http') ? data.csv_download_url : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${data.csv_download_url}`}
                            download
                            target="_blank"
                            className="inline-flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-6 py-3 rounded-lg font-bold shadow-sm transition-all hover:scale-105 active:scale-95"
                        >
                            <Download className="h-5 w-5" />
                            Download Results CSV
                        </a>
                    )}

                    {/* 2. Generate Dimensions Button */}
                    {dimensions.length === 0 && (
                        <button
                            onClick={handleProcessData}
                            disabled={submittingDims}
                            className="inline-flex items-center justify-center gap-2 bg-calo-primary hover:bg-calo-dark text-white px-6 py-3 rounded-full font-bold shadow-md transition-colors disabled:opacity-70"
                        >
                            {submittingDims ? <Loader2 className="animate-spin" /> : "Generate Dimensions ⚡"}
                        </button>
                    )}
                </div>
            </div>

            {/* DIMENSIONS FORM (If generated) */}
            {dimensions.length > 0 && (
                <Card title="Dimensions Analysis" className="animate-in fade-in slide-in-from-bottom-8 duration-700">
                    <div className="space-y-6">
                        {dimensions.map((dim, idx) => (
                            <div key={idx} className="p-4 bg-calo-background-secondary border border-calo-border rounded-lg relative">
                                <span className="absolute top-2 right-2 text-xs font-bold text-calo-text-secondary">#{idx + 1}</span>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs font-bold uppercase text-calo-text-secondary">Dimension</label>
                                        <input
                                            className="w-full mt-1 px-3 py-2 border border-calo-border rounded text-sm bg-white text-slate-800 focus:ring-1 focus:ring-calo-primary"
                                            value={dim.dimension}
                                            onChange={(e) => updateDimension(idx, 'dimension', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase text-calo-text-secondary">Description</label>
                                        <textarea
                                            rows={2}
                                            className="w-full mt-1 px-3 py-2 border border-calo-border rounded text-sm bg-white text-slate-800 focus:ring-1 focus:ring-calo-primary"
                                            value={dim.description}
                                            onChange={(e) => updateDimension(idx, 'description', e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase text-calo-text-secondary">Keywords (Comma Separated)</label>
                                        <input
                                            className="w-full mt-1 px-3 py-2 border border-calo-border rounded text-sm bg-white text-slate-800 focus:ring-1 focus:ring-calo-primary"
                                            value={Array.isArray(dim.keywords) ? dim.keywords.join(', ') : dim.keywords}
                                            onChange={(e) => updateDimension(idx, 'keywords', e.target.value.split(',').map((s: string) => s.trim()))}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}

                        <button
                            onClick={handleSubmitDimensions}
                            disabled={submittingDims}
                            className="w-full bg-calo-primary hover:bg-calo-dark text-white font-bold py-3 rounded-full flex items-center justify-center gap-2 transition-colors shadow-sm"
                        >
                            {submittingDims ? <Loader2 className="animate-spin" /> : <><Send className="h-4 w-4" /> Start Analysis & Generate Dashboard 🚀</>}
                        </button>
                    </div>
                </Card>
            )}
        </div>
    );
}

