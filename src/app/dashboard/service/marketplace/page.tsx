"use client"

import * as React from "react"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { useAuth } from "@/context/AuthContext"
import {
    formatTradePounds,
    getProviderJobFeed,
    poundsToPence,
    submitServiceOffer,
    tradeFeeBreakdown,
    tradeServiceCategoryLabel,
    withdrawServiceOffer,
    type ProviderJobFeedRow,
    type TradeServiceCategory,
} from "@/lib/tradexchangeApi"
import { AlertCircle, Briefcase, CheckCircle2, Loader2, Search, Send, X } from "lucide-react"

const categories: Array<{ value: TradeServiceCategory | 'all'; label: string }> = [
    { value: 'all', label: 'All approved services' },
    { value: 'delivery', label: 'Delivery & Recovery' },
    { value: 'inspection', label: 'Vehicle Inspection' },
    { value: 'finance', label: 'Vehicle Finance' },
    { value: 'warranty', label: 'Vehicle Warranty' },
]

function QuotePanel({ job, onChanged }: { job: ProviderJobFeedRow; onChanged: () => Promise<void> }) {
    const [open, setOpen] = React.useState(false)
    const [price, setPrice] = React.useState(job.my_offer_amount_pence ? String(job.my_offer_amount_pence / 100) : '')
    const [message, setMessage] = React.useState('')
    const [availableFrom, setAvailableFrom] = React.useState('')
    const [busy, setBusy] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [success, setSuccess] = React.useState<string | null>(null)

    const pence = poundsToPence(price)
    const calc = pence ? tradeFeeBreakdown(pence) : null
    const hasOffer = Boolean(job.my_offer_id)

    const sendQuote = async () => {
        if (!pence) {
            setError('Enter a valid price in pounds, for example 240.')
            return
        }
        setBusy(true)
        setError(null)
        setSuccess(null)
        try {
            if (hasOffer && job.my_offer_id) await withdrawServiceOffer(job.my_offer_id)
            await submitServiceOffer({
                jobId: job.id,
                businessId: job.my_business_id,
                amountPence: pence,
                message: message.trim() || undefined,
                availableFrom: availableFrom || undefined,
            })
            setSuccess(hasOffer ? 'Quote updated.' : 'Quote sent.')
            setOpen(false)
            await onChanged()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not send quote.')
        } finally {
            setBusy(false)
        }
    }

    const withdraw = async () => {
        if (!job.my_offer_id) return
        setBusy(true)
        setError(null)
        try {
            await withdrawServiceOffer(job.my_offer_id)
            setSuccess('Quote withdrawn.')
            await onChanged()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not withdraw quote.')
        } finally {
            setBusy(false)
        }
    }

    return (
        <div className="mt-5 border-t border-[var(--border-default)] pt-4">
            {error && <p className="mb-3 text-sm text-red-400 flex items-center gap-2"><AlertCircle size={14} />{error}</p>}
            {success && <p className="mb-3 text-sm text-emerald-400 flex items-center gap-2"><CheckCircle2 size={14} />{success}</p>}
            {!open ? (
                <div className="flex flex-wrap items-center gap-3">
                    {hasOffer && <span className="text-sm text-[var(--text-muted)]">Your quote: <strong className="text-[var(--text-primary)]">{formatTradePounds(job.my_offer_amount_pence)}</strong></span>}
                    <Button size="sm" variant={hasOffer ? "outline" : "default"} onClick={() => setOpen(true)}>
                        <Send size={14} className="mr-2" /> {hasOffer ? 'Update quote' : 'Send a quote'}
                    </Button>
                    {hasOffer && job.my_offer_status === 'submitted' && (
                        <Button size="sm" variant="outline" onClick={withdraw} disabled={busy}>
                            <X size={14} className="mr-2" /> Withdraw
                        </Button>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <label className="space-y-2 text-sm font-medium">
                            <span>Your price (£)</span>
                            <Input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 240" />
                        </label>
                        <label className="space-y-2 text-sm font-medium">
                            <span>Available from</span>
                            <Input type="date" value={availableFrom} onChange={e => setAvailableFrom(e.target.value)} />
                        </label>
                    </div>
                    <label className="space-y-2 text-sm font-medium block">
                        <span>Message to customer</span>
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            rows={3}
                            className="w-full rounded-xl border border-[var(--border-default)] bg-[var(--bg-input)] px-4 py-3 text-sm text-[var(--text-primary)] focus:outline-none focus:border-primary"
                            placeholder="Availability, equipment, collection notes…"
                        />
                    </label>
                    {calc && (
                        <p className="text-xs text-[var(--text-muted)]">
                            After CarMazium&apos;s 9% service fee ({formatTradePounds(calc.fee)}), your net is {formatTradePounds(calc.net)} when the job is confirmed complete.
                        </p>
                    )}
                    <div className="flex gap-2">
                        <Button size="sm" onClick={sendQuote} disabled={busy}>{busy ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Send size={14} className="mr-2" />}{hasOffer ? 'Update quote' : 'Send quote'}</Button>
                        <Button size="sm" variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function ServiceMarketplacePage() {
    const { user, profile, loading: authLoading } = useAuth()
    const [jobs, setJobs] = React.useState<ProviderJobFeedRow[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [category, setCategory] = React.useState<TradeServiceCategory | 'all'>('all')
    const [search, setSearch] = React.useState('')

    const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setJobs(await getProviderJobFeed(category))
        } catch (err) {
            setJobs([])
            const message = err instanceof Error ? err.message : 'Could not load available jobs.'
            setError(message.includes('function') || message.includes('schema cache')
                ? 'The TradeXchange marketplace is not enabled in this environment yet. Your existing assigned Jobs remain available.'
                : message)
        } finally {
            setLoading(false)
        }
    }, [category])

    React.useEffect(() => {
        if (!authLoading && user) void load()
    }, [authLoading, user, load])

    const visibleJobs = React.useMemo(() => {
        const term = search.trim().toLowerCase()
        if (!term) return jobs
        return jobs.filter(job => [job.title, job.description, job.collection_location, job.delivery_location, job.vehicle_label]
            .filter(Boolean).join(' ').toLowerCase().includes(term))
    }, [jobs, search])

    const userName = profile?.firstName ? `${profile.firstName} ${profile.lastName || ''}` : (user?.email?.split('@')[0] || 'User')

    if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>

    return (
        <div className="min-h-screen pt-20 pb-12">
            <div className="container mx-auto px-5 flex flex-col lg:flex-row gap-8">
                <DashboardSidebar role="provider" userName={userName} userType="Service Provider" />
                <main className="flex-1 min-w-0 space-y-6">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold mb-2">TradeXchange</p>
                        <h1 className="text-3xl font-bold font-heading">Available Jobs</h1>
                        <p className="text-sm text-[var(--text-muted)] mt-2 max-w-3xl">Open work in the service categories your business is approved for. Customer contact details remain private until the winning quote is accepted and paid.</p>
                    </div>

                    <div className="glass-card p-4 grid grid-cols-1 md:grid-cols-[1fr_260px] gap-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={16} />
                            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search route, vehicle or job…" className="pl-9" />
                        </div>
                        <select value={category} onChange={e => setCategory(e.target.value as TradeServiceCategory | 'all')} className="rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-primary)]">
                            {categories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                        </select>
                    </div>

                    {error && <div className="glass-card p-4 border border-amber-500/30 text-amber-300 flex items-start gap-3"><AlertCircle size={18} className="mt-0.5 shrink-0" /><span>{error}</span></div>}

                    {loading ? (
                        <div className="glass-card p-12 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>
                    ) : visibleJobs.length === 0 ? (
                        <div className="glass-card p-12 text-center text-[var(--text-muted)]">
                            <Briefcase size={56} className="mx-auto mb-4 opacity-30" />
                            <p className="text-xl font-medium">No open jobs match right now</p>
                            <p className="text-sm mt-2">Your assigned work is still available under My Jobs.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {visibleJobs.map(job => (
                                <article key={job.id} className="glass-card p-6 hover:border-white/20 transition-colors">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <h2 className="text-lg font-bold">{job.title}</h2>
                                            <p className="text-xs text-[var(--text-muted)] mt-1">{tradeServiceCategoryLabel[job.category]} · {new Date(job.created_at).toLocaleDateString('en-GB')} · {job.offer_count} quote{job.offer_count === 1 ? '' : 's'}</p>
                                        </div>
                                        {job.my_offer_id && <span className="text-xs font-bold px-3 py-1 rounded-full bg-primary/15 text-primary border border-primary/20">Your quote sent</span>}
                                    </div>
                                    <p className="text-sm text-[var(--text-muted)] mt-4">{job.description}</p>
                                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-4 text-sm">
                                        {job.collection_location && <div><p className="text-xs text-[var(--text-muted)]">From</p><p className="font-medium">{job.collection_location}</p></div>}
                                        {job.delivery_location && <div><p className="text-xs text-[var(--text-muted)]">To</p><p className="font-medium">{job.delivery_location}</p></div>}
                                        {job.vehicle_label && <div><p className="text-xs text-[var(--text-muted)]">Vehicle</p><p className="font-medium">{job.vehicle_label}</p></div>}
                                        {job.preferred_date && <div><p className="text-xs text-[var(--text-muted)]">Preferred</p><p className="font-medium">{new Date(job.preferred_date).toLocaleDateString('en-GB')}</p></div>}
                                        {job.budget_pence && <div><p className="text-xs text-[var(--text-muted)]">Budget guide</p><p className="font-medium">{formatTradePounds(job.budget_pence)}</p></div>}
                                    </div>
                                    <p className="text-xs text-[var(--text-muted)] mt-4">Other providers&apos; quotes are private. Contact and access details unlock only through the secured job workflow.</p>
                                    <QuotePanel job={job} onChanged={load} />
                                </article>
                            ))}
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}
