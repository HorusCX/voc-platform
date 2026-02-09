"use client";

import { useState } from "react";
import { StepWebsite } from "./StepWebsite";
import { StepCompetitors } from "./StepCompetitors";
import { StepAppIds } from "./StepAppIds";
import { SuccessView } from "../results/SuccessView";
import { Company } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Globe, Users, Smartphone, Check } from "lucide-react";

export default function VocStepper() {
    const [step, setStep] = useState(1);
    const [data, setData] = useState<{
        competitors?: Company[];
        jobId?: string;
    }>({});

    const handleStep1Complete = (companies: Company[]) => {
        setData((prev) => ({ ...prev, competitors: companies }));
        setStep(2);
    };

    const handleStep2Complete = (companies: Company[]) => {
        setData((prev) => ({ ...prev, competitors: companies }));
        setStep(3);
    };

    const handleStep3Complete = ({ job_id, brands }: { job_id: string; brands: Company[] }) => {
        setData((prev) => ({ ...prev, jobId: job_id, competitors: brands }));
        setStep(4); // 4 = Success/Polling View
    };

    const reset = () => {
        setStep(1);
        setData({});
    };

    // Render Logic
    return (
        <div className="w-full max-w-4xl mx-auto px-4 py-8 relative">

            {/* Stepper Header */}
            {step < 4 && (
                <div className="flex items-center justify-between mb-16 relative w-full max-w-2xl mx-auto">
                    {/* Progress Bar Background */}
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-[1px] bg-border -z-10" />
                    {/* Active Progress */}
                    <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-[1px] bg-primary -z-10 transition-all duration-500 ease-in-out"
                        style={{ width: `${((step - 1) / 2) * 100}%` }}
                    />

                    {[1, 2, 3].map((num) => {
                        const isActive = step >= num;
                        const isCurrent = step === num;

                        return (
                            <div key={num} className="flex flex-col items-center gap-3 bg-background px-2">
                                <div className={cn(
                                    "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ring-4 ring-background border",
                                    isActive
                                        ? "bg-primary border-primary text-primary-foreground shadow-sm"
                                        : "bg-background border-input text-muted-foreground"
                                )}>
                                    {step > num ? (
                                        <Check className="w-5 h-5" />
                                    ) : (
                                        <>
                                            {num === 1 && <Globe className="w-5 h-5" />}
                                            {num === 2 && <Users className="w-5 h-5" />}
                                            {num === 3 && <Smartphone className="w-5 h-5" />}
                                        </>
                                    )}
                                </div>
                                <span className={cn(
                                    "text-xs font-semibold uppercase tracking-wider absolute -bottom-8 whitespace-nowrap transition-colors duration-300",
                                    isActive ? "text-foreground" : "text-muted-foreground"
                                )}>
                                    {num === 1 && "Website"}
                                    {num === 2 && "Competitors"}
                                    {num === 3 && "App IDs"}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Step Content with Animation Wrapper */}
            <div className="min-h-[400px] animate-in fade-in slide-in-from-bottom-4 duration-500">
                {step === 1 && <StepWebsite onComplete={handleStep1Complete} />}

                {step === 2 && data.competitors && (
                    <StepCompetitors
                        initialData={data.competitors}
                        onComplete={handleStep2Complete}
                    />
                )}

                {step === 3 && data.competitors && (
                    <StepAppIds
                        initialData={data.competitors}
                        onComplete={handleStep3Complete}
                    />
                )}

                {step === 4 && data.jobId && (
                    <SuccessView jobId={data.jobId} onReset={reset} />
                )}
            </div>
        </div>
    );
}
