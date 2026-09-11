"use client"

import * as React from "react"
import Link from "next/link"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { Loader2, ArrowLeft, Star, CheckCircle, AlertCircle, ShieldCheck, Phone, Mail, XCircle, Clock, Banknote } from "lucide-react"
import { RequireAuth } from "@/components/auth/RequireAuth"
import { Button } from "@/components/ui/Button"
import { getJob, acceptQuote, confirmCompletion, disputeJob, cancelJob, formatPence, type ServiceJob, type ServiceQuote } from "@/lib/servicesApi"
import { JobStatusBadge, RecoveryBadge, JobRoute, JobTiming, JobVehicles } from "@/components/services/JobBits"

function Rating({ c }: { c: { rating: number; totalReviews: number } }) {
    if (!c.totalReviews) return <p className="text-xs text-[var(--text-muted)]">New to CarMazium</p>
    return <p className="text-xs text-[var(--text-muted)] inline-flex items-center gap-1"><Star size={12} className="text-amber-500 fill-amber-500" /> {c.rating.toFixed(1)} · {c.totalReviews} review{c.totalReviews === 1 ? "" : "s"}</p>
}

function QuoteCard({ quote, cheapest, busy, onAccept }: { quote: ServiceQuote; cheapest: boolean; busy: boolean; onAccept: () => void }) {
    const c = quote.contractor
    return <div className={`rounded-2xl border p-5 ${cheapest ? "border-primary/40 bg-primary/5" : "border-[var(--border-default)] bg-[var(--bg-card)]"}`}><div className="flex items-start justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2 mb-1"><p className="font-heading font-bold truncate">{c?.businessName || c?.user.firstName || "Provider"}</p>{cheapest && <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/25">Lowest</span>}</div>{c && <Rating c={c}/>} {c?.serviceArea && <p className="text-xs text-[var(--text-muted)] mt-1">{c.serviceArea}</p>}{quote.message && <p className="text-sm text-[var(--text-secondary)] mt-3 whitespace-pre-line">“{quote.message}”</p>}</div><div className="text-right shrink-0"><p className="text-2xl font-black font-heading">{formatPence(quote.amountPence)}</p><Button size="sm" className="mt-2" disabled={busy} onClick={onAccept}>{busy ? <Loader2 className="animate-spin" size={14}/> : "Accept & pay"}</Button></div></div></div>
}

function JobDetail() {
    const { id } = useParams<{ id: string }>()
    const router = useRouter()
    const params = useSearchParams()
    const [job, setJob] = React.useState<ServiceJob | null>(null)
    const [error, setError] = React.useState<string | null>(null)
    const [busy, setBusy] = React.useState<string | null>(null)
    const [flash, setFlash] = React.useState<string | null>(params.get("posted") ? "Job posted. Approved transporters can now quote it." : params.get("paid") === "1" ? "Transport-service payment received. Your transporter has been notified." : params.get("paid") === "0" ? "Checkout was cancelled. Your quote remains accepted." : null)
    const load = React.useCallback(() => { getJob(id).then(j => { if (j.viewerRole === "contractor" || j.viewerRole === "bidder") return router.replace(`/dashboard/service/jobs/${id}`); setJob(j) }).catch(e => setError(e?.message || "Job not found")) }, [id, router])
    React.useEffect(() => { load() }, [load])
    React.useEffect(() => { if (params.get("paid") !== "1" || job?.status !== "ACCEPTED") return; const t=setInterval(load,2500); const stop=setTimeout(()=>clearInterval(t),30000); return()=>{clearInterval(t);clearTimeout(stop)} }, [params, job?.status, load])
    const run = async (key:string, fn:()=>Promise<void>, after?:string) => { setBusy(key); setError(null); try { await fn(); if(after)setFlash(after); load() } catch(e:any){setError(e?.message||"Something went wrong")} finally{setBusy(null)} }
    if (error && !job) return <div className="container mx-auto px-5 py-20 text-center text-red-500">{error}</div>
    if (!job) return <div className="flex justify-center py-32"><Loader2 className="animate-spin text-primary"/></div>
    const activeQuotes=(job.quotes??[]).filter(q=>q.status==="ACTIVE")
    const accepted=(job.quotes??[]).find(q=>q.id===job.acceptedQuoteId)
    const isPaidState=["PAID","IN_PROGRESS","COMPLETED"].includes(job.status)
    return <div className="container mx-auto px-5 py-10 max-w-5xl">
        <Link href="/services/jobs" className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-muted)] hover:text-primary mb-6"><ArrowLeft size={14}/> My jobs</Link>
        {flash && <div className="mb-6 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 text-sm flex items-start gap-3"><CheckCircle size={18} className="shrink-0 mt-0.5"/>{flash}</div>}
        {error && <div className="mb-6 p-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300 text-sm flex items-start gap-3"><AlertCircle size={18} className="shrink-0 mt-0.5"/>{error}</div>}
        <div className="grid lg:grid-cols-[1fr_360px] gap-8"><div>
            <div className="flex items-start justify-between gap-3 mb-2"><h1 className="text-2xl md:text-3xl font-black font-heading tracking-tight">{job.title}</h1><div className="flex items-center gap-2 shrink-0">{job.isRecovery&&<RecoveryBadge/>}<JobStatusBadge status={job.status}/></div></div><JobRoute job={job} className="mb-1"/><div className="mb-6"><JobTiming job={job}/></div>
            <section className="mb-8"><h2 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">Vehicles</h2><JobVehicles vehicles={job.vehicles}/></section>
            {job.description && <section className="mb-8"><h2 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mb-2">Notes</h2><p className="text-sm text-[var(--text-secondary)] whitespace-pre-line">{job.description}</p></section>}
            {job.status==="OPEN" && <section><h2 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">Quotes ({activeQuotes.length})</h2>{activeQuotes.length===0 ? <div className="rounded-2xl border border-dashed border-[var(--border-default)] p-10 text-center"><Clock size={28} className="mx-auto text-[var(--text-muted)] mb-3"/><p className="text-sm text-[var(--text-muted)]">No quotes yet. Approved transporters can see the job.</p></div> : <div className="space-y-3">{activeQuotes.map((q,i)=><QuoteCard key={q.id} quote={q} cheapest={i===0} busy={busy===q.id} onAccept={()=>run(q.id, async()=>{window.location.href=await acceptQuote(job.id,q.id)})}/>)}</div>}</section>}
        </div><aside className="space-y-4">
            {accepted && job.contractor && <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-5"><p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">Your transporter</p><p className="font-heading font-bold text-lg">{job.contractor.businessName||job.contractor.user.firstName}</p><Rating c={job.contractor}/>{isPaidState||job.status==="RELEASED"?<div className="mt-4 space-y-2 text-sm">{(job.contractor.phone||job.contractor.user.phone)&&<a href={`tel:${job.contractor.phone||job.contractor.user.phone}`} className="flex items-center gap-2 text-primary hover:underline"><Phone size={14}/>{job.contractor.phone||job.contractor.user.phone}</a>}{job.contractor.user.email&&<a href={`mailto:${job.contractor.user.email}`} className="flex items-center gap-2 text-primary hover:underline"><Mail size={14}/>{job.contractor.user.email}</a>}</div>:<p className="mt-3 text-xs text-[var(--text-muted)]">Contact details unlock once the transport-service payment is made.</p>}</div>}
            {job.agreedAmountPence!=null && <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-5"><p className="text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] mb-3">Transport price</p><p className="text-3xl font-black font-heading">{formatPence(job.agreedAmountPence)}</p><p className="text-xs text-[var(--text-muted)] mt-1">{job.payment?.status==="RELEASED"?"Paid to your transporter.":job.payment?.status==="PAID"?"Held by CarMazium until you confirm the transport job is complete.":job.payment?.status==="REFUNDED"?"Refunded to you.":"Not yet paid."}</p></div>}
            <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-card)] p-5 space-y-3">{job.status==="ACCEPTED"&&accepted&&<Button className="w-full" disabled={busy==="pay"} onClick={()=>run("pay",async()=>{window.location.href=await acceptQuote(job.id,accepted.id)})}>{busy==="pay"?<Loader2 className="animate-spin" size={16}/>:<><Banknote size={16} className="mr-2"/> Pay {formatPence(accepted.amountPence)}</>}</Button>}{job.status==="COMPLETED"&&<><Button className="w-full" disabled={busy==="confirm"} onClick={()=>run("confirm",()=>confirmCompletion(job.id),"Confirmed. Your transporter has been paid.")}>{busy==="confirm"?<Loader2 className="animate-spin" size={16}/>:<><CheckCircle size={16} className="mr-2"/> Confirm delivery</>}</Button><p className="text-[11px] text-[var(--text-muted)] text-center">This releases the transporter's share. Vehicle purchase funds are not involved.</p></>}{isPaidState&&<button type="button" disabled={busy==="dispute"} onClick={()=>{const r=prompt("What went wrong? This freezes the transport job for CarMazium to review.");if(r!==null)run("dispute",()=>disputeJob(job.id,r||undefined),"Dispute raised. CarMazium will be in touch.")}} className="w-full text-xs font-bold text-red-500 hover:underline">Something is wrong — raise a dispute</button>}{job.status==="OPEN"&&<button type="button" disabled={busy==="cancel"} onClick={()=>{if(confirm("Cancel this job? Any quotes will be withdrawn."))run("cancel",()=>cancelJob(job.id),"Job cancelled.")}} className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-bold text-[var(--text-muted)] hover:text-red-500"><XCircle size={14}/> Cancel job</button>}{job.status==="DISPUTED"&&<p className="text-sm text-[var(--text-muted)] text-center">Under review by CarMazium. We will email you.</p>}{job.status==="RELEASED"&&<p className="text-sm text-[var(--text-muted)] text-center inline-flex items-center gap-2 w-full justify-center"><ShieldCheck size={16} className="text-emerald-500"/> Complete</p>}</div>
        </aside></div>
    </div>
}

export default function ServiceJobPage(){return <div className="min-h-screen" style={{background:'var(--bg-body)'}}><RequireAuth title="Sign in to view this job" message="Quotes and contact details are only shown to authorised participants."><React.Suspense fallback={<div className="flex justify-center py-32"><Loader2 className="animate-spin text-primary"/></div>}><JobDetail/></React.Suspense></RequireAuth></div>}
