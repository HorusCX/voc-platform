"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Database, Search, FileText, Brain, CheckCircle2, Loader2, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatStreamEvent } from "@/lib/api";

export type ThinkingStep = ChatStreamEvent & { id: string };

interface ThinkingDisplayProps {
    steps: ThinkingStep[];
    isActive: boolean;
    elapsedSeconds: number;
}

const TOOL_ICON: Record<string, React.ReactNode> = {
    sql_analytics: <Database className="h-3.5 w-3.5 text-blue-400" />,
    synthesize_reviews: <FileText className="h-3.5 w-3.5 text-purple-400" />,
    semantic_search: <Search className="h-3.5 w-3.5 text-emerald-400" />,
    generate_chart: <BarChart2 className="h-3.5 w-3.5 text-orange-400" />,
};

const TOOL_BADGE: Record<string, string> = {
    sql_analytics: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    synthesize_reviews: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    semantic_search: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    generate_chart: "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

export function ThinkingDisplay({ steps, isActive, elapsedSeconds }: ThinkingDisplayProps) {
    const [isExpanded, setIsExpanded] = useState(true);

    if (steps.length === 0 && !isActive) return null;

    return (
        <div className={cn(
            "rounded-xl border overflow-hidden transition-all duration-300 text-xs",
            isActive
                ? "border-blue-500/30 bg-blue-500/5"
                : "border-border bg-muted/20"
        )}>
            {/* Header */}
            <button
                onClick={() => setIsExpanded(v => !v)}
                className="w-full flex items-center gap-2 px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
            >
                {isActive ? (
                    <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin shrink-0" />
                ) : (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                )}
                <span className="flex-1 text-left font-medium">
                    {isActive ? "Thinking…" : `Thought for ${elapsedSeconds}s`}
                </span>
                {isExpanded
                    ? <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                    : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            </button>

            {/* Steps */}
            {isExpanded && (
                <div className="px-3 pb-2.5 pt-1 space-y-2 border-t border-border/50">
                    {steps.map(step => (
                        <div key={step.id} className="flex gap-2 items-start">
                            {step.type === "tool_call" && (
                                <>
                                    <div className="mt-0.5 shrink-0">
                                        {TOOL_ICON[step.tool ?? ""] ?? <Brain className="h-3.5 w-3.5 text-muted-foreground" />}
                                    </div>
                                    <div className="flex flex-col gap-1 min-w-0">
                                        <span className={cn(
                                            "inline-flex items-center px-1.5 py-0.5 rounded border font-mono text-[10px] w-fit",
                                            TOOL_BADGE[step.tool ?? ""] ?? "bg-muted text-muted-foreground border-border"
                                        )}>
                                            {step.tool}
                                        </span>
                                        {step.input && (
                                            <span className="text-muted-foreground/60 font-mono break-all line-clamp-2">
                                                {step.input}
                                            </span>
                                        )}
                                    </div>
                                </>
                            )}

                            {step.type === "tool_result" && (
                                <>
                                    <div className="mt-0.5 w-3.5 shrink-0" />
                                    <span className="text-muted-foreground/60 line-clamp-2 italic">
                                        {step.content}
                                    </span>
                                </>
                            )}

                            {step.type === "thinking" && (
                                <>
                                    <Brain className="h-3.5 w-3.5 mt-0.5 text-muted-foreground/50 shrink-0" />
                                    <span className="text-muted-foreground/60 italic line-clamp-3">
                                        {step.content}
                                    </span>
                                </>
                            )}
                        </div>
                    ))}

                    {/* Animated pulse while active */}
                    {isActive && (
                        <div className="flex gap-1 pl-5 pt-0.5">
                            <div className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                            <div className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                            <div className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
