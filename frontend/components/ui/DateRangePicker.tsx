"use client";

import { useState, useEffect, useRef } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DateRangePickerProps {
    startDate: string;
    endDate: string;
    onStartChange: (value: string) => void;
    onEndChange: (value: string) => void;
    /** A = Unified Pill  |  B = Separate Chips  |  C = Segmented Badges  |  D = Custom Calendar Dropdown */
    variant?: "A" | "B" | "C" | "D";
    size?: "sm" | "md";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDate(s: string): Date | null {
    if (!s) return null;
    const d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
}

function fmtShort(s: string): string {
    const d = parseDate(s);
    if (!d) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getMonthDays(year: number, month: number): Array<{ date: Date; inMonth: boolean }> {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const cells: Array<{ date: Date; inMonth: boolean }> = [];

    // Leading days from prev month (week starts Monday)
    const startDow = (firstDay.getDay() + 6) % 7;
    for (let i = startDow - 1; i >= 0; i--) {
        cells.push({ date: new Date(year, month, -i), inMonth: false });
    }

    // Current month
    for (let d = 1; d <= lastDay.getDate(); d++) {
        cells.push({ date: new Date(year, month, d), inMonth: true });
    }

    // Trailing days to complete the grid
    const remainder = cells.length % 7;
    if (remainder > 0) {
        for (let i = 1; i <= 7 - remainder; i++) {
            cells.push({ date: new Date(year, month + 1, i), inMonth: false });
        }
    }

    return cells;
}

function getPresets(today: Date) {
    const todayStr = toDateStr(today);

    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);

    const l7 = new Date(today);
    l7.setDate(l7.getDate() - 6);

    const l14 = new Date(today);
    l14.setDate(l14.getDate() - 13);

    const l30 = new Date(today);
    l30.setDate(l30.getDate() - 29);

    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - (today.getDay() + 6) % 7);

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    return [
        { label: "Yesterday", start: toDateStr(yest), end: toDateStr(yest) },
        { label: "Last 7 days", start: toDateStr(l7), end: todayStr },
        { label: "Last 14 days", start: toDateStr(l14), end: todayStr },
        { label: "Last 30 days", start: toDateStr(l30), end: todayStr },
        { label: "This week", start: toDateStr(weekStart), end: todayStr },
        { label: "This month", start: toDateStr(monthStart), end: todayStr },
    ];
}

// ─── Month Calendar Sub-component ─────────────────────────────────────────────

interface MonthCalendarProps {
    year: number;
    month: number;
    tempStart: string;
    tempEnd: string;
    hovered: string | null;
    selectingEnd: boolean;
    onDayClick: (dateStr: string) => void;
    onDayHover: (dateStr: string | null) => void;
    onPrev: () => void;
    onNext: () => void;
}

function MonthCalendar({
    year, month, tempStart, tempEnd, hovered, selectingEnd,
    onDayClick, onDayHover, onPrev, onNext,
}: MonthCalendarProps) {
    const monthName = new Date(year, month).toLocaleDateString("en-US", { month: "long", year: "numeric" });
    const days = getMonthDays(year, month);
    const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
    const todayStr = toDateStr(new Date());

    const effectiveEnd = tempEnd || (selectingEnd && hovered ? hovered : "");

    const rangeStart = tempStart && effectiveEnd
        ? (tempStart <= effectiveEnd ? tempStart : effectiveEnd)
        : tempStart;
    const rangeEnd = tempStart && effectiveEnd
        ? (tempStart <= effectiveEnd ? effectiveEnd : tempStart)
        : effectiveEnd;

    return (
        <div className="w-[230px]">
            {/* Month Header */}
            <div className="flex items-center justify-between mb-3">
                <button
                    onClick={onPrev}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-semibold text-foreground">{monthName}</span>
                <button
                    onClick={onNext}
                    className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                >
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Day Labels */}
            <div className="grid grid-cols-7 mb-1">
                {DAY_LABELS.map(d => (
                    <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">
                        {d}
                    </div>
                ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7">
                {days.map(({ date, inMonth }, i) => {
                    const ds = toDateStr(date);
                    const isToday = ds === todayStr;
                    const isStart = ds === tempStart;
                    const isEnd = ds === tempEnd || (selectingEnd && ds === hovered && !tempEnd);
                    const inRange = rangeStart && rangeEnd && ds > rangeStart && ds < rangeEnd;
                    const isSelected = isStart || (tempEnd && isEnd);

                    // Determine rounded corners for range
                    const isRangeEdgeStart = ds === rangeStart && rangeEnd && rangeStart !== rangeEnd;
                    const isRangeEdgeEnd = ds === rangeEnd && rangeStart && rangeStart !== rangeEnd;

                    return (
                        <div
                            key={i}
                            className={cn(
                                "relative h-9 flex items-center justify-center",
                                inRange && "bg-primary/10",
                                isRangeEdgeStart && "rounded-l-full",
                                isRangeEdgeEnd && "rounded-r-full",
                            )}
                        >
                            <button
                                disabled={!inMonth}
                                onClick={() => inMonth && onDayClick(ds)}
                                onMouseEnter={() => onDayHover(ds)}
                                onMouseLeave={() => onDayHover(null)}
                                className={cn(
                                    "w-8 h-8 flex items-center justify-center rounded-full text-[13px] font-medium transition-all duration-100",
                                    !inMonth && "text-muted-foreground/25 cursor-default pointer-events-none",
                                    inMonth && !isSelected && !isToday && "hover:bg-muted text-foreground cursor-pointer",
                                    isToday && !isSelected && inMonth && "font-bold text-primary border border-primary/30 cursor-pointer hover:bg-primary/5",
                                    isSelected && inMonth && "bg-primary text-primary-foreground font-semibold shadow-sm cursor-pointer hover:bg-primary/90 z-10 relative",
                                    inRange && !isSelected && inMonth && "text-foreground",
                                )}
                            >
                                {date.getDate()}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Variant D: Custom Calendar Dropdown ─────────────────────────────────────

function CustomCalendarPicker({
    startDate,
    endDate,
    onStartChange,
    onEndChange,
    size = "sm",
}: Omit<DateRangePickerProps, "variant">) {
    const today = new Date();
    const [isOpen, setIsOpen] = useState(false);
    const [tempStart, setTempStart] = useState(startDate);
    const [tempEnd, setTempEnd] = useState(endDate);
    const [hovered, setHovered] = useState<string | null>(null);
    const [selectingEnd, setSelectingEnd] = useState(false);

    // Left calendar defaults to previous month, right to current
    const getInitialMonths = (): [[number, number], [number, number]] => {
        if (startDate && endDate) {
            const s = parseDate(startDate);
            const e = parseDate(endDate);
            if (s && e) return [[s.getFullYear(), s.getMonth()], [e.getFullYear(), e.getMonth()]];
        }
        const prev = new Date(today);
        prev.setMonth(prev.getMonth() - 1);
        return [[prev.getFullYear(), prev.getMonth()], [today.getFullYear(), today.getMonth()]];
    };

    const [[leftYear, leftMonth], setLeft] = useState(getInitialMonths()[0]);
    const [[rightYear, rightMonth], setRight] = useState(getInitialMonths()[1]);

    const containerRef = useRef<HTMLDivElement>(null);

    // Sync temp when props change from outside
    useEffect(() => { setTempStart(startDate); }, [startDate]);
    useEffect(() => { setTempEnd(endDate); }, [endDate]);

    // Ensure right calendar is always ahead of left
    useEffect(() => {
        const l = new Date(leftYear, leftMonth);
        const r = new Date(rightYear, rightMonth);
        if (r <= l) {
            const next = new Date(l);
            next.setMonth(next.getMonth() + 1);
            setRight([next.getFullYear(), next.getMonth()]);
        }
    }, [leftYear, leftMonth, rightYear, rightMonth]);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const handleDayClick = (ds: string) => {
        if (!selectingEnd) {
            // First click → set start, wait for end
            setTempStart(ds);
            setTempEnd("");
            setSelectingEnd(true);
        } else {
            // Second click → set end (swap if needed)
            if (ds < tempStart) {
                setTempEnd(tempStart);
                setTempStart(ds);
            } else {
                setTempEnd(ds);
            }
            setSelectingEnd(false);
        }
    };

    const handlePreset = (start: string, end: string) => {
        setTempStart(start);
        setTempEnd(end);
        setSelectingEnd(false);
        // Navigate calendars to show the preset range
        const s = parseDate(start);
        const e = parseDate(end);
        if (s) setLeft([s.getFullYear(), s.getMonth()]);
        if (e) {
            if (s && e.getFullYear() === s.getFullYear() && e.getMonth() === s.getMonth()) {
                // Same month: show prev + this month
                const prev = new Date(s);
                prev.setMonth(prev.getMonth() - 1);
                setLeft([prev.getFullYear(), prev.getMonth()]);
                setRight([s.getFullYear(), s.getMonth()]);
            } else {
                setRight([e.getFullYear(), e.getMonth()]);
            }
        }
    };

    const handleApply = () => {
        onStartChange(tempStart);
        onEndChange(tempEnd);
        setIsOpen(false);
    };

    const handleReset = () => {
        setTempStart("");
        setTempEnd("");
        setSelectingEnd(false);
    };

    const displayText = () => {
        if (startDate && endDate) return `${fmtShort(startDate)} — ${fmtShort(endDate)}`;
        if (startDate) return `From ${fmtShort(startDate)}`;
        return "Select date range";
    };

    const hasSelection = !!(startDate || endDate);
    const h = size === "sm" ? "h-9" : "h-10";
    const presets = getPresets(today);
    const activePreset = presets.find(p => p.start === tempStart && p.end === tempEnd)?.label ?? null;

    return (
        <div ref={containerRef} className="relative inline-block">
            {/* Trigger Button */}
            <button
                onClick={() => {
                    setIsOpen(!isOpen);
                    if (!isOpen) {
                        setTempStart(startDate);
                        setTempEnd(endDate);
                        setSelectingEnd(false);
                    }
                }}
                className={cn(
                    "flex items-center gap-2.5 px-4 bg-background border rounded-xl font-medium transition-all whitespace-nowrap",
                    "focus:outline-none",
                    isOpen
                        ? "border-primary/60 ring-2 ring-primary/15 shadow-sm"
                        : "border-input hover:border-primary/40",
                    hasSelection ? "text-foreground" : "text-muted-foreground",
                    h,
                    size === "sm" ? "text-sm" : "text-base"
                )}
            >
                <CalendarDays className={cn("h-4 w-4 flex-shrink-0", hasSelection ? "text-primary" : "text-muted-foreground")} />
                <span>{displayText()}</span>
                {hasSelection ? (
                    <span
                        role="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onStartChange("");
                            onEndChange("");
                        }}
                        className="ml-0.5 p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                        <X className="h-3.5 w-3.5" />
                    </span>
                ) : (
                    <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
                )}
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div className={cn(
                    "absolute top-full mt-2 z-50",
                    "bg-background border border-border rounded-2xl",
                    "shadow-xl shadow-black/10",
                    "flex flex-row",
                    "right-0"
                )}>
                    {/* Two-Month Calendars */}
                    <div className="p-5 flex gap-6">
                        <MonthCalendar
                            year={leftYear}
                            month={leftMonth}
                            tempStart={tempStart}
                            tempEnd={tempEnd}
                            hovered={hovered}
                            selectingEnd={selectingEnd}
                            onDayClick={handleDayClick}
                            onDayHover={setHovered}
                            onPrev={() => {
                                const d = new Date(leftYear, leftMonth - 1);
                                setLeft([d.getFullYear(), d.getMonth()]);
                            }}
                            onNext={() => {
                                const next = new Date(leftYear, leftMonth + 1);
                                if (next < new Date(rightYear, rightMonth)) {
                                    setLeft([next.getFullYear(), next.getMonth()]);
                                }
                            }}
                        />
                        <div className="w-px bg-border" />
                        <MonthCalendar
                            year={rightYear}
                            month={rightMonth}
                            tempStart={tempStart}
                            tempEnd={tempEnd}
                            hovered={hovered}
                            selectingEnd={selectingEnd}
                            onDayClick={handleDayClick}
                            onDayHover={setHovered}
                            onPrev={() => {
                                const prev = new Date(rightYear, rightMonth - 1);
                                if (prev > new Date(leftYear, leftMonth)) {
                                    setRight([prev.getFullYear(), prev.getMonth()]);
                                }
                            }}
                            onNext={() => {
                                const d = new Date(rightYear, rightMonth + 1);
                                setRight([d.getFullYear(), d.getMonth()]);
                            }}
                        />
                    </div>

                    {/* Divider */}
                    <div className="w-px bg-border my-4" />

                    {/* Presets + Actions */}
                    <div className="flex flex-col justify-between p-5 w-44">
                        <div className="flex flex-col gap-0.5">
                            {presets.map(p => (
                                <button
                                    key={p.label}
                                    onClick={() => handlePreset(p.start, p.end)}
                                    className={cn(
                                        "text-left px-3 py-2 rounded-lg text-sm transition-colors",
                                        activePreset === p.label
                                            ? "text-primary font-semibold bg-primary/8"
                                            : "text-primary hover:bg-muted font-medium"
                                    )}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex gap-2 pt-4 border-t border-border">
                            <button
                                onClick={handleReset}
                                className="flex-1 py-2 text-sm font-medium text-muted-foreground border border-input rounded-lg hover:bg-muted transition-colors"
                            >
                                Reset
                            </button>
                            <button
                                onClick={handleApply}
                                className="flex-1 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export function DateRangePicker({
    startDate,
    endDate,
    onStartChange,
    onEndChange,
    variant = "A",
    size = "sm",
}: DateRangePickerProps) {
    const h = size === "sm" ? "h-8" : "h-9";
    const text = size === "sm" ? "text-xs" : "text-sm";
    const w = size === "sm" ? "w-28" : "w-32";

    // ─── VARIANT D: Custom Calendar Dropdown ───────────────────────────────
    if (variant === "D") {
        return (
            <CustomCalendarPicker
                startDate={startDate}
                endDate={endDate}
                onStartChange={onStartChange}
                onEndChange={onEndChange}
                size={size}
            />
        );
    }

    // ─── VARIANT A: Unified Pill ───────────────────────────────────────────
    if (variant === "A") {
        return (
            <div
                className={cn(
                    "flex items-center gap-1.5 px-3 bg-background border border-input rounded-lg",
                    "focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50",
                    "hover:border-primary/40 transition-colors",
                    h
                )}
            >
                <CalendarDays className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <input
                    type="date"
                    value={startDate}
                    onChange={(e) => onStartChange(e.target.value)}
                    className={cn("bg-transparent font-medium text-foreground focus:outline-none [color-scheme:light]", text, w)}
                />
                <span className="text-muted-foreground px-0.5 select-none">→</span>
                <input
                    type="date"
                    value={endDate}
                    onChange={(e) => onEndChange(e.target.value)}
                    className={cn("bg-transparent font-medium text-foreground focus:outline-none [color-scheme:light]", text, w)}
                />
            </div>
        );
    }

    // ─── VARIANT B: Separate Chips ─────────────────────────────────────────
    if (variant === "B") {
        return (
            <div className="flex items-center gap-2">
                <div
                    className={cn(
                        "flex items-center gap-2 px-3 bg-background border border-input rounded-lg",
                        "focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50",
                        "hover:border-primary/40 transition-colors",
                        h
                    )}
                >
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className={cn("text-muted-foreground font-medium select-none", text)}>From</span>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => onStartChange(e.target.value)}
                        className={cn("bg-transparent font-medium text-foreground focus:outline-none [color-scheme:light]", text, w)}
                    />
                </div>
                <span className={cn("text-muted-foreground select-none", text)}>—</span>
                <div
                    className={cn(
                        "flex items-center gap-2 px-3 bg-background border border-input rounded-lg",
                        "focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/50",
                        "hover:border-primary/40 transition-colors",
                        h
                    )}
                >
                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    <span className={cn("text-muted-foreground font-medium select-none", text)}>To</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={(e) => onEndChange(e.target.value)}
                        className={cn("bg-transparent font-medium text-foreground focus:outline-none [color-scheme:light]", text, w)}
                    />
                </div>
            </div>
        );
    }

    // ─── VARIANT C: Segmented Badges ───────────────────────────────────────
    return (
        <div className="flex items-center gap-1">
            <label
                className={cn(
                    "relative flex items-center gap-1.5 px-3 cursor-pointer",
                    "bg-primary/5 border border-primary/20 rounded-lg",
                    "hover:bg-primary/10 hover:border-primary/40 transition-colors",
                    h
                )}
            >
                <CalendarDays className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                <span className={cn("font-medium text-foreground select-none", text)}>
                    {startDate
                        ? new Date(startDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                        : "Start date"}
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
                <input
                    type="date"
                    value={startDate}
                    onChange={(e) => onStartChange(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full"
                />
            </label>

            <span className={cn("text-muted-foreground px-1 select-none", text)}>→</span>

            <label
                className={cn(
                    "relative flex items-center gap-1.5 px-3 cursor-pointer",
                    "bg-primary/5 border border-primary/20 rounded-lg",
                    "hover:bg-primary/10 hover:border-primary/40 transition-colors",
                    h
                )}
            >
                <CalendarDays className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                <span className={cn("font-medium text-foreground select-none", text)}>
                    {endDate
                        ? new Date(endDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                        : "End date"}
                </span>
                <ChevronDown className="h-3 w-3 text-muted-foreground" />
                <input
                    type="date"
                    value={endDate}
                    onChange={(e) => onEndChange(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full"
                />
            </label>
        </div>
    );
}
