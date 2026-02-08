"use client";

import { useState } from "react";
import { Upload, Link as LinkIcon, Loader2 } from "lucide-react";

interface UploadDataProps {
    onDataLoaded: (url: string) => void;
}

export function UploadData({ onDataLoaded }: UploadDataProps) {
    const [uploadMethod, setUploadMethod] = useState<'file' | 'url'>('url');
    const [s3Url, setS3Url] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [dragActive, setDragActive] = useState(false);

    const handleUrlSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!s3Url.trim()) return;

        setIsLoading(true);
        try {
            onDataLoaded(s3Url);
        } catch (error) {
            console.error('Error loading data:', error);
            alert('Failed to load data from URL');
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = async (file: File) => {
        if (!file.name.endsWith('.csv')) {
            alert('Please upload a CSV file');
            return;
        }

        setIsLoading(true);
        try {
            // Create a local URL for the file
            const fileUrl = URL.createObjectURL(file);
            onDataLoaded(fileUrl);
        } catch (error) {
            console.error('Error uploading file:', error);
            alert('Failed to upload file');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileUpload(e.dataTransfer.files[0]);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            handleFileUpload(e.target.files[0]);
        }
    };

    return (
        <div className="max-w-3xl mx-auto space-y-6">
            <div className="bg-white rounded-xl shadow-md border border-slate-200 p-8">
                <h2 className="text-2xl font-bold text-slate-800 mb-2">Upload Analysis Data</h2>
                <p className="text-slate-600 mb-6">
                    Load analyzed review data from an S3 URL or upload a CSV file directly
                </p>

                {/* Method Selector */}
                <div className="flex gap-4 mb-6">
                    <button
                        onClick={() => setUploadMethod('url')}
                        className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${uploadMethod === 'url'
                                ? 'bg-teal-500 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                    >
                        <LinkIcon className="h-5 w-5" />
                        S3 URL
                    </button>
                    <button
                        onClick={() => setUploadMethod('file')}
                        className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${uploadMethod === 'file'
                                ? 'bg-teal-500 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                    >
                        <Upload className="h-5 w-5" />
                        File Upload
                    </button>
                </div>

                {/* S3 URL Input */}
                {uploadMethod === 'url' && (
                    <form onSubmit={handleUrlSubmit} className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">
                                S3 URL or Direct CSV Link
                            </label>
                            <input
                                type="text"
                                value={s3Url}
                                onChange={(e) => setS3Url(e.target.value)}
                                placeholder="https://s3.amazonaws.com/bucket/analyzed_reviews.csv"
                                className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                                disabled={isLoading}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading || !s3Url.trim()}
                            className="w-full bg-teal-500 hover:bg-teal-600 text-white font-bold py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                    Loading Data...
                                </>
                            ) : (
                                <>
                                    <LinkIcon className="h-5 w-5" />
                                    Load from URL
                                </>
                            )}
                        </button>
                    </form>
                )}

                {/* File Upload */}
                {uploadMethod === 'file' && (
                    <div>
                        <div
                            onDragEnter={handleDrag}
                            onDragLeave={handleDrag}
                            onDragOver={handleDrag}
                            onDrop={handleDrop}
                            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${dragActive
                                    ? 'border-teal-500 bg-teal-50'
                                    : 'border-slate-300 hover:border-slate-400'
                                }`}
                        >
                            <Upload className="h-12 w-12 mx-auto mb-4 text-slate-400" />
                            <p className="text-lg font-semibold text-slate-700 mb-2">
                                Drop your CSV file here
                            </p>
                            <p className="text-sm text-slate-500 mb-4">or</p>
                            <label className="inline-block">
                                <input
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileChange}
                                    className="hidden"
                                    disabled={isLoading}
                                />
                                <span className="bg-teal-500 hover:bg-teal-600 text-white font-bold py-3 px-6 rounded-lg cursor-pointer transition-colors inline-flex items-center gap-2">
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="h-5 w-5 animate-spin" />
                                            Processing...
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="h-5 w-5" />
                                            Choose File
                                        </>
                                    )}
                                </span>
                            </label>
                            <p className="text-xs text-slate-500 mt-4">
                                Supports CSV files from the analyze_reviews function
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <h3 className="font-bold text-blue-900 mb-2">📋 Instructions</h3>
                <ul className="text-sm text-blue-800 space-y-2">
                    <li>• <strong>S3 URL:</strong> Paste the download link from your analysis results</li>
                    <li>• <strong>File Upload:</strong> Upload the analyzed CSV file directly from your computer</li>
                    <li>• The CSV must contain columns: sentiment, emotion, confidence, topics, rating, date, brand</li>
                </ul>
            </div>
        </div>
    );
}
