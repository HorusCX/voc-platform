"use client";

import { useState } from "react";
import { Loader2, CloudUpload, FileText } from "lucide-react";
import { useDropzone, FileRejection } from "react-dropzone";

interface UploadDataProps {
    onDataLoaded: (url: string) => void;
}

export function UploadData({ onDataLoaded }: UploadDataProps) {
    const [url, setUrl] = useState('');
    const [isFileLoading, setIsFileLoading] = useState(false);
    const [isUrlLoading, setIsUrlLoading] = useState(false);

    const handleUrlImport = async () => {
        if (!url.trim()) return;

        setIsUrlLoading(true);
        try {
            onDataLoaded(url);
        } catch (error) {
            console.error('Error loading data:', error);
            alert('Failed to load data from URL');
        } finally {
            setIsUrlLoading(false);
        }
    };

    const handleFileUpload = async (file: File) => {
        if (!file.name.endsWith('.csv')) {
            alert('Please upload a CSV file');
            return;
        }

        setIsFileLoading(true);
        try {
            // Create a local URL for the file
            const fileUrl = URL.createObjectURL(file);
            onDataLoaded(fileUrl);
        } catch (error) {
            console.error('Error uploading file:', error);
            alert('Failed to upload file');
        } finally {
            setIsFileLoading(false);
        }
    };

    const onDrop = (acceptedFiles: File[], fileRejections: FileRejection[]) => {
        if (fileRejections.length > 0) {
            alert('Invalid file. Please upload a valid CSV.');
            return;
        }
        if (acceptedFiles && acceptedFiles.length > 0) {
            handleFileUpload(acceptedFiles[0]);
        }
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'text/csv': ['.csv'],
        },
        maxFiles: 1,
        disabled: isFileLoading || isUrlLoading,
    });

    return (
        <div className="bg-card rounded-2xl border border-border p-8 shadow-sm text-center">

            <div className="mb-6 flex justify-center">
                <div className="p-4 bg-primary/5 rounded-full ring-1 ring-primary/10">
                    <CloudUpload className="w-10 h-10 text-primary" />
                </div>
            </div>

            <h3 className="text-lg font-semibold text-foreground mb-2 tracking-tight">
                Upload Review Data
            </h3>
            <p className="text-muted-foreground text-sm mb-8 max-w-sm mx-auto">
                Drag and drop your CSV file here, or click to browse.
            </p>

            <div
                {...getRootProps()}
                className={`
                    border-2 border-dashed rounded-xl p-10 cursor-pointer transition-all duration-200
                    flex flex-col items-center justify-center gap-4 group
                    ${isDragActive
                        ? 'border-primary bg-primary/5'
                        : 'border-input hover:border-primary/50 hover:bg-muted/50'
                    }
                `}
            >
                <input {...getInputProps()} />

                <div className="p-3 bg-muted rounded-lg group-hover:scale-110 transition-transform duration-200">
                    {isFileLoading ? (
                        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
                    ) : (
                        <FileText className="w-6 h-6 text-muted-foreground group-hover:text-foreground" />
                    )}
                </div>

                <div className="text-center">
                    <p className="text-sm font-medium text-foreground">
                        {isFileLoading ? "Processing file..." : (isDragActive ? "Drop the file here" : "Click to upload or drag and drop")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                        CSV files only (max 10MB)
                    </p>
                </div>
            </div>

            {/* Manual URL Input Option */}
            <div className="relative mt-8 mb-6">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">Or import from URL</span>
                </div>
            </div>

            <div className="flex gap-2">
                <Input
                    placeholder="https://example.com/data.csv"
                    className="bg-background border-input focus-visible:ring-primary"
                    value={url}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)}
                    disabled={isUrlLoading || isFileLoading}
                />
                <Button
                    variant="outline"
                    className="border-input hover:bg-muted hover:text-foreground"
                    onClick={handleUrlImport}
                    disabled={!url.trim() || isUrlLoading || isFileLoading}
                >
                    {isUrlLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                        "Import"
                    )}
                </Button>
            </div>
        </div>
    );
}

// Simple Button and Input components for this file to avoid big dependencies if not present, 
// or mapped to semantic vars if they are standard HTML. 

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'outline' | 'default';
}

function Button({ className, variant, children, ...props }: ButtonProps) {
    return (
        <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${variant === 'outline'
                ? 'border border-input bg-transparent hover:bg-accent hover:text-accent-foreground text-foreground'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
                } ${className}`}
            {...props}
        >
            {children}
        </button>
    )
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    dummy?: boolean;
}

function Input({ className, ...props }: InputProps) {
    return (
        <input
            className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
            {...props}
        />
    )
}
