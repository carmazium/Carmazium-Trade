"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import {
    Gavel, PlusCircle, Loader2, Eye, XCircle, Clock,
    ChevronRight, AlertCircle, CheckCircle2, Calendar, X,
    Upload, Handshake, Info, CheckCircle, ImageIcon,
    BarChart2, Users, TrendingUp, Tag, Tags, Star,
} from "lucide-react"
import { createChatRoom } from "@/lib/chatApi"
import { AuctionResultsModal } from "@/components/auctions/AuctionResultsModal"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { useAuth } from "@/context/AuthContext"
import { useSearchParams } from "next/navigation"
import {
    getMyAuctions, createAuction, cancelAuction, closeAuctionEarly,
    getCurrentBid, getBidCount, updateAuctionDigest,
    type Auction, type CreateAuctionRequest,
} from "@/lib/auctionApi"
import { apiClient } from "@/lib/apiClient"
import { uploadImage } from "@/lib/supabase"
import { getStripeConnectStatus, alsoListRetail, type StripeConnectStatus, type Listing } from "@/lib/listingApi"

const STATUS_STYLES: Record<string, string> = {
    SCHEDULED: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    ACTIVE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    ENDED: "bg-gray-500/10 text-[var(--text-muted)] border-gray-500/20",
    CANCELLED: "bg-red-500/10 text-red-400 border-red-500/20",
}

function formatCountdown(target: Date): string {
    const diff = target.getTime() - Date.now()
    if (diff <= 0) return "Ended"
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor((diff % 3_600_000) / 60_000)
    const s = Math.floor((diff % 60_000) / 1_000)
    if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`
    return `${h}h ${m}m ${s}s`
}

function formatDate(iso: string) {
    return new Date(iso).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    })
}

function addHours(iso: string, hours: number): string {
    return new Date(new Date(iso).getTime() + hours * 3_600_000).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    })
}

// A plain grey "ENDED" pill hides the one thing a seller actually needs to
// know: whether there's something left to do. This surfaces that directly on
// the row instead of making them notice a separate section further down the
// page and mentally connect it back to this auction.
function AuctionStatusBadge({ auction }: { auction: Auction }) {
    const needsHandover = auction.status === "ENDED" && !!auction.winnerId && !auction.sellerBonusReleased
    const approved = auction.status === "ENDED" && !!auction.winnerId && auction.sellerBonusReleased
    // sellerBonusReleased means the handover was approved — it doesn't guarantee
    // the £100 actually arrived (auto-transfer can fail or be skipped if no
    // payout method is connected), so "Paid" is only shown once it truly has.
    const paidOut = approved && (!!auction.stripePayoutTransferId || !!auction.manualPayoutConfirmedAt)

    if (needsHandover) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border bg-amber-500/10 text-amber-400 border-amber-500/25 animate-pulse">
                <Handshake size={10} /> Action Needed
            </span>
        )
    }
    if (paidOut) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                <CheckCircle size={10} /> Ended · Paid
            </span>
        )
    }
    if (approved) {
        return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border bg-blue-500/10 text-blue-400 border-blue-500/20">
                <CheckCircle size={10} /> Ended · Payout Processing
            </span>
        )
    }
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLES[auction.status] ?? STATUS_STYLES.ENDED}`}>
            {auction.status === "ACTIVE" && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5" />
            )}
            {auction.status}
        </span>
    )
}

export default function SellerAuctionsPageWrapper() {
    return (
        <React.Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>}>
            <SellerAuctionsPage />
        </React.Suspense>
    )
}

function SellerAuctionsPage() {
    const { user, loading: authLoading } = useAuth()
    const searchParams = useSearchParams()
    const preselectedListingId = searchParams.get("listingId") ?? ""
    const [auctions, setAuctions] = React.useState<Auction[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [showForm, setShowForm] = React.useState(false)
    const [eligibleListings, setEligibleListings] = React.useState<Listing[]>([])
    const [cancelling, setCancelling] = React.useState<string | null>(null)
    const [closing, setClosing] = React.useState<string | null>(null)
    const [tick, setTick] = React.useState(0)

    // Form state
    const [formListingId, setFormListingId] = React.useState(preselectedListingId)
    const [formStartTime, setFormStartTime] = React.useState("")
    const [formStartImmediately, setFormStartImmediately] = React.useState(false)
    const [formReservePrice, setFormReservePrice] = React.useState("")
    const [formStartingBid, setFormStartingBid] = React.useState("")
    const [formMinIncrement, setFormMinIncrement] = React.useState("100")
    const [formBinPrice, setFormBinPrice] = React.useState("")
    const [submitting, setSubmitting] = React.useState(false)
    const [formError, setFormError] = React.useState<string | null>(null)
    const [successMsg, setSuccessMsg] = React.useState<string | null>(null)
    const [resultsAuction, setResultsAuction] = React.useState<Auction | null>(null)
    const [connectingChat, setConnectingChat] = React.useState(false)
    const [payoutStatus, setPayoutStatus] = React.useState<StripeConnectStatus | null>(null)
    // Also-list-retail for auction listings
    const [alsoRetailAuction, setAlsoRetailAuction] = React.useState<Auction | null>(null)
    const [alsoRetailPrice,   setAlsoRetailPrice]   = React.useState("")
    const [alsoRetailTier,    setAlsoRetailTier]    = React.useState<'BASIC' | 'STANDARD' | 'PREMIUM'>('BASIC')
    const [alsoRetailLoading, setAlsoRetailLoading] = React.useState(false)
    const [alsoRetailError,   setAlsoRetailError]   = React.useState<string | null>(null)
    // Digest — custom tags & self-rating on your own auction
    const [digestAuction,  setDigestAuction]  = React.useState<Auction | null>(null)
    const [digestTagsInput, setDigestTagsInput] = React.useState("")
    const [digestRating,   setDigestRating]   = React.useState<number | null>(null)
    const [digestLoading,  setDigestLoading]  = React.useState(false)
    const [digestError,    setDigestError]    = React.useState<string | null>(null)

    React.useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 1000)
        return () => clearInterval(id)
    }, [])

    React.useEffect(() => {
        if (user) getStripeConnectStatus().then(setPayoutStatus).catch(() => {})
    }, [user])

    async function fetchAuctions() {
        setLoading(true)
        setError(null)
        try {
            setAuctions(await getMyAuctions())
        } catch (err: any) {
            setError(err.message || "Failed to load auctions")
        } finally {
            setLoading(false)
        }
    }

    React.useEffect(() => {
        if (!authLoading && user) fetchAuctions()
    }, [user, authLoading])

    // Auto-open form if coming from inventory with a pre-selected listing
    React.useEffect(() => {
        if (preselectedListingId && !authLoading && user) openForm()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [preselectedListingId, authLoading, user])

    async function openForm() {
        setShowForm(true)
        setFormError(null)
        try {
            const [listingsRes, freshAuctions] = await Promise.all([
                apiClient<{ data: Listing[] }>("/listings/my"),
                getMyAuctions(),
            ])
            const listed = listingsRes?.data ?? []
            const auctionListingIds = new Set(
                (freshAuctions ?? [])
                    .filter(a => a.status === "SCHEDULED" || a.status === "ACTIVE")
                    .map(a => a.listingId)
            )
            // An auction that ends with reserve not met reverts its listing to
            // DRAFT/CLASSIFIED specifically so the seller can re-auction it later
            // (see AuctionsService.closeAuction) — that reversion is the whole
            // point of the "Re-auction" button in AuctionResultsModal. Without
            // this, that listing can never satisfy the ACTIVE-only check below,
            // so re-auctioning was silently impossible for every seller: the
            // dropdown always showed "No eligible listings" for the one listing
            // they were specifically trying to select. An ENDED auction against
            // the listing's own ID is what proves this DRAFT is a reverted
            // auction rather than an ordinary unfinished/unpaid draft, which
            // must stay excluded.
            const relistableAuctionListingIds = new Set(
                (freshAuctions ?? [])
                    .filter(a => a.status === "ENDED" || a.status === "CANCELLED")
                    .map(a => a.listingId)
            )
            setEligibleListings(
                listed.filter(l =>
                    (l.status === "ACTIVE" || (l.status === "DRAFT" && relistableAuctionListingIds.has(l.id))) &&
                    !auctionListingIds.has(l.id) &&
                    !(l as any).linkedListingId
                )
            )
        } catch {
            setFormError("Failed to load your listings.")
        }
    }

    async function handleCreate(e: React.FormEvent) {
        e.preventDefault()
        setFormError(null)
        if (!formListingId) { setFormError("Please select a listing."); return }
        if (!formStartImmediately && !formStartTime) { setFormError("Please set a start date/time or choose 'Start immediately'."); return }

        const resolvedStartTime = formStartImmediately ? new Date().toISOString() : new Date(formStartTime).toISOString()

        if (!formStartImmediately) {
            const startMs = new Date(formStartTime).getTime()
            if (startMs < Date.now() + 30 * 60 * 1000) {
                setFormError("Start time must be at least 30 minutes in the future.")
                return
            }
        }

        setSubmitting(true)
        try {
            const dto: CreateAuctionRequest = {
                listingId: formListingId,
                startTime: resolvedStartTime,
                reservePrice: Number(formReservePrice),
                startingBid: Number(formStartingBid),
                minIncrement: Number(formMinIncrement) || 100,
                ...(formBinPrice ? { buyItNowPrice: Number(formBinPrice) } : {}),
            }
            await createAuction(dto)
            const endDisplay = addHours(resolvedStartTime, 24)
            setSuccessMsg(formStartImmediately ? `Auction is now live! It will run until ${endDisplay}.` : `Auction scheduled! It will run until ${endDisplay}.`)
            setShowForm(false)
            setFormListingId(""); setFormStartTime(""); setFormStartImmediately(false); setFormReservePrice("")
            setFormStartingBid(""); setFormMinIncrement("100"); setFormBinPrice("")
            fetchAuctions()
        } catch (err: any) {
            setFormError(err.message || "Failed to create auction.")
        } finally {
            setSubmitting(false)
        }
    }

    async function handleCancel(id: string) {
        if (!confirm("Cancel this auction? This cannot be undone.")) return
        setCancelling(id)
        try {
            await cancelAuction(id)
            fetchAuctions()
        } catch (err: any) {
            alert(err.message || "Failed to cancel auction.")
        } finally {
            setCancelling(null)
        }
    }

    async function handleClose(id: string) {
        if (!confirm("Close this auction now? Bidding will end immediately and a winner will be determined if the reserve has been met. This cannot be undone.")) return
        setClosing(id)
        try {
            await closeAuctionEarly(id)
            setSuccessMsg("Auction closed — winner determined if reserve was met.")
            fetchAuctions()
        } catch (err: any) {
            alert(err.message || "Failed to close auction.")
        } finally {
            setClosing(null)
        }
    }

    async function handleAlsoRetailSubmit() {
        if (!alsoRetailAuction || !alsoRetailPrice) return
        setAlsoRetailLoading(true)
        setAlsoRetailError(null)
        try {
            const { linkedListingId } = await alsoListRetail(alsoRetailAuction.listingId, parseFloat(alsoRetailPrice), alsoRetailTier)
            // Retail is a distinct listing and must have a fresh HPI. The normal
            // edit wizard handles that mandatory request before the £1/upgrade fee.
            window.location.href = `/sell?editId=${encodeURIComponent(linkedListingId)}`
        } catch (err: any) {
            setAlsoRetailError(err.message ?? 'Failed to create retail listing')
        } finally {
            setAlsoRetailLoading(false)
        }
    }

    function openDigest(auction: Auction) {
        setDigestAuction(auction)
        setDigestTagsInput((auction.customTags ?? []).join(', '))
        setDigestRating(auction.sellerSelfRating ?? null)
        setDigestError(null)
    }

    async function handleDigestSubmit() {
        if (!digestAuction) return
        const customTags = digestTagsInput.split(',').map(t => t.trim()).filter(Boolean).slice(0, 10)
        setDigestLoading(true)
        setDigestError(null)
        try {
            const updated = await updateAuctionDigest(digestAuction.id, {
                customTags,
                ...(digestRating ? { sellerSelfRating: digestRating } : {}),
            })
            setAuctions(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a))
            setDigestAuction(null)
        } catch (err: any) {
            setDigestError(err.message ?? 'Failed to save digest')
        } finally {
            setDigestLoading(false)
        }
    }

    // ── Handover proof upload ─────────────────────────────────────────────────
    const [handoverUploading, setHandoverUploading] = React.useState<string | null>(null)
    const [handoverDone, setHandoverDone] = React.useState<Set<string>>(new Set())
    const [handoverError, setHandoverError] = React.useState<Record<string, string>>({})

    // Seed handoverDone from API data whenever auctions load
    React.useEffect(() => {
        const submittedIds = auctions
            .filter(a => a.handoverProofUrl && !a.sellerBonusReleased)
            .map(a => a.id)
        if (submittedIds.length > 0) {
            setHandoverDone(prev => new Set([...prev, ...submittedIds]))
        }
    }, [auctions])

    async function handleHandoverUpload(auctionId: string, file: File) {
        setHandoverUploading(auctionId)
        setHandoverError(prev => ({ ...prev, [auctionId]: "" }))
        try {
            const url = await uploadImage(file, 'listings', `handover/${auctionId}`)
            await apiClient(`/auctions/${auctionId}/handover-proof`, {
                method: "POST",
                body: JSON.stringify({ proofUrl: url }),
            })
            setHandoverDone(prev => new Set([...prev, auctionId]))
            setSuccessMsg("Handover proof submitted — your £100 bonus will be released after verification.")
        } catch (err: any) {
            setHandoverError(prev => ({ ...prev, [auctionId]: err.message || "Upload failed. Please try again." }))
        } finally {
            setHandoverUploading(null)
        }
    }

    // Auctions where handover is needed or pending — exclude fully approved ones
    const endedWithWinner = auctions.filter(a => a.status === "ENDED" && a.winnerId && !a.sellerBonusReleased)
    // Auctions where bonus has been approved — show a completion card
    const approvedHandovers = auctions.filter(a => a.status === "ENDED" && a.winnerId && a.sellerBonusReleased)

    async function handleConnectWithWinner(auction: Auction) {
        if (!auction.winnerId) return
        setConnectingChat(true)
        try {
            const room = await createChatRoom(auction.winnerId, auction.listingId)
            window.location.href = `/dashboard/seller/messages?room=${room.id}`
        } catch (err: any) {
            alert(err.message || "Failed to open chat")
        } finally {
            setConnectingChat(false)
        }
    }

    return (
        <>
        <div className="min-h-screen pt-20 pb-12">
            <div className="container mx-auto px-5 flex flex-col lg:flex-row gap-8">
                <DashboardSidebar role="seller" />
                <main className="flex-1 space-y-6">

                    {/* Header — sticky so "Create Auction" stays reachable without
                        scrolling back up from deep inside a long auctions table */}
                    <div className="sticky top-20 z-20 bg-[var(--bg-body)]/95 backdrop-blur-md pt-2 -mt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-3xl font-bold font-heading">My Auctions</h1>
                            <p className="text-[var(--text-muted)] text-sm mt-1">Manage your live vehicle auctions and bidding</p>
                        </div>
                        <button
                            onClick={openForm}
                            className="inline-flex items-center gap-2 bg-primary text-white font-bold py-2.5 px-6 rounded-xl shadow-neon hover:bg-red-600 transition-colors"
                        >
                            <PlusCircle size={18} />
                            Create Auction
                        </button>
                    </div>

                    {/* Action needed — the single most important thing on this page when it applies,
                        so it sits above everything else instead of being a section you have to scroll
                        past the whole table to discover on your own. */}
                    {endedWithWinner.length > 0 && (
                        <button
                            type="button"
                            onClick={() => document.getElementById('handover-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                            className="w-full flex items-center gap-4 p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 transition-colors text-left"
                        >
                            <div className="w-11 h-11 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                                <Handshake size={20} className="text-amber-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="font-black text-amber-300 text-base">
                                    {endedWithWinner.length} auction{endedWithWinner.length > 1 ? "s" : ""} waiting on you
                                </p>
                                <p className="text-sm text-amber-300/80 mt-0.5">
                                    Upload handover proof to get your £100 bonus released.
                                </p>
                            </div>
                            <ChevronRight size={18} className="text-amber-400 shrink-0" />
                        </button>
                    )}

                    {/* Success banner */}
                    <AnimatePresence>
                        {successMsg && (
                            <motion.div
                                initial={{ opacity: 0, y: -8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -8 }}
                                className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                            >
                                <CheckCircle2 size={18} />
                                <span className="flex-1 text-sm font-bold">{successMsg}</span>
                                <button onClick={() => setSuccessMsg(null)}><X size={16} /></button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Create auction form */}
                    <AnimatePresence>
                        {showForm && (
                            <motion.div
                                initial={{ opacity: 0, y: -12 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -12 }}
                                className="glass-card overflow-hidden"
                            >
                                <div className="p-5 border-b border-[var(--border-default)] flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Gavel size={18} className="text-primary" />
                                        <h2 className="font-bold text-lg">{formStartImmediately ? "Start Auction Now" : "Schedule New Auction"}</h2>
                                    </div>
                                    <button
                                        onClick={() => setShowForm(false)}
                                        className="text-[var(--text-muted)] hover:text-primary dark:hover:text-white transition-colors"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>

                                <form onSubmit={handleCreate} className="p-5 space-y-4">
                                    {formError && (
                                        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                            <AlertCircle size={16} />
                                            {formError}
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Listing select */}
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                                                Select Listing
                                            </label>
                                            <select
                                                value={formListingId}
                                                onChange={e => setFormListingId(e.target.value)}
                                                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg h-11 px-3 text-sm focus:ring-1 focus:ring-primary/50 focus:outline-none"
                                            >
                                                <option value="">— Choose an AUCTION-type listing —</option>
                                                {eligibleListings.map(l => (
                                                    <option key={l.id} value={l.id}>
                                                        {l.title} — {l.year} {l.make} {l.model}
                                                        {l.status === "DRAFT" ? " (previous auction ended — reserve not met)" : ""}
                                                    </option>
                                                ))}
                                            </select>
                                            {eligibleListings.length === 0 && (
                                                <p className="text-xs text-[var(--text-muted)] mt-1">
                                                    No eligible listings. Create an AUCTION-type listing first.
                                                </p>
                                            )}
                                        </div>

                                        {/* Start immediately toggle */}
                                        <div className="md:col-span-2">
                                            <button
                                                type="button"
                                                onClick={() => { setFormStartImmediately(v => !v); setFormStartTime("") }}
                                                className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg border transition-colors ${formStartImmediately ? "bg-primary/10 border-primary/40 text-primary" : "bg-[var(--bg-input)] border-[var(--border-default)] text-[var(--text-muted)] hover:border-primary/30"}`}
                                            >
                                                <div className={`w-9 h-5 rounded-full relative transition-colors ${formStartImmediately ? "bg-primary" : "bg-slate-600"}`}>
                                                    <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${formStartImmediately ? "translate-x-4" : "translate-x-0.5"}`} />
                                                </div>
                                                <span className="text-sm font-semibold">Start immediately — go live right now</span>
                                            </button>
                                        </div>

                                        {/* Start time (hidden when starting immediately) */}
                                        {!formStartImmediately && (
                                        <div>
                                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                                                Start Date & Time
                                            </label>
                                            <Input
                                                type="datetime-local"
                                                value={formStartTime}
                                                onChange={e => setFormStartTime(e.target.value)}
                                                min={new Date(Date.now() + 30 * 60_000).toISOString().slice(0, 16)}
                                                className="bg-[var(--bg-input)] border-[var(--border-default)] h-11 rounded-lg"
                                            />
                                        </div>
                                        )}

                                        {/* Duration read-only */}
                                        <div>
                                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                                                Duration
                                            </label>
                                            <div className="flex items-center gap-2 h-11 px-3 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg text-[var(--text-muted)] text-sm">
                                                <Clock size={14} className="text-primary shrink-0" />
                                                <span>24 hours · Open bidding</span>
                                                {(formStartImmediately || formStartTime) && (
                                                    <span className="ml-auto text-xs text-[var(--text-secondary)] shrink-0">
                                                        ends {addHours(formStartImmediately ? new Date().toISOString() : new Date(formStartTime).toISOString(), 24)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Reserve price */}
                                        <div>
                                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                                                Reserve Price (£)
                                            </label>
                                            <Input
                                                type="number"
                                                min={0}
                                                step={1}
                                                placeholder="e.g. 15000"
                                                value={formReservePrice}
                                                onChange={e => setFormReservePrice(e.target.value)}
                                                className="bg-[var(--bg-input)] border-[var(--border-default)] h-11 rounded-lg"
                                            />
                                        </div>

                                        {/* Starting bid */}
                                        <div>
                                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                                                Starting Bid (£)
                                            </label>
                                            <Input
                                                type="number"
                                                min={0}
                                                step={1}
                                                placeholder="e.g. 10000"
                                                value={formStartingBid}
                                                onChange={e => setFormStartingBid(e.target.value)}
                                                className="bg-[var(--bg-input)] border-[var(--border-default)] h-11 rounded-lg"
                                            />
                                        </div>

                                        {/* Min increment */}
                                        <div>
                                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                                                Minimum Bid Increment (£)
                                            </label>
                                            <Input
                                                type="number"
                                                min={1}
                                                step={1}
                                                value={formMinIncrement}
                                                onChange={e => setFormMinIncrement(e.target.value)}
                                                className="bg-[var(--bg-input)] border-[var(--border-default)] h-11 rounded-lg"
                                            />
                                        </div>

                                        {/* Buy It Now price (optional) */}
                                        <div>
                                            <label className="block text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                                                Buy It Now Price (£) <span className="text-[var(--text-secondary)] font-normal normal-case">— optional</span>
                                            </label>
                                            <Input
                                                type="number"
                                                min={0}
                                                step={1}
                                                placeholder="Leave blank to disable BIN"
                                                value={formBinPrice}
                                                onChange={e => setFormBinPrice(e.target.value)}
                                                className="bg-[var(--bg-input)] border-[var(--border-default)] h-11 rounded-lg"
                                            />
                                        </div>
                                    </div>

                                    <div className="flex justify-end gap-3 pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setShowForm(false)}
                                            className="px-5 py-2 rounded-lg border border-[var(--border-default)] text-[var(--text-muted)] hover:bg-[var(--bg-card)] transition-colors text-sm font-bold"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="inline-flex items-center gap-2 px-6 py-2 rounded-lg bg-primary text-white font-bold hover:bg-red-600 transition-colors disabled:opacity-50 text-sm"
                                        >
                                            {submitting
                                                ? <Loader2 size={15} className="animate-spin" />
                                                : <Gavel size={15} />
                                            }
                                            Schedule Auction
                                        </button>
                                    </div>
                                </form>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Auctions table */}
                    <div className="glass-card overflow-hidden">
                        {/* ── Mobile cards (< sm) ── */}
                        <div className="sm:hidden divide-y divide-[var(--border-default)]">
                            {loading ? (
                                <div className="px-6 py-12 text-center">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                                </div>
                            ) : error ? (
                                <div className="px-6 py-8 text-center">
                                    <div className="flex items-center justify-center gap-2 text-red-400">
                                        <AlertCircle size={16} />
                                        <span className="text-sm">{error}</span>
                                    </div>
                                </div>
                            ) : auctions.length === 0 ? (
                                <div className="px-6 py-12 text-center text-[var(--text-muted)]">
                                    <Gavel className="h-10 w-10 text-gray-700 mx-auto mb-2" />
                                    <p className="font-bold">No auctions yet.</p>
                                    <button
                                        onClick={openForm}
                                        className="mt-3 inline-flex items-center gap-1.5 text-primary hover:underline text-sm font-bold"
                                    >
                                        <PlusCircle size={14} /> Create your first auction
                                    </button>
                                </div>
                            ) : (
                                auctions.map(auction => (
                                    <div key={auction.id} className="p-4">
                                        <div className="flex gap-3">
                                            {auction.listing.images?.[0] && (
                                                <img
                                                    src={auction.listing.images[0]}
                                                    alt=""
                                                    className="w-20 h-16 rounded-xl object-cover shrink-0"
                                                />
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <p className="font-bold text-base leading-snug truncate">{auction.listing.title}</p>
                                                <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                                                    {auction.listing.year} &middot; {auction.listing.make} {auction.listing.model}
                                                </p>
                                                <div className="mt-1.5"><AuctionStatusBadge auction={auction} /></div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between gap-2 mt-3 text-xs">
                                            <div className="flex items-center gap-1.5 text-[var(--text-muted)] min-w-0">
                                                <Calendar size={11} className="shrink-0" />
                                                <span className="truncate">{formatDate(auction.startTime)}</span>
                                            </div>
                                            {auction.status === "ACTIVE" ? (
                                                <div className="flex items-center gap-1.5 text-primary font-bold shrink-0">
                                                    <Clock size={11} />
                                                    <span key={tick}>{formatCountdown(new Date(auction.endTime))}</span>
                                                </div>
                                            ) : auction.status === "SCHEDULED" ? (
                                                <div className="text-blue-400 shrink-0">
                                                    Starts in {formatCountdown(new Date(auction.startTime))}
                                                </div>
                                            ) : null}
                                        </div>

                                        <div className="flex items-center justify-between mt-2">
                                            <span className="font-mono font-bold text-lg">£{getCurrentBid(auction).toLocaleString()}</span>
                                            <span className="text-sm text-[var(--text-muted)]">{getBidCount(auction)} bid{getBidCount(auction) === 1 ? '' : 's'}</span>
                                        </div>

                                        <div className="flex flex-wrap gap-2 mt-3">
                                            {auction.status === "ACTIVE" && (
                                                <>
                                                    <Link
                                                        href={`/auctions/live/${auction.id}`}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold hover:bg-emerald-500/20 transition-colors"
                                                    >
                                                        <Eye size={13} /> View Live
                                                    </Link>
                                                    <button
                                                        disabled={closing === auction.id}
                                                        onClick={() => handleClose(auction.id)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                                                    >
                                                        {closing === auction.id
                                                            ? <Loader2 size={13} className="animate-spin" />
                                                            : <Gavel size={13} />
                                                        }
                                                        Close Bids
                                                    </button>
                                                </>
                                            )}
                                            {(auction.status === "ACTIVE" || auction.status === "SCHEDULED") && !(auction.listing as any).linkedListing && (
                                                <button
                                                    onClick={() => { setAlsoRetailAuction(auction); setAlsoRetailPrice(""); setAlsoRetailTier('BASIC'); setAlsoRetailError(null) }}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-transparent text-[var(--text-muted)] border border-[var(--border-default)] text-xs font-bold hover:text-blue-400 hover:border-blue-500/30 transition-colors"
                                                >
                                                    <Tag size={13} /> Also Retail
                                                </button>
                                            )}
                                            {(auction.status === "ACTIVE" || auction.status === "SCHEDULED") && (auction.listing as any).linkedListing?.status === 'DRAFT' && (
                                                <button
                                                    onClick={() => {
                                                        const linked = (auction.listing as any).linkedListing
                                                        // A linked Retail Listing is a distinct listing and must
                                                        // obtain its own fresh HPI before its listing fee can be paid.
                                                        window.location.href = `/sell?editId=${encodeURIComponent(linked.id)}`
                                                    }}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold hover:bg-amber-500/20 transition-colors"
                                                >
                                                    <Tag size={13} /> Complete Retail Listing
                                                </button>
                                            )}
                                            {(auction.status === "ACTIVE" || auction.status === "SCHEDULED") && (
                                                <button
                                                    onClick={() => openDigest(auction)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-transparent text-[var(--text-muted)] border border-[var(--border-default)] text-xs font-bold hover:text-violet-400 hover:border-violet-500/30 transition-colors"
                                                >
                                                    <Tags size={13} /> Digest
                                                </button>
                                            )}
                                            {auction.status === "SCHEDULED" && (
                                                <button
                                                    disabled={cancelling === auction.id}
                                                    onClick={() => handleCancel(auction.id)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                                >
                                                    {cancelling === auction.id
                                                        ? <Loader2 size={13} className="animate-spin" />
                                                        : <XCircle size={13} />
                                                    }
                                                    Cancel
                                                </button>
                                            )}
                                            {(auction.status === "ENDED" || auction.status === "CANCELLED") && (
                                                <button
                                                    onClick={() => setResultsAuction(auction)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-default)] text-xs font-bold hover:bg-white/10 transition-colors"
                                                >
                                                    <BarChart2 size={13} /> Results
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* ── Full table (>= sm) ── */}
                        <div className="hidden sm:block overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-[var(--bg-input)] text-[var(--text-muted)] text-xs uppercase font-bold">
                                    <tr>
                                        <th className="px-6 py-4">Vehicle</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4">Schedule</th>
                                        <th className="px-6 py-4 text-right">Current Bid</th>
                                        <th className="px-6 py-4 text-center">Bids</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-default)]">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center">
                                                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                                            </td>
                                        </tr>
                                    ) : error ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-8 text-center">
                                                <div className="flex items-center justify-center gap-2 text-red-400">
                                                    <AlertCircle size={16} />
                                                    <span className="text-sm">{error}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : auctions.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-[var(--text-muted)]">
                                                <Gavel className="h-10 w-10 text-gray-700 mx-auto mb-2" />
                                                <p className="font-bold">No auctions yet.</p>
                                                <button
                                                    onClick={openForm}
                                                    className="mt-3 inline-flex items-center gap-1.5 text-primary hover:underline text-sm font-bold"
                                                >
                                                    <PlusCircle size={14} /> Create your first auction
                                                </button>
                                            </td>
                                        </tr>
                                    ) : (
                                        auctions.map(auction => (
                                            <tr key={auction.id} className="hover:bg-[var(--bg-card)] transition-colors">
                                                {/* Vehicle */}
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        {auction.listing.images?.[0] && (
                                                            <img
                                                                src={auction.listing.images[0]}
                                                                alt=""
                                                                className="w-14 h-10 rounded object-cover"
                                                            />
                                                        )}
                                                        <div>
                                                            <div className="font-bold">{auction.listing.title}</div>
                                                            <div className="text-xs text-[var(--text-muted)]">
                                                                {auction.listing.year} · {auction.listing.make} {auction.listing.model}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Status */}
                                                <td className="px-6 py-4">
                                                    <AuctionStatusBadge auction={auction} />
                                                </td>

                                                {/* Schedule */}
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                                                            <Calendar size={11} />
                                                            {formatDate(auction.startTime)}
                                                        </div>
                                                        {auction.status === "ACTIVE" ? (
                                                            <div className="flex items-center gap-1.5 text-xs text-primary font-bold">
                                                                <Clock size={11} />
                                                                <span key={tick}>{formatCountdown(new Date(auction.endTime))}</span>
                                                            </div>
                                                        ) : auction.status === "SCHEDULED" ? (
                                                            <div className="text-xs text-blue-400">
                                                                Starts in {formatCountdown(new Date(auction.startTime))}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                </td>

                                                {/* Current bid */}
                                                <td className="px-6 py-4 text-right font-mono font-bold">
                                                    £{getCurrentBid(auction).toLocaleString()}
                                                </td>

                                                {/* Bids */}
                                                <td className="px-6 py-4 text-center text-[var(--text-muted)]">
                                                    {getBidCount(auction)}
                                                </td>

                                                {/* Actions */}
                                                <td className="px-6 py-4">
                                                    <div className="flex justify-end gap-2">
                                                        {auction.status === "ACTIVE" && (
                                                            <>
                                                                <Link
                                                                    href={`/auctions/live/${auction.id}`}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold hover:bg-emerald-500/20 transition-colors"
                                                                >
                                                                    <Eye size={13} /> View Live
                                                                </Link>
                                                                <button
                                                                    disabled={closing === auction.id}
                                                                    onClick={() => handleClose(auction.id)}
                                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                                                                >
                                                                    {closing === auction.id
                                                                        ? <Loader2 size={13} className="animate-spin" />
                                                                        : <Gavel size={13} />
                                                                    }
                                                                    Close Bids
                                                                </button>
                                                            </>
                                                        )}
                                                        {(auction.status === "ACTIVE" || auction.status === "SCHEDULED") && !(auction.listing as any).linkedListing && (
                                                            <button
                                                                onClick={() => { setAlsoRetailAuction(auction); setAlsoRetailPrice(""); setAlsoRetailTier('BASIC'); setAlsoRetailError(null) }}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-transparent text-[var(--text-muted)] border border-[var(--border-default)] text-xs font-bold hover:text-blue-400 hover:border-blue-500/30 transition-colors"
                                                            >
                                                                <Tag size={13} /> Also Retail
                                                            </button>
                                                        )}
                                                        {(auction.status === "ACTIVE" || auction.status === "SCHEDULED") && (auction.listing as any).linkedListing?.status === 'DRAFT' && (
                                                            <button
                                                                onClick={() => {
                                                                    const linked = (auction.listing as any).linkedListing
                                                                    // This linked Retail Listing must complete its own fresh
                                                                    // HPI/history request before any listing fee is collected.
                                                                    window.location.href = `/sell?editId=${encodeURIComponent(linked.id)}`
                                                                }}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold hover:bg-amber-500/20 transition-colors"
                                                            >
                                                                <Tag size={13} /> Complete Retail Listing
                                                            </button>
                                                        )}
                                                        {(auction.status === "ACTIVE" || auction.status === "SCHEDULED") && (
                                                            <button
                                                                onClick={() => openDigest(auction)}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-transparent text-[var(--text-muted)] border border-[var(--border-default)] text-xs font-bold hover:text-violet-400 hover:border-violet-500/30 transition-colors"
                                                            >
                                                                <Tags size={13} /> Digest
                                                            </button>
                                                        )}
                                                        {auction.status === "SCHEDULED" && (
                                                            <button
                                                                disabled={cancelling === auction.id}
                                                                onClick={() => handleCancel(auction.id)}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-bold hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                                            >
                                                                {cancelling === auction.id
                                                                    ? <Loader2 size={13} className="animate-spin" />
                                                                    : <XCircle size={13} />
                                                                }
                                                                Cancel
                                                            </button>
                                                        )}
                                                        {(auction.status === "ENDED" || auction.status === "CANCELLED") && (
                                                            <button
                                                                onClick={() => setResultsAuction(auction)}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] text-[var(--text-muted)] border border-[var(--border-default)] text-xs font-bold hover:bg-white/10 transition-colors"
                                                            >
                                                                <BarChart2 size={13} /> Results
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    {/* ── Approved Handovers ──────────────────────────────── */}
                    {approvedHandovers.length > 0 && (
                        <div className="space-y-3">
                            {approvedHandovers.map(auction => {
                                const paid = !!auction.stripePayoutTransferId || !!auction.manualPayoutConfirmedAt
                                return (
                                <div key={auction.id} className="glass-card p-4 flex items-center gap-4 border border-emerald-500/20 bg-emerald-500/5 rounded-2xl">
                                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                                        <CheckCircle size={18} className="text-emerald-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-sm">{auction.listing?.title}</p>
                                        <p className="text-xs text-emerald-400 mt-0.5">
                                            {paid ? "Handover verified — £100 seller bonus released" : "Handover verified — £100 bonus is being processed"}
                                        </p>
                                    </div>
                                    <span className="text-xs font-black uppercase tracking-widest text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg">
                                        {paid ? "Complete" : "Processing"}
                                    </span>
                                </div>
                                )
                            })}
                        </div>
                    )}

                    {/* ── Handover Proof Section ──────────────────────────── */}
                    {endedWithWinner.length > 0 && (
                        <div id="handover-section" className="space-y-4 scroll-mt-24">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                                    <Handshake size={16} className="text-emerald-400" />
                                </div>
                                <div>
                                    <h2 className="font-bold">Handover Completion</h2>
                                    <p className="text-xs text-[var(--text-muted)]">Upload proof to receive your £100 seller bonus</p>
                                </div>
                            </div>

                            {payoutStatus !== null && !payoutStatus.onboardingComplete && (
                                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                    <AlertCircle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                                    <div className="text-xs text-amber-300">
                                        <p className="font-bold mb-0.5">Payout method not set up</p>
                                        <p className="text-amber-300/70">
                                            Connect your bank account in{" "}
                                            <a href="/dashboard/seller/settings" className="underline hover:text-amber-200">Settings → Payouts</a>
                                            {" "}to receive your £100 automatically after handover approval.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {endedWithWinner.map(auction => {
                                const isDone = handoverDone.has(auction.id)
                                const isUploading = handoverUploading === auction.id
                                const err = handoverError[auction.id]
                                const winningBid = Number(auction.winningBidAmount)

                                return (
                                    <div key={auction.id} className="glass-card p-5 space-y-4">
                                        {/* Auction info */}
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-center gap-3 min-w-0">
                                                {auction.listing.images?.[0] && (
                                                    <Image src={auction.listing.images[0]} alt="" width={56} height={40} className="w-14 h-10 rounded object-cover shrink-0" />
                                                )}
                                                <div className="min-w-0">
                                                    <p className="font-bold truncate">{auction.listing.title}</p>
                                                    <p className="text-xs text-[var(--text-muted)]">{auction.listing.year} · {auction.listing.make} {auction.listing.model}</p>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest">Winning Bid</p>
                                                <p className="text-lg font-black font-mono">£{winningBid.toLocaleString()}</p>
                                            </div>
                                        </div>

                                        {/* Fee summary — only the seller's own payout, not the
                                            full £125 breakdown (what the buyer pays and what
                                            Carmazium keeps is not the seller's business). */}
                                        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-2.5 text-center text-xs">
                                            <p className="text-[var(--text-muted)] text-xs uppercase tracking-widest mb-0.5">Your Bonus</p>
                                            <p className="text-emerald-400 font-black text-base">£100</p>
                                            <p className="text-[var(--text-secondary)] text-xs">after handover verified</p>
                                        </div>

                                        {isDone ? (
                                            <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                                <CheckCircle size={16} className="shrink-0" />
                                                <div>
                                                    <p className="text-sm font-bold">Handover proof submitted</p>
                                                    <p className="text-xs text-emerald-400/70">Your £100 bonus is pending verification — we'll notify you once released.</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-xs text-[var(--text-muted)]">
                                                    <Info size={13} className="text-amber-400 shrink-0 mt-0.5" />
                                                    <span>Upload a photo or document showing the vehicle was handed over — e.g. a signed receipt, photo with the buyer, or logbook transfer confirmation.</span>
                                                </div>

                                                {err && (
                                                    <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                                                        <AlertCircle size={13} className="shrink-0" />
                                                        {err}
                                                    </div>
                                                )}

                                                <label className={`flex flex-col items-center gap-3 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${isUploading ? "opacity-50 pointer-events-none" : "border-[var(--border-default)] hover:border-emerald-500/40 hover:bg-emerald-500/5"}`}>
                                                    <input
                                                        type="file"
                                                        accept="image/*,.pdf"
                                                        className="sr-only"
                                                        disabled={isUploading}
                                                        onChange={e => {
                                                            const file = e.target.files?.[0]
                                                            if (file) handleHandoverUpload(auction.id, file)
                                                        }}
                                                    />
                                                    {isUploading ? (
                                                        <Loader2 size={24} className="text-emerald-400 animate-spin" />
                                                    ) : (
                                                        <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                                                            <ImageIcon size={22} className="text-emerald-400" />
                                                        </div>
                                                    )}
                                                    <div className="text-center">
                                                        <p className="text-sm font-bold">
                                                            {isUploading ? "Uploading proof..." : "Upload Handover Proof"}
                                                        </p>
                                                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                                            {isUploading ? "Please wait" : "JPG, PNG or PDF · Click or drag to upload"}
                                                        </p>
                                                    </div>
                                                    {!isUploading && (
                                                        <span className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500 text-black font-bold text-xs">
                                                            <Upload size={12} /> Choose File
                                                        </span>
                                                    )}
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </main>
            </div>
        </div>

        {/* Auction Results Modal */}

        {resultsAuction && (
            <AuctionResultsModal
                auction={resultsAuction}
                onClose={() => setResultsAuction(null)}
                onReauction={(a) => {
                    setResultsAuction(null)
                    setFormListingId(a.listingId)
                    openForm()
                }}
                onConnectWithWinner={handleConnectWithWinner}
                connectingChat={connectingChat}
            />
        )}
        {/* ── Also List for Retail modal ──────────────────────────── */}
        {alsoRetailAuction && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                <div className="bg-[var(--bg-dropdown)] border border-[var(--border-default)] rounded-2xl w-full max-w-sm p-6 space-y-5 shadow-2xl">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                                <Tag size={16} className="text-blue-400" />
                            </div>
                            <div>
                                <p className="font-bold text-sm">Also List for Retail</p>
                                <p className="text-[var(--text-muted)] text-xs truncate max-w-[180px]">{alsoRetailAuction.listing?.title}</p>
                            </div>
                        </div>
                        <button onClick={() => setAlsoRetailAuction(null)} className="text-[var(--text-muted)] hover:text-primary dark:hover:text-white transition-colors"><X size={18} /></button>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">Retail Price (£)</label>
                            <input
                                type="number"
                                placeholder="e.g. 18500"
                                value={alsoRetailPrice}
                                onChange={e => setAlsoRetailPrice(e.target.value)}
                                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 h-10 text-sm focus:outline-none focus:border-primary/50"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">Listing Plan</label>
                            <div className="grid grid-cols-3 gap-2">
                                {([['BASIC', '£1'], ['STANDARD', '£10'], ['PREMIUM', '£25']] as const).map(([tier, price]) => (
                                    <button
                                        key={tier}
                                        onClick={() => setAlsoRetailTier(tier)}
                                        className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${alsoRetailTier === tier ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-[var(--bg-input)] border-[var(--border-default)] text-[var(--text-muted)] hover:border-primary/30'}`}
                                    >
                                        {tier}<br /><span className="text-xs font-normal">{price}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {alsoRetailError && <p className="text-red-400 text-xs">{alsoRetailError}</p>}

                    <button
                        onClick={handleAlsoRetailSubmit}
                        disabled={alsoRetailLoading || !alsoRetailPrice}
                        className="w-full h-10 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {alsoRetailLoading ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : <><Tag size={14} /> Create & Pay</>}
                    </button>
                </div>
            </div>
        )}

        {digestAuction && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                <div className="bg-[var(--bg-dropdown)] border border-[var(--border-default)] rounded-2xl w-full max-w-sm p-6 space-y-5 shadow-2xl">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                                <Tags size={16} className="text-violet-400" />
                            </div>
                            <div>
                                <p className="font-bold text-sm">Digest</p>
                                <p className="text-[var(--text-muted)] text-xs truncate max-w-[180px]">{digestAuction.listing?.title}</p>
                            </div>
                        </div>
                        <button onClick={() => setDigestAuction(null)} className="text-[var(--text-muted)] hover:text-primary dark:hover:text-white transition-colors"><X size={18} /></button>
                    </div>

                    <p className="text-xs text-[var(--text-muted)]">Add your own custom tags/batch labels and a self-rating to this listing — shown to buyers on the auction page.</p>

                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">Custom Tags (comma-separated)</label>
                            <input
                                type="text"
                                placeholder="e.g. Track Day Ready, One Owner"
                                value={digestTagsInput}
                                onChange={e => setDigestTagsInput(e.target.value)}
                                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-3 h-10 text-sm focus:outline-none focus:border-primary/50"
                            />
                            <p className="text-[10px] text-[var(--text-muted)] mt-1">Up to 10 tags, 30 characters each.</p>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider block mb-1.5">Self-Rating</label>
                            <div className="flex gap-1.5">
                                {[1, 2, 3, 4, 5].map(n => (
                                    <button
                                        key={n}
                                        type="button"
                                        onClick={() => setDigestRating(prev => prev === n ? null : n)}
                                        className="p-1"
                                    >
                                        <Star
                                            size={22}
                                            className={(digestRating ?? 0) >= n ? "text-amber-400 fill-amber-400" : "text-[var(--text-muted)]"}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {digestError && <p className="text-red-400 text-xs">{digestError}</p>}

                    <button
                        onClick={handleDigestSubmit}
                        disabled={digestLoading}
                        className="w-full h-10 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {digestLoading ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Tags size={14} /> Save Digest</>}
                    </button>
                </div>
            </div>
        )}
        </>
    )
}
