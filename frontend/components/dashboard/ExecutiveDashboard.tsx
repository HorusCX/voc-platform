"use client";

import React from 'react';
import { DashboardData } from "@/lib/dashboard-utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Smartphone, MapPin, Star, Globe } from "lucide-react";

interface ExecutiveDashboardProps {
    data: DashboardData;
}

export function ExecutiveDashboard({ data }: ExecutiveDashboardProps) {
    return (
        <div className="space-y-8">
            {/* Process Flow - Simplified */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <ProcessStep label={`${data.totalReviews} Reviews`} active />
                <ProcessStep label="AI Analysis" active />
                <ProcessStep label="Insights" active />
                <ProcessStep label="Recommendations" active />
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <KPICard
                    title="Total Reviews"
                    value={data.totalReviews.toString()}
                />
                <KPICard
                    title="Avg Rating"
                    value={data.avgRating.toFixed(2)}
                    subtitle={<StarRating rating={data.avgRating} />}
                />
                <KPICard
                    title="Negative %"
                    value={`${data.negativePercent.toFixed(1)}%`}
                    trend="negative"
                />
                <KPICard
                    title="Positive %"
                    value={`${data.positivePercent.toFixed(1)}%`}
                    trend="positive"
                />
                <KPICard
                    title="Net Sentiment"
                    value={`${data.netSentiment > 0 ? '+' : ''}${data.netSentiment.toFixed(1)}%`}
                    trend={data.netSentiment >= 0 ? "positive" : "negative"}
                    highlight
                />
            </div>

            {/* Sentiment Trend Chart */}
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground mb-6 tracking-tight">Sentiment Trend (90 Days)</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data.sentimentTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis
                            dataKey="week"
                            stroke="var(--muted-foreground)"
                            style={{ fontSize: '11px', fontFamily: 'var(--font-inter)' }}
                            tickLine={false}
                            axisLine={false}
                            dy={10}
                        />
                        <YAxis
                            stroke="var(--muted-foreground)"
                            style={{ fontSize: '11px', fontFamily: 'var(--font-inter)' }}
                            tickLine={false}
                            axisLine={false}
                            dx={-10}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: 'var(--popover)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                fontSize: '12px',
                                color: 'var(--popover-foreground)'
                            }}
                        />
                        <Line
                            type="monotone"
                            dataKey="positive"
                            stroke="var(--primary)"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="negative"
                            stroke="var(--muted-foreground)"
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-6 mt-4 text-xs text-muted-foreground font-medium">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-primary" />
                        Positive
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-muted-foreground" />
                        Negative
                    </div>
                </div>
            </div>

            {/* Review Sources Breakdown */}
            <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-foreground mb-6 tracking-tight">Review Sources</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {data.platformStats.map((stat, idx) => {
                        let Icon = Globe;
                        let color = "text-muted-foreground";
                        let bg = "bg-muted";

                        if (stat.platform === 'App Store') { Icon = Smartphone; color = "text-blue-500"; bg = "bg-blue-500/10"; }
                        if (stat.platform === 'Google Play') { Icon = Smartphone; color = "text-green-500"; bg = "bg-green-500/10"; }
                        if (stat.platform === 'Google Maps') { Icon = MapPin; color = "text-red-500"; bg = "bg-red-500/10"; }
                        if (stat.platform === 'Trustpilot') { Icon = Star; color = "text-emerald-500"; bg = "bg-emerald-500/10"; }

                        return (
                            <div key={idx} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-background/50">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${bg}`}>
                                    <Icon className={`w-5 h-5 ${color}`} />
                                </div>
                                <div>
                                    <div className="text-xs text-muted-foreground font-medium">{stat.platform}</div>
                                    <div className="text-lg font-bold text-foreground">{stat.count}</div>
                                    <div className="text-[10px] text-muted-foreground">{stat.percentage.toFixed(0)}%</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Brand Comparison Overview */}
            {
                data.brandStats.length > 1 && (
                    <div className="bg-card rounded-2xl border border-border p-6 shadow-sm overflow-hidden">
                        <h3 className="text-sm font-semibold text-foreground mb-6 tracking-tight">Brand Comparison</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead>
                                    <tr className="border-b border-border text-xs text-muted-foreground font-medium uppercase tracking-wider">
                                        <th className="py-3 px-4 pl-0 font-medium">Brand</th>
                                        <th className="py-3 px-4 font-medium text-right">Reviews</th>
                                        <th className="py-3 px-4 font-medium text-right">Rating</th>
                                        <th className="py-3 px-4 font-medium text-right">Neg %</th>
                                        <th className="py-3 px-4 font-medium text-right">Pos %</th>
                                        <th className="py-3 px-4 pr-0 font-medium text-right">Net</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {data.brandStats.map((brand, idx) => (
                                        <tr key={idx} className="group hover:bg-muted/50 transition-colors">
                                            <td className="py-3 px-4 pl-0 font-medium text-card-foreground">{brand.brand}</td>
                                            <td className="py-3 px-4 text-right text-muted-foreground tabular-nums">{brand.reviews}</td>
                                            <td className="py-3 px-4 text-right text-muted-foreground tabular-nums">{brand.avgRating.toFixed(2)}</td>
                                            <td className="py-3 px-4 text-right text-destructive/80 tabular-nums">{brand.negativePercent.toFixed(1)}%</td>
                                            <td className="py-3 px-4 text-right text-muted-foreground tabular-nums">{brand.positivePercent.toFixed(1)}%</td>
                                            <td className={`py-3 px-4 pr-0 text-right font-medium tabular-nums ${brand.netSentiment >= 0 ? 'text-foreground' : 'text-destructive'}`}>
                                                {brand.netSentiment > 0 ? '+' : ''}{brand.netSentiment.toFixed(1)}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            }

            <DimensionPerformanceMatrix data={data} />
        </div>
    );
}

function ProcessStep({ label, active = false }: { label: string; active?: boolean }) {
    return (
        <div className={`rounded-xl border p-4 text-center transition-all ${active ? 'bg-card border-border shadow-sm' : 'bg-muted border-transparent opacity-50'
            }`}>
            {/* Icon removed */}
            <div className="text-xs text-muted-foreground font-medium">{label}</div>
        </div>
    );
}

interface KPICardProps {
    title: string;
    value: string;
    subtitle?: React.ReactNode;
    trend?: 'positive' | 'negative' | 'neutral';
    highlight?: boolean;
}

function KPICard({ title, value, subtitle, trend, highlight = false }: KPICardProps) {
    return (
        <div className={`rounded-2xl border p-5 flex flex-col justify-between h-full transition-all ${highlight
            ? 'bg-primary border-primary text-primary-foreground shadow-lg shadow-border/50'
            : 'bg-card border-border shadow-sm'
            }`}>
            <div>
                <div className={`text-xs font-medium mb-1 ${highlight ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{title}</div>
                <div className={`font-semibold text-2xl tracking-tight ${trend === 'positive' && !highlight ? 'text-foreground' :
                    trend === 'negative' && !highlight ? 'text-destructive' :
                        highlight ? 'text-primary-foreground' : 'text-foreground'
                    }`}>
                    {value}
                </div>
            </div>
            {subtitle && <div className="mt-2">{subtitle}</div>}
        </div>
    );
}

function StarRating({ rating }: { rating: number }) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    return (
        <div className="flex items-center gap-0.5 text-yellow-400/90 text-xs">
            {[...Array(5)].map((_, i) => {
                if (i < fullStars) {
                    return <span key={i}>★</span>;
                } else if (i === fullStars && hasHalfStar) {
                    return <span key={i} className="opacity-50">★</span>;
                } else {
                    return <span key={i} className="text-muted">★</span>;
                }
            })}
        </div>
    );
}

function DimensionPerformanceMatrix({ data }: { data: DashboardData }) {
    const [viewMode, setViewMode] = React.useState<'positive' | 'net'>('net');

    return (
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold text-foreground tracking-tight">Dimension Performance</h3>
                <div className="flex bg-muted p-1 rounded-lg">
                    <button
                        onClick={() => setViewMode('positive')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${viewMode === 'positive'
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        Positive %
                    </button>
                    <button
                        onClick={() => setViewMode('net')}
                        className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${viewMode === 'net'
                            ? 'bg-card text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        Net Score
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead>
                        <tr className="border-b border-border text-xs text-muted-foreground font-medium uppercase tracking-wider">
                            <th className="py-2 px-4 pl-0 font-medium">Dimension</th>
                            {data.brandStats.map((brand, idx) => (
                                <th key={idx} className="py-2 px-4 font-medium text-center">{brand.brand}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {data.dimensionStats.slice(0, 15).map((dim, idx) => (
                            <tr key={idx} className="group hover:bg-muted/50">
                                <td className="py-3 px-4 pl-0 font-medium text-foreground">{dim.dimension}</td>
                                {data.brandStats.map((brand, brandIdx) => {
                                    const value = viewMode === 'positive' ? dim.positivePercent : dim.netSentiment;
                                    // Logic usually requires getting specific brand value for dimension,
                                    // but assuming DashboardData structure flattens this effectively or we use overall for now.
                                    // *Correction*: detailed brand breakdown might need richer data structure,
                                    // but keeping logic same as original file for now, just styling.

                                    const isPositive = value >= 0;
                                    // const opacity = Math.min(Math.abs(value) / 100 + 0.1, 1); // This line was removed in the instruction

                                    return (
                                        <td key={brandIdx} className="py-3 px-4 text-center tabular-nums">
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${isPositive
                                                ? 'bg-secondary text-secondary-foreground'
                                                : 'bg-destructive/10 text-destructive'
                                                }`}>
                                                {value > 0 ? '+' : ''}{value.toFixed(0)}%
                                            </span>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
