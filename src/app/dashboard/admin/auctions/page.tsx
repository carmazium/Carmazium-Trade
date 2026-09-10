"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Gavel, Loader2, ArrowLeft, Eye, Car, UserCheck, X, AlertTriangle, Pencil, RefreshCcw } from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { UserDetailModal } from "@/components/dashboard/UserDetailModal"
import { ListingEditModal } from "@/components/dashboard/ListingEditModal"
import { useAuth } from "@/context/AuthContext"
import { getAdminAuctions, getAllDealers, assignAuctionWinner, refundAuctionBuyerFee } from "@/lib/adminApi"
import { formatPrice } from "@/lib/listingApi"

const STATUS_STYLES: Record<string, string> = {
    SCHEDULED: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    ACTIVE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    ENDED: "bg-gray-500/10 text-[var(--text-muted)] border-gray-500/20",
    CANCELLED: "bg-red-500/10 text-red-400 border-red-500/20",
}

export default function AdminAuctionsPage() {
    const { user, profile, loading: authLoading } = useAuth()
    const router = useRouter()
    const [auctions, setAuctions] = React.useState<any[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [page, setPage] = React.useState(1)
    const [total, setTotal] = React.useState(0)
    const limit = 20

    // Assign-winner flow
    const [dealers, setDealers] = React.useState<any[]>([])
    const [assignTarget, setAssignTarget] = React.useState<any | null>(null)
    const [selectedDealerId, setSelectedDealerId] = React.useState("")
    const [confirming, setConfirming] = React.useState(false)
    const [assigning, setAssigning] = React.useState(false)
    const [assignError, setAssignError] = React.useState<string | null>(null)
    const [selectedUserId, setSelectedUserId] = React.useState<string | null>(null)
    const [editListingId, setEditListingId] = React.useState<string | null>(null)
    const [refundingAuctionId, setRefundingAuctionId] = React.useState<string | null>(null)

    React.useEffect(() => {
        if (!authLoading) {
            if (!user) { router.replace('/auth/login'); return }
            if (profile?.role !== 'ADMIN') { router.replace('/dashboard'); return }
        }
    }, [user, profile, authLoading, router])

    const loadAuctions = React.useCallback(() => {
        setLoading(true)
        setError(null)
        getAdminAuctions(page, limit)
            .then(r => { setAuctions(r.data || []); setTotal(r.pagination?.total || 0) })
            .catch(err => setError(err.message || 'Failed to load auctions'))
            .finally(() => setLoading(false))
    }, [page])

    React.useEffect(() => {
        if (profile?.role !== 'ADMIN') return
        loadAuctions()
    }, [profile, page, loadAuctions])

    React.useEffect(() => {
        if (profile?.role !== 'ADMIN') return
        getAllDealers().then(setDealers).catch(() => {})
    }, [profile])

    function openAssignModal(auction: any) {
        setAssignTarget(auction)
        setSelectedDealerId("")
        setConfirming(false)
        setAssignError(null)
    }

    function closeAssignModal() {
        setAssignTarget(null)
        setSelectedDealerId("")
        setConfirming(false)
        setAssignError(null)
    }

    async function handleConfirmAssign() {
        if (!assignTarget || !selectedDealerId) return
        setAssigning(true)
        setAssignError(null)
        try {
            await assignAuctionWinner(assignTarget.id, selectedDealerId)
            closeAssignModal()
            loadAuctions()
        } catch (err: any) {
            setAssignError(err.message || 'Failed to assign winner')
        } finally {
            setAssigning(false)
        }
    }

    async function handleRefundBuyerFee(auction: any) {
        const reason = window.prompt(
            'Reason for cancelling this sale and refunding the buyer fee?\n\nUse this only for a verified failed sale, such as a material undisclosed fault found during inspection.',
            'Material undisclosed fault confirmed during inspection',
        )
        if (!reason?.trim()) return
        if (!window.confirm('Refund the full £125 buyer fee and return the vehicle to Draft for correction/relisting?')) return

        setRefundingAuctionId(auction.id)
        try {
            await refundAuctionBuyerFee(auction.id, reason.trim())
            loadAuctions()
        } catch (err: any) {
            alert(err.message || 'Failed to refund buyer fee')
        } finally {
            setRefundingAuctionId(null)
        }
    }

    const assignAmount = assignTarget
        ? (assignTarget.buyItNowPrice != null ? Number(assignTarget.buyItNowPrice) : Number(assignTarget.reservePrice))
        : 0
    const selectedDealer = dealers.find(d => d.id === selectedDealerId)

    if (authLoading || (user && !profile) || (loading && auctions.length === 0)) {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
    }
    if (!user || profile?.role !== 'ADMIN') return null

    const userName = profile?.firstName ? `${profile.firstName} ${profile.lastName || ""}` : (user?.email?.split('@')[0] || "Admin")

    return (
        <div className="min-h-screen pt-20 pb-12">
            <div className="container mx-auto px-5 flex flex-col lg:flex-row gap-8">
                <DashboardSidebar role="admin" userName={userName} userType="Super Admin" />

                <main className="flex-1 space-y-8 min-w-0">
                    <div className="bg-[var(--bg-input)] p-6 rounded-2xl border border-[var(--border-default)] backdrop-blur-md">
                        <Link href="/dashboard/admin" className="inline-flex items-center text-[var(--text-muted)] hover:text-primary dark:hover:text-white mb-2 text-sm transition-colors">
                            <ArrowLeft size={16} className="mr-1" /> Back to Overview
                        </Link>
                        <h1 className="text-3xl font-black font-heading uppercase tracking-tight flex items-center gap-3">
                            <Gavel className="text-purple-400 hidden sm:block" size={28} />
                            Auction Management
                        </h1>
                        <p className="text-[var(--text-muted)] mt-1 text-sm">{total} total auctions across the platform</p>
                    </div>

                    {error && <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200"><strong>Error:</strong> {error}</div>}

                    <div className="glass-card overflow-hidden border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-[var(--bg-input)] text-[var(--text-muted)] text-xs uppercase font-black tracking-widest border-b border-[var(--border-default)]">
                                    <tr>
                                        <th className="px-6 py-4">Vehicle</th>
                                        <th className="px-6 py-4">Seller</th>
                                        <th className="px-6 py-4 text-center">Status</th>
                                        <th className="px-6 py-4 text-right">Reserve</th>
                                        <th className="px-6 py-4 text-right">Top Bid</th>
                                        <th className="px-6 py-4 text-right">Bids</th>
                                        <th className="px-6 py-4 text-right">Winner</th>
                                        <th className="px-6 py-4 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-default)]/80">
                                    {auctions.map((a) => (
                                        <tr key={a.id} className="hover:bg-[var(--bg-card)] transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    {a.listing?.images?.[0] ? (
                                                        <Image src={a.listing.images[0]} alt="" width={44} height={44} className="w-11 h-11 rounded-lg object-cover" />
                                                    ) : (
                                                        <div className="w-11 h-11 rounded-lg bg-white/10 flex items-center justify-center"><Car size={16} className="text-[var(--text-muted)]" /></div>
                                                    )}
                                                    <div>
                                                        <p className="font-bold text-sm max-w-[180px] truncate">{a.listing?.title}</p>
                                                        <p className="text-xs text-[var(--text-muted)]">{a.listing?.year} · {a.listing?.make}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-xs">
                                                <div className="cursor-pointer group" onClick={() => a.listing?.seller?.id && setSelectedUserId(a.listing.seller.id)}>
                                                    <p className="group-hover:text-primary transition-colors">{a.listing?.seller?.firstName} {a.listing?.seller?.lastName}</p>
                                                    <p className="text-[var(--text-muted)]">{a.listing?.seller?.email}</p>
                                                    {a.listing?.seller?.phone && <p className="text-[var(--text-muted)]">{a.listing.seller.phone}</p>}
                                                    {a.listing?.seller?.dealerProfile?.companyName && (
                                                        <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                            {a.listing.seller.dealerProfile.companyName}{a.listing.seller.dealerProfile.isVerified ? ' ✓' : ''}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border text-xs font-bold ${STATUS_STYLES[a.status] || STATUS_STYLES.ENDED}`}>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                                    {a.status}
                                                </span>
                                                {a.listing?.status && a.listing.status !== 'ACTIVE' && (
                                                    <Link
                                                        href="/dashboard/admin/listings"
                                                        title="This auction's listing hasn't cleared admin review yet — it can't go live until approved"
                                                        className="block mt-1 text-[9px] font-bold uppercase tracking-widest text-amber-400 hover:underline"
                                                    >
                                                        {a.listing.status === 'REJECTED' ? 'Listing Rejected' : 'Awaiting Review'}
                                                    </Link>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm font-bold">{formatPrice(a.reservePrice)}</td>
                                            <td className="px-6 py-4 text-right text-sm text-emerald-400 font-bold">
                                                {a.listing?.bids?.[0]?.amount ? formatPrice(Number(a.listing.bids[0].amount)) : '—'}
                                            </td>
                                            <td className="px-6 py-4 text-right text-sm">{a.listing?._count?.bids ?? 0}</td>
                                            <td className="px-6 py-4 text-right text-xs">
                                                {a.winner ? (
                                                    <div className="cursor-pointer group inline-block text-right" onClick={() => setSelectedUserId(a.winner.id)}>
                                                        <p className="text-emerald-400 group-hover:text-primary transition-colors">{a.winner.firstName} {a.winner.lastName}</p>
                                                        {a.winner.phone && <p className="text-[var(--text-muted)]">{a.winner.phone}</p>}
                                                        {a.winner.dealerProfile?.companyName && (
                                                            <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                                                {a.winner.dealerProfile.companyName}{a.winner.dealerProfile.isVerified ? ' ✓' : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : <span className="text-[var(--text-muted)]">—</span>}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    {a.status === 'ACTIVE' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openAssignModal(a)}
                                                            className="p-2.5 hover:bg-white/10 rounded-lg transition-colors text-purple-400 hover:text-primary dark:hover:text-white inline-flex cursor-pointer"
                                                            title="Assign Winner"
                                                        >
                                                            <UserCheck size={16} />
                                                        </button>
                                                    )}
                                                    {a.status === 'ENDED' && a.buyerFeePaid && !a.sellerBonusReleased && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRefundBuyerFee(a)}
                                                            disabled={refundingAuctionId === a.id}
                                                            className="p-2.5 hover:bg-red-500/10 rounded-lg transition-colors text-red-400 hover:text-red-300 inline-flex disabled:opacity-40 cursor-pointer"
                                                            title="Cancel failed sale & refund full £125 buyer fee"
                                                        >
                                                            {refundingAuctionId === a.id ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => a.listing?.id && setEditListingId(a.listing.id)}
                                                        disabled={!a.listing?.id}
                                                        className="p-2.5 hover:bg-white/10 rounded-lg transition-colors text-[var(--text-muted)] hover:text-primary dark:hover:text-white inline-flex disabled:opacity-30 cursor-pointer"
                                                        title="Edit Listing"
                                                    >
                                                        <Pencil size={16} />
                                                    </button>
                                                    <Link href={`/auctions/live/${a.id}`} target="_blank" className="p-2.5 hover:bg-white/10 rounded-lg transition-colors text-blue-400 hover:text-primary dark:hover:text-white inline-flex" title="View Auction">
                                                        <Eye size={16} />
                                                    </Link>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 border-t border-[var(--border-default)] bg-[var(--bg-input)] flex items-center justify-between text-xs font-medium text-[var(--text-muted)]">
                            <span>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</span>
                            <div className="flex gap-2">
                                <button className="px-3 py-1 bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] rounded disabled:opacity-50" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
                                <button className="px-3 py-1 bg-[var(--bg-input)] hover:bg-[var(--bg-card-hover)] rounded disabled:opacity-50" onClick={() => setPage(p => p + 1)} disabled={page * limit >= total}>Next</button>
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            {/* Assign Winner Modal */}
            {assignTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={closeAssignModal}>
                    <div className="w-full max-w-md bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-black uppercase tracking-tight flex items-center gap-2">
                                <UserCheck size={20} className="text-purple-400" /> Assign Winner
                            </h3>
                            <button type="button" onClick={closeAssignModal} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer">
                                <X size={18} />
                            </button>
                        </div>

                        <p className="text-sm text-[var(--text-muted)] mb-1">
                            {assignTarget.listing?.title}
                        </p>
                        <p className="text-xs text-[var(--text-muted)] mb-4">
                            Winning amount will be {assignTarget.buyItNowPrice != null ? 'the Buy It Now price' : 'the reserve price'}: <span className="font-bold text-[var(--text-primary)]">{formatPrice(assignAmount)}</span>
                        </p>

                        {!confirming ? (
                            <>
                                <label className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Select Dealer</label>
                                <select
                                    value={selectedDealerId}
                                    onChange={(e) => setSelectedDealerId(e.target.value)}
                                    className="w-full mt-1 mb-5 rounded-lg border border-[var(--border-default)] bg-[var(--bg-input)] px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                                >
                                    <option value="">Choose a dealer...</option>
                                    {dealers.map((d) => (
                                        <option key={d.id} value={d.id}>
                                            {d.dealerProfile?.companyName || `${d.firstName || ''} ${d.lastName || ''}`.trim() || d.email}
                                        </option>
                                    ))}
                                </select>

                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={closeAssignModal}
                                        className="flex-1 px-4 py-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[var(--text-muted)] font-bold text-xs uppercase tracking-widest hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirming(true)}
                                        disabled={!selectedDealerId}
                                        className="flex-1 px-4 py-2.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 font-bold text-xs uppercase tracking-widest hover:bg-purple-500/20 disabled:opacity-50 transition-colors cursor-pointer"
                                    >
                                        Continue
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 mb-5">
                                    <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                                    <p className="text-xs text-amber-200">
                                        This immediately ends the auction and assigns{' '}
                                        <span className="font-bold">{selectedDealer?.dealerProfile?.companyName || `${selectedDealer?.firstName || ''} ${selectedDealer?.lastName || ''}`.trim()}</span>{' '}
                                        as the winner for <span className="font-bold">{formatPrice(assignAmount)}</span>. This cannot be undone.
                                    </p>
                                </div>

                                {assignError && (
                                    <p className="text-xs text-red-400 mb-3">{assignError}</p>
                                )}

                                <div className="flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setConfirming(false)}
                                        disabled={assigning}
                                        className="flex-1 px-4 py-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] text-[var(--text-muted)] font-bold text-xs uppercase tracking-widest hover:text-[var(--text-primary)] disabled:opacity-50 transition-colors cursor-pointer"
                                    >
                                        Back
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleConfirmAssign}
                                        disabled={assigning}
                                        className="flex-1 px-4 py-2.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-400 font-bold text-xs uppercase tracking-widest hover:bg-purple-500/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                                    >
                                        {assigning ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                                        Yes, Assign Winner
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            <UserDetailModal userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
            <ListingEditModal
                listingId={editListingId}
                onClose={() => setEditListingId(null)}
                onSaved={loadAuctions}
            />
        </div>
    )
}
