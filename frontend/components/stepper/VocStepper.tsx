"use client";

import { useState } from "react";
import { StepWebsite } from "./StepWebsite";
import { StepCompetitors } from "./StepCompetitors";
import { StepAppIds } from "./StepAppIds";
import { SuccessView } from "../results/SuccessView";
import { Company } from "@/lib/api";
import { cn } from "@/lib/utils";

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

            {/* Stepper Header (Only show for steps 1-3) */}
            {step < 4 && (
                <div className="flex items-center justify-between mb-8 relative">
                    {/* Progress Bar Background */}
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 -z-10" />
                    {/* Active Progress */}
                    <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-calo-primary -z-10 transition-all duration-500 ease-in-out"
                        style={{ width: `${((step - 1) / 2) * 100}%` }}
                    />

                    {[1, 2, 3].map((num) => (
                        <div key={num} className="flex flex-col items-center gap-2 bg-calo-mint px-2">
                            <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-colors",
                                step >= num
                                    ? "bg-calo-primary border-calo-primary text-white"
                                    : "bg-white border-calo-border text-calo-text-secondary"
                            )}>
                                {num}
                            </div>
                            <span className={cn(
                                "text-xs font-medium uppercase tracking-wide",
                                step >= num ? "text-calo-primary" : "text-calo-text-secondary"
                            )}>
                                {num === 1 && "Website"}
                                {num === 2 && "Competitors"}
                                {num === 3 && "App IDs"}
                            </span>
                        </div>
                    ))}
                </div>
            )}



            {/* Step Content with Animation Wrapper */}
            <div className="min-h-[400px]">
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
