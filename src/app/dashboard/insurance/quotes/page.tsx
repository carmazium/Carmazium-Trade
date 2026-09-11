"use client"

import * as React from "react"
import { AlertCircle, CheckCircle, ClipboardList, Clock, Loader2, X, XCircle } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { useAuth } from "@/context/AuthContext"
import {
    formatCurrency,
    getInsuranceQuotes,
    updateInsuranceStatus,
    type InsuranceQuote,
} from "@/lib/partnerApi"

export default function InsuranceQuotesPage() {
    const { user, profile, loading: authLoading } = useAuth()
    const [quotes, setQuotes] = React.useState<InsuranceQuote[]>([])
    const [loading, setLoading] = React.useState(true)
    const [updating, setUpdating] = React.useState<string | null>(null)
    const [statusFilter, setStatusFilter] = React.useState<string>("ALL")
    const [page, setPage] = React.useState(1)
    const [total, setTotal] = React.useState(0)
    const [quoteTarget, setQuoteTarget] = React.useState<InsuranceQuote | null>(null)
    const [premium, setPremium] = React.useState("")
    const [coverageType, setCoverageType] = React.useState("Comprehensive")
    const [expiryDate, setExpiryDate] = React.useState("")
    const [formError, setFormError] = React.useState<string | null>(null)
    const limit = 15

    const loadQuotes = React.useCallback(async () => {
        if (!user) return
        try {
            setLoading(true)
            const res = await getInsuranceQuotes(page, limit)
            setQuotes(res.data || [])
            setTotal(res.pagination?.total || 0)
        } catch (err) {
            console.error('Failed to fetch insurance quotes:', err)
        } finally {
            setLoading(false)
        }
    }, [user, page])

    React.useEffect(() => {
        if (!authLoading && user) void loadQuotes()
    }, [user, authLoading, loadQuotes])

    const mergeUpdatedQuote = (updated: InsuranceQuote) => {
        setQuotes(prev => prev.map(q => q.id === updated.id ? { ...q, ...updated } : q))
    }

    const handleReject = async (id: string) => {
        try {
            setUpdating(id)
            mergeUpdatedQuote(await updateInsuranceStatus(id, 'REJECTED'))
        } catch (err) {
            console.error('Failed to reject quote:', err)
        } finally {
            setUpdating(null)
        }
    }

    const openQuoteDialog = (quote: InsuranceQuote) => {
        setQuoteTarget(quote)
        setPremium(quote.quotedPrice || "")
        setCoverageType(quote.coverageType || "Comprehensive")
        setExpiryDate(quote.expiryDate ? quote.expiryDate.slice(0, 10) : "")
        setFormError(null)
    }

    const submitQuote = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!quoteTarget) return
        const amount = Number(premium)
        if (!Number.isFinite(amount) || amount <= 0) {
            setFormError('Enter a valid positive annual premium.')
            return
        }
        if (!coverageType.trim()) {
            setFormError('Enter the cover type.')
            return
        }

        setUpdating(quoteTarget.id)
        setFormError(null)
        try {
            const updated = await updateInsuranceStatus(
                quoteTarget.id,
                'QUOTED',
                amount,
                coverageType.trim(),
                expiryDate ? new Date(`${expiryDate}T23:59:59`).toISOString() : undefined,
            )
            mergeUpdatedQuote(updated)
            setQuoteTarget(null)
        } catch (err) {
            setFormError(err instanceof Error ? err.message : 'Could not send quote.')
        } finally {
            setUpdating(null)
        }
    }

    if (authLoading) {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
    }

    const userName = profile?.firstName ? `${profile.firstName} ${profile.lastName || ""}` : (user?.email?.split('@')[0] || "User")
    const filtered = statusFilter === "ALL" ? quotes : quotes.filter(q => q.status === statusFilter)
    const totalPages = Math.ceil(total / limit)

    return (
        <div className="min-h-screen pt-20 pb-12">
            <div className="container mx-auto px-5 flex flex-col lg:flex-row gap-8">
                <DashboardSidebar role="insurance" userName={userName} userType="Insurance Partner" />

                <main className="flex-1 space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <h1 className="text-2xl font-black font-heading flex items-center gap-2"><ClipboardList className="text-primary" /> Insurance Quotes</h1>
                            <p className="text-sm text-[var(--text-muted)] mt-1">Enter the premium and cover before sending a quote. Accepted quotes are locked.</p>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            {["ALL", "PENDING", "QUOTED", "ACCEPTED", "EXPIRED", "REJECTED"].map(s => (
                                <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === s ? 'bg-primary text-white' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-white/10 hover:text-primary'}`}>
                                    {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="glass-card overflow-hidden border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-[var(--bg-input)] text-[var(--text-muted)] text-xs uppercase font-black tracking-widest">
                                    <tr><th className="px-6 py-4">Applicant</th><th className="px-6 py-4">Vehicle</th><th className="px-6 py-4 text-center">Driver</th><th className="px-6 py-4 text-center">NCB</th><th className="px-6 py-4 text-center">Convictions</th><th className="px-6 py-4">Premium</th><th className="px-6 py-4 text-center">Status</th><th className="px-6 py-4 text-right">Actions</th></tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-default)]/80">
                                    {loading ? <tr><td colSpan={8} className="px-6 py-12 text-center"><Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" /></td></tr> : filtered.length === 0 ? <tr><td colSpan={8} className="px-6 py-12 text-center text-[var(--text-muted)] italic">No quotes found.</td></tr> : filtered.map(quote => (
                                        <tr key={quote.id} className="hover:bg-[var(--bg-card)] transition-colors">
                                            <td className="px-6 py-4"><div className="font-bold">{quote.user?.firstName} {quote.user?.lastName}</div><div className="text-xs text-[var(--text-muted)]">{quote.user?.email}</div></td>
                                            <td className="px-6 py-4"><div className="text-sm">{quote.listing?.title || 'Unknown'}</div><div className="text-xs text-[var(--text-muted)]">{formatCurrency(quote.listing?.price || 0)}</div></td>
                                            <td className="px-6 py-4 text-center">{quote.driverAge}</td>
                                            <td className="px-6 py-4 text-center">{quote.ncbYears} yr</td>
                                            <td className="px-6 py-4 text-center">{quote.hasConvictions ? <span className="text-red-400 inline-flex items-center gap-1"><AlertCircle size={12} /> Yes</span> : <span className="text-emerald-400">No</span>}</td>
                                            <td className="px-6 py-4"><div className="font-bold">{quote.quotedPrice ? formatCurrency(quote.quotedPrice) : '—'}</div><div className="text-xs text-[var(--text-muted)]">{quote.coverageType || 'Not quoted'}</div></td>
                                            <td className="px-6 py-4 text-center"><span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${quote.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : quote.status === 'QUOTED' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : quote.status === 'ACCEPTED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : quote.status === 'EXPIRED' ? 'bg-gray-500/10 text-[var(--text-muted)] border-gray-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>{quote.status === 'PENDING' && <Clock size={10} />}{quote.status === 'ACCEPTED' && <CheckCircle size={10} />}{quote.status === 'REJECTED' && <XCircle size={10} />}{quote.status}</span></td>
                                            <td className="px-6 py-4 text-right">{updating === quote.id ? <Loader2 size={16} className="animate-spin text-primary inline" /> : quote.status === 'PENDING' || quote.status === 'QUOTED' ? <div className="flex gap-2 justify-end"><Button size="sm" className="bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white border border-blue-500/20 h-8 text-xs" onClick={() => openQuoteDialog(quote)}>{quote.status === 'QUOTED' ? 'Revise' : 'Quote'}</Button><Button size="sm" variant="outline" className="border-red-500/20 text-red-500 hover:bg-red-500/10 h-8 text-xs" onClick={() => void handleReject(quote.id)}>Reject</Button></div> : null}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {totalPages > 1 && <div className="p-4 border-t border-[var(--border-default)] flex justify-between items-center"><span className="text-sm text-[var(--text-muted)]">Page {page} of {totalPages} ({total} total)</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="text-xs">Previous</Button><Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="text-xs">Next</Button></div></div>}
                    </div>
                </main>
            </div>

            {quoteTarget && (
                <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Send insurance quote">
                    <form onSubmit={submitQuote} className="w-full max-w-lg glass-strong rounded-2xl border border-[var(--border-default)] p-6 shadow-2xl">
                        <div className="flex items-start justify-between gap-4 mb-6"><div><h2 className="text-xl font-black">Send Insurance Quote</h2><p className="text-sm text-[var(--text-muted)] mt-1">{quoteTarget.listing?.title || 'Vehicle'} · {quoteTarget.user?.firstName} {quoteTarget.user?.lastName}</p></div><button type="button" onClick={() => setQuoteTarget(null)} className="p-2 rounded-lg hover:bg-white/10" aria-label="Close"><X size={18} /></button></div>
                        <div className="space-y-4">
                            <div><label className="text-sm font-bold block mb-2">Annual premium (£)</label><Input type="number" min="0.01" step="0.01" value={premium} onChange={e => setPremium(e.target.value)} placeholder="e.g. 649.99" required /></div>
                            <div><label className="text-sm font-bold block mb-2">Cover type</label><Input value={coverageType} onChange={e => setCoverageType(e.target.value)} placeholder="e.g. Comprehensive" required /></div>
                            <div><label className="text-sm font-bold block mb-2">Quote expiry (optional)</label><Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} /></div>
                            {formError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{formError}</div>}
                        </div>
                        <div className="flex justify-end gap-3 mt-6"><Button type="button" variant="outline" onClick={() => setQuoteTarget(null)}>Cancel</Button><Button type="submit" disabled={updating === quoteTarget.id}>{updating === quoteTarget.id ? <><Loader2 size={15} className="animate-spin mr-2" />Sending…</> : 'Send Quote'}</Button></div>
                    </form>
                </div>
            )}
        </div>
    )
}
