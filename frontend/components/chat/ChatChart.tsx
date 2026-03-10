"use client";

import {
    ResponsiveContainer,
    Tooltip,
    Legend,
    CartesianGrid,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    LineChart,
    Line,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
} from "recharts";

export interface YKeySpec {
    key: string;
    label: string;
    color?: string;
}

export interface ChartSpec {
    type: "bar" | "line" | "pie" | "area";
    title: string;
    data: Record<string, string | number>[];
    xKey: string;
    yKeys: YKeySpec[];
}

const CHART_COLORS = [
    "#3C83F6",
    "#10b981",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
];

const TOOLTIP_STYLE: React.CSSProperties = {
    backgroundColor: "var(--popover)",
    border: "1px solid var(--border)",
    borderRadius: "8px",
    fontSize: "12px",
    color: "var(--popover-foreground)",
};

const AXIS_TICK_STYLE = { fontSize: 11, fill: "var(--muted-foreground)" };

function resolveColors(yKeys: YKeySpec[]): YKeySpec[] {
    return yKeys.map((yk, idx) => ({
        ...yk,
        color: yk.color ?? CHART_COLORS[idx % CHART_COLORS.length],
    }));
}

function CartesianChartInner({
    spec,
    yKeys,
}: {
    spec: ChartSpec;
    yKeys: YKeySpec[];
}) {
    const commonProps = {
        data: spec.data,
        margin: { top: 4, right: 16, left: 0, bottom: 4 },
    };

    const axes = (
        <>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.5} />
            <XAxis
                dataKey={spec.xKey}
                tick={AXIS_TICK_STYLE}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
            />
            <YAxis
                tick={AXIS_TICK_STYLE}
                axisLine={false}
                tickLine={false}
                width={40}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.3 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
        </>
    );

    if (spec.type === "bar") {
        return (
            <BarChart {...commonProps}>
                {axes}
                {yKeys.map((yk) => (
                    <Bar key={yk.key} dataKey={yk.key} name={yk.label} fill={yk.color} radius={[3, 3, 0, 0]} />
                ))}
            </BarChart>
        );
    }

    if (spec.type === "area") {
        return (
            <AreaChart {...commonProps}>
                {axes}
                {yKeys.map((yk) => (
                    <Area
                        key={yk.key}
                        type="monotone"
                        dataKey={yk.key}
                        name={yk.label}
                        stroke={yk.color}
                        fill={yk.color}
                        fillOpacity={0.15}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                    />
                ))}
            </AreaChart>
        );
    }

    // line (default)
    return (
        <LineChart {...commonProps}>
            {axes}
            {yKeys.map((yk) => (
                <Line
                    key={yk.key}
                    type="monotone"
                    dataKey={yk.key}
                    name={yk.label}
                    stroke={yk.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                />
            ))}
        </LineChart>
    );
}

function PieChartInner({ spec, yKeys }: { spec: ChartSpec; yKeys: YKeySpec[] }) {
    const dataKey = yKeys[0]?.key ?? "value";
    return (
        <PieChart margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <Pie
                data={spec.data}
                dataKey={dataKey}
                nameKey={spec.xKey}
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) =>
                    `${name ?? ""} (${(((percent as number) ?? 0) * 100).toFixed(0)}%)`
                }
                labelLine={false}
            >
                {spec.data.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
        </PieChart>
    );
}

export function ChatChart({ spec }: { spec: ChartSpec }) {
    if (!spec.data || spec.data.length === 0) {
        return (
            <div className="my-3 rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
                No data available for this chart.
            </div>
        );
    }

    const yKeys = resolveColors(spec.yKeys);

    return (
        <div className="my-3 rounded-xl border border-border bg-card p-4 shadow-sm w-full not-prose">
            {spec.title && (
                <p className="text-sm font-semibold text-foreground mb-3">{spec.title}</p>
            )}
            <ResponsiveContainer width="100%" height={280}>
                {spec.type === "pie" ? (
                    <PieChartInner spec={spec} yKeys={yKeys} />
                ) : (
                    <CartesianChartInner spec={spec} yKeys={yKeys} />
                )}
            </ResponsiveContainer>
        </div>
    );
}
