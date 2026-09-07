"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter, useSearchParams } from "next/navigation"
import {
    ArrowLeft, Trophy, Car, Loader2, AlertTriangle,
    Fuel, Cog, Gauge, Palette, DoorOpen, Users2, Zap,
    CalendarDays, Hash, ShieldCheck, FileText,
    MapPin, CheckCircle2, XCircle, Clock, PoundSterling,
    MessageSquare, User, FileSearch, Phone, Mail, Award,
    ChevronLeft, ChevronRight, ZoomIn,
} from "lucide-react"
import { ImageLightbox } from "@/components/features/ImageLightbox"
import { useAuth } from "@/context/AuthContext"
import { RequireAuth } from "@/components/auth/RequireAuth"
import { TRADE_EXCHANGE_ROLES, canAccessTradeExchange } from "@/lib/tradeAccess"
import { getWonAuctionById, type Auction } from "@/lib/auctionApi"
import { createChatRoom, type ChatRoom } from "@/lib/chatApi"
import { ChatWindow } from "@/components/chat/ChatWindow"
import { ChatErrorBoundary } from "@/components/chat/ChatErrorBoundary"
import { HpiReportModal } from "@/components/hpi/HpiReportModal"
import { getSessionStatus, applyHpiEmailFee } from "@/lib/paymentApi"

// ─── Spec row helper ──────────────────────────────────────────────────────────

function SpecRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | number | null }) {
    if (!value && value !== 0) return null
    return (
        <div className="flex items-start gap-3 py-3 border-b border-[var(--border-default)] last:border-0">
            <div className="w-7 h-7 rounded-lg bg-[var(--bg-card)] flex items-center justify-center shrink-0 mt-0.5 text-[var(--text-muted)]">
                {icon}
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest font-bold">{label}</p>
                <p className="text-sm font-bold text-[var(--text-primary)] mt-0.5">{value}</p>
            </div>
        </div>
    )
}

function StatusChip({ ok, label }: { ok: boolean | null; label: string }) {
    if (ok === null) return null
    return (
        <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border ${
            ok
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-red-500/10 border-red-500/20 text-red-400"
        }`}>
            {ok ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
            {label}
        </span>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WonAuctionPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = React.use(paramsPromise)
    const auctionId = params.id
    const { user, profile, loading: authLoading } = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()

    const [auction, setAuction] = React.useState<Auction | null>(null)
    const [loadError, setLoadError] = React.useState<string | null>(null)
    const [loading, setLoading] = React.useState(true)

    const [chatRoom, setChatRoom] = React.useState<ChatRoom | null>(null)
    const [chatLoading, setChatLoading] = React.useState(false)
    const [chatError, setChatError] = React.useState<string | null>(null)

    const [activeImage, setActiveImage] = React.useState(0)
    const [galleryLightboxOpen, setGalleryLightboxOpen] = React.useState(false)
    const touchStartXRef = React.useRef<number | null>(null)
    const [showHpiModal, setShowHpiModal] = React.useState(false)

    // Returning from Stripe after paying to have the HPI report emailed —
    // verify the session actually completed, apply the fallback in case the
    // webhook was delayed, then reopen the modal so the buyer sees it registered.
    React.useEffect(() => {
        const hpiEmailSuccess = searchParams.get('hpi_email_success') === 'true'
        const sessionId = searchParams.get('session_id')
        if (!hpiEmailSuccess) return

        if (sessionId) {
            getSessionStatus(sessionId)
                .then(status => status.paymentStatus === 'paid' ? applyHpiEmailFee(sessionId) : undefined)
                .catch(() => {})
                .finally(() => setShowHpiModal(true))
        } else {
            setShowHpiModal(true)
        }

        const url = new URL(window.location.href)
        url.searchParams.delete('hpi_email_success')
        url.searchParams.delete('hpi_email_cancel')
        url.searchParams.delete('session_id')
        router.replace(url.pathname + url.search, { scroll: false })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const connectChat = React.useCallback((sellerId: string, listingId: string) => {
        setChatLoading(true)
        setChatError(null)
        createChatRoom(sellerId, listingId)
            .then(setChatRoom)
            .catch((err: unknown) => setChatError(err instanceof Error ? err.message : "Could not open chat with seller."))
            .finally(() => setChatLoading(false))
    }, [])

    // Fetch auction data — through the winner-gated endpoint (not the public
    // findOne), so the seller's phone/email are actually present to display.
    React.useEffect(() => {
        if (authLoading || !user || !canAccessTradeExchange(profile?.role)) return
        getWonAuctionById(auctionId)
            .then(a => {
                if (!a || !a.buyerFeePaid) {
                    router.replace(`/auctions/live/${auctionId}`)
                    return
                }
                setAuction(a)
                if (a.listing.sellerId) {
                    connectChat(a.listing.sellerId, a.listing.id)
                }
            })
            .catch(() => setLoadError("Could not load auction details."))
            .finally(() => setLoading(false))
    }, [authLoading, user, profile?.role, auctionId, connectChat, router])

    if (authLoading) {
        return (
            <div className="min-h-screen pt-20 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    // Handover pages live inside the Trade Exchange, so the same dealers-only
    // rule applies. The winner-gated API would refuse a stranger anyway, but
    // this stops a non-dealer (or a guest) sitting on a spinner forever — the
    // fetch effect above never runs for them.
    if (!user || !canAccessTradeExchange(profile?.role)) {
        return (
            <div className="pt-20">
                <RequireAuth
                    title="Sign up to enter the Trade Exchange"
                    signupRole="DEALER"
                    allowedRoles={TRADE_EXCHANGE_ROLES}
                    message="Auction handovers are open to registered dealers."
                >
                    {null}
                </RequireAuth>
            </div>
        )
    }

    if (loading) {
        return (
            <div className="min-h-screen pt-20 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (loadError || !auction) {
        return (
            <div className="min-h-screen pt-20 flex flex-col items-center justify-center gap-4 text-center px-6">
                <AlertTriangle size={36} className="text-red-400" />
                <p className="text-[var(--text-primary)] font-bold">{loadError ?? "Auction not found."}</p>
                <Link href="/auctions" className="text-sm text-primary hover:underline">Browse auctions</Link>
            </div>
        )
    }

    const listing = auction.listing
    const images: string[] = listing.images ?? []
    const winAmount = Number(auction.winningBidAmount)
    const seller = listing.seller
    const isDealerSeller = seller?.dealerProfile != null
    const sellerName = seller?.dealerProfile?.companyName
        || `${seller?.firstName ?? ""} ${seller?.lastName ?? ""}`.trim()
        || "Seller"
    const sellerPhone = isDealerSeller ? seller?.dealerProfile?.phone : seller?.phone

    function formatDate(d: string | null | undefined) {
        if (!d) return null
        return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    }

    const motOk = listing.motStatus ? listing.motStatus.toLowerCase() === "valid" : null
    const taxOk = listing.taxStatus ? listing.taxStatus.toLowerCase() === "taxed" : null
    const GRADE_LABELS = ['', 'Excellent', 'Great', 'Good', 'Average', 'Below Average']
    const businessAddress = seller?.dealerProfile?.businessAddress

    return (
        <div className="min-h-screen pt-20 pb-16">
            <div className="container mx-auto px-5 max-w-7xl">

                {/* Back + win banner */}
                <div className="mb-6 space-y-4">
                    <Link
                        href="/dashboard/user?tab=overview"
                        className="inline-flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-primary dark:hover:text-white transition-colors"
                    >
                        <ArrowLeft size={15} /> Back to Dashboard
                    </Link>

                    <div className="flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                        <div className="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0">
                            <Trophy size={22} className="text-amber-400" />
                        </div>
                        <div>
                            <p className="text-amber-300 font-black text-lg tracking-tight">You Won This Auction!</p>
                            <p className="text-[var(--text-muted)] text-sm mt-0.5">
                                Winning bid: <strong className="text-[var(--text-primary)]">£{winAmount.toLocaleString()}</strong>
                                <span className="mx-2 text-gray-600">·</span>
                                Contact the seller below to arrange collection or delivery.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Main two-column layout */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 items-start">

                    {/* ── Left: vehicle details ─────────────────────────────── */}
                    <div className="space-y-5">

                        {/* Image gallery */}
                        <div className="dealer-glass-card overflow-hidden">
                            {images.length > 0 ? (
                                <>
                                    <div
                                        className="relative h-72 sm:h-96 bg-black/40 group cursor-zoom-in"
                                        onClick={() => setGalleryLightboxOpen(true)}
                                        onTouchStart={(e) => { touchStartXRef.current = e.touches[0].clientX }}
                                        onTouchEnd={(e) => {
                                            const startX = touchStartXRef.current
                                            touchStartXRef.current = null
                                            if (startX == null) return
                                            const deltaX = e.changedTouches[0].clientX - startX
                                            if (Math.abs(deltaX) < 40) return
                                            if (deltaX < 0) setActiveImage((i) => Math.min(images.length - 1, i + 1))
                                            else setActiveImage((i) => Math.max(0, i - 1))
                                        }}
                                    >
                                        <Image
                                            src={images[activeImage]}
                                            alt={listing.title}
                                            fill
                                            sizes="(max-width: 1024px) 100vw, 60vw"
                                            priority
                                            className="object-cover"
                                        />
                                        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg text-xs font-bold text-white pointer-events-none">
                                            {activeImage + 1} / {images.length}
                                        </div>
                                        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-sm text-white p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                            <ZoomIn size={14} />
                                        </div>
                                        {images.length > 1 && (
                                            <>
                                                <button
                                                    type="button"
                                                    aria-label="Previous image"
                                                    onClick={(e) => { e.stopPropagation(); setActiveImage((i) => Math.max(0, i - 1)) }}
                                                    disabled={activeImage === 0}
                                                    className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-black/50 backdrop-blur border border-white/10 text-white items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                                                >
                                                    <ChevronLeft size={18} />
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label="Next image"
                                                    onClick={(e) => { e.stopPropagation(); setActiveImage((i) => Math.min(images.length - 1, i + 1)) }}
                                                    disabled={activeImage === images.length - 1}
                                                    className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-black/50 backdrop-blur border border-white/10 text-white items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                                                >
                                                    <ChevronRight size={18} />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    <ImageLightbox
                                        images={images}
                                        alt={listing.title}
                                        startIndex={activeImage}
                                        open={galleryLightboxOpen}
                                        onClose={() => setGalleryLightboxOpen(false)}
                                    />
                                    {images.length > 1 && (
                                        <div className="flex gap-2 p-3 overflow-x-auto bg-black/20">
                                            {images.map((img, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => setActiveImage(i)}
                                                    className={`relative w-16 h-11 rounded-lg overflow-hidden shrink-0 border-2 transition-all ${
                                                        i === activeImage ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"
                                                    }`}
                                                >
                                                    <Image src={img} alt="" fill sizes="64px" className="object-cover" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="h-64 flex items-center justify-center bg-black/40 text-gray-700">
                                    <Car size={48} />
                                </div>
                            )}
                        </div>

                        {/* Title + VRM */}
                        <div className="dealer-glass-card p-5">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                                <div>
                                    <h1 className="text-2xl font-black text-[var(--text-primary)] tracking-tight">{listing.title}</h1>
                                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                                        {listing.vrm && (
                                            <span className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-widest px-2.5 py-1 bg-[var(--bg-card)] rounded-lg border border-[var(--border-default)]">
                                                {listing.vrm}
                                            </span>
                                        )}
                                        {listing.make && <span className="text-sm font-bold text-primary italic uppercase tracking-widest">{listing.make}</span>}
                                        {listing.year && <span className="text-sm text-[var(--text-muted)] font-bold">• {listing.year}</span>}
                                        {listing.location && (
                                            <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
                                                <MapPin size={10} /> {listing.location}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest font-bold">Winning Bid</p>
                                    <p className="text-2xl font-black text-amber-400">£{winAmount.toLocaleString()}</p>
                                </div>
                            </div>

                            {/* MOT / Tax status chips */}
                            {(motOk !== null || taxOk !== null) && (
                                <div className="flex gap-2 mt-4 flex-wrap">
                                    <StatusChip ok={motOk} label={`MOT ${listing.motExpiryDate ? `— expires ${formatDate(listing.motExpiryDate)}` : listing.motStatus ?? ""}`} />
                                    <StatusChip ok={taxOk} label={`Tax ${listing.taxDueDate ? `— due ${formatDate(listing.taxDueDate)}` : listing.taxStatus ?? ""}`} />
                                    {listing.ulezCompliant === true && (
                                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                                            <ShieldCheck size={10} /> ULEZ Compliant
                                        </span>
                                    )}
                                    {listing.writeOffCategory && (
                                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border bg-amber-500/10 border-amber-500/20 text-amber-400">
                                            <AlertTriangle size={10} /> Cat {listing.writeOffCategory}
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Grade / HPI / history — same trust badges shown on the retail listing cards */}
                            {(listing.exteriorGrade != null || listing.hpiReport || listing.owners || listing.serviceHistory) && (
                                <div className="flex gap-2 mt-2 flex-wrap">
                                    {listing.exteriorGrade != null && (
                                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border bg-violet-500/10 border-violet-500/20 text-violet-400">
                                            <Award size={10} /> Grade {listing.exteriorGrade} — {GRADE_LABELS[listing.exteriorGrade] ?? ''}
                                        </span>
                                    )}
                                    {/* Clickable regardless of clear/not-clear/pending — a winner
                                        should be able to see a "not clear" or in-progress report
                                        too, not just a badge that only appears for good news. */}
                                    {listing.hpiReport && (
                                        <button
                                            type="button"
                                            onClick={() => setShowHpiModal(true)}
                                            className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                                                listing.hpiReport.status !== 'COMPLETED'
                                                    ? 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20'
                                                    : listing.hpiReport.isClear
                                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                                                        : 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                                            }`}
                                        >
                                            {listing.hpiReport.status !== 'COMPLETED'
                                                ? <><Clock size={10} /> HPI Pending</>
                                                : listing.hpiReport.isClear
                                                    ? <><ShieldCheck size={10} /> HPI Clear</>
                                                    : <><AlertTriangle size={10} /> HPI — Issues Found</>}
                                        </button>
                                    )}
                                    {listing.owners && (
                                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border bg-[var(--bg-card)] border-[var(--border-default)] text-[var(--text-secondary)]">
                                            <Users2 size={10} /> {listing.owners === '1' ? '1 Owner' : `${listing.owners} Owners`}
                                        </span>
                                    )}
                                    {listing.serviceHistory && (
                                        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border bg-[var(--bg-card)] border-[var(--border-default)] text-[var(--text-secondary)]">
                                            <FileText size={10} /> {listing.serviceHistory} Service History
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Specs grid */}
                        <div className="dealer-glass-card p-5">
                            <p className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest mb-4 border-b border-[var(--border-default)] pb-3">
                                Vehicle Specifications
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                                <div>
                                    <SpecRow icon={<Gauge size={13} />} label="Mileage" value={listing.mileage ? `${listing.mileage.toLocaleString()} mi` : null} />
                                    <SpecRow icon={<Fuel size={13} />} label="Fuel Type" value={listing.fuelType} />
                                    <SpecRow icon={<Cog size={13} />} label="Transmission" value={listing.transmission} />
                                    <SpecRow icon={<Car size={13} />} label="Body Type" value={listing.bodyType} />
                                    <SpecRow icon={<Palette size={13} />} label="Colour" value={listing.color} />
                                </div>
                                <div>
                                    <SpecRow icon={<DoorOpen size={13} />} label="Doors" value={listing.doors} />
                                    <SpecRow icon={<Users2 size={13} />} label="Seats" value={listing.seats} />
                                    <SpecRow icon={<Zap size={13} />} label="BHP" value={listing.bhp} />
                                    <SpecRow icon={<Cog size={13} />} label="Engine Size" value={listing.engineSize ? `${listing.engineSize}L` : null} />
                                    <SpecRow icon={<FileText size={13} />} label="Condition" value={listing.condition} />
                                </div>
                            </div>
                            {listing.vin && (
                                <div className="mt-2 pt-3 border-t border-[var(--border-default)]">
                                    <SpecRow icon={<Hash size={13} />} label="VIN" value={listing.vin} />
                                </div>
                            )}
                            {listing.monthOfFirstRegistration && (
                                <SpecRow icon={<CalendarDays size={13} />} label="First Registered" value={formatDate(listing.monthOfFirstRegistration)} />
                            )}
                        </div>

                        {/* Description */}
                        {listing.description && (
                            <div className="dealer-glass-card p-5">
                                <p className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest mb-3 border-b border-[var(--border-default)] pb-3">
                                    Description
                                </p>
                                <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{listing.description}</p>
                            </div>
                        )}

                        {/* Features */}
                        {listing.features && listing.features.length > 0 && (
                            <div className="dealer-glass-card p-5">
                                <p className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest mb-3 border-b border-[var(--border-default)] pb-3">
                                    Features & Equipment
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    {listing.features.map((f: string) => (
                                        <span key={f} className="text-xs font-bold text-[var(--text-secondary)] px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-default)]">
                                            {f}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Right: chat panel ─────────────────────────────────── */}
                    <div className="lg:sticky lg:top-24 space-y-4">

                        {/* Seller card */}
                        <div className="dealer-glass-card p-5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] flex items-center justify-center shrink-0 relative">
                                    {seller?.dealerProfile?.logo ? (
                                        <Image src={seller.dealerProfile.logo} alt="" fill sizes="40px" className="object-cover rounded-xl" />
                                    ) : (
                                        <User size={18} className="text-[var(--text-muted)]" />
                                    )}
                                </div>
                                <div>
                                    <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest font-bold">Selling from</p>
                                    <p className="text-[var(--text-primary)] font-black text-sm">{sellerName}</p>
                                </div>
                            </div>

                            {(sellerPhone || seller?.email || businessAddress) && (
                                <div className="mt-3 pt-3 border-t border-[var(--border-default)] space-y-2">
                                    {sellerPhone && (
                                        <a href={`tel:${sellerPhone}`} className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)] hover:text-primary transition-colors">
                                            <Phone size={13} className="text-primary shrink-0" /> {sellerPhone}
                                        </a>
                                    )}
                                    {seller?.email && (
                                        <a href={`mailto:${seller.email}`} className="flex items-center gap-2 text-sm text-[var(--text-muted)] hover:text-primary transition-colors truncate">
                                            <Mail size={13} className="text-primary shrink-0" /> {seller.email}
                                        </a>
                                    )}
                                    {businessAddress && (
                                        <p className="flex items-start gap-2 text-sm text-[var(--text-muted)]">
                                            <MapPin size={13} className="text-primary shrink-0 mt-0.5" /> {businessAddress}
                                        </p>
                                    )}
                                </div>
                            )}

                            <div className="mt-3 pt-3 border-t border-[var(--border-default)] flex items-center gap-2 text-xs text-[var(--text-muted)]">
                                <Clock size={11} />
                                <span>Auction ended {new Date(auction.endTime).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                            </div>
                        </div>

                        {/* Chat window */}
                        <div className="dealer-glass-card overflow-hidden flex flex-col" style={{ height: 520 }}>
                            <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-default)] shrink-0">
                                <MessageSquare size={14} className="text-primary" />
                                <span className="text-sm font-bold">Chat with {sellerName}</span>
                            </div>

                            <div className="flex-1 min-h-0">
                                {chatLoading ? (
                                    <div className="h-full flex items-center justify-center">
                                        <Loader2 size={22} className="animate-spin text-primary" />
                                    </div>
                                ) : chatError ? (
                                    <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
                                        <AlertTriangle size={24} className="text-red-400" />
                                        <p className="text-red-300 text-sm">{chatError}</p>
                                        <button
                                            type="button"
                                            onClick={() => auction?.listing.sellerId && connectChat(auction.listing.sellerId, auction.listing.id)}
                                            className="text-xs font-bold text-primary hover:underline"
                                        >
                                            Try again
                                        </button>
                                    </div>
                                ) : chatRoom ? (
                                    <ChatErrorBoundary fallback={
                                        <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
                                            <AlertTriangle size={24} className="text-red-400" />
                                            <p className="text-red-300 text-sm">Chat couldn&apos;t load. The rest of this page still works.</p>
                                        </div>
                                    }>
                                        <ChatWindow room={chatRoom} />
                                    </ChatErrorBoundary>
                                ) : (
                                    <div className="h-full flex items-center justify-center">
                                        <Loader2 size={22} className="animate-spin text-primary" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Handover status — mirrors the stage grouping on /dashboard/dealer/auctions/won */}
                        {(() => {
                            const stage = auction.sellerBonusReleased
                                ? "complete"
                                : auction.handoverSubmittedAt
                                    ? "under_review"
                                    : "awaiting_seller"
                            const label =
                                stage === "complete" ? "Handover complete" :
                                stage === "under_review" ? "Under review" :
                                "Awaiting seller proof"
                            // sellerBonusReleased only means the handover was approved — it
                            // doesn't guarantee the £100 actually reached the seller yet
                            // (auto-transfer can fail or be skipped if they haven't
                            // connected a payout method). Check the actual payout signal
                            // separately so this never claims a payment that hasn't happened.
                            const payoutComplete = !!auction.stripePayoutTransferId || !!auction.manualPayoutConfirmedAt
                            const hint =
                                stage === "complete"
                                    ? (payoutComplete
                                        ? "Verified and closed. The seller has been paid the £100 bonus."
                                        : "Verified and closed. The seller's £100 bonus is still being processed.")
                                    : stage === "under_review" ? "Seller has submitted handover proof. Our team is reviewing it." :
                                "Seller has to submit handover proof — you can chat while you wait."
                            const Icon = stage === "complete" ? CheckCircle2 : stage === "under_review" ? FileSearch : Clock
                            const tint =
                                stage === "complete" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" :
                                stage === "under_review" ? "bg-violet-500/10 text-violet-400 border-violet-500/25" :
                                "bg-blue-500/10 text-blue-400 border-blue-500/25"
                            return (
                                <div className="dealer-glass-card p-4">
                                    <p className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border-default)] pb-2 mb-3">Handover Status</p>
                                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${tint}`}>
                                        <Icon size={11} /> {label}
                                    </span>
                                    <p className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">{hint}</p>
                                    {auction.handoverSubmittedAt && (
                                        <p className="text-[10px] text-[var(--text-muted)] mt-2">
                                            Submitted {formatDate(auction.handoverSubmittedAt)}
                                        </p>
                                    )}
                                    {auction.sellerBonusReleasedAt && (
                                        <p className="text-[10px] text-[var(--text-muted)] mt-1">
                                            Verified {formatDate(auction.sellerBonusReleasedAt)}
                                        </p>
                                    )}
                                </div>
                            )
                        })()}

                        {/* Auction summary */}
                        <div className="dealer-glass-card p-4 space-y-2">
                            <p className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest border-b border-[var(--border-default)] pb-2">Auction Summary</p>
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--text-muted)]">Winning bid</span>
                                <span className="font-black text-amber-400">£{winAmount.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--text-muted)]">Buyer fee paid</span>
                                <span className="font-bold text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12} /> £125</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-[var(--text-muted)]">Date won</span>
                                <span className="font-bold">{formatDate(auction.endTime)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {showHpiModal && (
                <HpiReportModal listingId={listing.id} onClose={() => setShowHpiModal(false)} />
            )}
        </div>
    )
}
