"use client";

import { DashboardData } from "@/lib/dashboard-utils";

interface OperationalDashboardProps {
    data: DashboardData;
}

export function OperationalDashboard({ data }: OperationalDashboardProps) {
    return (
        <div className="space-y-8">
            {/* Strength & Weakness Analysis */}
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-foreground mb-6 tracking-tight">SWOT Analysis</h2>

                <div className="grid md:grid-cols-2 gap-8">
                    {/* Main Strengths */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-6 bg-primary rounded-full" />
                            <h3 className="text-sm font-medium text-foreground">Key Strengths</h3>
                        </div>
                        <div className="space-y-2">
                            {data.topStrengths.length > 0 ? (
                                data.topStrengths.map((dim, idx) => (
                                    <div key={idx} className="flex flex-col p-3 rounded-lg bg-secondary border border-border">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-medium text-secondary-foreground text-sm">{dim.dimension}</span>
                                            <span className="text-xs font-bold text-secondary-foreground px-1.5 py-0.5 bg-background/50 rounded">
                                                +{dim.netSentiment.toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 h-1.5 bg-background/50 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-primary rounded-full"
                                                    style={{ width: `${dim.positivePercent}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-muted-foreground w-8 text-right">{dim.positivePercent.toFixed(0)}%</span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-muted-foreground text-sm italic">No appreciable strengths found.</p>
                            )}
                        </div>
                    </div>

                    {/* Main Weaknesses */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-1.5 h-6 bg-destructive rounded-full" />
                            <h3 className="text-sm font-medium text-foreground">Critical Weaknesses</h3>
                        </div>
                        <div className="space-y-2">
                            {data.topWeaknesses.length > 0 ? (
                                data.topWeaknesses.map((dim, idx) => (
                                    <div key={idx} className="flex flex-col p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                                        <div className="flex justify-between items-start mb-1">
                                            <span className="font-medium text-foreground text-sm">{dim.dimension}</span>
                                            <span className="text-xs font-bold text-destructive px-1.5 py-0.5 bg-background rounded border border-destructive/20">
                                                {dim.netSentiment.toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 h-1.5 bg-destructive/10 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-destructive rounded-full"
                                                    style={{ width: `${dim.negativePercent}%` }}
                                                />
                                            </div>
                                            <span className="text-xs text-destructive w-8 text-right">{dim.negativePercent.toFixed(0)}%</span>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-muted-foreground text-sm italic">No significant weaknesses found.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Dimension Analysis Table */}
            <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden">
                <div className="p-6 border-b border-border">
                    <h2 className="text-lg font-semibold text-foreground tracking-tight">Full Dimension Analysis</h2>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="bg-muted/50 border-b border-border">
                                <th className="py-3 px-6 font-medium text-muted-foreground text-xs uppercase tracking-wider">Rank</th>
                                <th className="py-3 px-6 font-medium text-muted-foreground text-xs uppercase tracking-wider">Dimension</th>
                                <th className="py-3 px-6 font-medium text-muted-foreground text-xs uppercase tracking-wider text-right">Vol</th>
                                <th className="py-3 px-6 font-medium text-muted-foreground text-xs uppercase tracking-wider text-right">Pos %</th>
                                <th className="py-3 px-6 font-medium text-muted-foreground text-xs uppercase tracking-wider text-right">Neg %</th>
                                <th className="py-3 px-6 font-medium text-muted-foreground text-xs uppercase tracking-wider text-right">Net</th>
                                <th className="py-3 px-6 font-medium text-muted-foreground text-xs uppercase tracking-wider text-right">Impact</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {data.dimensionStats.map((dim, idx) => (
                                <tr
                                    key={idx}
                                    className="hover:bg-muted/50 transition-colors"
                                >
                                    <td className="py-3 px-6 text-muted-foreground font-mono text-xs">{idx + 1}</td>
                                    <td className="py-3 px-6 font-medium text-foreground">{dim.dimension}</td>
                                    <td className="py-3 px-6 text-muted-foreground text-right tabular-nums">{dim.total}</td>
                                    <td className="py-3 px-6 text-muted-foreground text-right tabular-nums">{dim.positivePercent.toFixed(0)}%</td>
                                    <td className="py-3 px-6 text-muted-foreground text-right tabular-nums">{dim.negativePercent.toFixed(0)}%</td>

                                    <td className="py-3 px-6 text-right tabular-nums">
                                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${dim.netSentiment >= 0
                                            ? 'bg-secondary text-secondary-foreground'
                                            : 'bg-destructive/10 text-destructive'
                                            }`}>
                                            {dim.netSentiment > 0 ? '+' : ''}{dim.netSentiment.toFixed(0)}%
                                        </span>
                                    </td>
                                    <td className="py-3 px-6 text-right tabular-nums text-muted-foreground text-xs">
                                        {dim.impact.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {data.dimensionStats.length === 0 && (
                    <div className="text-center py-12 text-muted-foreground">
                        <p className="text-sm">No analysis data available</p>
                    </div>
                )}
            </div>
        </div>
    );
}
