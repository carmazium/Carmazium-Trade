"use client"

import * as React from "react"
import Link from "next/link"
import { Loader2, Truck, Plus } from "lucide-react"
import { RequireAuth } from "@/components/auth/RequireAuth"
import { getMyJobs, type ServiceJob } from "@/lib/servicesApi"
import { JobListCard } from "@/components/services/JobBits"

function MyJobsList() {
    const [jobs, setJobs] = React.useState<ServiceJob[] | null>(null)
    const [error, setError] = React.useState<string | null>(null)
    React.useEffect(() => { getMyJobs().then(setJobs).catch(e => setError(e?.message || "Could not load your jobs")) }, [])
    const active = jobs?.filter(j => !["RELEASED", "CANCELLED", "EXPIRED"].includes(j.status)) ?? []
    const past = jobs?.filter(j => ["RELEASED", "CANCELLED", "EXPIRED"].includes(j.status)) ?? []
    return <div className="container mx-auto px-5 py-12 max-w-4xl">
        <div className="flex items-start justify-between gap-4 mb-8"><div><h1 className="text-3xl md:text-4xl font-black font-heading tracking-tight mb-1">My service jobs</h1><p className="text-[var(--text-muted)] text-sm">Deliveries and inspections you have posted in the Trade Exchange.</p></div><Link href="/services/delivery/new" className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-white text-sm font-black uppercase tracking-widest hover:bg-primary/90 transition-colors shrink-0"><Plus size={16}/> Post a job</Link></div>
        {error && <p className="text-red-500 text-sm mb-6">{error}</p>}
        {!jobs && !error && <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary"/></div>}
        {jobs && jobs.length===0 && <div className="rounded-2xl border border-dashed border-[var(--border-default)] p-12 text-center"><Truck size={32} className="mx-auto text-[var(--text-muted)] mb-4"/><h2 className="font-heading font-bold text-lg mb-2">No jobs yet</h2><p className="text-sm text-[var(--text-muted)] mb-6">Post a delivery and approved transporters will quote it.</p><Link href="/services/delivery/new" className="text-primary font-bold text-sm hover:underline">Post your first job →</Link></div>}
        {active.length>0 && <section className="mb-10"><h2 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">Active</h2><div className="space-y-3">{active.map(j=><JobListCard key={j.id} job={j} href={`/services/jobs/${j.id}`} trailing={j.status==="OPEN"?<span className="text-xs font-bold text-primary">{j._count?.quotes??0} quote{(j._count?.quotes??0)===1?"":"s"}</span>:undefined}/>)}</div></section>}
        {past.length>0 && <section><h2 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">Past</h2><div className="space-y-3 opacity-80">{past.map(j=><JobListCard key={j.id} job={j} href={`/services/jobs/${j.id}`}/>)}</div></section>}
    </div>
}

export default function MyServiceJobsPage() {
    return <div className="min-h-screen" style={{background:'var(--bg-body)'}}><RequireAuth title="Sign in to see your jobs" message="Your posted jobs and their quotes live here."><MyJobsList/></RequireAuth></div>
}
