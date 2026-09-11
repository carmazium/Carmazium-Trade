"use client"

import * as React from "react"
import { Suspense, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import {
    Shield,
    ShieldCheck,
    Lock,
    Loader2,
    Car,
    Check,
    Gavel,
    Wallet,
    RefreshCcw,
    Receipt,
    ArrowLeft,
} from "lucide-react"
import { Button } from "@/components/ui/Button"
import { getListingBySlug, type Listing, formatPrice } from "@/lib/listingApi"
import { createCheckoutSession } from "@/lib/paymentApi"
import { useAuth } from "@/context/AuthContext"

const AUCTION_BUYER_FEE = 125
const REFUNDABLE_PORTION = 100
const NON_REFUNDABLE_PLATFORM_FEE = 25

export default function CheckoutPage() {
    return (
        <Suspense fallback={<PageLoader />}>
            <CheckoutContent />
        </Suspense>
    )
}

function PageLoader() {
    return (
        <div className="min-h-screen flex items-center justify-center">
            <Loader2 className="w-10 h-10 text-primary animate-spin" />
        </div>
    )
}

function CheckoutContent() {
    const searchParams = useSearchParams()
    const { user, loading: authLoading } = useAuth()

    const listingRef = searchParams.get("listing_id")
    const mode = searchParams.get("mode")

    const [listing, setListing] = useState<Listing | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isProcessing, setIsProcessing] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // This route deliberately supports only the auction buyer fee. CarMazium
    // does not take vehicle deposits or full vehicle purchase funds.
    const validMode = mode === "auction_fee"

    useEffect(() => {
        if (!listingRef || !validMode) {
            setIsLoading(false)
            return
        }

        getListingBySlug(listingRef)
            .then(setListing)
            .catch(() => setError("Vehicle not found"))
            .finally(() => setIsLoading(false))
    }, [listingRef, validMode])

    const handleCheckout = async () => {
        if (!listing || !user) return
        setIsProcessing(true)
        setError(null)
        try {
            const result = await createCheckoutSession(
                listing.id,
                AUCTION_BUYER_FEE,
                "COMMISSION",
                "gbp",
            )
            if (!result.url) throw new Error("Stripe checkout could not be created.")
            window.location.href = result.url
        } catch (err: any) {
            setError(err?.message || "Failed to start checkout. Please try again.")
            setIsProcessing(false)
        }
    }

    const getListingImage = (item: Listing) => {
        const image = item.images?.find((src) => !src.includes("example.com"))
        return image || "/assets/images/featured-sports.png"
    }

    if (isLoading || authLoading) return <PageLoader />

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <div className="text-center max-w-md">
                    <Lock size={48} className="mx-auto mb-4" style={{ color: "var(--text-muted)" }} />
                    <h2 className="text-2xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>Sign In Required</h2>
                    <p className="mb-6" style={{ color: "var(--text-muted)" }}>Sign in with the winning dealer account to pay the auction buyer fee.</p>
                    <Button asChild><Link href="/auth/login">Sign In</Link></Button>
                </div>
            </div>
        )
    }

    if (!validMode) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <div className="max-w-lg text-center rounded-2xl border p-8" style={{ background: "var(--bg-card)", borderColor: "var(--border-default)" }}>
                    <Car size={44} className="mx-auto mb-4 text-primary" />
                    <h1 className="text-2xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>Vehicle payments are made directly to the seller</h1>
                    <p className="text-sm leading-relaxed mb-6" style={{ color: "var(--text-muted)" }}>
                        CarMazium does not collect vehicle deposits or the vehicle purchase price. Inspect the vehicle first, then pay the seller directly if you proceed.
                    </p>
                    <Button asChild variant="outline"><Link href="/buy-cars"><ArrowLeft size={15} className="mr-2" /> Back to vehicles</Link></Button>
                </div>
            </div>
        )
    }

    if (!listing || error) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <div className="text-center max-w-md">
                    <Car size={48} className="mx-auto mb-4" style={{ color: "var(--text-muted)" }} />
                    <h2 className="text-2xl font-bold mb-3" style={{ color: "var(--text-primary)" }}>Vehicle Not Found</h2>
                    <p className="mb-6" style={{ color: "var(--text-muted)" }}>{error || "The vehicle could not be loaded."}</p>
                    <Button asChild variant="outline"><Link href="/auctions">Browse Auctions</Link></Button>
                </div>
            </div>
        )
    }

    const winningBid = listing.auction?.winningBidAmount != null
        ? Number(listing.auction.winningBidAmount)
        : listing.auction?.buyItNowPrice != null
            ? Number(listing.auction.buyItNowPrice)
            : Number(listing.price)

    const auctionRef = listing.auction?.id
        ? `AUC-${listing.auction.id.replace(/-/g, "").slice(0, 5).toUpperCase()}`
        : "—"

    const specs = [
        listing.year,
        listing.mileage ? `${listing.mileage.toLocaleString()} miles` : null,
        listing.fuelType ? listing.fuelType.charAt(0) + listing.fuelType.slice(1).toLowerCase() : null,
        listing.transmission ? listing.transmission.charAt(0) + listing.transmission.slice(1).toLowerCase() : null,
    ].filter(Boolean).join(" • ")

    const steps = [
        { n: 1, label: "Auction Won", sub: "Winning dealer confirmed", done: true },
        { n: 2, label: "Buyer Fee", sub: "Unlock seller details", active: true },
        { n: 3, label: "Handover", sub: "Inspect, pay seller, collect", done: false },
    ]

    return (
        <div className="min-h-screen pb-20 pt-24">
            <div className="container mx-auto px-5 max-w-2xl">
                <div className="flex items-center justify-between mb-10">
                    {steps.map((step, index) => (
                        <React.Fragment key={step.n}>
                            <div className="flex flex-col items-center text-center gap-1.5 shrink-0">
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 font-bold text-sm shrink-0 ${step.done ? "border-[var(--border-default)] text-[var(--text-muted)]" : step.active ? "bg-primary border-primary text-white" : "border-[var(--border-default)] text-[var(--text-muted)]"}`}>
                                    {step.done ? <Check size={16} /> : step.n}
                                </div>
                                <div>
                                    <p className={`text-xs font-bold whitespace-nowrap ${step.active ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>{step.label}</p>
                                    <p className="text-[10px] whitespace-nowrap" style={{ color: "var(--text-faint)" }}>{step.sub}</p>
                                </div>
                            </div>
                            {index < steps.length - 1 && <div className="flex-1 h-px mx-2 mt-[-20px]" style={{ background: "var(--border-default)" }} />}
                        </React.Fragment>
                    ))}
                </div>

                <div className="flex items-center gap-2 mb-1.5">
                    <Shield size={22} className="text-primary" />
                    <h1 className="text-2xl font-heading font-bold" style={{ color: "var(--text-primary)" }}>Auction Buyer Fee</h1>
                </div>
                <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
                    Pay the £125 auction buyer fee to unlock the seller&apos;s contact details and arrange inspection and collection. The vehicle purchase price is paid directly to the seller, not to CarMazium.
                </p>

                <div className="rounded-2xl border p-4 flex items-center gap-4 mb-6" style={{ background: "var(--bg-card)", borderColor: "var(--border-default)" }}>
                    <div className="w-28 h-20 relative rounded-xl overflow-hidden shrink-0">
                        <Image src={getListingImage(listing)} alt={listing.title} fill className="object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h3 className="font-bold text-sm truncate" style={{ color: "var(--text-primary)" }}>{listing.title}</h3>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-primary/30 text-primary text-[10px] font-bold uppercase tracking-wide shrink-0"><Gavel size={10} /> Auction Win</span>
                        </div>
                        <p className="text-xs mb-2 truncate" style={{ color: "var(--text-muted)" }}>{specs}</p>
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            <div><p style={{ color: "var(--text-faint)" }}>Winning Bid</p><p className="font-bold text-primary">{formatPrice(winningBid)}</p></div>
                            <div><p style={{ color: "var(--text-faint)" }}>Auction Reference</p><p className="font-bold" style={{ color: "var(--text-primary)" }}>{auctionRef}</p></div>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border p-6 mb-6" style={{ background: "var(--bg-card)", borderColor: "var(--border-default)" }}>
                    <div className="flex items-center gap-3 mb-5">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0"><Wallet size={18} className="text-primary" /></div>
                        <div>
                            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>£125 total buyer fee</h2>
                            <p className="text-xs" style={{ color: "var(--text-muted)" }}>£100 refundable portion + £25 non-refundable CarMazium platform fee.</p>
                        </div>
                    </div>
                    <div className="flex items-center justify-between mb-5"><span className="font-bold" style={{ color: "var(--text-primary)" }}>Total Due Today</span><span className="text-2xl font-black text-primary font-mono">£125</span></div>
                    <div className="border-t pt-5" style={{ borderColor: "var(--border-default)" }}>
                        <div className="flex items-center gap-2 mb-3"><ShieldCheck size={14} className="text-primary" /><p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>After payment</p></div>
                        <div className="grid sm:grid-cols-3 gap-3 text-xs">
                            <div><p className="font-bold mb-1">Seller details unlock</p><p style={{ color: "var(--text-faint)" }}>Contact the seller and arrange inspection/collection.</p></div>
                            <div><p className="font-bold mb-1">Inspect before paying</p><p style={{ color: "var(--text-faint)" }}>Confirm the vehicle matches the description.</p></div>
                            <div><p className="font-bold mb-1">Pay seller directly</p><p style={{ color: "var(--text-faint)" }}>CarMazium does not hold the vehicle purchase money.</p></div>
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl p-4 flex items-start gap-3 mb-6 bg-blue-500/5 border border-blue-500/15">
                    <RefreshCcw size={18} className="text-blue-400 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-bold text-blue-400 mb-1">Refund policy</p>
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                            If a qualifying auction sale fails or is cancelled, the <span className="text-[var(--text-primary)] font-bold">£100 refundable portion</span> can be returned to the winning buyer. The <span className="text-[var(--text-primary)] font-bold">£25 platform fee is non-refundable in all cases</span>. Statutory rights are unaffected.
                        </p>
                    </div>
                </div>

                <div className="rounded-2xl border p-6 mb-6" style={{ background: "var(--bg-card)", borderColor: "var(--border-default)" }}>
                    <div className="flex items-center gap-2 mb-4"><Receipt size={16} className="text-primary" /><h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Fee Summary</h2></div>
                    <div className="space-y-3 text-sm">
                        <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Refundable portion</span><span>£{REFUNDABLE_PORTION}.00</span></div>
                        <div className="flex justify-between"><span style={{ color: "var(--text-muted)" }}>Non-refundable platform fee</span><span>£{NON_REFUNDABLE_PLATFORM_FEE}.00</span></div>
                        <div className="border-t pt-3 flex justify-between" style={{ borderColor: "var(--border-default)" }}><span className="font-bold">Total Due</span><span className="text-lg font-black text-primary font-mono">£{AUCTION_BUYER_FEE}.00</span></div>
                    </div>
                </div>

                {error && <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">{error}</div>}

                <p className="flex items-center justify-center gap-1.5 text-xs mb-4" style={{ color: "var(--text-faint)" }}><Lock size={12} /> Secure platform-fee payment powered by <span className="font-bold" style={{ color: "var(--text-muted)" }}>Stripe</span></p>
                <Button onClick={handleCheckout} disabled={isProcessing} className="w-full h-14 text-lg font-bold gap-3 bg-gradient-to-r from-primary to-[#ff4d4d] hover:from-[#ff4d4d] hover:to-primary shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all disabled:opacity-50">
                    {isProcessing ? <><Loader2 className="animate-spin" size={20} /> Connecting to Stripe...</> : <><Lock size={20} /> Pay £125 Buyer Fee</>}
                </Button>

                <p className="text-center text-xs mt-4" style={{ color: "var(--text-faint)" }}>By proceeding, you agree to our <Link href="/terms" className="text-primary hover:underline">Terms &amp; Conditions</Link>.</p>
                <p className="flex items-center justify-center gap-1.5 text-center text-xs mt-1.5" style={{ color: "var(--text-faint)" }}><Shield size={11} /> Card details are handled by Stripe and are not stored by CarMazium.</p>
            </div>
        </div>
    )
}
