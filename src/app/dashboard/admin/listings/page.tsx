"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/Button"
import { Car, Loader2, ArrowLeft, Trash2, AlertTriangle, Eye, ChevronDown, Check, X, ClipboardList, Pencil, Gauge, FileWarning } from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { UserDetailModal } from "@/components/dashboard/UserDetailModal"
import { ListingEditModal } from "@/components/dashboard/ListingEditModal"
import { HpiReportForm } from "@/components/admin/HpiReportForm"
import { HpiPdfUpload } from "@/components/admin/HpiPdfUpload"
import { useAuth } from "@/context/AuthContext"
import { getAdminListings, deleteListingForce, getPendingListingReviews, approveListing, rejectListing } from "@/lib/adminApi"
import { formatPrice } from "@/lib/listingApi"

const STATUS_STYLES: Record<string, string> = {
    ACTIVE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    PENDING_REVIEW: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    REJECTED: "bg-red-500/10 text-red-400 border-red-500/25",
    DRAFT: "bg-gray-500/10 text-[var(--text-muted)] border-gray-500/25",
    SOLD: "bg-blue-500/10 text-blue-400 border-blue-500/25",
    OFFER_ACCEPTED: "bg-sky-500/10 text-sky-400 border-sky-500/25",
    WITHDRAWN: "bg-gray-500/10 text-[var(--text-muted)] border-gray-500/25",
    DELETED: "bg-red-500/10 text-red-400 border-red-500/25",
}

function StatusPill({ status }: { status: string }) {
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-bold border ${STATUS_STYLES[status] || STATUS_STYLES.DRAFT}`}>
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {status.replace('_', ' ')}
        </span>
    )
}

export default function AdminListingsPage() {
    const { user, profile, loading: authLoading } = useAuth()
    const router = useRouter()
    const [listings, setListings] = React.useState<any[]>([])
    const [loading, setLoading] = React.useState(true)
    const [deleting, setDeleting] = React.useState<string | null>(null)
    const [error, setError] = React.useState<string | null>(null)
    const [page, setPage] = React.useState(1)
    const [total, setTotal] = React.useState(0)
    // "CarMazium" = listings created by an ADMIN account. Admins can list
    // directly now, so their own vehicles would otherwise be buried among
    // every seller's in this table.
    const [ownerFilter, setOwnerFilter] = React.useState<'ALL' | 'ADMIN'>('ALL')
    const limit = 20

    // ── Pending review ──
    const [pendingListings, setPendingListings] = React.useState<any[]>([])
    const [pendingLoading, setPendingLoading] = React.useState(true)
    const [expandedId, setExpandedId] = React.useState<string | null>(null)
    const [rejectReasons, setRejectReasons] = React.useState<Record<string, string>>({})
    const [actionLoading, setActionLoading] = React.useState<string | null>(null)
    const [actionError, setActionError] = React.useState<string | null>(null)
    const [successMsg, setSuccessMsg] = React.useState<string | null>(null)
    const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null)
    const [editListingId, setEditListingId] = React.useState<string | null>(null)
    const [hpiTarget, setHpiTarget] = React.useState<{ id: string; title: string } | null>(null)
    const [hpiUploadTarget, setHpiUploadTarget] = React.useState<{ id: string; title: string; hasPdf: boolean } | null>(null)

    React.useEffect(() => {
        // Enforce Admin Access
        if (!authLoading) {
            if (!user) {
                router.replace('/auth/login')
                return
            }
            if (profile?.role !== 'ADMIN') {
                router.replace('/dashboard')
                return
            }
        }
    }, [user, profile, authLoading, router])

    const fetchListings = async () => {
        try {
            setLoading(true)
            setError(null)
            const result = await getAdminListings(page, limit, ownerFilter === 'ADMIN' ? 'ADMIN' : undefined)
            setListings(result.data || [])
            setTotal(result.pagination?.total || 0)
        } catch (err: any) {
            console.error('Failed to fetch admin listings:', err)
            setError(err.message || "Failed to load system listings.")
        } finally {
            setLoading(false)
        }
    }

    React.useEffect(() => {
        if (profile?.role === 'ADMIN') {
            fetchListings()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile, page, ownerFilter])

    const loadPending = async () => {
        try {
            setPendingLoading(true)
            const data = await getPendingListingReviews()
            setPendingListings(data || [])
        } catch (err) {
            console.error('Failed to load pending listing reviews:', err)
        } finally {
            setPendingLoading(false)
        }
    }

    React.useEffect(() => {
        if (profile?.role === 'ADMIN') {
            loadPending()
        }
    }, [profile])

    const handleApprove = async (id: string) => {
        setActionError(null)
        setSuccessMsg(null)
        try {
            setActionLoading(id)
            await approveListing(id)
            setPendingListings(prev => prev.filter(l => l.id !== id))
            setExpandedId(null)
            setSuccessMsg('Listing approved and is now live.')
        } catch (err: any) {
            setActionError(err.message || 'Failed to approve listing')
        } finally {
            setActionLoading(null)
        }
    }

    const handleReject = async (id: string) => {
        const reason = (rejectReasons[id] || '').trim()
        if (reason.length < 10) {
            setActionError('Please provide a rejection reason (at least 10 characters).')
            return
        }
        setActionError(null)
        setSuccessMsg(null)
        try {
            setActionLoading(id)
            await rejectListing(id, reason)
            setPendingListings(prev => prev.filter(l => l.id !== id))
            setExpandedId(null)
            setSuccessMsg('Listing rejected — the seller has been notified.')
        } catch (err: any) {
            setActionError(err.message || 'Failed to reject listing')
        } finally {
            setActionLoading(null)
        }
    }

    const handleDelete = async (listingId: string) => {
        if (!window.confirm("Are you sure you want to forcefully delete this listing? This action cannot be undone.")) return;

        try {
            setDeleting(listingId)
            await deleteListingForce(listingId)
            setListings(listings.filter(l => l.id !== listingId))
            setTotal(t => t - 1)
        } catch (err: any) {
            alert(err.message || 'Failed to delete listing')
        } finally {
            setDeleting(null)
        }
    }

    if (authLoading || (user && !profile) || (loading && listings.length === 0)) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        )
    }

    if (!user || profile?.role !== 'ADMIN') return null;

    const userName = profile?.firstName ? `${profile.firstName} ${profile.lastName || ""}` : (user?.email?.split('@')[0] || "Admin")

    return (
        <div className="min-h-screen pt-20 pb-12">
            <div className="container mx-auto px-5 flex flex-col lg:flex-row gap-8">
                <DashboardSidebar role="admin" userName={userName} userType="Super Admin" />

                <main className="flex-1 space-y-8 min-w-0">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[var(--bg-input)] p-6 rounded-2xl border border-[var(--border-default)] backdrop-blur-md">
                        <div>
                            <Link href="/dashboard/admin" className="inline-flex items-center text-[var(--text-muted)] hover:text-primary dark:hover:text-white mb-2 text-sm transition-colors">
                                <ArrowLeft size={16} className="mr-1" /> Back to Overview
                            </Link>
                            <h1 className="text-3xl font-black font-heading uppercase tracking-tight flex items-center gap-3">
                                <Car className="text-primary hidden sm:block" size={28} />
                                Listing Moderation
                            </h1>
                            <p className="text-[var(--text-muted)] text-sm mt-1">{total} total listings on the platform</p>
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200">
                            <strong>System Error:</strong> {error}
                        </div>
                    )}

                    {/* ── Pending Review ────────────────────────────────────────── */}
                    <div className="glass-card border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-xl font-black font-heading uppercase tracking-tight flex items-center gap-2.5">
                                <ClipboardList className="text-amber-400" size={22} />
                                Pending Review
                            </h2>
                            {pendingListings.length > 0 && (
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/25 px-3 py-1.5 rounded-full">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                    {pendingListings.length} awaiting action
                                </span>
                            )}
                        </div>

                        {actionError && (
                            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-sm">{actionError}</div>
                        )}
                        {successMsg && (
                            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-300 text-sm">{successMsg}</div>
                        )}

                        {pendingLoading ? (
                            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-primary" size={24} /></div>
                        ) : pendingListings.length === 0 ? (
                            <div className="flex flex-col items-center py-10 text-center">
                                <Gauge className="text-[var(--text-faint)] mb-2" size={28} />
                                <p className="text-sm font-semibold text-[var(--text-secondary)]">All caught up</p>
                                <p className="text-xs text-[var(--text-muted)] mt-0.5">Nothing is waiting for review right now.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {pendingListings.map((l) => {
                                    const isExpanded = expandedId === l.id
                                    const isRejectedResubmit = l.status === 'REJECTED'
                                    // Every listing must complete its vehicle-history/HPI review before approval.
                                    // Missing or pending reports therefore keep the listing in review.
                                    const hpiPending = l.hpiReport?.status !== 'COMPLETED'
                                    return (
                                        <div key={l.id} className={`border rounded-xl overflow-hidden ${isRejectedResubmit ? 'border-red-500/30' : 'border-[var(--border-default)]'}`}>
                                            <button
                                                type="button"
                                                onClick={() => setExpandedId(isExpanded ? null : l.id)}
                                                className="w-full flex items-center gap-3 p-4 hover:bg-[var(--bg-input)] transition-colors text-left cursor-pointer"
                                            >
                                                {l.images?.[0] ? (
                                                    <Image src={l.images[0]} alt="" width={48} height={48} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                                                ) : (
                                                    <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                                                        <Car className="text-[var(--text-muted)]" size={18} />
                                                    </div>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-bold text-sm truncate">{l.title}</p>
                                                    <p className="text-xs text-[var(--text-muted)] truncate">{l.seller?.firstName} {l.seller?.lastName} · {l.seller?.email}</p>
                                                </div>
                                                {hpiPending && (
                                                    <span className="text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 bg-primary/10 text-primary border-primary/30 inline-flex items-center gap-1.5">
                                                        <FileWarning size={12} /> HPI outstanding
                                                    </span>
                                                )}
                                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${isRejectedResubmit ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                                                    {isRejectedResubmit ? 'Rejected' : 'Pending'}
                                                </span>
                                                <span className="text-sm font-bold shrink-0 hidden sm:inline">{formatPrice(l.price)}</span>
                                                <ChevronDown size={18} className={`text-[var(--text-muted)] transition-transform shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
                                            </button>

                                            {isExpanded && (
                                                <div className="p-4 pt-0 border-t border-[var(--border-default)] bg-[var(--bg-input)]/40">
                                                    {isRejectedResubmit && l.rejectionReason && (
                                                        <div className="my-4 p-3 bg-red-500/5 border border-red-500/20 rounded-lg text-xs text-red-300">
                                                            <strong>Previous rejection reason:</strong> {l.rejectionReason}
                                                        </div>
                                                    )}

                                                    {l.images?.length > 0 && (
                                                        <div className="flex gap-2 overflow-x-auto py-4">
                                                            {l.images.map((img: string, i: number) => (
                                                                <Image key={i} src={img} alt="" width={96} height={72} className="w-24 h-[72px] rounded-lg object-cover shrink-0 border border-[var(--border-default)]" />
                                                            ))}
                                                        </div>
                                                    )}

                                                    <>
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm py-2">
                                                                {([
                                                                    ['Make', l.make], ['Model', l.model], ['Year', l.year],
                                                                    ['Mileage', l.mileage ? `${Number(l.mileage).toLocaleString()} mi` : null],
                                                                    ['VRM', l.vrm], ['VIN', l.vin],
                                                                    ['Fuel', l.fuelType], ['Transmission', l.transmission],
                                                                    ['Body Type', l.bodyType], ['Condition', l.condition],
                                                                    ['Colour', l.color], ['Doors', l.doors], ['Seats', l.seats],
                                                                    ['Location', l.location], ['Badge Tier', l.badgeTier],
                                                                    ['Type', l.type], ['Owners', l.owners],
                                                                    ['MOT', l.motStatus], ['Tax', l.taxStatus],
                                                                    ...(l.type === 'AUCTION' && l.auction ? ([
                                                                        ['Auction Status', l.auction.status],
                                                                        ['Reserve Price', formatPrice(l.auction.reservePrice)],
                                                                        ['Starting Bid', formatPrice(l.auction.startingBid)],
                                                                        ['Min Increment', formatPrice(l.auction.minIncrement)],
                                                                        ['Buy It Now', l.auction.buyItNowPrice ? formatPrice(l.auction.buyItNowPrice) : null],
                                                                        ['Start Time', new Date(l.auction.startTime).toLocaleString('en-GB')],
                                                                    ] as [string, unknown][]) : []),
                                                                ] as [string, unknown][]).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([label, value]) => (
                                                                    <div key={label}>
                                                                        <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">{label}</p>
                                                                        <p className="font-medium">{String(value)}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            {l.type === 'AUCTION' && !l.auction && (
                                                                <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-2">
                                                                    Marked as an auction listing but no auction schedule has been created yet.
                                                                </div>
                                                            )}

                                                            {l.description && (
                                                                <div className="py-3">
                                                                    <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold mb-1">Description</p>
                                                                    <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{l.description}</p>
                                                                </div>
                                                            )}

                                                            <div className="flex items-center gap-4 py-2">
                                                                <Link href={`/buy-cars/${l.slug}`} target="_blank" className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1">
                                                                    <Eye size={12} /> Preview listing
                                                                </Link>
                                                            </div>

                                                            <div className="mt-3">
                                                                <label className="text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-bold">
                                                                    Rejection reason (required to reject)
                                                                </label>
                                                                <textarea
                                                                    value={rejectReasons[l.id] || ''}
                                                                    onChange={(e) => setRejectReasons(prev => ({ ...prev, [l.id]: e.target.value }))}
                                                                    placeholder="Explain what needs fixing before this can be approved..."
                                                                    rows={2}
                                                                    className="w-full mt-1 rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)] px-3 py-2 text-sm placeholder:text-[var(--text-muted)] focus:border-primary focus:outline-none"
                                                                />
                                                            </div>

                                                            {hpiPending && (
                                                                <div className="mt-4 p-3 rounded-lg border border-primary/30 bg-primary/5">
                                                                    <div className="flex items-start gap-3">
                                                                        <FileWarning size={16} className="text-primary shrink-0 mt-0.5" />
                                                                        <div className="flex-1 min-w-0">
                                                                            <p className="text-xs font-bold text-primary">HPI report outstanding</p>
                                                                            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                                                                                This mandatory vehicle-history/HPI review must be completed before the listing can go live.
                                                                                Finish it from the HPI queue, then return here to approve the listing.
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex gap-2 mt-3">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setHpiUploadTarget({ id: l.id, title: l.title, hasPdf: false })}
                                                                            className="flex-1 px-3 py-2 rounded-lg bg-primary text-white text-[11px] font-black uppercase tracking-widest hover:bg-primary/90 transition-colors cursor-pointer"
                                                                        >
                                                                            Upload PDF
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setHpiTarget({ id: l.id, title: l.title })}
                                                                            className="flex-1 px-3 py-2 rounded-lg border border-primary/40 text-primary text-[11px] font-black uppercase tracking-widest hover:bg-primary/10 transition-colors cursor-pointer"
                                                                        >
                                                                            Fill in form
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {/* Report already saved — still editable at any point, so a typo
                                                                caught on re-read doesn't require rejecting the whole listing. */}
                                                            {l.hpiReport?.status === 'COMPLETED' && (
                                                                <div className="mt-4 p-3 rounded-lg border border-emerald-500/25 bg-emerald-500/5 flex items-center gap-3">
                                                                    <FileWarning size={16} className="text-emerald-400 shrink-0" />
                                                                    <p className="flex-1 min-w-0 text-[11px] text-[var(--text-muted)]">
                                                                        <span className="font-bold text-emerald-400">
                                                                            HPI report {l.hpiReport.pdfUploadedAt ? 'uploaded' : 'prepared'}.
                                                                        </span>{' '}
                                                                        Spot an error? You can still edit or replace it.
                                                                    </p>
                                                                    {/* Send them to whichever editor actually owns this report —
                                                                        an uploaded PDF is served in preference to form data, so
                                                                        editing the form wouldn't change what buyers download. */}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => l.hpiReport.pdfUploadedAt
                                                                            ? setHpiUploadTarget({ id: l.id, title: l.title, hasPdf: true })
                                                                            : setHpiTarget({ id: l.id, title: l.title })}
                                                                        className="shrink-0 px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-primary/40 text-[11px] font-bold uppercase tracking-widest transition-colors cursor-pointer"
                                                                    >
                                                                        {l.hpiReport.pdfUploadedAt ? 'Replace PDF' : 'Edit report'}
                                                                    </button>
                                                                </div>
                                                            )}

                                                            <div className="flex gap-3 mt-4">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleApprove(l.id)}
                                                                    disabled={actionLoading === l.id || hpiPending}
                                                                    title={hpiPending ? 'Complete the mandatory HPI report before approval' : undefined}
                                                                    className="flex-1 px-4 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold text-xs uppercase tracking-widest hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 cursor-pointer"
                                                                >
                                                                    {actionLoading === l.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                                    Approve — Go Live
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setEditListingId(l.id)}
                                                                    className="flex-1 px-4 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 font-bold text-xs uppercase tracking-widest hover:bg-blue-500/20 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                                                                >
                                                                    <Pencil size={14} />
                                                                    Edit Details
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleReject(l.id)}
                                                                    disabled={actionLoading === l.id}
                                                                    className="flex-1 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 font-bold text-xs uppercase tracking-widest hover:bg-red-500/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                                                                >
                                                                    {actionLoading === l.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                                                                    Reject
                                                                </button>
                                                            </div>
                                                        </>
                                                    </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        {([
                            ['ALL', 'All listings'],
                            ['ADMIN', 'CarMazium'],
                        ] as const).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => {
                                    // Page 1: the current page number almost
                                    // certainly doesn't exist in the smaller set.
                                    setPage(1)
                                    setOwnerFilter(value)
                                }}
                                className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest border transition-colors cursor-pointer ${ownerFilter === value
                                    ? 'bg-primary text-white border-primary'
                                    : 'bg-[var(--bg-input)] text-[var(--text-muted)] border-[var(--border-default)] hover:text-[var(--text-primary)] hover:border-primary/40'}`}
                            >
                                {label}
                            </button>
                        ))}
                        {!loading && (
                            <span className="text-xs text-[var(--text-muted)] ml-1">
                                {total} {total === 1 ? 'listing' : 'listings'}
                            </span>
                        )}
                    </div>

                    <div className="glass-card overflow-hidden border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">

                        {/* ── Mobile cards (< sm) ── */}
                        <div className="sm:hidden divide-y divide-[var(--border-default)]">
                            {listings.map((l) => {
                                const isSelf = false
                                return (
                                    <div key={l.id} className={`flex items-center gap-3 p-4 ${l.deletedAt ? 'bg-red-500/5' : ''}`}>
                                        {l.images?.[0] ? (
                                            <Image src={l.images[0]} alt="" width={48} height={48} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                                        ) : (
                                            <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                                                <Car className="text-[var(--text-muted)]" size={18} />
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="font-bold text-sm truncate">{l.title}</p>
                                                <div className="shrink-0"><StatusPill status={l.deletedAt ? 'DELETED' : l.status} /></div>
                                            </div>
                                            <div className="flex items-center justify-between mt-1">
                                                <p className="text-xs text-[var(--text-muted)] truncate hover:text-primary transition-colors cursor-pointer" onClick={() => l.seller?.id && setSelectedUserId(l.seller.id)}>{l.seller?.firstName} {l.seller?.lastName} · {l.vrm || 'No VRM'}</p>
                                                <p className="text-sm font-bold ml-2 shrink-0">{formatPrice(l.price)}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1 shrink-0 ml-1">
                                            <Link href={`/buy-cars/${l.slug}`} target="_blank" className="p-2.5 bg-blue-500/10 rounded-lg text-blue-400 hover:bg-blue-500/20 transition-colors"><Eye size={16} /></Link>
                                            <button onClick={() => handleDelete(l.id)} disabled={deleting === l.id || !!l.deletedAt} className="p-2.5 bg-red-500/10 rounded-lg text-red-400 disabled:opacity-30 hover:bg-red-500/20 transition-colors">
                                                {deleting === l.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {/* ── Desktop table (≥ sm) ── */}
                        <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-[var(--bg-input)] text-[var(--text-muted)] text-xs uppercase font-black tracking-widest border-b border-[var(--border-default)]">
                                    <tr>
                                        <th className="px-6 py-4">Vehicle</th>
                                        <th className="px-6 py-4 text-center">Status</th>
                                        <th className="px-6 py-4 text-right">Price</th>
                                        <th className="px-6 py-4">Seller</th>
                                        <th className="px-6 py-4 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-default)]/80">
                                    {listings.map((l) => (
                                        <tr key={l.id} className={`transition-colors ${l.deletedAt ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-[var(--bg-card)]'}`}>
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    {l.images?.[0] ? (
                                                        <Image src={l.images[0]} alt="" width={48} height={48} className="w-12 h-12 rounded-lg object-cover" />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center">
                                                            <Car className="text-[var(--text-muted)]" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="font-bold max-w-[200px] truncate">{l.title}</p>
                                                        <p className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                                                            {l.vrm || 'No VRM'} 
                                                            {l.deletedAt && <AlertTriangle size={12} className="text-red-400 ml-1" />}
                                                        </p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <StatusPill status={l.deletedAt ? 'DELETED' : l.status} />
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold text-sm">
                                                {formatPrice(l.price)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm cursor-pointer group" onClick={() => l.seller?.id && setSelectedUserId(l.seller.id)}>
                                                    <p className="truncate max-w-[150px] group-hover:text-primary transition-colors">{l.seller?.firstName} {l.seller?.lastName}</p>
                                                    <p className="text-xs text-[var(--text-muted)] truncate max-w-[150px]">{l.seller?.email}</p>
                                                    {l.seller?.phone && <p className="text-xs text-[var(--text-muted)] truncate max-w-[150px]">{l.seller.phone}</p>}
                                                    {l.seller?.dealerProfile?.companyName && (
                                                        <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                            {l.seller.dealerProfile.companyName}{l.seller.dealerProfile.isVerified ? ' ✓' : ''}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <Link href={`/buy-cars/${l.slug}`} target="_blank" className="p-2.5 hover:bg-white/10 rounded-lg transition-colors text-blue-400 hover:text-primary dark:hover:" title="View Listing">
                                                        <Eye size={18} />
                                                    </Link>
                                                    <button
                                                        onClick={() => setEditListingId(l.id)}
                                                        disabled={l.status === 'SOLD' || !!l.deletedAt}
                                                        className="p-2.5 hover:bg-white/10 rounded-lg transition-colors text-[var(--text-muted)] hover:text-primary dark:hover:text-white disabled:opacity-30"
                                                        title={l.status === 'SOLD' ? 'Cannot edit a sold listing' : 'Edit Listing'}
                                                    >
                                                        <Pencil size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDelete(l.id)}
                                                        disabled={deleting === l.id || !!l.deletedAt}
                                                        className="p-2 hover:bg-red-500/20 rounded-lg transition-colors text-red-400 disabled:opacity-30 disabled:hover:bg-transparent"
                                                        title="Force Delete"
                                                    >
                                                        {deleting === l.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>{/* end hidden sm:block */}

                        {/* Pagination footer */}
                        <div className="p-4 border-t border-[var(--border-default)] bg-[var(--bg-input)] flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
                            <span>Showing {(page - 1) * limit + 1 + (listings.length === 0 ? -1 : 0)} to {Math.min(page * limit, total)} of {total}</span>
                            <div className="flex items-center gap-2">
                                <button 
                                    className="px-3 py-1 bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] rounded disabled:opacity-50"
                                    onClick={() => setPage(p => Math.max(1, p - 1))}
                                    disabled={page === 1}
                                >Prev</button>
                                <button 
                                    className="px-3 py-1 bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] rounded disabled:opacity-50"
                                    onClick={() => setPage(p => p + 1)}
                                    disabled={page * limit >= total}
                                >Next</button>
                            </div>
                        </div>
                    </div>

                </main>
            </div>
            <UserDetailModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
            <ListingEditModal
                listingId={editListingId}
                onClose={() => setEditListingId(null)}
                onSaved={() => { fetchListings(); loadPending() }}
            />
            {hpiUploadTarget && (
                <HpiPdfUpload
                    listingId={hpiUploadTarget.id}
                    listingTitle={hpiUploadTarget.title}
                    hasExistingPdf={hpiUploadTarget.hasPdf}
                    onClose={() => setHpiUploadTarget(null)}
                    onSaved={() => {
                        setHpiUploadTarget(null)
                        loadPending()
                        setSuccessMsg('HPI report uploaded — the seller and any waiting buyers have been notified.')
                    }}
                />
            )}
            {hpiTarget && (
                <HpiReportForm
                    listingId={hpiTarget.id}
                    listingTitle={hpiTarget.title}
                    onClose={() => setHpiTarget(null)}
                    // Reload so the "HPI outstanding" badge clears.
                    onSaved={() => { loadPending(); setSuccessMsg('HPI report saved — the seller and any waiting buyers have been notified.') }}
                />
            )}
        </div>
    )
}
