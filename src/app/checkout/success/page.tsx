"use client"

import * as React from "react"
import { Suspense, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { CheckCircle, ArrowRight, Home, Car, Loader2, PartyPopper, LayoutDashboard } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { getSessionStatus, applyAuctionFee, applyKycFee } from "@/lib/paymentApi"
import type { SessionStatus } from "@/lib/paymentApi"
import { publishListing } from "@/lib/listingApi"
import { useAuth } from "@/context/AuthContext"
import { trackMetaEvent } from "@/components/analytics/MetaPixel"
import { useAnalytics } from "@/hooks/useAnalytics"
import { SELLER_FUNNEL } from "@/lib/gtm"

export default function CheckoutSuccessPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
            </div>
        }>
            <CheckoutSuccessContent />
        </Suspense>
    )
}

function CheckoutSuccessContent() {
    const searchParams = useSearchParams()
    const sessionId = searchParams.get("session_id")
    const { profile } = useAuth()
    const { trackEvent } = useAnalytics()
    // Won-auction handover list lives at a different path per role — same
    // split used by the notification bell for auction-seller destinations.
    const wonAuctionsHref = profile?.role === "DEALER" ? "/dashboard/dealer/auctions/won" : "/dashboard/buyer/bids"

    const [sessionData, setSessionData] = useState<SessionStatus | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const trackedSessionId = useRef<string | null>(null)

    useEffect(() => {
        if (!sessionId) {
            setIsLoading(false)
            return
        }
        const poll = async () => {
            try {
                const data = await getSessionStatus(sessionId)
                setSessionData(data)
                // Webhook fallback: activate listing or apply auction fee if webhook was delayed
                if (data?.metadata?.type === 'LISTING_FEE' && data?.metadata?.listingId) {
                    publishListing(data.metadata.listingId).catch(() => {})
                }
                if (data?.metadata?.type === 'COMMISSION') {
                    applyAuctionFee(sessionId).catch(() => {})
                }
                if (data?.metadata?.type === 'KYC_VERIFICATION') {
                    applyKycFee(sessionId).catch(() => {})
                }
                // Guard against double-firing (effect re-run, repeated polls) — one
                // Purchase event per completed Stripe Checkout Session.
                if (data?.paymentStatus === 'paid' && trackedSessionId.current !== sessionId) {
                    trackedSessionId.current = sessionId
                    const value = data.amountTotal != null ? data.amountTotal / 100 : undefined
                    const currency = data.currency?.toUpperCase() ?? "GBP"
                    trackMetaEvent("Purchase", {
                        value,
                        currency,
                        content_type: "product",
                        content_ids: data.metadata?.listingId ? [data.metadata.listingId] : undefined,
                        content_name: data.metadata?.type,
                    })
                    // Generic purchase for GTM — one trigger covers every fee
                    // type, with `fee_type` to split them in reporting.
                    // transaction_id is the Stripe session so GA4 can dedupe
                    // if the seller refreshes the success page.
                    trackEvent('purchase', {
                        transaction_id: sessionId,
                        value,
                        currency,
                        fee_type: data.metadata?.type,
                        listing_id: data.metadata?.listingId,
                    })
                    // Seller funnel terminal step: the retail listing fee cleared.
                    if (data.metadata?.type === 'LISTING_FEE') {
                        trackEvent(SELLER_FUNNEL.LISTING_FEE_PAID, {
                            transaction_id: sessionId,
                            value,
                            currency,
                            listing_type: 'retail',
                            listing_id: data.metadata?.listingId,
                        })
                    }
                }
            } catch {
                // Silently fail — show generic success
            } finally {
                setIsLoading(false)
            }
        }
        poll()
    }, [sessionId])

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="animate-spin text-primary" size={40} />
            </div>
        )
    }

    return (
        <div className="min-h-screen flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-[#1a2744] to-slate-900 -z-10" />
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-[150px] pointer-events-none" />

            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 30 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.5, type: "spring" }}
                className="max-w-lg w-full text-center space-y-8"
            >
                {/* Animated checkmark */}
                <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                    className="relative mx-auto w-24 h-24"
                >
                    <div className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping" />
                    <div className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                        <CheckCircle size={48} className="text-white" strokeWidth={2.5} />
                    </div>
                </motion.div>

                {/* Celebration icon */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                >
                    <PartyPopper size={28} className="mx-auto text-yellow-400 mb-2" />
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                >
                    <h1 className="text-3xl md:text-4xl font-heading font-bold text-white">
                        {sessionData?.metadata?.type === 'LISTING_FEE'
                            ? 'Submitted for Review'
                            : sessionData?.metadata?.type === 'COMMISSION'
                            ? '£125 Buyer Fee Paid'
                            : sessionData?.metadata?.type === 'KYC_VERIFICATION'
                            ? 'Verification Fee Paid!'
                            : sessionData?.metadata?.type === 'DEPOSIT'
                            ? 'Legacy Deposit Record'
                            : sessionData?.metadata?.type === 'FULL_PAYMENT'
                            ? 'Legacy Vehicle Payment Record'
                            : 'Payment Successful!'}
                    </h1>
                    <p className="mt-3 text-lg text-gray-300">
                        {sessionData?.metadata?.type === 'LISTING_FEE'
                            ? "Payment confirmed. Your vehicle details are now under review and will be listed shortly — we'll notify you once it's approved."
                            : sessionData?.metadata?.type === 'COMMISSION'
                            ? 'Your £125 auction buyer fee is confirmed. Seller details and chat are now unlocked. Arrange inspection and collection, inspect the vehicle, and if you proceed pay the vehicle purchase price directly to the seller. CarMazium has not received the vehicle purchase money.'
                            : sessionData?.metadata?.type === 'KYC_VERIFICATION'
                            ? 'Your £1 verification fee is confirmed. Our team will review your dealer application shortly.'
                            : sessionData?.metadata?.type === 'DEPOSIT'
                            ? "This is confirmation of a historical deposit session created before CarMazium stopped collecting vehicle deposits. New vehicle deposits and purchase-price payments are made directly between buyer and seller."
                            : sessionData?.metadata?.type === 'FULL_PAYMENT'
                            ? "This is confirmation of a historical vehicle-payment session. CarMazium no longer creates new full vehicle purchase payments; current vehicle sale funds are paid directly to the seller."
                            : 'Your transaction has been completed securely through Stripe.'}
                    </p>
                </motion.div>

                {/* Transaction details */}
                {sessionData && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="rounded-2xl border p-6 text-left space-y-3"
                        style={{ background: 'var(--bg-card)', borderColor: 'var(--border-default)' }}
                    >
                        <div className="flex justify-between text-sm">
                            <span style={{ color: 'var(--text-muted)' }}>Status</span>
                            <span className="text-emerald-400 font-bold capitalize">{sessionData.paymentStatus}</span>
                        </div>
                        {sessionData.customerEmail && (
                            <div className="flex justify-between text-sm">
                                <span style={{ color: 'var(--text-muted)' }}>Confirmation sent to</span>
                                <span style={{ color: 'var(--text-primary)' }}>{sessionData.customerEmail}</span>
                            </div>
                        )}
                        <div className="flex justify-between text-sm">
                            <span style={{ color: 'var(--text-muted)' }}>Payment type</span>
                            <span className="capitalize" style={{ color: 'var(--text-primary)' }}>
                                {sessionData.metadata?.type?.toLowerCase().replace('_', ' ') || 'Payment'}
                            </span>
                        </div>
                    </motion.div>
                )}

                {/* CTAs */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                    className="flex flex-col sm:flex-row gap-4 justify-center"
                >
                    {sessionData?.metadata?.type === 'LISTING_FEE' ? (
                        <>
                            <Button asChild className="gap-2 bg-gradient-to-r from-primary to-[#ff4d4d] hover:from-[#ff4d4d] hover:to-primary px-6">
                                <Link href="/dashboard/user?tab=inventory">
                                    <LayoutDashboard size={18} /> View My Listings <ArrowRight size={14} />
                                </Link>
                            </Button>
                            <Button asChild variant="outline" className="gap-2 border-white/20 hover:bg-[var(--bg-card)]">
                                <Link href="/sell">
                                    <Car size={18} /> List Another
                                </Link>
                            </Button>
                        </>
                    ) : sessionData?.metadata?.type === 'COMMISSION' ? (
                        <>
                            <Button asChild className="gap-2 bg-gradient-to-r from-primary to-[#ff4d4d] hover:from-[#ff4d4d] hover:to-primary px-6">
                                <Link href={wonAuctionsHref}>
                                    <LayoutDashboard size={18} /> Go to My Auctions <ArrowRight size={14} />
                                </Link>
                            </Button>
                            <Button asChild variant="outline" className="gap-2 border-white/20 hover:bg-[var(--bg-card)]">
                                <Link href="/">
                                    <Home size={18} /> Return Home
                                </Link>
                            </Button>
                        </>
                    ) : sessionData?.metadata?.type === 'KYC_VERIFICATION' ? (
                        <Button asChild className="gap-2 bg-gradient-to-r from-primary to-[#ff4d4d] hover:from-[#ff4d4d] hover:to-primary px-6">
                            <Link href="/dashboard/dealer">
                                <LayoutDashboard size={18} /> Go to Dealer Dashboard <ArrowRight size={14} />
                            </Link>
                        </Button>
                    ) : (
                        <>
                            <Button asChild className="gap-2 bg-gradient-to-r from-primary to-[#ff4d4d] hover:from-[#ff4d4d] hover:to-primary px-6">
                                <Link href="/dashboard">
                                    <Car size={18} /> View Dashboard <ArrowRight size={14} />
                                </Link>
                            </Button>
                            <Button asChild variant="outline" className="gap-2 border-white/20 hover:bg-[var(--bg-card)]">
                                <Link href="/">
                                    <Home size={18} /> Return Home
                                </Link>
                            </Button>
                        </>
                    )}
                </motion.div>
            </motion.div>
        </div>
    )
}
