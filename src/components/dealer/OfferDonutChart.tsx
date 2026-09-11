"use client"

import * as React from "react"

interface OfferBreakdownData {
    PENDING: number
    ACCEPTED: number
    REJECTED: number
    COUNTERED: number
    WITHDRAWN: number
    avgAcceptedAmount: number
    avgTimeToRespond: number
}

interface OfferDonutChartProps {
    data: OfferBreakdownData
    title?: string
    loading?: boolean
}

const SEGMENTS = [
    { key: "ACCEPTED", label: "Accepted", color: "#10b981", hoverColor: "#34d399" },
    { key: "PENDING", label: "Pending", color: "#f59e0b", hoverColor: "#fbbf24" },
    { key: "COUNTERED", label: "Countered", color: "#8b5cf6", hoverColor: "#a78bfa" },
    { key: "REJECTED", label: "Rejected", color: "#ef4444", hoverColor: "#f87171" },
    { key: "WITHDRAWN", label: "Withdrawn", color: "#6b7280", hoverColor: "#9ca3af" },
] as const

export function OfferDonutChart({
    data,
    title = "Offer Performance",
    loading = false,
}: OfferDonutChartProps) {
    const [hoveredSegment, setHoveredSegment] = React.useState<string | null>(null)
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
        const timer = setTimeout(() => setMounted(true), 200)
        return () => clearTimeout(timer)
    }, [])

    if (loading) {
        return (
            <div className="dealer-glass-card p-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mb-6">{title}</h3>
                <div className="flex items-center justify-center py-8">
                    <div className="w-44 h-44 rounded-full bg-white/[0.02] animate-pulse" />
                </div>
            </div>
        )
    }

    const total = SEGMENTS.reduce((sum, s) => sum + (data[s.key] || 0), 0)
    const convRate = total > 0 ? Math.round((data.ACCEPTED / total) * 100) : 0

    const size = 180
    const strokeWidth = 28
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const center = size / 2

    const arcs = SEGMENTS.map((seg, index) => {
        const count = data[seg.key] || 0
        const previousCount = SEGMENTS
            .slice(0, index)
            .reduce((sum, previous) => sum + (data[previous.key] || 0), 0)
        const pct = total > 0 ? count / total : 0
        const dashLength = pct * circumference
        const dashOffset = circumference - (total > 0 ? (previousCount / total) * circumference : 0)

        return {
            ...seg,
            count,
            pct,
            dashArray: `${dashLength} ${circumference - dashLength}`,
            dashOffset,
        }
    })

    function formatCurrency(val: number): string {
        if (val >= 1000000) return `£${(val / 1000000).toFixed(1)}M`
        if (val >= 1000) return `£${(val / 1000).toFixed(1)}k`
        return `£${val.toFixed(0)}`
    }

    return (
        <div className="dealer-glass-card p-6">
            <h3 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mb-6">{title}</h3>

            <div className="flex flex-col items-center">
                <div className="relative">
                    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                        <circle
                            cx={center}
                            cy={center}
                            r={radius}
                            fill="none"
                            stroke="rgba(255,255,255,0.03)"
                            strokeWidth={strokeWidth}
                        />
                        {arcs.map((arc) => (
                            <circle
                                key={arc.key}
                                cx={center}
                                cy={center}
                                r={radius}
                                fill="none"
                                stroke={hoveredSegment === arc.key ? arc.hoverColor : arc.color}
                                strokeWidth={hoveredSegment === arc.key ? strokeWidth + 4 : strokeWidth}
                                strokeDasharray={arc.dashArray}
                                strokeDashoffset={mounted ? arc.dashOffset : circumference}
                                strokeLinecap="round"
                                transform={`rotate(-90 ${center} ${center})`}
                                className="transition-all duration-700 ease-out cursor-pointer"
                                style={{ filter: hoveredSegment === arc.key ? `drop-shadow(0 0 8px ${arc.color}60)` : 'none' }}
                                onMouseEnter={() => setHoveredSegment(arc.key)}
                                onMouseLeave={() => setHoveredSegment(null)}
                            />
                        ))}
                    </svg>

                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-black metallic-foil leading-none">{total}</span>
                        <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mt-1">Total Offers</span>
                        <span className={`text-lg font-black leading-none mt-1 ${convRate >= 30 ? 'text-emerald-400' : convRate >= 15 ? 'text-amber-400' : 'text-red-400'}`}>
                            {convRate}%
                        </span>
                        <span className="text-[8px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Win Rate</span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-x-6 gap-y-2 mt-5 w-full">
                    {arcs.map((arc) => (
                        <div
                            key={arc.key}
                            className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
                                hoveredSegment === arc.key ? 'bg-[var(--bg-card)]' : ''
                            }`}
                            onMouseEnter={() => setHoveredSegment(arc.key)}
                            onMouseLeave={() => setHoveredSegment(null)}
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: arc.color }}
                                />
                                <span className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">{arc.label}</span>
                            </div>
                            <span className="text-[11px] font-black tabular-nums" style={{ color: 'var(--text-primary)' }}>{arc.count}</span>
                        </div>
                    ))}
                </div>

                <div className="flex items-center gap-4 mt-5 pt-5 border-t border-[var(--border-default)] w-full">
                    <div className="flex-1 text-center">
                        <p className="text-lg font-black leading-none" style={{ color: 'var(--text-primary)' }}>{formatCurrency(data.avgAcceptedAmount)}</p>
                        <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mt-1">Avg Accepted</p>
                    </div>
                    <div className="w-px h-10 bg-white/10" />
                    <div className="flex-1 text-center">
                        <p className="text-lg font-black leading-none" style={{ color: 'var(--text-primary)' }}>{data.avgTimeToRespond}h</p>
                        <p className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] mt-1">Avg Response</p>
                    </div>
                </div>
            </div>
        </div>
    )
}
