"use client";

import { DashboardData } from "@/lib/dashboard-utils";

interface OperationalDashboardProps {
    data: DashboardData;
}

export function OperationalDashboard({ data }: OperationalDashboardProps) {
    return (
        <div className="space-y-8">
            {/* Strength & Weakness Analysis */}
            <div className="bg-gradient-to-br from-slate-50 to-white rounded-xl shadow-md border border-slate-200 p-8">
                <h2 className="text-xl font-bold text-slate-800 mb-6">All Brands Strength & Weakness Analysis</h2>

                <div className="grid md:grid-cols-2 gap-8">
                    {/* Main Strengths */}
                    <div className="border-l-4 border-green-500 pl-6">
                        <h3 className="text-lg font-bold text-green-700 mb-4">Main Strengths</h3>
                        <div className="space-y-3">
                            {data.topStrengths.length > 0 ? (
                                data.topStrengths.map((dim, idx) => (
                                    <div key={idx} className="flex items-start gap-2">
                                        <span className="text-green-600 font-bold text-lg">✅</span>
                                        <div className="flex-1">
                                            <div className="font-semibold text-slate-800">
                                                {dim.dimension}
                                                <span className="ml-2 text-green-600 font-bold">
                                                    +{dim.netSentiment.toFixed(1)}% net
                                                </span>
                                            </div>
                                            <div className="text-sm text-slate-600">
                                                {dim.positivePercent.toFixed(0)}% positive
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-slate-500 italic">No significant strengths identified</p>
                            )}
                        </div>
                    </div>

                    {/* Main Weaknesses */}
                    <div className="border-l-4 border-red-500 pl-6">
                        <h3 className="text-lg font-bold text-red-700 mb-4">Main Weaknesses</h3>
                        <div className="space-y-3">
                            {data.topWeaknesses.length > 0 ? (
                                data.topWeaknesses.map((dim, idx) => (
                                    <div key={idx} className="flex items-start gap-2">
                                        <span className="text-red-600 font-bold text-lg">🔴</span>
                                        <div className="flex-1">
                                            <div className="font-semibold text-slate-800">
                                                {dim.dimension}
                                                <span className="ml-2 text-red-600 font-bold">
                                                    {dim.netSentiment.toFixed(1)}% net
                                                </span>
                                            </div>
                                            <div className="text-sm text-slate-600">
                                                {dim.negativePercent.toFixed(0)}% negative, {dim.total} mentions
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p className="text-slate-500 italic">No significant weaknesses identified</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Dimension Analysis Table */}
            <div className="bg-white rounded-xl shadow-md border border-slate-200 p-6">
                <h2 className="text-xl font-bold text-slate-800 mb-6">Dimension Analysis</h2>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b-2 border-slate-300 bg-slate-50">
                                <th className="text-left py-3 px-4 font-bold text-slate-700">RANK</th>
                                <th className="text-left py-3 px-4 font-bold text-slate-700">DIMENSION</th>
                                <th className="text-center py-3 px-4 font-bold text-slate-700">TOTAL</th>
                                <th className="text-center py-3 px-4 font-bold text-slate-700">POS</th>
                                <th className="text-center py-3 px-4 font-bold text-slate-700">NEG</th>
                                <th className="text-center py-3 px-4 font-bold text-slate-700">NEU</th>
                                <th className="text-center py-3 px-4 font-bold text-slate-700">POS%</th>
                                <th className="text-center py-3 px-4 font-bold text-slate-700">NEG%</th>
                                <th className="text-center py-3 px-4 font-bold text-slate-700">NET</th>
                                <th className="text-center py-3 px-4 font-bold text-slate-700">IMPACT</th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.dimensionStats.map((dim, idx) => (
                                <tr
                                    key={idx}
                                    className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                                        }`}
                                >
                                    <td className="py-3 px-4 text-center font-bold text-slate-500">{idx + 1}</td>
                                    <td className="py-3 px-4 font-semibold text-slate-800">{dim.dimension}</td>
                                    <td className="py-3 px-4 text-center text-slate-600">{dim.total}</td>
                                    <td className="py-3 px-4 text-center text-green-600 font-semibold">{dim.positive}</td>
                                    <td className="py-3 px-4 text-center text-red-600 font-semibold">{dim.negative}</td>
                                    <td className="py-3 px-4 text-center text-slate-500">{dim.neutral}</td>
                                    <td className="py-3 px-4 text-center text-green-600 font-semibold">
                                        {dim.positivePercent.toFixed(1)}%
                                    </td>
                                    <td className="py-3 px-4 text-center text-red-600 font-semibold">
                                        {dim.negativePercent.toFixed(1)}%
                                    </td>
                                    <td className={`py-3 px-4 text-center font-bold ${dim.netSentiment >= 0 ? 'text-green-600' : 'text-red-600'
                                        }`}>
                                        {dim.netSentiment > 0 ? '+' : ''}{dim.netSentiment.toFixed(1)}%
                                    </td>
                                    <td className="py-3 px-4 text-center font-bold text-slate-700">
                                        {dim.impact.toFixed(2)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {data.dimensionStats.length === 0 && (
                    <div className="text-center py-12 text-slate-500">
                        <p className="text-lg">No dimension data available</p>
                        <p className="text-sm mt-2">Topics may not have been extracted from the reviews</p>
                    </div>
                )}
            </div>
        </div>
    );
}
