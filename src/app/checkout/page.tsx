"use client"

import * as React from "react"
import { Suspense, useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { motion } from "framer-motion"
import { Shield, ShieldCheck, Lock, CreditCard, ArrowLeft, Loader2, Car, CheckCircle, Check, BadgeCheck, Gavel, Wallet, RefreshCcw, Receipt } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { getListingBySlug, type Listing, formatPrice } from "@/lib/listingApi"
import { createCheckoutSession } from "@/lib/paymentApi"
import { useAuth } from "@/context/AuthContext"

const DEPOSIT_AMOUNT = 500 // £500 refundable deposit
const AUCTION_BUYER_FEE = 125 // CarMazium auction buyer/platform fee

export default function CheckoutPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
        }>
            <CheckoutContent />
        </Suspense>
    )
}

function CheckoutContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const { user, loading: authLoading } = useAuth()

    const listingId = searchParams.get("listing_id")
    const mode = searchParams.get("mode") as "deposit" | "full" | "auction_fee" | null

    const isAuctionFee = mode === "auction_fee"

    const [listing, setListing] = useState<Listing | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isProcessing, setIsProcessing] = useState(false)
    const [selectedMode, setSelectedMode] = useState<"deposit" | "full">(isAuctionFee ? "deposit" : (mode as "deposit" | "full") || "deposit")
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!listingId) return
        const load = async () => {
            try {
                const data = await getListingBySlug(listingId)
                setListing(data)
            } catch {
                setError("Vehicle not found")
            } finally {
                setIsLoading(false)
            }
        }
        load()
    }, [listingId])

    const handleCheckout = async () => {
        if (!listing || !user) return
        setIsProcessing(true)
        setError(null)

        try {
            let amount: number
            let type: "DEPOSIT" | "FULL_PAYMENT" | "COMMISSION"
            if (isAuctionFee) {
                amount = AUCTION_BUYER_FEE
                type = "COMMISSION"
            } else {
                amount = selectedMode === "deposit" ? DEPOSIT_AMOUNT : parseFloat(String(listing.price))
                type = selectedMode === "deposit" ? "DEPOSIT" : "FULL_PAYMENT"
            }
            const result = await createCheckoutSession(listing.id, amount, type, "gbp")
            if (result.url) {
                window.location.href = result.url
            }
        } catch (err: any) {
            setError(err.message || "Failed to start checkout. Please try again.")
            setIsProcessing(false)
        }
    }

    const getListingImage = (l: Listing) => {
        if (l.images?.length > 0) {
            const valid = l.images.find(img => !img.includes('example.com'))
            if (valid) return valid
        }
        return "/assets/images/featured-sports.png"
    }

    if (isLoading || authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="animate-spin text-primary" size={40} />
            </div>
        )
    }

    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <div className="text-center max-w-md">
                    <Lock size={48} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                    <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Sign In Required</h2>
                    <p className="mb-6" style={{ color: 'var(--text-muted)' }}>Please sign in to proceed with the purchase.</p>
                    <Button asChild><Link href="/auth/signup">Sign In / Sign Up</Link></Button>
                </div>
            </div>
        )
    }

    if (!listing || error) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4">
                <div className="text-center max-w-md">
                    <Car size={48} className="mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
                    <h2 className="text-2xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Vehicle Not Found</h2>
                    <p className="mb-6" style={{ color: 'var(--text-muted)' }}>{error || "The vehicle you're looking for doesn't exist."}</p>
                    <Button asChild variant="outline"><Link href="/search">Browse Vehicles</Link></Button>
                </div>
            </div>
        )
    }

    const fullPrice = parseFloat(String(listing.price))

    if (isAuctionFee) {
        const winningBid = listing.auction?.winningBidAmount != null
            ? Number(listing.auction.winningBidAmount)
            : (listing.auction?.buyItNowPrice != null ? Number(listing.auction.buyItNowPrice) : fullPrice)
        const auctionRef = listing.auction?.id
            ? `AUC-${listing.auction.id.replace(/-/g, '').slice(0, 5).toUpperCase()}`
            : '—'
        const specs = [
            listing.year,
            listing.mileage ? `${listing.mileage.toLocaleString()} miles` : null,
            listing.fuelType ? listing.fuelType.charAt(0) + listing.fuelType.slice(1).toLowerCase() : null,
            listing.transmission ? listing.transmission.charAt(0) + listing.transmission.slice(1).toLowerCase() : null,
        ].filter(Boolean).join(' • ')

        const steps = [
            { n: 1, label: 'Auction Won', sub: 'Congratulations!', done: true },
            { n: 2, label: 'Secure Checkout', sub: 'Buyer Fee Payment', done: false, active: true },
            { n: 3, label: 'Next Steps', sub: 'Handover & Collection', done: false },
        ]

        return (
            <div className="min-h-screen pb-20 pt-24">
                <div className="container mx-auto px-5 max-w-2xl">
                    {/* Stepper */}
                    <div className="flex items-center justify-between mb-10">
                        {steps.map((step, i) => (
                            <React.Fragment key={step.n}>
                                <div className="flex flex-col items-center text-center gap-1.5 shrink-0">
                                    <div
                                        className={`w-9 h-9 rounded-full flex items-center justify-center border-2 font-bold text-sm shrink-0 ${step.done
                                            ? 'border-[var(--border-default)] text-[var(--text-muted)]'
                                            : step.active
                                                ? 'bg-primary border-primary text-white'
                                                : 'border-[var(--border-default)] text-[var(--text-muted)]'
                                            }`}
                                    >
                                        {step.done ? <Check size={16} /> : step.n}
                                    </div>
                                    <div>
                                        <p className={`text-xs font-bold whitespace-nowrap ${step.active ? 'text-[var(--text-primary)]' : 'text-[var(--text-muted)]'}`}>{step.label}</p>
                                        <p className="text-[10px] whitespace-nowrap" style={{ color: 'var(--text-faint)' }}>{step.sub}</p>
                                    </div>
                                </div>
                                {i < steps.length - 1 && (
                                    <div className="flex-1 h-px mx-2 mt-[-20px]" style={{ background: 'var(--border-default)' }} />
                                )}
                            </React.Fragment>
                        ))}
                    </div>

                    {/* Heading */}
                    <div className="flex items-center gap-2 mb-1.5">
                        <Shield size={22} className="text-primary" />
                        <h1 className="text-2xl font-heading font-bold" style={{ color: 'var(--text-primary)' }}>Secure Checkout</h1>
                    </div>
                    <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
                        You&apos;ve won the auction! Complete your payment below to confirm your purchase and move to the next step.
                    </p>

                    {/* Vehicle card */}
                    <div className="rounded-2xl border p-4 flex items-center gap-4 mb-6"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}>
                        <div className="w-28 h-20 relative rounded-xl overflow-hidden shrink-0">
                            <Image src={getListingImage(listing)} alt={listing.title} fill className="object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                                <h3 className="font-bold text-sm truncate" style={{ color: 'var(--text-primary)' }}>{listing.title}</h3>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-primary/30 text-primary text-[10px] font-bold uppercase tracking-wide shrink-0">
                                    <Gavel size={10} /> Auction Win
                                </span>
                            </div>
                            <p className="text-xs mb-2 truncate" style={{ color: 'var(--text-muted)' }}>{specs}</p>
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div>
                                    <p style={{ color: 'var(--text-faint)' }}>Winning Bid</p>
                                    <p className="font-bold text-primary">{formatPrice(winningBid)}</p>
                                </div>
                                <div>
                                    <p style={{ color: 'var(--text-faint)' }}>Auction Reference</p>
                                    <p className="font-bold" style={{ color: 'var(--text-primary)' }}>{auctionRef}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Auction Buyer Fee */}
                    <div className="rounded-2xl border p-6 mb-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}>
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                                <Wallet size={18} className="text-primary" />
                            </div>
                            <div>
                                <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Auction Buyer Fee</h2>
                                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>A one-time fee required to secure your winning vehicle.</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between mb-5">
                            <span className="font-bold" style={{ color: 'var(--text-primary)' }}>Total Due Today</span>
                            <span className="text-2xl font-black text-primary font-mono">£{AUCTION_BUYER_FEE}</span>
                        </div>

                        <div className="border-t pt-5" style={{ borderColor: 'var(--border-default)' }}>
                            <div className="flex items-center gap-2 mb-3">
                                <ShieldCheck size={14} className="text-primary" />
                                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>What this fee covers</p>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                {[
                                    { icon: ShieldCheck, label: 'Secure your win', desc: 'Confirms your commitment to complete the purchase' },
                                    { icon: Lock, label: 'Serious buyers only', desc: 'Helps keep our marketplace trusted and reliable' },
                                    { icon: Shield, label: 'Safe & secure', desc: 'Your payment is protected by Stripe' },
                                ].map(({ icon: Icon, label, desc }) => (
                                    <div key={label} className="text-xs">
                                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-2">
                                            <Icon size={14} className="text-emerald-400" />
                                        </div>
                                        <p className="font-bold mb-0.5" style={{ color: 'var(--text-primary)' }}>{label}</p>
                                        <p style={{ color: 'var(--text-faint)' }}>{desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Refund policy */}
                    <div className="rounded-2xl p-4 flex items-start gap-3 mb-6 bg-blue-500/5 border border-blue-500/15">
                        <RefreshCcw size={18} className="text-blue-400 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-sm font-bold text-blue-400 mb-1">Refund Policy</p>
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                                If CarMazium approves a failed-sale cancellation — for example because a material undisclosed fault is confirmed before handover — <span className="text-[var(--text-primary)] font-bold">your £{AUCTION_BUYER_FEE} buyer fee is refunded in full</span>.
                            </p>
                        </div>
                    </div>

                    {/* Order summary */}
                    <div className="rounded-2xl border p-6 mb-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}>
                        <div className="flex items-center gap-2 mb-4">
                            <Receipt size={16} className="text-primary" />
                            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Order Summary</h2>
                        </div>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between">
                                <span style={{ color: 'var(--text-muted)' }}>Auction Buyer Fee</span>
                                <span style={{ color: 'var(--text-primary)' }}>£{AUCTION_BUYER_FEE}.00</span>
                            </div>
                            <div className="border-t pt-3 flex justify-between" style={{ borderColor: 'var(--border-default)' }}>
                                <span className="font-bold" style={{ color: 'var(--text-primary)' }}>Total Due</span>
                                <span className="text-lg font-black text-primary font-mono">£{AUCTION_BUYER_FEE}.00</span>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm mb-6">
                            {error}
                        </div>
                    )}

                    <p className="flex items-center justify-center gap-1.5 text-xs mb-4" style={{ color: 'var(--text-faint)' }}>
                        <Lock size={12} /> Secure payment powered by <span className="font-bold" style={{ color: 'var(--text-muted)' }}>Stripe</span>
                    </p>

                    <Button
                        onClick={handleCheckout}
                        disabled={isProcessing}
                        className="w-full h-14 text-lg font-bold gap-3 bg-gradient-to-r from-primary to-[#ff4d4d] hover:from-[#ff4d4d] hover:to-primary shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all disabled:opacity-50"
                    >
                        {isProcessing ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                Connecting to Stripe...
                            </>
                        ) : (
                            <>
                                <Lock size={20} />
                                Pay £{AUCTION_BUYER_FEE} Buyer Fee
                            </>
                        )}
                    </Button>

                    <p className="text-center text-xs mt-4" style={{ color: 'var(--text-faint)' }}>
                        By proceeding, you agree to our <Link href="/terms" className="text-primary hover:underline">Terms &amp; Conditions</Link>
                    </p>
                    <p className="flex items-center justify-center gap-1.5 text-center text-xs mt-1.5" style={{ color: 'var(--text-faint)' }}>
                        <Shield size={11} /> Your payment information is encrypted and secure. We never store your card details.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen pb-20">
            {/* Header */}
            <div className="relative overflow-hidden pt-28 pb-12">
                <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#1a2744] to-slate-900" />
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/8 rounded-full blur-[120px] pointer-events-none" />
                <div className="container mx-auto px-5 relative z-10">
                    <Link href={`/vehicle/${listing.slug}`} className="inline-flex items-center gap-2 text-sm mb-4 transition-colors hover:text-primary" style={{ color: 'var(--text-muted)' }}>
                        <ArrowLeft size={16} /> Back to listing
                    </Link>
                    <h1 className="text-3xl md:text-4xl font-heading font-bold text-white">Secure Checkout</h1>
                    <p className="mt-2 text-gray-300">Complete your purchase safely through Stripe</p>
                </div>
            </div>

            <div className="container mx-auto px-5 -mt-4 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                    {/* ── Left column: Vehicle summary ──────────────────────── */}
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4 }}
                        className="lg:col-span-2"
                    >
                        <div className="rounded-2xl border overflow-hidden shadow-lg"
                            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}>
                            <div className="h-52 relative">
                                <Image src={getListingImage(listing)} alt={listing.title} fill className="object-cover" />
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent" />
                                <div className="absolute bottom-4 left-4">
                                    <span className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-md border border-[var(--border-default)] text-primary font-mono text-xl font-bold">
                                        {formatPrice(listing.price)}
                                    </span>
                                </div>
                            </div>
                            <div className="p-5 space-y-3">
                                <h3 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{listing.title}</h3>
                                <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                                    {listing.year && <span className="px-2 py-1 rounded-md" style={{ background: 'var(--bg-input)' }}>{listing.year}</span>}
                                    {listing.mileage && <span className="px-2 py-1 rounded-md" style={{ background: 'var(--bg-input)' }}>{listing.mileage.toLocaleString()} mi</span>}
                                    {listing.fuelType && <span className="px-2 py-1 rounded-md capitalize" style={{ background: 'var(--bg-input)' }}>{listing.fuelType.toLowerCase()}</span>}
                                    {listing.transmission && <span className="px-2 py-1 rounded-md capitalize" style={{ background: 'var(--bg-input)' }}>{listing.transmission.toLowerCase()}</span>}
                                </div>
                            </div>
                        </div>

                        {/* Trust badges */}
                        <div className="mt-6 grid grid-cols-3 gap-3">
                            {[
                                { icon: Shield, label: "Buyer Protection" },
                                { icon: Lock, label: "SSL Encrypted" },
                                { icon: BadgeCheck, label: "Stripe Secured" },
                            ].map(({ icon: Icon, label }) => (
                                <div key={label} className="flex flex-col items-center gap-2 p-3 rounded-xl border text-center"
                                    style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}>
                                    <Icon size={20} className="text-emerald-400" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</span>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                    {/* ── Right column: Payment options ─────────────────────── */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.4, delay: 0.1 }}
                        className="lg:col-span-3 space-y-6"
                    >
                        {/* Standard deposit / full payment */}
                        <div className="rounded-2xl border p-6 space-y-5"
                            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}>
                            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Choose Payment Option</h2>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <button
                                    onClick={() => setSelectedMode("deposit")}
                                    className={`relative p-5 rounded-xl border-2 text-left transition-all ${selectedMode === "deposit" ? 'border-primary bg-primary/5 shadow-lg' : 'hover:border-white/20'}`}
                                    style={selectedMode !== "deposit" ? { borderColor: 'var(--border-default)', background: 'var(--bg-input)' } : undefined}
                                >
                                    {selectedMode === "deposit" && <div className="absolute top-3 right-3"><CheckCircle size={20} className="text-primary" /></div>}
                                    <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Refundable Deposit</div>
                                    <div className="text-2xl font-bold text-primary font-mono">£{DEPOSIT_AMOUNT.toLocaleString()}</div>
                                    <p className="text-xs mt-2" style={{ color: 'var(--text-faint)' }}>Reserve this vehicle — fully refundable within 7 days</p>
                                </button>

                                <button
                                    onClick={() => setSelectedMode("full")}
                                    className={`relative p-5 rounded-xl border-2 text-left transition-all ${selectedMode === "full" ? 'border-primary bg-primary/5 shadow-lg' : 'hover:border-white/20'}`}
                                    style={selectedMode !== "full" ? { borderColor: 'var(--border-default)', background: 'var(--bg-input)' } : undefined}
                                >
                                    {selectedMode === "full" && <div className="absolute top-3 right-3"><CheckCircle size={20} className="text-primary" /></div>}
                                    <div className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Full Payment</div>
                                    <div className="text-2xl font-bold text-primary font-mono">{formatPrice(fullPrice)}</div>
                                    <p className="text-xs mt-2" style={{ color: 'var(--text-faint)' }}>Complete the purchase — vehicle is yours</p>
                                </button>
                            </div>

                            {/* Retail buyer fee notice */}
                            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-xs">
                                <CheckCircle size={13} className="text-emerald-400 shrink-0" />
                                <span style={{ color: 'var(--text-muted)' }}>Retail buyers pay <span className="text-[var(--text-primary)] font-bold">no buyer fees</span> — only the vehicle price above.</span>
                            </div>
                        </div>

                        {/* Order summary */}
                        <div className="rounded-2xl border p-6 space-y-4"
                            style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}>
                            <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Order Summary</h2>

                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span style={{ color: 'var(--text-muted)' }}>{listing.title}</span>
                                    <span style={{ color: 'var(--text-primary)' }}>{formatPrice(fullPrice)}</span>
                                </div>
                                <div className="border-t" style={{ borderColor: 'var(--border-default)' }} />
                                <div className="flex justify-between">
                                    <span className="font-semibold" style={{ color: 'var(--text-muted)' }}>
                                        {selectedMode === "deposit" ? "Deposit Amount" : "Total Due"}
                                    </span>
                                    <span className="text-lg font-bold text-primary font-mono">
                                        {selectedMode === "deposit" ? `£${DEPOSIT_AMOUNT.toLocaleString()}.00` : formatPrice(fullPrice)}
                                    </span>
                                </div>
                                {selectedMode === "deposit" && (
                                    <div className="flex justify-between text-xs">
                                        <span style={{ color: 'var(--text-faint)' }}>Remaining balance</span>
                                        <span style={{ color: 'var(--text-faint)' }}>{formatPrice(fullPrice - DEPOSIT_AMOUNT)}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Checkout button */}
                        <Button
                            onClick={handleCheckout}
                            disabled={isProcessing}
                            className="w-full h-14 text-lg font-bold gap-3 bg-gradient-to-r from-primary to-[#ff4d4d] hover:from-[#ff4d4d] hover:to-primary shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all disabled:opacity-50"
                        >
                            {isProcessing ? (
                                <>
                                    <Loader2 className="animate-spin" size={20} />
                                    Connecting to Stripe...
                                </>
                            ) : (
                                <>
                                    <CreditCard size={20} />
                                    Pay {selectedMode === "deposit" ? `£${DEPOSIT_AMOUNT}` : formatPrice(fullPrice)} Securely
                                </>
                            )}
                        </Button>

                        <p className="text-center text-xs" style={{ color: 'var(--text-faint)' }}>
                            You will be redirected to Stripe&apos;s secure checkout. Your card details are never stored on our servers.
                        </p>
                    </motion.div>
                </div>
            </div>
        </div>
    )
}
