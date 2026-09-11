"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import {
    Loader2, Trophy, Car, MessageSquare, CreditCard, CheckCircle2,
    Clock, AlertTriangle, Gavel, Radio, TrendingUp, FileSearch,
    Calendar, Gauge, Fuel, Cog, Palette, Phone, Mail, ShieldCheck, Award, MapPin, Globe, Lock,
} from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { PageHeader } from "@/components/dashboard/PageHeader"
import { useAuth } from "@/context/AuthContext"
import { getWonAuctions, type Auction } from "@/lib/auctionApi"
import { getMyBids, type Bid } from "@/lib/listingApi"
import { createChatRoom } from "@/lib/chatApi"
import { FUEL_TYPE_LABELS, BODY_TYPE_LABELS } from "@/lib/vehicleLabels"

// This page is the single stop for everything about a dealer's auction bidding —
// bids currently in play and every won auction's handover status — instead of
// spreading that across a browse tab, individual auction pages, and a separate
// wins list. One row shape, one clear button per row, ordered by what needs you
// most urgently first.

function formatCountdown(target: Date): string {
    const diff = target.getTime() - Date.now()
    if (diff <= 0) return "Ending now"
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor((diff % 3_600_000) / 60_000)
    if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h left`
    if (h > 0) return `${h}h ${m}m left`
    return `${m}m left`
}

// ─── Handover status derivation ───────────────────────────────────────────────
//
// Each stage below maps 1:1 to backend state on the Auction row so a buyer can
// always see exactly where they are in the flow they started when they won.

type HandoverStage =
    | "fee_due"           // won but hasn't paid the £125 buyer fee yet
    | "in_progress"       // fee paid, handover not yet verified (awaiting proof or under review)
    | "complete"          // admin approved, sellerBonusReleased = true

function stageFor(a: Auction): HandoverStage {
    if (!a.buyerFeePaid) return "fee_due"
    if (a.sellerBonusReleased) return "complete"
    return "in_progress"
}

const STAGE_LABELS: Record<HandoverStage, { label: string; hint: string; icon: React.ComponentType<{ size?: number; className?: string }>; tint: string }> = {
    fee_due: {
        label: "Payment needed",
        hint: "Pay the £125 fee to unlock messaging with the seller and start the handover.",
        icon: CreditCard,
        tint: "bg-amber-500/10 text-amber-400 border-amber-500/25",
    },
    in_progress: {
        label: "Handover in progress",
        hint: "You can message the seller now. We'll update this once they submit proof of handover.",
        icon: Clock,
        tint: "bg-blue-500/10 text-blue-400 border-blue-500/25",
    },
    complete: {
        label: "All done",
        hint: "Handover verified and closed.",
        icon: CheckCircle2,
        tint: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
    },
}

// ─── Shared row shell — every section uses this same shape ───────────────────

function Row({
    image, title, meta, specs, badge, hint, rightLabel, rightValue, rightValueClass, cta,
}: {
    image: string
    title: string
    meta: React.ReactNode
    specs?: React.ReactNode
    badge: { label: string; icon: React.ComponentType<{ size?: number; className?: string }>; tint: string }
    hint: string
    rightLabel: string
    rightValue: string
    rightValueClass: string
    cta: React.ReactNode
}) {
    return (
        <div className="dealer-glass-card p-4 md:p-5">
            <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="relative w-full md:w-40 h-32 md:h-24 rounded-xl overflow-hidden shrink-0 bg-black/30">
                    <Image src={image} alt={title} fill sizes="(max-width: 768px) 100vw, 160px" className="object-cover" />
                </div>

                <div className="flex-1 min-w-0">
                    <p className="text-lg font-black text-[var(--text-primary)] truncate">{title}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--text-muted)] mt-1">{meta}</div>
                    {specs && <div className="flex flex-wrap gap-1.5 mt-2">{specs}</div>}

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border ${badge.tint}`}>
                            <badge.icon size={12} /> {badge.label}
                        </span>
                    </div>
                    <p className="text-sm text-[var(--text-muted)] mt-2 max-w-xl leading-relaxed">{hint}</p>
                </div>

                <div className="flex md:flex-col items-end md:items-end justify-between md:justify-center gap-3 shrink-0 md:w-56">
                    <div className="text-right">
                        <p className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">{rightLabel}</p>
                        <p className={`text-xl font-black ${rightValueClass}`}>{rightValue}</p>
                    </div>
                    {cta}
                </div>
            </div>
        </div>
    )
}

// Same spec-chip look used on the retail listing cards (CarCard.tsx) — so a
// purchased vehicle reads with the same level of detail a buyer already
// trusted when they placed the winning bid, not just year/mileage.
function SpecChip({ icon: Icon, children }: { icon: React.ComponentType<{ size?: number }>; children: React.ReactNode }) {
    return (
        <span className="inline-flex items-center gap-1 bg-slate-500/10 dark:bg-[var(--bg-card)] border border-slate-500/20 dark:border-[var(--border-default)] text-slate-600 dark:text-[var(--text-muted)] text-[10px] font-semibold px-2 py-1 rounded-md">
            <Icon size={10} /> {children}
        </span>
    )
}

function PrimaryButton({ href, icon: Icon, children }: { href: string; icon: React.ComponentType<{ size?: number }>; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary hover:bg-red-600 text-white text-sm font-black transition-colors w-full md:w-auto"
        >
            <Icon size={15} /> {children}
        </Link>
    )
}

function SecondaryButton({ href, icon: Icon, children }: { href: string; icon: React.ComponentType<{ size?: number }>; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-[var(--border-default)] text-[var(--text-primary)] text-sm font-bold hover:bg-primary/5 dark:hover:bg-white/5 transition-colors w-full md:w-auto"
        >
            <Icon size={15} /> {children}
        </Link>
    )
}

// Opens (or creates) the chat room right from the list — no detour through the
// detail page just to say something to the seller. Also surfaces a direct
// call link when their phone number is available (winner-gated data only —
// see AuctionSeller in auctionApi.ts), for buyers who'd rather just call.
function ChatButton({ sellerId, listingId, phone }: { sellerId: string; listingId: string; phone?: string | null }) {
    const [connecting, setConnecting] = React.useState(false)
    const [error, setError] = React.useState(false)

    return (
        <div className="flex flex-col items-end gap-1.5 w-full md:w-auto">
            <button
                type="button"
                disabled={connecting}
                onClick={async () => {
                    setConnecting(true)
                    setError(false)
                    try {
                        const room = await createChatRoom(sellerId, listingId)
                        window.location.href = `/dashboard/dealer/messages?room=${room.id}`
                    } catch {
                        setError(true)
                        setConnecting(false)
                    }
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary hover:bg-red-600 disabled:opacity-60 text-white text-sm font-black transition-colors w-full md:w-auto"
            >
                {connecting ? <Loader2 size={15} className="animate-spin" /> : <MessageSquare size={15} />}
                Chat with seller
            </button>
            {phone && (
                <a
                    href={`tel:${phone}`}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border-default)] text-[var(--text-primary)] text-sm font-bold hover:border-primary/40 hover:text-primary transition-colors w-full md:w-auto"
                >
                    <Phone size={14} /> {phone}
                </a>
            )}
            {error && <p className="text-xs text-red-400 font-bold">Couldn&apos;t open chat — try again.</p>}
        </div>
    )
}

// The seller's number stays locked until the buyer fee is paid — otherwise a
// winner could get the seller's contact and arrange the handover off-platform
// without ever paying. Same size/shape as PrimaryButton so the two stack as
// a matched pair; the backend only sends a real `phone` once buyerFeePaid.
function CallSellerButton({ phone, phoneAvailable }: { phone?: string | null; phoneAvailable?: boolean }) {
    if (!phoneAvailable) return null
    if (!phone) {
        return (
            <div
                className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-default)] text-[var(--text-muted)] text-sm font-black w-full md:w-auto"
                title="Unlocks after you pay the buyer fee"
            >
                <Lock size={15} className="shrink-0" />
                <span className="blur-[3px] select-none">07XXX XXXXXX</span>
            </div>
        )
    }
    return (
        <a
            href={`tel:${phone}`}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-black transition-colors w-full md:w-auto"
        >
            <Phone size={15} /> Call Seller
        </a>
    )
}

const GRADE_LABELS = ['', 'Excellent', 'Great', 'Good', 'Average', 'Below Average']

// ─── Section 1: Won auctions, grouped by handover stage ───────────────────────

function WonAuctionRow({ auction }: { auction: Auction }) {
    const l = auction.listing
    const stage = stageFor(auction)
    const s = STAGE_LABELS[stage]
    const winAmount = Number(auction.winningBidAmount ?? 0)
    const seller = l.seller
    const isDealerSeller = seller?.dealerProfile != null
    const sellerName = seller?.dealerProfile?.companyName
        || `${seller?.firstName ?? ""} ${seller?.lastName ?? ""}`.trim()
        || "the seller"
    // Nothing to review yet — put the chat action right here instead of sending
    // them to the detail page to discover the same button there.
    const noProofYet = stage === "in_progress" && !auction.handoverSubmittedAt

    const businessAddress = seller?.dealerProfile?.businessAddress
    const website = seller?.dealerProfile?.website
    const sellerPhone = isDealerSeller ? seller?.dealerProfile?.phone : seller?.phone
    const sellerPhoneAvailable = isDealerSeller ? seller?.dealerProfile?.phoneAvailable : seller?.phoneAvailable

    return (
        <Row
            image={l.images?.[0] ?? "/assets/images/hero-bg.png"}
            title={l.title}
            meta={<>
                <span>Sold by <span className="text-[var(--text-primary)] font-bold">{sellerName}</span></span>
                {seller?.email && (
                    <a href={`mailto:${seller.email}`} className="flex items-center gap-1 hover:text-primary transition-colors truncate max-w-[220px]">
                        <Mail size={11} className="shrink-0" /> {seller.email}
                    </a>
                )}
                {l.location && (
                    <span className="flex items-center gap-1"><MapPin size={11} className="shrink-0" /> {l.location}</span>
                )}
                {businessAddress && (
                    <span className="flex items-center gap-1"><MapPin size={11} className="shrink-0" /> {businessAddress}</span>
                )}
                {website && (
                    <a href={website} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary transition-colors">
                        <Globe size={11} className="shrink-0" /> Website
                    </a>
                )}
            </>}
            specs={<>
                {l.year && <SpecChip icon={Calendar}>{l.year}</SpecChip>}
                {l.mileage != null && <SpecChip icon={Gauge}>{Number(l.mileage).toLocaleString()} mi</SpecChip>}
                {l.fuelType && FUEL_TYPE_LABELS[l.fuelType] && <SpecChip icon={Fuel}>{FUEL_TYPE_LABELS[l.fuelType]}</SpecChip>}
                {l.bodyType && BODY_TYPE_LABELS[l.bodyType] && <SpecChip icon={Car}>{BODY_TYPE_LABELS[l.bodyType]}</SpecChip>}
                {l.transmission && <SpecChip icon={Cog}>{l.transmission}</SpecChip>}
                {l.color && <SpecChip icon={Palette}>{l.color}</SpecChip>}
                {l.engineSize != null && <SpecChip icon={Gauge}>{(l.engineSize / 1000).toFixed(1)}L</SpecChip>}
                {l.exteriorGrade != null && (
                    <SpecChip icon={Award}>Grade {l.exteriorGrade} — {GRADE_LABELS[l.exteriorGrade] ?? ''}</SpecChip>
                )}
                {l.hpiReport?.isClear && <SpecChip icon={ShieldCheck}>HPI Clear</SpecChip>}
                {l.owners && <SpecChip icon={Car}>{l.owners === '1' ? '1 Owner' : `${l.owners} Owners`}</SpecChip>}
                {l.serviceHistory && <SpecChip icon={FileSearch}>{l.serviceHistory} Service History</SpecChip>}
            </>}
            badge={s}
            hint={s.hint}
            rightLabel="Winning bid"
            rightValue={`£${winAmount.toLocaleString()}`}
            rightValueClass="text-amber-400"
            cta={
                stage === "fee_due" ? (
                    <div className="flex flex-col items-end gap-2 w-full md:w-auto">
                        <PrimaryButton href={`/checkout?listing_id=${auction.listingId}&mode=auction_fee`} icon={CreditCard}>
                            Pay the £125 fee
                        </PrimaryButton>
                        <CallSellerButton phone={sellerPhone} phoneAvailable={sellerPhoneAvailable} />
                    </div>
                ) : noProofYet && l.sellerId ? (
                    <ChatButton sellerId={l.sellerId} listingId={auction.listingId} phone={sellerPhone} />
                ) : stage === "in_progress" ? (
                    <SecondaryButton href={`/auctions/won/${auction.id}`} icon={FileSearch}>
                        View details
                    </SecondaryButton>
                ) : (
                    <SecondaryButton href={`/auctions/won/${auction.id}`} icon={MessageSquare}>
                        View details
                    </SecondaryButton>
                )
            }
        />
    )
}

// ─── Section 2: Live auctions currently being bid on ──────────────────────────

function ActiveBidRow({ bid, tick }: { bid: Bid; tick: number }) {
    const l = bid.listing
    const auction = l.auction!
    void tick // re-renders the countdown text every second without changing its own state
    const timeLeft = formatCountdown(new Date(auction.endTime))
    const badge = bid.isWinning
        ? { label: "You're winning", icon: TrendingUp, tint: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" }
        : { label: "You've been outbid", icon: Radio, tint: "bg-amber-500/10 text-amber-400 border-amber-500/25" }

    return (
        <Row
            image={l.images?.[0] ?? "/assets/images/hero-bg.png"}
            title={l.title}
            meta={<>
                {l.year && <span className="font-bold">{l.year}</span>}
                <span className="opacity-40">·</span>
                <span className="flex items-center gap-1"><Clock size={11} /> {timeLeft}</span>
            </>}
            badge={badge}
            hint={bid.isWinning
                ? "You're currently the highest bidder. We'll notify you the moment someone else bids."
                : "Someone else has placed a higher bid. Go back to the auction to bid again before time runs out."}
            rightLabel="Your bid"
            rightValue={`£${Number(bid.amount).toLocaleString()}`}
            rightValueClass={bid.isWinning ? "text-emerald-400" : "text-amber-400"}
            cta={
                bid.isWinning ? (
                    <SecondaryButton href={`/auctions/live/${auction.id}`} icon={Gavel}>
                        View auction
                    </SecondaryButton>
                ) : (
                    <PrimaryButton href={`/auctions/live/${auction.id}`} icon={Gavel}>
                        Bid again
                    </PrimaryButton>
                )
            }
        />
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyBidsPage() {
    const { user, loading: authLoading } = useAuth()
    const [wonAuctions, setWonAuctions] = React.useState<Auction[] | null>(null)
    const [activeBids, setActiveBids] = React.useState<Bid[] | null>(null)
    const [loadError, setLoadError] = React.useState<string | null>(null)
    const [tick, setTick] = React.useState(0)

    React.useEffect(() => {
        if (authLoading || !user) return
        Promise.all([getWonAuctions(), getMyBids(1, 50)])
            .then(([won, bidsRes]) => {
                setWonAuctions(won)
                // One row per auction, not per bid — keep only their latest bid on
                // each auction that's still ACTIVE (already-ended auctions surface
                // through wonAuctions instead, so no duplicate rows).
                const seen = new Set<string>()
                const active: Bid[] = []
                for (const b of bidsRes.data ?? []) {
                    if (b.listing.auction?.status !== "ACTIVE") continue
                    if (seen.has(b.listingId)) continue
                    seen.add(b.listingId)
                    active.push(b)
                }
                setActiveBids(active)
            })
            .catch(() => setLoadError("Couldn't load your bids and wins."))
    }, [authLoading, user])

    // Tick every 30s so "2h 14m left" style countdowns stay roughly current
    // without a per-second re-render cost on a list page.
    React.useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 30_000)
        return () => clearInterval(id)
    }, [])

    const grouped = React.useMemo(() => {
        if (!wonAuctions) return null
        const buckets: Record<HandoverStage, Auction[]> = { fee_due: [], in_progress: [], complete: [] }
        for (const a of wonAuctions) buckets[stageFor(a)].push(a)
        return buckets
    }, [wonAuctions])

    const isLoading = authLoading || wonAuctions === null || activeBids === null
    const isEmpty = !isLoading && !loadError && wonAuctions !== null && activeBids !== null
        && wonAuctions.length === 0 && activeBids.length === 0

    return (
        <div className="min-h-screen pt-20 pb-12">
            <div className="container mx-auto px-5 flex flex-col lg:flex-row gap-8">
                <DashboardSidebar role="dealer" />
                <main className="flex-1 space-y-8">
                    <PageHeader
                        title="Purchased from Auction"
                        subHeader="Every auction you're bidding on or have won, and exactly what to do next"
                    />

                    {isLoading ? (
                        <div className="dealer-glass-card p-16 flex items-center justify-center">
                            <Loader2 size={22} className="animate-spin text-primary" />
                        </div>
                    ) : loadError ? (
                        <div className="dealer-glass-card p-10 flex flex-col items-center gap-3 text-center">
                            <AlertTriangle size={28} className="text-red-400" />
                            <p className="text-sm text-[var(--text-primary)] font-bold">{loadError}</p>
                        </div>
                    ) : isEmpty ? (
                        <div className="dealer-glass-card p-14 flex flex-col items-center gap-4 text-center">
                            <div className="w-14 h-14 rounded-2xl bg-[var(--bg-input)] flex items-center justify-center border border-[var(--border-default)]">
                                <Trophy size={22} className="text-[var(--text-muted)]" />
                            </div>
                            <div>
                                <p className="text-base font-black text-[var(--text-primary)]">You haven&apos;t placed a bid yet</p>
                                <p className="text-sm text-[var(--text-muted)] mt-1 max-w-md">
                                    Once you bid on a live auction, it&apos;ll show up here — and if you win,
                                    you&apos;ll see exactly what to do next to complete the handover.
                                </p>
                            </div>
                            <Link
                                href="/auctions/browse"
                                className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl bg-primary hover:bg-red-600 text-white text-sm font-black transition-colors"
                            >
                                <Gavel size={14} /> Browse live auctions
                            </Link>
                        </div>
                    ) : (
                        <div className="space-y-10">
                            {/* 1. Fee due — most urgent, always first */}
                            {grouped && grouped.fee_due.length > 0 && (
                                <section>
                                    <div className="flex items-baseline justify-between mb-3 px-1">
                                        <h2 className="text-sm font-black uppercase tracking-widest">Needs your attention</h2>
                                        <span className="text-sm text-[var(--text-muted)] font-bold">{grouped.fee_due.length}</span>
                                    </div>
                                    <div className="space-y-3">
                                        {grouped.fee_due.map(a => <WonAuctionRow key={a.id} auction={a} />)}
                                    </div>
                                </section>
                            )}

                            {/* 2. Currently bidding */}
                            {activeBids && activeBids.length > 0 && (
                                <section>
                                    <div className="flex items-baseline justify-between mb-3 px-1">
                                        <h2 className="text-sm font-black uppercase tracking-widest">Auctions you&apos;re bidding on</h2>
                                        <span className="text-sm text-[var(--text-muted)] font-bold">{activeBids.length}</span>
                                    </div>
                                    <div className="space-y-3">
                                        {activeBids.map(b => <ActiveBidRow key={b.listingId} bid={b} tick={tick} />)}
                                    </div>
                                </section>
                            )}

                            {/* 3. Handover in progress */}
                            {grouped && grouped.in_progress.length > 0 && (
                                <section>
                                    <div className="flex items-baseline justify-between mb-3 px-1">
                                        <h2 className="text-sm font-black uppercase tracking-widest">Handover in progress</h2>
                                        <span className="text-sm text-[var(--text-muted)] font-bold">{grouped.in_progress.length}</span>
                                    </div>
                                    <div className="space-y-3">
                                        {grouped.in_progress.map(a => <WonAuctionRow key={a.id} auction={a} />)}
                                    </div>
                                </section>
                            )}

                            {/* 4. Completed — deprioritized, at the bottom */}
                            {grouped && grouped.complete.length > 0 && (
                                <section>
                                    <div className="flex items-baseline justify-between mb-3 px-1">
                                        <h2 className="text-sm font-black uppercase tracking-widest text-[var(--text-muted)]">Completed</h2>
                                        <span className="text-sm text-[var(--text-muted)] font-bold">{grouped.complete.length}</span>
                                    </div>
                                    <div className="space-y-3">
                                        {grouped.complete.map(a => <WonAuctionRow key={a.id} auction={a} />)}
                                    </div>
                                </section>
                            )}
                        </div>
                    )}

                    {/* Legend / footnote */}
                    {!isEmpty && !isLoading && !loadError && (
                        <div className="dealer-glass-card p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-[var(--text-muted)]">
                            <span className="flex items-center gap-1.5"><Car size={13} /> The winning bid itself is paid directly to the seller, not through Carmazium.</span>
                            <span className="flex items-center gap-1.5"><CreditCard size={13} /> The £125 buyer fee is Carmazium&apos;s fee — up to £100 of it is refunded if handover is denied.</span>
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}
