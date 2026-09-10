"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
    Loader2, ArrowLeft, ShieldCheck, FileWarning, Upload, ClipboardList, Eye, Users, Clock, AlertTriangle,
} from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { HpiReportForm } from "@/components/admin/HpiReportForm"
import { HpiPdfUpload } from "@/components/admin/HpiPdfUpload"
import { useAuth } from "@/context/AuthContext"
import { getPendingHpiRequests, type PendingHpiRequest } from "@/lib/hpiApi"

/** A report waiting longer than this gets flagged — matches the reminder cron. */
const OVERDUE_AFTER_DAYS = 3

const LISTING_STATUS_STYLES: Record<string, string> = {
    ACTIVE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    PENDING_REVIEW: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    SOLD: "bg-blue-500/10 text-blue-400 border-blue-500/25",
    REJECTED: "bg-red-500/10 text-red-400 border-red-500/25",
}

function daysSince(iso: string): number {
    return Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000))
}

/**
 * Mandatory vehicle-history/HPI reviews awaiting completion.
 *
 * A PENDING report blocks listing approval. Buyer-paid emailed copies share the
 * same completed report and are shown as waiting recipients where applicable.
 */
export default function AdminHpiQueuePage() {
    const { user, profile, loading: authLoading } = useAuth()
    const router = useRouter()
    const [requests, setRequests] = React.useState<PendingHpiRequest[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [successMsg, setSuccessMsg] = React.useState<string | null>(null)
    const [formTarget, setFormTarget] = React.useState<{ id: string; title: string } | null>(null)
    const [uploadTarget, setUploadTarget] = React.useState<{ id: string; title: string } | null>(null)

    React.useEffect(() => {
        if (authLoading) return
        if (!user) { router.replace('/auth/login'); return }
        if (profile?.role !== 'ADMIN') { router.replace('/dashboard'); return }
        load()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authLoading, user, profile])

    async function load() {
        setLoading(true)
        setError(null)
        try {
            setRequests(await getPendingHpiRequests())
        } catch (e: any) {
            setError(e?.message || 'Failed to load the HPI queue')
        } finally {
            setLoading(false)
        }
    }

    function handleCompleted(message: string) {
        setFormTarget(null)
        setUploadTarget(null)
        setSuccessMsg(message)
        load()
    }

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="animate-spin text-primary" size={28} />
            </div>
        )
    }
    if (!user || profile?.role !== 'ADMIN') return null

    const userName = profile?.firstName
        ? `${profile.firstName} ${profile.lastName || ''}`
        : (user?.email?.split('@')[0] || 'Admin')
    const overdueCount = requests.filter(r => daysSince(r.purchasedAt) >= OVERDUE_AFTER_DAYS).length

    return (
        <div className="min-h-screen pt-20 pb-12">
            <div className="container mx-auto px-5 flex flex-col lg:flex-row gap-8">
                <DashboardSidebar role="admin" userName={userName} userType="Super Admin" />

                <main className="flex-1 space-y-6 min-w-0">
                    <Link
                        href="/dashboard/admin"
                        className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-primary transition-colors"
                    >
                        <ArrowLeft size={15} /> Back to Overview
                    </Link>

                    <header>
                        <h1 className="text-2xl font-black tracking-tight flex items-center gap-3">
                            <ShieldCheck className="text-primary" size={24} />
                            HPI Reports
                        </h1>
                        <p className="text-sm text-[var(--text-muted)] mt-1.5 leading-relaxed max-w-2xl">
                            Mandatory vehicle-history/HPI reviews that must be completed before a listing can go live.
                            Buyer-paid emailed copies, when any are waiting, use the same completed report.
                        </p>
                    </header>

                    {successMsg && (
                        <div className="mb-5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm">
                            {successMsg}
                        </div>
                    )}
                    {error && (
                        <div className="mb-5 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-center gap-2">
                            <AlertTriangle size={15} /> {error}
                        </div>
                    )}

                    {!loading && requests.length > 0 && (
                        <div className="grid grid-cols-2 gap-3 mb-5">
                            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4">
                                <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">Outstanding</p>
                                <p className="text-2xl font-black mt-1">{requests.length}</p>
                            </div>
                            <div className={`rounded-xl border p-4 ${overdueCount > 0
                                ? 'border-amber-500/30 bg-amber-500/5'
                                : 'border-[var(--border-default)] bg-[var(--bg-card)]'}`}>
                                <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
                                    Waiting {OVERDUE_AFTER_DAYS}+ days
                                </p>
                                <p className={`text-2xl font-black mt-1 ${overdueCount > 0 ? 'text-amber-400' : ''}`}>{overdueCount}</p>
                            </div>
                        </div>
                    )}

                    <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] overflow-hidden">
                        {loading ? (
                            <div className="p-12 flex justify-center">
                                <Loader2 className="animate-spin text-primary" size={24} />
                            </div>
                        ) : requests.length === 0 ? (
                            <div className="p-12 text-center">
                                <ClipboardList size={32} className="mx-auto mb-3 text-[var(--text-muted)] opacity-50" />
                                <p className="font-bold text-[var(--text-primary)]">Nothing outstanding</p>
                                <p className="text-xs text-[var(--text-muted)] mt-1">
                                    Every mandatory vehicle-history review is complete.
                                </p>
                            </div>
                        ) : (
                            <ul className="divide-y divide-[var(--border-default)]">
                                {requests.map((r) => {
                                    const waiting = daysSince(r.purchasedAt)
                                    const overdue = waiting >= OVERDUE_AFTER_DAYS
                                    const title = r.listing?.title
                                        || [r.listing?.year, r.listing?.make, r.listing?.model].filter(Boolean).join(' ')
                                        || r.vrm
                                    return (
                                        <li key={r.id} className="p-4 sm:p-5">
                                            <div className="flex flex-wrap items-start gap-3">
                                                <div className="flex-1 min-w-[220px]">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <p className="font-bold text-sm">{title}</p>
                                                        <span className="text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-[var(--bg-input)] border border-[var(--border-default)]">
                                                            {r.vrm}
                                                        </span>
                                                        {r.listing?.status && (
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${LISTING_STATUS_STYLES[r.listing.status] || 'bg-gray-500/10 text-[var(--text-muted)] border-gray-500/25'}`}>
                                                                {r.listing.status.replace('_', ' ')}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-[var(--text-muted)] mt-1 truncate">
                                                        {r.listing?.seller
                                                            ? `${r.listing.seller.firstName ?? ''} ${r.listing.seller.lastName ?? ''}`.trim() || r.listing.seller.email
                                                            : 'Seller unknown'}
                                                        {r.listing?.seller?.email ? ` · ${r.listing.seller.email}` : ''}
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-3 mt-2">
                                                        <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold ${overdue ? 'text-amber-400' : 'text-[var(--text-muted)]'}`}>
                                                            <Clock size={12} />
                                                            Waiting {waiting} day{waiting === 1 ? '' : 's'}
                                                        </span>
                                                        {r.waitingBuyers > 0 && (
                                                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary">
                                                                <Users size={12} />
                                                                {r.waitingBuyers} paid buyer{r.waitingBuyers === 1 ? '' : 's'} waiting
                                                            </span>
                                                        )}
                                                        {r.listing?.slug && (
                                                            <Link
                                                                href={`/buy-cars/${r.listing.slug}`}
                                                                target="_blank"
                                                                className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:underline"
                                                            >
                                                                <Eye size={12} /> View listing
                                                            </Link>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex gap-2 shrink-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => setUploadTarget({ id: r.listingId, title })}
                                                        className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-primary text-white text-[11px] font-black uppercase tracking-widest hover:bg-primary/90 transition-colors cursor-pointer"
                                                    >
                                                        <Upload size={13} /> Upload PDF
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormTarget({ id: r.listingId, title })}
                                                        className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-primary/40 text-[11px] font-black uppercase tracking-widest transition-colors cursor-pointer"
                                                    >
                                                        <FileWarning size={13} /> Fill in form
                                                    </button>
                                                </div>
                                            </div>
                                        </li>
                                    )
                                })}
                            </ul>
                        )}
                    </section>
                </main>
            </div>

            {uploadTarget && (
                <HpiPdfUpload
                    listingId={uploadTarget.id}
                    listingTitle={uploadTarget.title}
                    onClose={() => setUploadTarget(null)}
                    onSaved={() => handleCompleted('Report uploaded — the seller and any waiting buyers have been notified.')}
                />
            )}
            {formTarget && (
                <HpiReportForm
                    listingId={formTarget.id}
                    listingTitle={formTarget.title}
                    onClose={() => setFormTarget(null)}
                    onSaved={() => handleCompleted('Report saved — the seller and any waiting buyers have been notified.')}
                />
            )}
        </div>
    )
}
