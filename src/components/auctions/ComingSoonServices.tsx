"use client"

import * as React from "react"
import { Truck, Wrench, Banknote, ShieldCheck, type LucideIcon } from "lucide-react"

/**
 * The four trade service areas, shown inside the Trade Exchange as a preview of
 * what is coming.
 *
 * These are deliberately inert. Nothing here posts a job, opens a form or hits
 * an endpoint — the service-request backend for these areas isn't live, so a
 * working button would collect enquiries nobody is on the other end of. The
 * cards exist to tell dealers what the room will do, and to let us find out
 * which of the four they reach for first.
 *
 * When an area does go live, drop its `href` in and swap the disabled button for
 * a Link — the copy and layout carry over unchanged.
 */
type Service = {
    icon: LucideIcon
    title: string
    description: string
    points: string[]
    cta: string
}

const SERVICES: Service[] = [
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

export function ComingSoonServices() {
    return (
        <section className="border-t border-[var(--border-default)] bg-[var(--bg-card)]">
            <div className="container mx-auto px-4 md:px-6 py-16">

                <div className="text-center max-w-2xl mx-auto mb-12">
                    <p className="text-primary text-[10px] font-black uppercase tracking-[0.2em] mb-3">
                        Coming to the Trade Exchange
                    </p>
                    <h2 className="text-3xl md:text-4xl font-black font-heading tracking-tight mb-3">
                        Your service areas
                    </h2>
                    <p className="text-[var(--text-muted)] text-sm leading-relaxed">
                        Post a job to approved trade businesses without leaving CarMazium. These four
                        areas aren&apos;t open yet — here&apos;s what they&apos;ll do.
                    </p>
                </div>

                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    {SERVICES.map(({ icon: Icon, title, description, points, cta }) => (
                        <div
                            key={title}
                            className="relative flex flex-col rounded-2xl border border-[var(--border-default)] bg-[var(--bg-input)] p-6"
                        >
                            <div className="flex items-start justify-between gap-3 mb-5">
                                <div className="w-11 h-11 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] flex items-center justify-center shrink-0">
                                    <Icon size={20} className="text-[var(--text-secondary)]" />
                                </div>
                                <span className="rounded-full bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-500 whitespace-nowrap">
                                    Coming soon
                                </span>
                            </div>

                            <h3 className="text-lg font-black font-heading tracking-tight mb-2">
                                {title}
                            </h3>
                            <p className="text-sm text-[var(--text-muted)] leading-relaxed mb-4">
                                {description}
                            </p>

                            <ul className="space-y-2 mb-6">
                                {points.map(point => (
                                    <li key={point} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                                        <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                                        {point}
                                    </li>
                                ))}
                            </ul>

                            {/*
                                A real <button disabled>, not a styled-down link. `disabled` takes
                                it out of the tab order and has screen readers announce it as
                                unavailable, so the card reads the same to a keyboard user as it
                                looks — and there is no href for anyone to follow early.
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
                    ))}
                </div>

            </div>
        </section>
    )
}
