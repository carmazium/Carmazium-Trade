"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Truck, Plus, Trash2, Loader2, AlertCircle, ArrowRight } from "lucide-react"
import { RequireAuth } from "@/components/auth/RequireAuth"
import { Button } from "@/components/ui/Button"
import { createJob, type JobVehicle } from "@/lib/servicesApi"

const EMPTY_VEHICLE: JobVehicle = { registration: "", make: "", model: "", year: undefined, notes: "" }
const inputCls = "w-full rounded-xl border px-4 py-3 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary bg-[var(--bg-input)] border-[var(--border-default)] text-[var(--text-primary)]"
const labelCls = "block text-[11px] font-extrabold uppercase tracking-widest text-[var(--text-muted)] mb-2"

function NewDeliveryJobForm() {
    const router = useRouter()
    const [submitting, setSubmitting] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [isRecovery, setIsRecovery] = React.useState(false)
    const [title, setTitle] = React.useState("")
    const [description, setDescription] = React.useState("")
    const [pickupPostcode, setPickupPostcode] = React.useState("")
    const [pickupAddress, setPickupAddress] = React.useState("")
    const [deliveryPostcode, setDeliveryPostcode] = React.useState("")
    const [deliveryAddress, setDeliveryAddress] = React.useState("")
    const [asap, setAsap] = React.useState(true)
    const [requestedFor, setRequestedFor] = React.useState("")
    const [vehicles, setVehicles] = React.useState<JobVehicle[]>([{ ...EMPTY_VEHICLE }])
    const setVehicle = (i: number, patch: Partial<JobVehicle>) => setVehicles(vs => vs.map((v, idx) => idx === i ? { ...v, ...patch } : v))

    const submit = async (e: React.FormEvent) => {
        e.preventDefault(); setError(null)
        if (!title.trim()) return setError("Give the job a short title, e.g. \"BMW 3 Series, Leeds to Bristol\".")
        if (!pickupPostcode.trim() || !deliveryPostcode.trim()) return setError("Both postcodes are needed to quote the route.")
        if (vehicles.some(v => !v.registration && !v.make && !v.model)) return setError("Each vehicle needs at least a registration or a make and model.")
        setSubmitting(true)
        try {
            const job = await createJob({
                serviceType: "DELIVERY", isRecovery, title: title.trim(), description: description.trim() || undefined,
                pickupPostcode: pickupPostcode.trim(), pickupAddress: pickupAddress.trim() || undefined,
                deliveryPostcode: deliveryPostcode.trim(), deliveryAddress: deliveryAddress.trim() || undefined,
                requestedFor: asap || !requestedFor ? undefined : new Date(requestedFor).toISOString(),
                vehicles: vehicles.map(v => ({ registration: v.registration || undefined, make: v.make || undefined, model: v.model || undefined, year: v.year || undefined, notes: v.notes || undefined })),
            })
            router.push(`/services/jobs/${job.id}?posted=1`)
        } catch (err: any) { setError(err?.message || "Could not post the job. Please try again."); setSubmitting(false) }
    }

    return <form onSubmit={submit} className="container mx-auto px-5 py-12 max-w-3xl">
        <div className="mb-8"><div className="inline-flex items-center gap-2 text-primary text-[10px] font-black uppercase tracking-[0.2em] mb-3"><Truck size={13} /> Delivery &amp; Recovery</div><h1 className="text-3xl md:text-4xl font-black font-heading tracking-tight mb-2">Post a delivery job</h1><p className="text-[var(--text-muted)] text-sm">Approved transporters send fixed prices. Your transport-service payment is handled by CarMazium; any vehicle purchase money remains directly between buyer and seller.</p></div>
        {error && <div className="mb-6 p-4 rounded-xl border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300 text-sm flex items-start gap-3"><AlertCircle size={18} className="shrink-0 mt-0.5" /> {error}</div>}
        <fieldset className="mb-8"><legend className={labelCls}>What kind of move</legend><div className="grid sm:grid-cols-2 gap-3">{[
            { v:false, label:"Delivery", hint:"The car runs and drives. Transported or driven on trade plates." },
            { v:true, label:"Recovery", hint:"Non-runner, accident damaged or no keys. Needs a flatbed." },
        ].map(opt => <label key={String(opt.v)} className={`flex items-start gap-3 rounded-xl border p-4 cursor-pointer transition-colors ${isRecovery === opt.v ? "border-primary bg-primary/5" : "border-[var(--border-default)] bg-[var(--bg-input)] hover:border-primary/40"}`}><input type="radio" name="kind" checked={isRecovery === opt.v} onChange={() => setIsRecovery(opt.v)} className="mt-0.5 accent-primary" /><span><span className="block text-sm font-extrabold">{opt.label}</span><span className="block text-[11px] text-[var(--text-muted)] mt-0.5">{opt.hint}</span></span></label>)}</div></fieldset>
        <div className="mb-8"><label className={labelCls} htmlFor="title">Job title</label><input id="title" className={inputCls} value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} placeholder='e.g. "BMW 3 Series, Leeds to Bristol"' /></div>
        <div className="grid sm:grid-cols-2 gap-5 mb-8">
            <div className="space-y-3"><div><label className={labelCls} htmlFor="pp">Pickup postcode</label><input id="pp" className={`${inputCls} font-mono uppercase`} value={pickupPostcode} onChange={e=>setPickupPostcode(e.target.value)} maxLength={10} placeholder="LS1 4AP" /></div><div><label className={labelCls} htmlFor="pa">Pickup address <span className="normal-case font-semibold">(optional — shown only to your chosen transporter)</span></label><input id="pa" className={inputCls} value={pickupAddress} onChange={e=>setPickupAddress(e.target.value)} maxLength={300} /></div></div>
            <div className="space-y-3"><div><label className={labelCls} htmlFor="dp">Delivery postcode</label><input id="dp" className={`${inputCls} font-mono uppercase`} value={deliveryPostcode} onChange={e=>setDeliveryPostcode(e.target.value)} maxLength={10} placeholder="BS1 4DJ" /></div><div><label className={labelCls} htmlFor="da">Delivery address <span className="normal-case font-semibold">(optional)</span></label><input id="da" className={inputCls} value={deliveryAddress} onChange={e=>setDeliveryAddress(e.target.value)} maxLength={300} /></div></div>
        </div>
        <fieldset className="mb-8"><legend className={labelCls}>When</legend><div className="flex flex-col sm:flex-row gap-3"><label className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer ${asap ? "border-primary bg-primary/5" : "border-[var(--border-default)] bg-[var(--bg-input)]"}`}><input type="radio" name="when" checked={asap} onChange={()=>setAsap(true)} className="accent-primary" /><span className="text-sm font-bold">As soon as possible</span></label><label className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer flex-1 ${!asap ? "border-primary bg-primary/5" : "border-[var(--border-default)] bg-[var(--bg-input)]"}`}><input type="radio" name="when" checked={!asap} onChange={()=>setAsap(false)} className="accent-primary" /><span className="text-sm font-bold whitespace-nowrap">On or after</span><input type="date" className={`${inputCls} py-1.5`} value={requestedFor} onChange={e=>{setRequestedFor(e.target.value);setAsap(false)}} min={new Date().toISOString().slice(0,10)} /></label></div></fieldset>
        <fieldset className="mb-8"><div className="flex items-center justify-between mb-3"><legend className={labelCls}>Vehicles ({vehicles.length})</legend>{vehicles.length<12 && <button type="button" onClick={()=>setVehicles(vs=>[...vs,{...EMPTY_VEHICLE}])} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"><Plus size={14}/> Add another vehicle</button>}</div><div className="space-y-3">{vehicles.map((v,i)=><div key={i} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-input)] p-4"><div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3"><input className={`${inputCls} font-mono uppercase`} placeholder="Reg" value={v.registration??""} onChange={e=>setVehicle(i,{registration:e.target.value})} maxLength={10}/><input className={inputCls} placeholder="Make" value={v.make??""} onChange={e=>setVehicle(i,{make:e.target.value})}/><input className={inputCls} placeholder="Model" value={v.model??""} onChange={e=>setVehicle(i,{model:e.target.value})}/><input className={inputCls} placeholder="Year" type="number" min={1900} max={2100} value={v.year??""} onChange={e=>setVehicle(i,{year:e.target.value?Number(e.target.value):undefined})}/></div><div className="flex gap-3"><input className={inputCls} placeholder='Notes — "no keys", "low clearance", "flat tyre"' value={v.notes??""} onChange={e=>setVehicle(i,{notes:e.target.value})}/>{vehicles.length>1 && <button type="button" onClick={()=>setVehicles(vs=>vs.filter((_,idx)=>idx!==i))} className="shrink-0 rounded-xl border border-[var(--border-default)] px-3 text-[var(--text-muted)] hover:text-red-500 hover:border-red-500/40"><Trash2 size={16}/></button>}</div></div>)}</div></fieldset>
        <div className="mb-10"><label className={labelCls} htmlFor="desc">Anything else the transporter should know <span className="normal-case font-semibold">(optional)</span></label><textarea id="desc" className={`${inputCls} resize-none`} rows={3} value={description} onChange={e=>setDescription(e.target.value)} maxLength={2000} /></div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"><p className="text-xs text-[var(--text-muted)] max-w-sm">Your job stays open for 7 days. Transporters see postcodes and vehicles—not your identity or full address.</p><Button type="submit" size="lg" disabled={submitting} className="w-full sm:w-auto">{submitting?<Loader2 className="animate-spin" size={18}/>:<>Post job <ArrowRight size={16} className="ml-2"/></>}</Button></div>
    </form>
}

export default function NewDeliveryJobPage() {
    return <div className="min-h-screen" style={{background:'var(--bg-body)'}}><RequireAuth title="Sign in to post a delivery job" message="Approved transporters will quote your route. You need an account so we can send you their prices."><NewDeliveryJobForm/></RequireAuth></div>
}
