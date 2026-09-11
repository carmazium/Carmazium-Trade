"use client"

import * as React from "react"
import Link from "next/link"
import { MapPin, ArrowRight, Car, Calendar, AlertTriangle, Clock } from "lucide-react"
import type { ServiceJob, ServiceJobStatus, JobVehicle } from "@/lib/servicesApi"

const STATUS: Record<ServiceJobStatus, { label: string; cls: string }> = {
    OPEN: { label: "Open for quotes", cls: "bg-sky-500/10 border-sky-500/25 text-sky-500" },
    ACCEPTED: { label: "Awaiting payment", cls: "bg-amber-500/10 border-amber-500/25 text-amber-500" },
    PAID: { label: "Paid — ready", cls: "bg-emerald-500/10 border-emerald-500/25 text-emerald-500" },
    IN_PROGRESS: { label: "In progress", cls: "bg-emerald-500/10 border-emerald-500/25 text-emerald-500" },
    COMPLETED: { label: "Awaiting confirmation", cls: "bg-violet-500/10 border-violet-500/25 text-violet-500" },
    RELEASED: { label: "Complete", cls: "bg-[var(--bg-input)] border-[var(--border-default)] text-[var(--text-muted)]" },
    CANCELLED: { label: "Cancelled", cls: "bg-[var(--bg-input)] border-[var(--border-default)] text-[var(--text-muted)]" },
    EXPIRED: { label: "Expired", cls: "bg-[var(--bg-input)] border-[var(--border-default)] text-[var(--text-muted)]" },
    DISPUTED: { label: "Disputed", cls: "bg-red-500/10 border-red-500/25 text-red-500" },
}

export function JobStatusBadge({ status }: { status: ServiceJobStatus }) {
    const s = STATUS[status]
    return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border ${s.cls}`}>{s.label}</span>
}
export function RecoveryBadge() {
    return <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider border bg-red-500/10 border-red-500/25 text-red-500"><AlertTriangle size={11} /> Recovery</span>
}
export function vehicleLabel(v: JobVehicle): string {
    const parts = [v.year, v.make, v.model].filter(Boolean).join(" ")
    return parts || v.registration || "Vehicle"
}
export function JobRoute({ job, className = "" }: { job: ServiceJob; className?: string }) {
    if (job.serviceType === "DELIVERY") return <div className={`flex items-center gap-2 text-sm ${className}`}><MapPin size={14} className="text-primary shrink-0" /><span className="font-mono font-bold">{job.pickupPostcode}</span><ArrowRight size={14} className="text-[var(--text-muted)] shrink-0" /><span className="font-mono font-bold">{job.deliveryPostcode}</span></div>
    return <div className={`flex items-center gap-2 text-sm ${className}`}><MapPin size={14} className="text-primary shrink-0" /><span className="font-mono font-bold">{job.servicePostcode}</span></div>
}
export function JobTiming({ job }: { job: ServiceJob }) {
    return <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">{job.requestedFor ? <><Calendar size={12} /> Wanted {new Date(job.requestedFor).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</> : <><Clock size={12} /> As soon as possible</>}</div>
}
export function JobVehicles({ vehicles, compact = false }: { vehicles: JobVehicle[]; compact?: boolean }) {
    if (compact) return <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]"><Car size={14} className="text-[var(--text-muted)] shrink-0" />{vehicles.length === 1 ? vehicleLabel(vehicles[0]) : `${vehicles.length} vehicles`}</div>
    return <ul className="space-y-2">{vehicles.map((v, i) => <li key={v.id ?? i} className="flex items-start gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-input)] px-4 py-3"><Car size={16} className="text-primary mt-0.5 shrink-0" /><div className="min-w-0"><p className="text-sm font-bold">{vehicleLabel(v)}</p><p className="text-xs text-[var(--text-muted)] font-mono">{v.registration || "No registration given"}{v.notes ? <span className="font-sans"> · {v.notes}</span> : null}</p>{v.listing && <Link href={`/vehicle/${v.listing.slug}`} className="text-xs text-primary hover:underline">View listing</Link>}</div></li>)}</ul>
}
export function JobListCard({ job, href, trailing }: { job: ServiceJob; href: string; trailing?: React.ReactNode }) {
    return <Link href={href} className="block rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-5 hover:border-primary/40 transition-colors"><div className="flex items-start justify-between gap-3 mb-3"><div className="min-w-0"><h3 className="font-heading font-black text-base truncate">{job.title}</h3><JobTiming job={job} /></div><div className="flex items-center gap-2 shrink-0">{job.isRecovery && <RecoveryBadge />}<JobStatusBadge status={job.status} /></div></div><JobRoute job={job} className="mb-2" /><div className="flex items-center justify-between gap-3"><JobVehicles vehicles={job.vehicles} compact />{trailing}</div></Link>
}
