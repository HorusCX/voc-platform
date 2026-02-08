"use client";

import { useEffect, useState } from "react";
import { VoCService } from "@/lib/api";
import { Card } from "../ui/Card";
import { Loader2, CheckCircle, ExternalLink, Send } from "lucide-react";
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
    const [finalSuccess, setFinalSuccess] = useState(false);

    // Polling Logic
    useEffect(() => {
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

        if (status === 'polling') {
            interval = setInterval(check, 10000); // 10s
            check(); // initial
        }

        return () => clearInterval(interval);
    }, [jobId, status]);

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

            setDimensions(dims);

        } catch (e) {
            console.error(e);
            alert("Failed to process data.");
        } finally {
            setSubmittingDims(false);
        }
    };

    const handleSubmitDimensions = async () => {
        setSubmittingDims(true);
        try {
            await VoCService.submitDimensions({
                dimensions: dimensions,
                bucket_name: data?.s3_bucket,
                file_key: data?.s3_key || data?.file_path
            });
            setFinalSuccess(true);
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

    if (status === 'polling') {
        return (
            <Card className="max-w-xl mx-auto text-center py-12">
                <Loader2 className="h-12 w-12 text-calo-primary animate-spin mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Scraping in Progress...</h2>
                <p className="text-calo-text-secondary animate-pulse">{data?.message || "Initializing..."}</p>
                <p className="text-xs text-calo-text-secondary mt-4">This usually takes 3-5 minutes. You can leave this page open.</p>
                <p className="text-xs text-calo-text-secondary mt-4">Job ID: {jobId}</p>
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

    // --- COMPLETED VIEW ---

    if (finalSuccess) {
        return (
            <Card className="max-w-2xl mx-auto text-center py-12 bg-green-50 border-green-200">
                <h2 className="text-2xl font-bold text-green-700 mb-4">✨ VoC Magic is happening</h2>
                <p className="text-slate-700 text-lg">
                    Dashboard link will be sent to <strong>info@horuscx.com</strong> shortly.
                </p>
                <button onClick={onReset} className="mt-8 text-green-700 underline">Start New Analysis</button>
            </Card>
        );
    }

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            {/* SUCCESS CARD */}
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
                    {/* 1. Dashboard Link if available */}
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
                        <>
                            <a
                                href={data.csv_download_url.startsWith('http') ? data.csv_download_url : `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${data.csv_download_url}`}
                                download
                                target="_blank"
                                className="inline-flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-6 py-3 rounded-lg font-bold shadow-sm transition-colors"
                            >
                                <ExternalLink className="h-4 w-4" /> Download CSV
                            </a>

                            {/* View Dashboard Button */}
                            <a
                                href={`/dashboard?csv_url=${encodeURIComponent(data.csv_download_url)}`}
                                className="inline-flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-600 text-white px-6 py-3 rounded-lg font-bold shadow-md transition-colors"
                            >
                                📊 View Dashboard
                            </a>
                        </>
                    )}

                    {/* 2. Forward / Process Button */}
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
                            {submittingDims ? <Loader2 className="animate-spin" /> : <><Send className="h-4 w-4" /> Submit {dimensions.length} Dimensions 🚀</>}
                        </button>
                    </div>
                </Card>
            )}
        </div>
    );
}
