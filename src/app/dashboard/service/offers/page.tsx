"use client"

import * as React from "react"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { Button } from "@/components/ui/Button"
import { useAuth } from "@/context/AuthContext"
import { formatTradePounds, getMyServiceOffers, tradeFeeBreakdown, tradeServiceCategoryLabel, withdrawServiceOffer, type MyServiceOffer } from "@/lib/tradexchangeApi"
import { AlertCircle, CheckCircle2, Gavel, Loader2, X } from "lucide-react"

const statusClass: Record<string, string> = {
    submitted: 'bg-blue-500/15 text-blue-300 border-blue-500/20',
    accepted: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20',
    declined: 'bg-red-500/15 text-red-300 border-red-500/20',
    withdrawn: 'bg-slate-500/15 text-slate-300 border-slate-500/20',
    expired: 'bg-amber-500/15 text-amber-300 border-amber-500/20',
}

export default function ServiceOffersPage() {
    const { user, profile, loading: authLoading } = useAuth()
    const [offers, setOffers] = React.useState<MyServiceOffer[]>([])
    const [loading, setLoading] = React.useState(true)
    const [busyId, setBusyId] = React.useState<string | null>(null)
    const [error, setError] = React.useState<string | null>(null)
    const [notice, setNotice] = React.useState<string | null>(null)

    const load = React.useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            setOffers(await getMyServiceOffers())
        } catch (err) {
            setOffers([])
            const message = err instanceof Error ? err.message : 'Could not load your quotes.'
            setError(message.includes('relation') || message.includes('schema cache')
                ? 'The TradeXchange quotes ledger is not enabled in this environment yet.'
                : message)
        } finally {
            setLoading(false)
        }
    }, [])

    React.useEffect(() => {
        if (!authLoading && user) void load()
    }, [authLoading, user, load])

    const withdraw = async (offerId: string) => {
        setBusyId(offerId)
        setError(null)
        setNotice(null)
        try {
            await withdrawServiceOffer(offerId)
            setNotice('Quote withdrawn.')
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not withdraw quote.')
        } finally {
            setBusyId(null)
        }
    }

    const userName = profile?.firstName ? `${profile.firstName} ${profile.lastName || ''}` : (user?.email?.split('@')[0] || 'User')

    if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>

    return (
        <div className="min-h-screen pt-20 pb-12">
            <div className="container mx-auto px-5 flex flex-col lg:flex-row gap-8">
                <DashboardSidebar role="provider" userName={userName} userType="Service Provider" />
                <main className="flex-1 min-w-0 space-y-6">
                    <div>
                        <p className="text-xs uppercase tracking-[0.2em] text-primary font-bold mb-2">TradeXchange</p>
                        <h1 className="text-3xl font-bold font-heading">My Quotes</h1>
                        <p className="text-sm text-[var(--text-muted)] mt-2">Quotes your business has submitted on available service jobs.</p>
                    </div>

                    {error && <div className="glass-card p-4 border border-red-500/30 text-red-300 flex items-start gap-3"><AlertCircle size={18} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
                    {notice && <div className="glass-card p-4 border border-emerald-500/30 text-emerald-300 flex items-center gap-3"><CheckCircle2 size={18} /><span>{notice}</span></div>}

                    {loading ? (
                        <div className="glass-card p-12 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>
                    ) : offers.length === 0 ? (
                        <div className="glass-card p-12 text-center text-[var(--text-muted)]">
                            <Gavel size={56} className="mx-auto mb-4 opacity-30" />
                            <p className="text-xl font-medium">No quotes yet</p>
                            <p className="text-sm mt-2">Quotes you send from Available Jobs will appear here.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {offers.map(offer => {
                                const calc = tradeFeeBreakdown(offer.amount_pence)
                                return (
                                    <article key={offer.id} className="glass-card p-6">
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div>
                                                <h2 className="font-bold text-lg">{offer.service_jobs?.title || 'Service job'}</h2>
                                                <p className="text-xs text-[var(--text-muted)] mt-1">{offer.service_jobs?.category ? tradeServiceCategoryLabel[offer.service_jobs.category] : 'TradeXchange'} · sent {new Date(offer.created_at).toLocaleDateString('en-GB')}</p>
                                            </div>
                                            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${statusClass[offer.status] || statusClass.submitted}`}>{offer.status.replaceAll('_', ' ')}</span>
                                        </div>
                                        <p className="text-sm mt-4">Your quote: <strong>{formatTradePounds(offer.amount_pence)}</strong></p>
                                        <p className="text-xs text-[var(--text-muted)] mt-1">Estimated net after 9% CarMazium service fee: {formatTradePounds(calc.net)}.</p>
                                        {offer.message && <p className="text-sm text-[var(--text-muted)] mt-3">{offer.message}</p>}
                                        {offer.status === 'submitted' && (
                                            <Button size="sm" variant="outline" className="mt-4" disabled={busyId === offer.id} onClick={() => withdraw(offer.id)}>
                                                {busyId === offer.id ? <Loader2 size={14} className="mr-2 animate-spin" /> : <X size={14} className="mr-2" />} Withdraw quote
                                            </Button>
                                        )}
                                    </article>
                                )
                            })}
                        </div>
                    )}
                </main>
            </div>
        </div>
    )
}
