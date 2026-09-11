"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import {
    Handshake, Loader2, ArrowLeft, CheckCircle, XCircle, ExternalLink,
    Car, Clock, AlertTriangle, BadgeCheck, RefreshCw, Banknote
} from "lucide-react"
import { Button } from "@/components/ui/Button"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { useAuth } from "@/context/AuthContext"
import { getPendingHandovers, approveHandover, denyHandover, getPendingPayouts, retryPayout, markPayoutPaidManually } from "@/lib/adminApi"
import { formatPrice } from "@/lib/listingApi"

export default function AdminHandoversPage() {
    const { user, profile, loading: authLoading } = useAuth()
    const router = useRouter()
    const [handovers, setHandovers] = React.useState<any[]>([])
    const [loading, setLoading] = React.useState(true)
    const [processing, setProcessing] = React.useState<string | null>(null)
    const [error, setError] = React.useState<string | null>(null)

    // Approved handovers whose £100 seller bonus still hasn't actually reached
    // the seller — this used to have no persistent home once the auction left
    // the pending-proofs queue above, so a payout that failed or was skipped
    // (no Stripe connected) could get lost with nobody following up on it.
    const [pendingPayouts, setPendingPayouts] = React.useState<any[]>([])
    const [payoutsLoading, setPayoutsLoading] = React.useState(true)
    const [payoutProcessing, setPayoutProcessing] = React.useState<string | null>(null)
    const [payoutError, setPayoutError] = React.useState<string | null>(null)

    React.useEffect(() => {
        if (!authLoading) {
            if (!user) { router.replace('/auth/login'); return }
            if (profile?.role !== 'ADMIN') { router.replace('/dashboard'); return }
        }
    }, [user, profile, authLoading, router])

    const fetchHandovers = React.useCallback(() => {
        if (profile?.role !== 'ADMIN') return
        setLoading(true)
        setError(null)
        getPendingHandovers()
            .then(setHandovers)
            .catch(err => setError(err.message || 'Failed to load handovers'))
            .finally(() => setLoading(false))
    }, [profile])

    const fetchPendingPayouts = React.useCallback(() => {
        if (profile?.role !== 'ADMIN') return
        setPayoutsLoading(true)
        setPayoutError(null)
        getPendingPayouts()
            .then(setPendingPayouts)
            .catch(err => setPayoutError(err.message || 'Failed to load pending payouts'))
            .finally(() => setPayoutsLoading(false))
    }, [profile])

    React.useEffect(() => { fetchHandovers() }, [fetchHandovers])
    React.useEffect(() => { fetchPendingPayouts() }, [fetchPendingPayouts])

    const handleRetryPayout = async (auctionId: string) => {
        if (!confirm('Retry the £100 Stripe transfer to this seller now?')) return
        try {
            setPayoutProcessing(auctionId)
            await retryPayout(auctionId)
            setPendingPayouts(prev => prev.filter(p => p.id !== auctionId))
        } catch (err: any) {
            alert(err.message || 'Retry failed')
        } finally {
            setPayoutProcessing(null)
        }
    }

    const handleMarkPaid = async (auctionId: string) => {
        if (!confirm('Confirm you have paid this seller £100 manually (outside Stripe)?')) return
        try {
            setPayoutProcessing(auctionId)
            await markPayoutPaidManually(auctionId)
            setPendingPayouts(prev => prev.filter(p => p.id !== auctionId))
        } catch (err: any) {
            alert(err.message || 'Failed to mark as paid')
        } finally {
            setPayoutProcessing(null)
        }
    }

    const handleApprove = async (auctionId: string, sellerConnected: boolean, hasBankDetails?: boolean) => {
        const payoutNote = sellerConnected
            ? 'The £100 seller bonus will be transferred automatically via Stripe.'
            : hasBankDetails
                ? '⚠️ Stripe not connected. You will need to manually transfer £100 to the bank details shown. Approve to mark the handover as complete.'
                : '⚠️ The seller has no payout method set up. Approve to complete the handover — follow up with the seller to arrange payment separately.'
        if (!confirm(`Approve this handover?\n\n${payoutNote}`)) return
        try {
            setProcessing(auctionId)
            await approveHandover(auctionId)
            setHandovers(prev => prev.filter(h => h.id !== auctionId))
        } catch (err: any) {
            alert(err.message || 'Approval failed')
        } finally {
            setProcessing(null)
        }
    }

    const handleDeny = async (auctionId: string) => {
        if (!confirm('Reject this handover proof? No buyer refund will be issued. The seller can upload clearer proof. Use the separate failed-sale action only if the sale genuinely failed or was cancelled.')) return
        try {
            setProcessing(auctionId)
            await denyHandover(auctionId)
            setHandovers(prev => prev.filter(h => h.id !== auctionId))
        } catch (err: any) {
            alert(err.message || 'Denial failed')
        } finally {
            setProcessing(null)
        }
    }

    if (authLoading || (user && !profile) || (loading && handovers.length === 0)) {
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
                            <Handshake className="text-amber-400 hidden sm:block" size={28} />
                            Handover Verification
                        </h1>
                        <p className="text-[var(--text-muted)] mt-1 text-sm">
                            Review seller-submitted handover proofs. Approve to release the £100 seller bonus, or reject unclear proof and ask the seller to resubmit. Rejecting proof does not refund the buyer.
                        </p>
                    </div>

                    {/* ── Needs Manual Payout ──────────────────────────────── */}
                    {!payoutsLoading && pendingPayouts.length > 0 && (
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <Banknote className="text-amber-400" size={20} />
                                <h2 className="text-lg font-black uppercase tracking-tight">Needs Manual Payout</h2>
                                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400">{pendingPayouts.length}</span>
                            </div>
                            <p className="text-xs text-[var(--text-muted)] -mt-1">
                                These handovers were approved, but the £100 seller bonus hasn&apos;t actually been paid yet — the automatic Stripe transfer either failed or the seller has no payout method connected.
                            </p>
                            {payoutError && <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200"><strong>Error:</strong> {payoutError}</div>}
                            {pendingPayouts.map((p) => (
                                <div key={p.id} className="glass-card border border-blue-500/20 bg-blue-500/5 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        {p.listing?.images?.[0] ? (
                                            <Image src={p.listing.images[0]} alt="" width={56} height={56} className="w-14 h-14 rounded-xl object-cover shrink-0" />
                                        ) : (
                                            <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center shrink-0"><Car size={22} className="text-[var(--text-muted)]" /></div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="font-bold truncate">{p.listing?.title}</p>
                                            <p className="text-xs text-[var(--text-muted)]">
                                                Seller: {p.listing?.seller?.firstName} {p.listing?.seller?.lastName} ({p.listing?.seller?.email})
                                            </p>
                                            {p.stripePayoutError && (
                                                <p className="text-xs text-amber-400 mt-0.5">{p.stripePayoutError}</p>
                                            )}
                                            {p.listing?.seller?.stripeConnectOnboardingComplete === false && p.listing?.seller?.bankAccountNumber && (
                                                <p className="text-xs font-mono text-blue-300 mt-1">
                                                    {p.listing.seller.bankAccountName || '—'} · {p.listing.seller.bankSortCode || '—'} · {p.listing.seller.bankAccountNumber}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {p.listing?.seller?.stripeConnectOnboardingComplete && (
                                            <Button
                                                onClick={() => handleRetryPayout(p.id)}
                                                disabled={payoutProcessing === p.id}
                                                size="sm"
                                                className="bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
                                            >
                                                {payoutProcessing === p.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                                                Retry via Stripe
                                            </Button>
                                        )}
                                        <Button
                                            onClick={() => handleMarkPaid(p.id)}
                                            disabled={payoutProcessing === p.id}
                                            variant="outline"
                                            size="sm"
                                            className="flex items-center gap-2"
                                        >
                                            {payoutProcessing === p.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                            Mark Paid Manually
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {error && <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200"><strong>Error:</strong> {error}</div>}

                    {!loading && handovers.length === 0 ? (
                        <div className="glass-card p-12 border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl text-center">
                            <BadgeCheck size={48} className="text-emerald-400 mx-auto mb-4" />
                            <h3 className="text-xl font-bold mb-2">All clear</h3>
                            <p className="text-[var(--text-muted)] text-sm">No handover proofs are pending verification right now.</p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {handovers.map((h) => (
                                <div key={h.id} className="glass-card border border-amber-500/20 bg-amber-500/5 rounded-2xl overflow-hidden">
                                    {/* Header */}
                                    <div className="p-5 border-b border-[var(--border-default)]">
                                        <div className="flex items-start gap-4">
                                            {h.listing?.images?.[0] ? (
                                                <Image src={h.listing.images[0]} alt="" width={72} height={72} className="w-18 h-18 rounded-xl object-cover shrink-0" />
                                            ) : (
                                                <div className="w-18 h-18 rounded-xl bg-white/10 flex items-center justify-center shrink-0"><Car size={28} className="text-[var(--text-muted)]" /></div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <h3 className="font-bold text-lg leading-tight">{h.listing?.title}</h3>
                                                        <p className="text-xs text-[var(--text-muted)] mt-0.5">{h.listing?.year} · {h.listing?.make} {h.listing?.model}</p>
                                                    </div>
                                                    <span className="inline-flex px-2 py-1 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 text-xs font-bold shrink-0">
                                                        PENDING REVIEW
                                                    </span>
                                                </div>

                                                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                                                    <div>
                                                        <p className="text-[var(--text-muted)] uppercase tracking-widest font-bold text-xs mb-0.5">Seller</p>
                                                        <p className="">{h.listing?.seller?.firstName} {h.listing?.seller?.lastName}</p>
                                                        <p className="text-[var(--text-muted)]">{h.listing?.seller?.email}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[var(--text-muted)] uppercase tracking-widest font-bold text-xs mb-0.5">Winner / Buyer</p>
                                                        <p className="">{h.winner?.firstName} {h.winner?.lastName}</p>
                                                        <p className="text-[var(--text-muted)]">{h.winner?.email}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-[var(--text-muted)] uppercase tracking-widest font-bold text-xs mb-0.5">Winning Bid</p>
                                                        <p className="text-emerald-400 font-bold">{formatPrice(Number(h.winningBidAmount ?? 0))}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Fee summary + Proof */}
                                    <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
                                        <div className="space-y-2">
                                            <p className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">Fee Breakdown</p>
                                            <div className="space-y-1 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-[var(--text-muted)]">Buyer paid</span>
                                                    <span className="font-bold">£125.00</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-[var(--text-muted)]">→ Seller bonus (on approval)</span>
                                                    <span className="font-bold text-emerald-400">£100.00</span>
                                                </div>
                                                <div className="flex justify-between border-t border-[var(--border-default)] pt-1">
                                                    <span className="text-[var(--text-muted)]">Carmazium keeps</span>
                                                    <span className="font-bold">£25.00</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs mt-2">
                                                <div className={`w-2 h-2 rounded-full ${h.buyerFeePaid ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                                                <span className="text-[var(--text-muted)]">Buyer fee {h.buyerFeePaid ? 'paid' : 'not yet paid'}</span>
                                            </div>
                                            <div className="flex flex-col gap-1.5 mt-1">
                                                <div className="flex items-center gap-2 text-xs">
                                                    {h.listing?.seller?.stripeConnectOnboardingComplete ? (
                                                        <>
                                                            <div className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                                            <span className="text-[var(--text-muted)]">Seller Stripe account <strong className="text-emerald-300">connected</strong> — payout fires automatically</span>
                                                        </>
                                                    ) : h.listing?.seller?.bankAccountNumber ? (
                                                        <>
                                                            <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                                                            <span className="text-blue-300">Manual bank transfer required — see details below</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                                                            <span className="text-amber-300">No payout method — seller must add bank details in Settings</span>
                                                        </>
                                                    )}
                                                </div>
                                                {!h.listing?.seller?.stripeConnectOnboardingComplete && h.listing?.seller?.bankAccountNumber && (
                                                    <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs font-mono text-blue-200 space-y-1">
                                                        <p><span className="text-[var(--text-muted)]">Name:</span> {h.listing.seller.bankAccountName || '—'}</p>
                                                        <p><span className="text-[var(--text-muted)]">Sort Code:</span> {h.listing.seller.bankSortCode || '—'}</p>
                                                        <p><span className="text-[var(--text-muted)]">Account:</span> {h.listing.seller.bankAccountNumber}</p>
                                                    </div>
                                                )}
                                            </div>
                                            {h.handoverSubmittedAt && (
                                                <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                                    <Clock size={12} />
                                                    Submitted {new Date(h.handoverSubmittedAt).toLocaleString()}
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-2">
                                            <p className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">Proof Submitted</p>
                                            {h.handoverProofUrl && (
                                                <a
                                                    href={h.handoverProofUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-2 p-3 bg-[var(--bg-card)] hover:bg-white/10 border border-[var(--border-default)] rounded-xl transition-colors text-sm text-blue-400 hover:text-blue-300"
                                                >
                                                    <ExternalLink size={16} />
                                                    View Handover Proof
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="px-5 pb-5 flex items-center gap-3">
                                        <Button
                                            onClick={() => handleApprove(h.id, !!h.listing?.seller?.stripeConnectOnboardingComplete, !!h.listing?.seller?.bankAccountNumber)}
                                            disabled={processing === h.id}
                                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center gap-2"
                                        >
                                            {processing === h.id ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                                            {h.listing?.seller?.stripeConnectOnboardingComplete
                                                ? 'Approve & Pay £100'
                                                : h.listing?.seller?.bankAccountNumber
                                                    ? 'Approve (Manual Transfer)'
                                                    : 'Approve (No Payout)'}
                                        </Button>
                                        <Button
                                            onClick={() => handleDeny(h.id)}
                                            disabled={processing === h.id}
                                            variant="outline"
                                            className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 flex items-center justify-center gap-2"
                                        >
                                            {processing === h.id ? <Loader2 size={16} className="animate-spin" /> : <XCircle size={16} />}
                                            Reject Proof — Resubmit
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}
