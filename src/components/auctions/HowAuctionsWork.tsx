"use client"

import * as React from "react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import {
    BadgeCheck, Banknote, Box, ChevronDown, ChevronRight, Clock, CreditCard,
    Eye, FileText, Gauge, Gavel, Handshake, Lock, Search, ShieldCheck,
    TrendingUp, Trophy, Users, Zap,
} from "lucide-react"

/**
 * The public "How Carmazium Auctions Work" pitch.
 *
 * Lifted verbatim out of the old single-file /auctions page so the Trade
 * Exchange landing page and anything else can render it. It is deliberately
 * NOT behind the dealer gate: this is the recruitment pitch, it shows no
 * vehicles and no live bids, and it is what makes the Trade Exchange findable
 * by the dealers it is for. Keep it outside <RequireAuth> wherever it is used.
 *
 * Copy is approved — do not paraphrase.
 */


// ─── How It Works content (moved from the standalone /auctions/how-it-works page,
// which now just redirects here — approved copy, do not paraphrase) ───────────

const SELLER_STEPS = [
    {
        icon: FileText,
        title: "List for free.",
        desc: "Add your car's details (DVLA-assisted), photos, and mark any known damage — Carmazium automatically grades your vehicle's condition from what you report, so there's nothing to fill in manually.",
    },
    {
        icon: Lock,
        title: "Set your reserve.",
        desc: "This is the minimum you're willing to accept. It's never shown to bidders — only you know it.",
    },
    {
        icon: Clock,
        title: "Go live for 24 hours.",
        desc: "Your auction runs for a full 24-hour window, with real-time bidding from verified trade dealers.",
    },
    {
        icon: Zap,
        title: "Anti-snipe protection.",
        desc: "Any bid placed in the final 3 minutes automatically extends the auction by 3 more minutes — so a last-second bid can't end things before you've had a fair chance to respond.",
    },
    {
        icon: Gavel,
        title: "Auction ends.",
        desc: "If your reserve is met, you're automatically connected with the winning bidder through an in-app chat.",
    },
    {
        icon: Handshake,
        title: "Arrange handover.",
        desc: "Agree the final details and handover directly with the buyer, then submit proof once it's done.",
    },
    {
        icon: Banknote,
        title: "Get paid — plus £100.",
        desc: "Once your handover proof is approved, Carmazium pays your £100 seller bonus directly to your account.",
    },
]

const BUYER_STEPS = [
    {
        icon: ShieldCheck,
        title: "Get verified.",
        desc: "Apply for a Dealer account and complete our KYC check.",
    },
    {
        icon: Search,
        title: "Browse live and upcoming auctions.",
        desc: "Filter by make, model, condition grade, and more.",
    },
    {
        icon: Eye,
        title: "Check the vehicle.",
        desc: "Every listing has a 3D condition viewer showing any seller-reported damage, an automatic 1–5 grade, and DVLA/MOT history.",
    },
    {
        icon: TrendingUp,
        title: "Bid in real time,",
        desc: "or use Buy It Now if the seller has set one for an instant win.",
    },
    {
        icon: Trophy,
        title: "Win the auction.",
        desc: "Highest bid wins, provided the seller's reserve is met.",
    },
    {
        icon: CreditCard,
        title: "Pay the £125 buyer fee.",
        desc: "A one-off £125 fee unlocks direct in-app chat with the seller so you can arrange handover — this is Carmazium's fee for the connection, not part of the vehicle price.",
    },
    {
        icon: Users,
        title: "Complete the purchase",
        desc: "directly with the seller.",
    },
]

const RULES = [
    { icon: Clock, term: "24-Hour Auctions", def: "Every live auction runs for exactly 24 hours." },
    { icon: Zap, term: "Anti-Snipe Rule", def: "A bid in the last 3 minutes extends the auction by 3 minutes — repeats until bidding settles." },
    { icon: Lock, term: "Reserve Price", def: "Set privately by the seller. If it isn't met, there's no sale and nothing is owed by anyone." },
    { icon: Trophy, term: "Buy It Now", def: "Optional — sellers can set an instant-buy price. Buyers can request it; the seller has 24 hours to confirm or decline." },
    { icon: FileText, term: "Free to List", def: "Listing a car for auction costs nothing." },
    { icon: Banknote, term: "£100 Seller Bonus", def: "Paid once Carmazium approves your submitted handover proof." },
    { icon: CreditCard, term: "£125 Buyer Fee", def: "Charged only when you win an auction — unlocks direct chat with the seller to arrange handover." },
    { icon: ShieldCheck, term: "Verified Bidders Only", def: "Every bidder is a KYC-verified trade dealer." },
]

const TRUST = [
    { icon: Gauge, title: "Automatic condition grading (1–5)", desc: "Computed from the damage you report, not self-selected." },
    { icon: Box, title: "3D Condition & Damage viewer", desc: "Included on every listing, so buyers can inspect before bidding." },
    { icon: BadgeCheck, title: "DVLA-verified history", desc: "MOT, tax, and registration status pulled directly from official records." },
]

const FAQS = [
    {
        q: "Do I need to be a dealer to bid?",
        a: "Yes — bidding is limited to verified dealer accounts. Anyone can list and sell a car, though.",
    },
    {
        q: "What happens if my reserve isn't met?",
        a: "No sale happens, no fees are charged, and you're free to relist.",
    },
    {
        q: "When do I actually get my £100?",
        a: "After you submit proof of handover and Carmazium's team approves it.",
    },
    {
        q: "What's the £125 buyer fee for?",
        a: "It's charged once you win an auction, and it's what unlocks direct in-app chat with the seller so you can arrange handover. It's a connection fee, not part of the price you pay for the car — that's negotiated and settled directly with the seller.",
    },
    {
        q: "Does Carmazium handle payment for the car itself?",
        a: "No. The vehicle sale is agreed and completed directly between you and the buyer — Carmazium isn't a party to that payment. Carmazium's role covers the auction, verification, the seller bonus, and the buyer connection fee.",
    },
]

function StepTimeline({ steps }: { steps: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string; desc: string }[] }) {
    return (
        <ol className="relative">
            {steps.map((step, i) => (
                <li key={step.title} className="relative pl-16 pb-8 last:pb-0">
                    {i < steps.length - 1 && (
                        <span className="absolute left-[21px] top-11 bottom-0 w-px bg-gradient-to-b from-primary/40 via-[var(--border-default)] to-transparent" aria-hidden />
                    )}
                    <span className="absolute left-0 top-0 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-white font-black text-sm tabular-nums shadow-[0_4px_14px_rgba(237,28,36,0.3)]">
                        {i + 1}
                    </span>
                    <div className="flex items-center gap-2 mb-1">
                        <step.icon size={14} className="text-primary shrink-0" />
                        <h4 className="font-heading font-bold text-[15px]">{step.title}</h4>
                    </div>
                    <p className="text-sm text-[var(--text-muted)] leading-relaxed max-w-lg">{step.desc}</p>
                </li>
            ))}
        </ol>
    )
}

function FaqItem({ q, a }: { q: string; a: string }) {
    return (
        <details className="group border border-[var(--border-default)] rounded-xl overflow-hidden bg-[var(--bg-input)]">
            <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer list-none hover:bg-primary/5 dark:hover:bg-white/5 transition-colors">
                <span className="font-semibold text-sm">{q}</span>
                <ChevronDown size={18} className="text-[var(--text-muted)] shrink-0 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-6 pb-5 text-sm text-[var(--text-muted)] leading-relaxed border-t border-[var(--border-default)] pt-4">
                {a}
            </div>
        </details>
    )
}


export function HowAuctionsWork() {
    const [track, setTrack] = React.useState<"seller" | "buyer">("seller")

    return (
        <section id="how-it-works" className="border-t border-[var(--border-default)] bg-[var(--bg-card)] mt-8">
                <div className="container mx-auto px-6 py-20">

                    {/* Intro */}
                    <div className="text-center mb-12">
                        <p className="text-primary text-[10px] font-black uppercase tracking-[0.2em] mb-3">How It Works</p>
                        <h2 className="text-3xl md:text-4xl font-black text-[var(--text-primary)] font-heading">How Carmazium Auctions Work</h2>
                        <p className="text-[var(--text-muted)] text-sm mt-3 max-w-md mx-auto">Two audiences, two tracks — pick the one that&apos;s you, then see exactly what happens next.</p>
                    </div>

                    {/* Track toggle */}
                    <div className="flex justify-center mb-12">
                        <div className="inline-flex items-center bg-[var(--bg-input)] p-1 rounded-full border border-[var(--border-default)] relative">
                            <motion.div
                                className="absolute top-1 bottom-1 bg-primary rounded-full shadow-lg shadow-primary/25 z-0"
                                layoutId="track-pill"
                                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                                style={{
                                    left: track === "seller" ? "4px" : "50%",
                                    right: track === "seller" ? "50%" : "4px",
                                }}
                            />
                            <button
                                onClick={() => setTrack("seller")}
                                className={`relative z-10 px-8 py-2.5 rounded-full text-sm font-bold transition-colors duration-300 ${track === "seller" ? "text-white" : "text-[var(--text-secondary)] hover:text-primary"}`}
                            >
                                For Sellers
                            </button>
                            <button
                                onClick={() => setTrack("buyer")}
                                className={`relative z-10 px-8 py-2.5 rounded-full text-sm font-bold transition-colors duration-300 ${track === "buyer" ? "text-white" : "text-[var(--text-secondary)] hover:text-primary"}`}
                            >
                                For Buyers
                            </button>
                        </div>
                    </div>

                    <div className="max-w-3xl mx-auto mb-20">
                        <div className="rounded-[1.75rem] border border-[var(--border-default)] bg-[var(--bg-input)] p-8 md:p-10">
                            {track === "seller" ? (
                                <>
                                    <StepTimeline steps={SELLER_STEPS} />
                                    <div className="mt-2 rounded-xl border-l-[3px] border-primary bg-[var(--bg-card)] px-5 py-4 text-sm text-[var(--text-muted)] leading-relaxed">
                                        <strong className="text-[var(--text-primary)]">Note:</strong> Carmazium isn&apos;t a party to the vehicle sale itself — that&apos;s agreed directly between you and the buyer. The £100 bonus is Carmazium&apos;s reward for selling through the platform.
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="text-sm text-[var(--text-muted)] mb-8 leading-relaxed">
                                        Bidding is restricted to <strong className="text-[var(--text-primary)]">KYC-verified dealer accounts</strong> — every bid comes from a checked, trade buyer, not an anonymous account.
                                    </p>
                                    <StepTimeline steps={BUYER_STEPS} />
                                    <div className="mt-2 rounded-xl border-l-[3px] border-primary bg-[var(--bg-card)] px-5 py-4 text-sm text-[var(--text-muted)] leading-relaxed">
                                        <strong className="text-[var(--text-primary)]">Note:</strong> The £125 fee is charged only once you&apos;ve won an auction — there&apos;s nothing to pay just for bidding or browsing.
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Rules, explained */}
                    <div className="text-center mb-10">
                        <h3 className="text-2xl md:text-3xl font-black font-heading tracking-tight mb-3">The Rules, Explained</h3>
                        <p className="text-[var(--text-muted)] text-sm">The fine print, in plain English.</p>
                    </div>
                    <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-4 mb-20">
                        {RULES.map((rule) => (
                            <div key={rule.term} className="flex items-start gap-3.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-input)] p-5 hover:border-primary/25 transition-colors">
                                <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                                    <rule.icon size={16} className="text-primary" />
                                </div>
                                <div className="min-w-0">
                                    <p className="font-heading font-bold text-sm mb-1">{rule.term}</p>
                                    <p className="text-xs text-[var(--text-muted)] leading-relaxed">{rule.def}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Trust & Transparency */}
                    <div className="text-center mb-10">
                        <h3 className="text-2xl md:text-3xl font-black font-heading tracking-tight mb-3">Trust &amp; Transparency</h3>
                        <p className="text-[var(--text-muted)] text-sm">Every listing tells you exactly what you&apos;re bidding on.</p>
                    </div>
                    <div className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-5 mb-20">
                        {TRUST.map((item) => (
                            <div key={item.title} className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-input)] p-6 text-center hover:border-primary/25 transition-colors">
                                <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                                    <item.icon size={22} className="text-primary" />
                                </div>
                                <h4 className="font-heading font-bold text-sm mb-2">{item.title}</h4>
                                <p className="text-xs text-[var(--text-muted)] leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>

                    {/* FAQ */}
                    <div className="max-w-2xl mx-auto mb-20">
                        <div className="text-center mb-10">
                            <h3 className="text-2xl md:text-3xl font-black font-heading tracking-tight mb-3">FAQ</h3>
                            <p className="text-[var(--text-muted)] text-sm">Can&apos;t find your answer? <Link href="/contact" className="text-primary hover:underline">Get in touch</Link>.</p>
                        </div>
                        <div className="space-y-3">
                            {FAQS.map((faq) => (
                                <FaqItem key={faq.q} q={faq.q} a={faq.a} />
                            ))}
                        </div>
                    </div>

                </div>
            </section>
    )
}
