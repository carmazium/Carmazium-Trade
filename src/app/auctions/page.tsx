"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import {
    Gavel, Truck, Wrench, Banknote, ShieldCheck,
    ArrowRight, type LucideIcon,
} from "lucide-react"
import { RequireAuth } from "@/components/auth/RequireAuth"
import { HowAuctionsWork } from "@/components/auctions/HowAuctionsWork"
import { TRADE_EXCHANGE_ROLES } from "@/lib/tradeAccess"

/**
 * Trade Exchange landing dashboard — the menu of what the room contains.
 *
 * /auctions used to BE the auction browser. It is now the section index, and
 * the browser lives at /auctions/browse. The URL was kept rather than moved to
 * /trade-exchange on purpose: renaming it would break existing links and SEO,
 * the /auctions/live/[id] and /auctions/won/[id] children, and the backend's
 * returnPath allowlist (/^\/(buy-cars|auctions)\//) that /auctions/browse still
 * satisfies.
 *
 * The public/gated split is the same one the old page had, and it matters:
 *   - hero and How It Works stay PUBLIC. They show no vehicle and no live bid,
 *     and they are the dealer-recruitment pitch — the reason a dealer signs up
 *     at all. Gating them would make the Trade Exchange invisible to search and
 *     to the exact audience it is for.
 *   - the section menu is DEALER-ONLY, same as the grid it replaced.
 *
 * The gate here is UI, not security. Every route it points at enforces the rule
 * again for itself, and the auction endpoints refuse non-dealers server-side.
 */

type Section = {
    icon: LucideIcon
    title: string
    description: string
    points: string[]
    /** Present = live. Absent = the card renders as Coming soon and is inert. */
    href?: string
    cta: string
}

const SECTIONS: Section[] = [
    {
        icon: Gavel,
        title: "Auction",
        description:
            "Bid on verified vehicles in 24-hour live auctions, or see what is scheduled next. Anti-snipe protection on every lot.",
        points: ["Live and upcoming lots", "Real-time bidding", "Reserve never shown to bidders"],
        href: "/auctions/browse",
        cta: "Enter the auction room",
    },
    {
        icon: Truck,
        title: "Delivery & Recovery",
        description:
            "Move or recover a vehicle anywhere in the UK. Post the route and approved transport businesses send you a price.",
        points: ["Single and multi-car moves", "Recovery jobs", "Contact shared only with your pick"],
        cta: "Post a delivery job",
    },
    {
        icon: Wrench,
        title: "Vehicle Inspections",
        description:
            "Independent pre-purchase and trade condition checks. Give the vehicle and location, approved inspectors quote.",
        points: ["Pre-purchase checks", "Trade condition grading", "Written report from the inspector"],
        cta: "Post an inspection job",
    },
    {
        icon: Banknote,
        title: "Vehicle Finance",
        description:
            "Send a finance enquiry to approved finance businesses. They respond through CarMazium — any lending, credit checks and agreements happen directly with that provider.",
        points: [
            "Enquiries only — no credit decision here",
            "Approved finance businesses respond",
            "Dealer stock funding enquiries too",
        ],
        cta: "Post a finance enquiry",
    },
    {
        icon: ShieldCheck,
        title: "Warranty Providers",
        description:
            "Ask approved warranty businesses for cover on a vehicle. They quote through CarMazium; the policy itself is issued by the provider.",
        points: ["Retail warranty quotes", "Dealer-branded cover", "Provider issues the policy"],
        cta: "Post a warranty request",
    },
]

function SectionCard({ section, index }: { section: Section; index: number }) {
    const { icon: Icon, title, description, points, href, cta } = section
    const live = Boolean(href)

    const body = (
        <>
            <div className="flex items-start justify-between gap-3 mb-5">
                <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 border ${live
                        ? "bg-primary/10 border-primary/20"
                        : "bg-[var(--bg-card)] border-[var(--border-default)]"}`}
                >
                    <Icon size={22} className={live ? "text-primary" : "text-[var(--text-muted)]"} />
                </div>
                <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap border ${live
                        ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-500"
                        : "bg-amber-500/10 border-amber-500/25 text-amber-500"}`}
                >
                    {live ? "Open now" : "Coming soon"}
                </span>
            </div>

            <h3 className="text-lg font-black font-heading tracking-tight mb-2">{title}</h3>
            <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-4">{description}</p>

            <ul className="space-y-2 mb-6">
                {points.map(point => (
                    <li key={point} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                        <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                        {point}
                    </li>
                ))}
            </ul>
        </>
    )

    const shell =
        "relative flex flex-col h-full rounded-2xl border p-6 transition-colors border-[var(--border-default)] bg-[var(--bg-input)]" +
        (live ? " hover:border-primary/40" : "")

    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05, duration: 0.4 }}
            className="h-full"
        >
            {live ? (
                // The whole card is the link — a dealer aiming for "Auction"
                // should not have to hit a 40px button to get there.
                <Link href={href!} className={`${shell} group cursor-pointer`}>
                    {body}
                    <span className="mt-auto inline-flex items-center justify-center gap-2 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-black uppercase tracking-widest text-white group-hover:bg-primary/90 transition-colors">
                        {cta}
                        <ArrowRight size={15} className="group-hover:translate-x-0.5 transition-transform" />
                    </span>
                </Link>
            ) : (
                <div className={shell}>
                    {body}
                    {/*
                        A real disabled button, not a dimmed link. `disabled`
                        takes it out of the tab order and has screen readers
                        announce it as unavailable, so the card reads the same to
                        a keyboard user as it looks — and there is no href for
                        anyone to follow early.
                    */}
                    <button
                        type="button"
                        disabled
                        aria-label={`${cta} — coming soon`}
                        className="mt-auto w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] px-4 py-2.5 text-sm font-bold text-[var(--text-muted)] cursor-not-allowed opacity-70"
                    >
                        {cta}
                    </button>
                </div>
            )}
        </motion.div>
    )
}

export default function TradeExchangePage() {
    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-body)' }}>

            {/* ── Hero (public — the dealer-recruitment pitch) ──────────────── */}
            <section className="relative overflow-hidden text-white" style={{ marginTop: '-80px', paddingTop: '80px' }}>
                <Image
                    src="/assets/images/live-auction-hero.jpg"
                    alt="Live car auction"
                    fill
                    priority
                    className="object-cover object-center"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/15 to-transparent dark:bg-gradient-to-b dark:from-slate-900/80 dark:via-slate-900/70 dark:to-slate-900" />
                <div className="absolute inset-0 dark:bg-[radial-gradient(ellipse_at_top_left,rgba(237,28,36,0.18)_0%,transparent_55%)]" />
                <div className="absolute inset-0 dark:bg-[radial-gradient(ellipse_at_bottom_right,rgba(15,23,42,0.85)_0%,transparent_60%)]" />

                <div className="container mx-auto px-6 py-20 md:py-24 relative z-10">
                    <div className="max-w-3xl">
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="inline-flex items-center gap-2.5 bg-red-600/10 border border-red-500/20 rounded-full px-4 py-1.5 mb-6"
                        >
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                            <span className="text-xs font-bold text-red-400 uppercase tracking-widest">
                                Trade Exchange
                            </span>
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05, duration: 0.6 }}
                            className="text-5xl md:text-6xl font-black font-heading tracking-tight leading-[0.95] mb-5"
                        >
                            Everything trade,<br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-red-700">
                                in one room.
                            </span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.12 }}
                            className="text-slate-300 text-lg max-w-lg leading-relaxed"
                        >
                            Live auctions today. Delivery, inspections, finance and warranty next —
                            all through approved trade businesses, all without leaving CarMazium.
                        </motion.p>
                    </div>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </section>

            {/* ── Section menu (dealer-only) ────────────────────────────────── */}
            <RequireAuth
                title="Sign up to enter the Trade Exchange"
                signupRole="DEALER"
                allowedRoles={TRADE_EXCHANGE_ROLES}
                requireVerifiedDealer
                message="The Trade Exchange is open to registered dealers. Signing up takes a minute."
            >
                <section className="container mx-auto px-4 md:px-6 py-16">
                    <div className="mb-10">
                        <h2 className="text-2xl md:text-3xl font-black font-heading tracking-tight mb-2">
                            Where do you want to go?
                        </h2>
                        <p className="text-[var(--text-muted)] text-sm">
                            Auctions are open now. The other four service areas are on the way.
                        </p>
                    </div>

                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                        {SECTIONS.map((section, i) => (
                            <SectionCard key={section.title} section={section} index={i} />
                        ))}
                    </div>
                </section>
            </RequireAuth>

            {/* Public on purpose — see the note at the top of this file. */}
            <HowAuctionsWork />
        </div>
    )
}
