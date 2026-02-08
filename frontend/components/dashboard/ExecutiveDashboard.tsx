"use client";

import { DashboardData, DimensionStats } from "@/lib/dashboard-utils";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface ExecutiveDashboardProps {
    data: DashboardData;
}

export function ExecutiveDashboard({ data }: ExecutiveDashboardProps) {
    return (
        <div className="space-y-8">
            {/* Process Flow */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <ProcessStep icon="📊" label={`${data.totalReviews} reviews analyzed (All)`} />
                <ProcessStep icon="🤖" label="AI-powered Sentiment & Topics" />
                <ProcessStep icon="💡" label="Structured Insights" />
                <ProcessStep icon="✅" label="Actionable Recommendations" />
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <KPICard
                    title="Total Reviews"
                    value={data.totalReviews.toString()}
                    className="bg-white"
                />
                <KPICard
                    title="Avg Rating"
                    value={data.avgRating.toFixed(2)}
                    subtitle={<StarRating rating={data.avgRating} />}
                    className="bg-white"
                />
                <KPICard
                    title="Negative %"
                    value={`${data.negativePercent.toFixed(1)}%`}
                    className="bg-red-50 text-red-700 border-red-200"
                    large
                />
                <KPICard
                    title="Positive %"
                    value={`${data.positivePercent.toFixed(1)}%`}
                    className="bg-green-50 text-green-700 border-green-200"
                    large
                />
                <KPICard
                    title="Net Sentiment"
                    value={`${data.netSentiment > 0 ? '+' : ''}${data.netSentiment.toFixed(1)}%`}
                    className={`${data.netSentiment >= 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}
                    large
                />
            </div>

            {/* Sentiment Trend Chart */}
            <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4">Sentiment Trend (Last 90 Days)</h3>
                <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={data.sentimentTrend}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="week" stroke="#64748b" style={{ fontSize: '12px' }} />
                        <YAxis stroke="#64748b" style={{ fontSize: '12px' }} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                        />
                        <Legend />
                        <Line
                            type="monotone"
                            dataKey="positive"
                            stroke="#10b981"
                            strokeWidth={2}
                            name="Positive"
                            dot={{ fill: '#10b981', r: 4 }}
                        />
                        <Line
                            type="monotone"
                            dataKey="negative"
                            stroke="#ef4444"
                            strokeWidth={2}
                            name="Negative"
                            dot={{ fill: '#ef4444', r: 4 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            {/* Brand Comparison Overview */}
            {data.brandStats.length > 1 && (
                <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Brand Comparison Overview</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="text-left py-3 px-4 font-bold text-slate-700">BRAND</th>
                                    <th className="text-center py-3 px-4 font-bold text-slate-700">REVIEWS</th>
                                    <th className="text-center py-3 px-4 font-bold text-slate-700">AVG RATING</th>
                                    <th className="text-center py-3 px-4 font-bold text-slate-700">NEG %</th>
                                    <th className="text-center py-3 px-4 font-bold text-slate-700">POS %</th>
                                    <th className="text-center py-3 px-4 font-bold text-slate-700">NET SENT %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.brandStats.map((brand, idx) => (
                                    <tr key={idx} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}>
                                        <td className="py-3 px-4 font-semibold text-slate-800">{brand.brand}</td>
                                        <td className="py-3 px-4 text-center text-slate-600">{brand.reviews}</td>
                                        <td className="py-3 px-4 text-center text-slate-600">{brand.avgRating.toFixed(2)}</td>
                                        <td className="py-3 px-4 text-center text-red-600 font-semibold">{brand.negativePercent.toFixed(1)}%</td>
                                        <td className="py-3 px-4 text-center text-green-600 font-semibold">{brand.positivePercent.toFixed(1)}%</td>
                                        <td className={`py-3 px-4 text-center font-bold ${brand.netSentiment >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {brand.netSentiment > 0 ? '+' : ''}{brand.netSentiment.toFixed(1)}%
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Dimension Performance by Brand */}
            <DimensionPerformanceMatrix data={data} />
        </div>
    );
}

function ProcessStep({ icon, label }: { icon: string; label: string }) {
    return (
        <div className="bg-white rounded-lg border border-slate-200 p-4 text-center shadow-sm">
            <div className="text-2xl mb-2">{icon}</div>
            <div className="text-xs text-slate-600 font-medium">{label}</div>
        </div>
    );
}

interface KPICardProps {
    title: string;
    value: string;
    subtitle?: React.ReactNode;
    className?: string;
    large?: boolean;
}

function KPICard({ title, value, subtitle, className = "bg-white", large = false }: KPICardProps) {
    return (
        <div className={`rounded-xl shadow-md border p-6 ${className}`}>
            <div className="text-sm font-bold text-slate-600 mb-2">{title}</div>
            <div className={`font-bold ${large ? 'text-4xl' : 'text-3xl'} mb-1`}>{value}</div>
            {subtitle && <div className="mt-2">{subtitle}</div>}
        </div>
    );
}

function StarRating({ rating }: { rating: number }) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;

    return (
        <div className="flex items-center gap-1 text-yellow-500">
            {[...Array(5)].map((_, i) => {
                if (i < fullStars) {
                    return <span key={i}>⭐</span>;
                } else if (i === fullStars && hasHalfStar) {
                    return <span key={i}>⭐</span>;
                } else {
                    return <span key={i} className="opacity-30">⭐</span>;
                }
            })}
        </div>
    );
}

function DimensionPerformanceMatrix({ data }: { data: DashboardData }) {
    const [viewMode, setViewMode] = React.useState<'positive' | 'net'>('net');

    return (
        <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-800">Dimension Performance by Brand</h3>
                <div className="flex gap-2">
                    <button
                        onClick={() => setViewMode('positive')}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${viewMode === 'positive'
                                ? 'bg-teal-500 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                    >
                        % Positive
                    </button>
                    <button
                        onClick={() => setViewMode('net')}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${viewMode === 'net'
                                ? 'bg-teal-500 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                    >
                        Net Sentiment
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-slate-200">
                            <th className="text-left py-3 px-4 font-bold text-slate-700">DIMENSION</th>
                            {data.brandStats.map((brand, idx) => (
                                <th key={idx} className="text-center py-3 px-4 font-bold text-slate-700">{brand.brand}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {data.dimensionStats.slice(0, 15).map((dim, idx) => (
                            <tr key={idx} className={`border-b border-slate-100 ${idx % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}>
                                <td className="py-3 px-4 font-semibold text-slate-800">{dim.dimension}</td>
                                {data.brandStats.map((brand, brandIdx) => {
                                    const value = viewMode === 'positive' ? dim.positivePercent : dim.netSentiment;
                                    const color = value >= 0 ? 'text-green-600' : 'text-red-600';
                                    return (
                                        <td key={brandIdx} className={`py-3 px-4 text-center font-semibold ${color}`}>
                                            {value > 0 ? '+' : ''}{value.toFixed(1)}%
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

// Add React import for useState
import React from 'react';
