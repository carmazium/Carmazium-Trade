"use client"

import * as React from "react"
import Link from "next/link"
import { Loader2, Briefcase, AlertCircle, Inbox } from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { useAuth } from "@/context/AuthContext"
import { getJobFeed, getAssignedJobs, formatPence, type ServiceJob } from "@/lib/servicesApi"
import { JobListCard } from "@/components/services/JobBits"

export default function ContractorJobsPage() {
    const { user, profile, loading: authLoading } = useAuth()
    const [tab, setTab] = React.useState<"open" | "mine">("open")
    const [feed, setFeed] = React.useState<ServiceJob[] | null>(null)
    const [mine, setMine] = React.useState<ServiceJob[] | null>(null)
    const [notApproved, setNotApproved] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    React.useEffect(() => {
        if (authLoading || !user) return
        Promise.all([getJobFeed(), getAssignedJobs()]).then(([f,m])=>{setFeed(f);setMine(m)}).catch(e=>{
            const msg:string=e?.message||""; if(/no approved services|approved service providers/i.test(msg))setNotApproved(true);else setError(msg||"Could not load jobs");setFeed([]);setMine([])
        })
    }, [authLoading,user])
    const userName=profile?.firstName?`${profile.firstName} ${profile.lastName||""}`.trim():user?.email||"Provider"
    const list=tab==="open"?feed:mine
    return <div className="min-h-screen pt-20 pb-12"><div className="container mx-auto px-5 flex flex-col lg:flex-row gap-8"><DashboardSidebar role="provider" userName={userName} userType="Service Provider"/><main className="flex-1 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap"><div><h1 className="text-3xl font-bold font-heading mb-1">Jobs</h1><p className="text-sm text-[var(--text-muted)]">Open jobs in your approved service areas, and the ones you have won.</p></div><div className="flex items-center gap-1 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-xl p-1">{([["open",`Open${feed?` (${feed.length})`:""}`],["mine",`My jobs${mine?` (${mine.length})`:""}`]] as const).map(([k,label])=><button key={k} type="button" onClick={()=>setTab(k)} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors ${tab===k?"bg-primary text-white":"text-[var(--text-muted)] hover:text-[var(--text-primary)]"}`}>{label}</button>)}</div></div>
        {notApproved&&<div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 flex flex-col sm:flex-row sm:items-center gap-4"><AlertCircle size={22} className="text-amber-500 shrink-0"/><div className="flex-1"><p className="font-bold text-sm">No approved service areas yet</p><p className="text-xs text-[var(--text-muted)] mt-0.5">Apply for a service area and connect Stripe. Jobs appear here once CarMazium approves you.</p></div><Link href="/dashboard/service/capabilities" className="text-xs font-black uppercase tracking-widest text-primary hover:underline shrink-0">Apply now →</Link></div>}
        {error&&<p className="text-red-500 text-sm">{error}</p>}
        {!list&&!notApproved&&!error&&<div className="flex justify-center py-16"><Loader2 className="animate-spin text-primary"/></div>}
        {list&&list.length===0&&!notApproved&&<div className="rounded-2xl border border-dashed border-[var(--border-default)] p-12 text-center">{tab==="open"?<Inbox size={30} className="mx-auto text-[var(--text-muted)] mb-3"/>:<Briefcase size={30} className="mx-auto text-[var(--text-muted)] mb-3"/>}<p className="text-sm text-[var(--text-muted)]">{tab==="open"?"No open jobs right now.":"You have not won a job yet. Quote on open jobs to get started."}</p></div>}
        {list&&list.length>0&&<div className="space-y-3">{list.map(j=>{const myQuote=j.quotes?.[0];const trailing=tab==="open"?(myQuote?<span className="text-xs font-bold text-emerald-500">Your quote: {formatPence(myQuote.amountPence)}</span>:<span className="text-xs font-bold text-primary">{j._count?.quotes??0} quote{(j._count?.quotes??0)===1?"":"s"} so far</span>):j.agreedAmountPence!=null?<span className="text-xs font-bold">{formatPence(j.contractorAmountPence??j.agreedAmountPence)} to you</span>:undefined;return <JobListCard key={j.id} job={j} href={`/dashboard/service/jobs/${j.id}`} trailing={trailing}/>})}</div>}
    </main></div></div>
}
