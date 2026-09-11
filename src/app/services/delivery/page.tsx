"use client"

import * as React from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { Truck, ArrowRight, ShieldCheck, Banknote, Users, FileText, Lock, CheckCircle } from "lucide-react"
import { useAuth } from "@/context/AuthContext"

const STEPS = [
    { icon: FileText, title: "Post the route", desc: "Where the car is, where it is going, and when. One car or a full load." },
    { icon: Users, title: "Approved transporters quote", desc: "Only businesses CarMazium has vetted can see your job. They send a fixed price." },
    { icon: Lock, title: "Pick one and pay CarMazium", desc: "Your money is held by us, not the transporter. Their contact details unlock the moment you pay." },
    { icon: CheckCircle, title: "Confirm delivery, we pay them", desc: "When the car arrives you confirm it. Only then does the transporter get paid." },
]

export default function DeliveryLandingPage() {
    const { user } = useAuth()
    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-body)' }}>
            <section className="relative overflow-hidden border-b border-[var(--border-default)]" style={{ marginTop: '-80px', paddingTop: '80px' }}>
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(237,28,36,0.10)_0%,transparent_55%)]" />
                <div className="container mx-auto px-6 py-16 md:py-24 relative"><div className="max-w-3xl">
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-4 py-1.5 mb-6 text-xs font-bold uppercase tracking-widest text-primary"><Truck size={13} /> Trade Exchange · Delivery &amp; Recovery</motion.div>
                    <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="text-4xl md:text-6xl font-black font-heading tracking-tight leading-[0.95] mb-5">Move any car,<br /><span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-red-700">anywhere in the UK.</span></motion.h1>
                    <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="text-[var(--text-muted)] text-lg max-w-xl leading-relaxed mb-8">Post the route and approved transport businesses send you a price. Single cars, multi-car loads, and recovery for non-runners. You pay CarMazium for the transport service, and the transporter is paid when you confirm the car arrived.</motion.p>
                    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex flex-col sm:flex-row gap-3">
                        <Link href="/services/delivery/new" className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-primary text-white text-sm font-black uppercase tracking-widest hover:bg-primary/90 transition-colors shadow-neon">Post a delivery job <ArrowRight size={16} /></Link>
                        {user && <Link href="/services/jobs" className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-[var(--border-default)] text-sm font-bold hover:border-primary/40 transition-colors">My jobs</Link>}
                    </motion.div>
                </div></div>
            </section>
            <section className="container mx-auto px-6 py-16"><div className="text-center mb-12"><p className="text-primary text-[10px] font-black uppercase tracking-[0.2em] mb-3">How it works</p><h2 className="text-3xl md:text-4xl font-black font-heading tracking-tight">Four steps, no chasing</h2></div><div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">{STEPS.map((s, i) => <div key={s.title} className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-input)] p-6"><div className="flex items-center gap-3 mb-4"><div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center"><s.icon size={18} className="text-primary" /></div><span className="text-xs font-black text-[var(--text-muted)]">0{i + 1}</span></div><h3 className="font-heading font-bold mb-2">{s.title}</h3><p className="text-sm text-[var(--text-muted)] leading-relaxed">{s.desc}</p></div>)}</div></section>
            <section className="border-t border-[var(--border-default)] bg-[var(--bg-card)]"><div className="container mx-auto px-6 py-14 grid md:grid-cols-3 gap-6">{[
                { icon: ShieldCheck, t: "Vetted transporters only", d: "Every business quoting on your job has been approved by CarMazium for delivery work." },
                { icon: Banknote, t: "Transport payment is protected", d: "Your delivery-service payment sits with CarMazium until you confirm the job is complete. Vehicle purchase money is always paid directly to the vehicle seller." },
                { icon: Users, t: "Contact shared only with your pick", d: "Transporters see the route and the car, not your name or address, until you choose one." },
            ].map((b) => <div key={b.t} className="flex gap-4"><b.icon size={22} className="text-primary shrink-0 mt-0.5" /><div><h3 className="font-heading font-bold mb-1">{b.t}</h3><p className="text-sm text-[var(--text-muted)] leading-relaxed">{b.d}</p></div></div>)}</div></section>
            <section className="container mx-auto px-6 py-14"><div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-input)] p-8 md:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6"><div><h3 className="text-xl font-black font-heading mb-1">Run a transport business?</h3><p className="text-sm text-[var(--text-muted)]">Apply to quote on delivery jobs. CarMazium keeps 9% of each transport job; you keep the rest, paid direct to your bank.</p></div><Link href={user ? "/dashboard/service/capabilities" : "/auth/signup?role=CONTRACTOR&redirect=%2Fdashboard%2Fservice%2Fcapabilities"} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-primary/40 text-primary text-sm font-black uppercase tracking-widest hover:bg-primary/10 transition-colors shrink-0">Become a provider <ArrowRight size={15} /></Link></div></section>
        </div>
    )
}
