"use client"

import * as React from "react"
import Link from "next/link"
import { CheckCircle2, Loader2, Shield, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { useAuth } from "@/context/AuthContext"
import { getListings, type Listing } from "@/lib/listingApi"
import {
    acceptInsuranceQuote,
    formatCurrency,
    getInsuranceProviders,
    getMyInsuranceQuotes,
    requestInsuranceQuote,
    type InsuranceProvider,
    type InsuranceQuote,
} from "@/lib/partnerApi"

export default function InsurancePage() {
    const { user, loading: authLoading } = useAuth()
    const [providers, setProviders] = React.useState<InsuranceProvider[]>([])
    const [listings, setListings] = React.useState<Listing[]>([])
    const [quotes, setQuotes] = React.useState<InsuranceQuote[]>([])
    const [listingId, setListingId] = React.useState("")
    const [partnerId, setPartnerId] = React.useState("")
    const [driverAge, setDriverAge] = React.useState("30")
    const [ncbYears, setNcbYears] = React.useState("0")
    const [hasConvictions, setHasConvictions] = React.useState(false)
    const [loading, setLoading] = React.useState(true)
    const [busy, setBusy] = React.useState<string | null>(null)
    const [error, setError] = React.useState<string | null>(null)
    const [notice, setNotice] = React.useState<string | null>(null)

    const load = React.useCallback(async () => {
        if (!user) return
        setLoading(true)
        setError(null)
        try {
            const [providerRows, listingRows, quoteRows] = await Promise.all([
                getInsuranceProviders(),
                getListings({ listingType: 'CLASSIFIED', limit: 50 }),
                getMyInsuranceQuotes(1, 100),
            ])
            setProviders(providerRows)
            setListings(listingRows.data || [])
            setQuotes(quoteRows.data || [])
            if (!partnerId && providerRows[0]) setPartnerId(providerRows[0].id)

            if (typeof window !== 'undefined') {
                const requested = new URLSearchParams(window.location.search).get('listingId')
                if (requested && listingRows.data.some(vehicle => vehicle.id === requested)) setListingId(requested)
                else if (!listingId && listingRows.data[0]) setListingId(listingRows.data[0].id)
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load insurance options.')
        } finally {
            setLoading(false)
        }
    }, [user, listingId, partnerId])

    React.useEffect(() => {
        if (!authLoading && user) void load()
        if (!authLoading && !user) setLoading(false)
    }, [authLoading, user])

    const submit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (!listingId || !partnerId) {
            setError('Choose a vehicle and an insurance provider.')
            return
        }
        const age = Number(driverAge)
        const ncb = Number(ncbYears)
        if (!Number.isInteger(age) || age < 17 || !Number.isInteger(ncb) || ncb < 0) {
            setError('Enter a valid driver age and no-claims period.')
            return
        }
        setBusy('request')
        setError(null)
        setNotice(null)
        try {
            await requestInsuranceQuote({ listingId, partnerId, driverAge: age, ncbYears: ncb, hasConvictions })
            setNotice('Insurance quote request sent securely to the selected provider.')
            await load()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not request insurance quote.')
        } finally {
            setBusy(null)
        }
    }

    const accept = async (quoteId: string) => {
        if (!window.confirm('Accept this insurance quote? The policy itself is arranged with the insurance provider.')) return
        setBusy(quoteId)
        setError(null)
        try {
            const updated = await acceptInsuranceQuote(quoteId)
            setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, ...updated } : q))
            setNotice('Quote accepted. Contact the provider to complete the policy setup and payment directly with them.')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not accept this insurance quote.')
        } finally {
            setBusy(null)
        }
    }

    if (authLoading || loading) {
        return <div className="min-h-screen pt-28 flex justify-center"><Loader2 className="animate-spin text-primary" size={36} /></div>
    }

    if (!user) {
        return (
            <div className="min-h-screen pt-28 pb-20 container mx-auto px-5">
                <div className="max-w-xl mx-auto glass-strong rounded-3xl p-10 text-center">
                    <Shield size={48} className="mx-auto text-primary mb-4" />
                    <h1 className="text-3xl font-black mb-3">Vehicle Insurance</h1>
                    <p className="text-[var(--text-muted)] mb-6">Sign in to request private quotes from approved insurance providers.</p>
                    <Button asChild><Link href="/auth/login?redirect=%2Finsurance">Sign in to continue</Link></Button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen pt-24 pb-20">
            <div className="container mx-auto px-5 max-w-6xl">
                <div className="text-center mb-10">
                    <Shield className="mx-auto text-primary mb-4" size={46} />
                    <h1 className="text-4xl font-black font-heading">Vehicle Insurance Quotes</h1>
                    <p className="text-[var(--text-muted)] mt-3 max-w-2xl mx-auto">Request a quote from an approved insurance provider. CarMazium introduces you to the provider; the insurance policy and premium payment are arranged directly with that provider.</p>
                </div>

                {error && <div className="mb-6 border border-red-500/30 bg-red-500/10 text-red-300 rounded-xl p-4">{error}</div>}
                {notice && <div className="mb-6 border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 rounded-xl p-4 flex gap-2"><CheckCircle2 size={18} />{notice}</div>}

                <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-8">
                    <form onSubmit={submit} className="glass-card rounded-2xl p-6 space-y-5 h-fit">
                        <div><h2 className="text-xl font-black">Request a quote</h2><p className="text-sm text-[var(--text-muted)] mt-1">Your details go only to the provider you select.</p></div>
                        <div><label className="text-sm font-bold block mb-2">Vehicle</label><select value={listingId} onChange={e => setListingId(e.target.value)} className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] px-3"><option value="">Choose vehicle</option>{listings.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.title}</option>)}</select></div>
                        <div><label className="text-sm font-bold block mb-2">Insurance provider</label><select value={partnerId} onChange={e => setPartnerId(e.target.value)} className="w-full h-11 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)] px-3"><option value="">Choose provider</option>{providers.map(provider => <option key={provider.id} value={provider.id}>{provider.companyName}</option>)}</select>{providers.length === 0 && <p className="text-xs text-amber-400 mt-2">No approved insurance providers are currently enabled.</p>}</div>
                        <div className="grid grid-cols-2 gap-4"><div><label className="text-sm font-bold block mb-2">Driver age</label><Input type="number" min="17" value={driverAge} onChange={e => setDriverAge(e.target.value)} /></div><div><label className="text-sm font-bold block mb-2">No-claims years</label><Input type="number" min="0" value={ncbYears} onChange={e => setNcbYears(e.target.value)} /></div></div>
                        <label className="flex items-center gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-input)] p-4"><input type="checkbox" checked={hasConvictions} onChange={e => setHasConvictions(e.target.checked)} /><span className="text-sm">I have driving convictions to declare</span></label>
                        <Button type="submit" className="w-full" disabled={busy === 'request' || !providers.length || !listings.length}>{busy === 'request' ? <><Loader2 className="animate-spin mr-2" size={16} />Sending…</> : 'Request Quote'}</Button>
                    </form>

                    <div className="space-y-4">
                        <h2 className="text-xl font-black">My insurance requests</h2>
                        {quotes.length === 0 ? <div className="glass-card rounded-2xl p-10 text-center text-[var(--text-muted)]">You have not requested an insurance quote yet.</div> : quotes.map(quote => (
                            <article key={quote.id} className="glass-card rounded-2xl p-5">
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h3 className="font-black">{quote.listing?.title || 'Vehicle'}</h3>{quote.status === 'ACCEPTED' && <ShieldCheck className="text-emerald-400" size={17} />}</div><p className="text-sm text-[var(--text-muted)] mt-1">{quote.partner?.companyName || 'Insurance provider'}</p></div><span className="text-xs font-bold uppercase tracking-wide rounded-full border border-[var(--border-default)] px-3 py-1 h-fit">{quote.status}</span></div>
                                {quote.status === 'QUOTED' || quote.status === 'ACCEPTED' ? <div className="mt-5 pt-4 border-t border-[var(--border-default)] flex flex-col sm:flex-row sm:items-end justify-between gap-4"><div><p className="text-xs text-[var(--text-muted)]">Annual premium</p><p className="text-2xl font-black text-emerald-400">{quote.quotedPrice ? formatCurrency(quote.quotedPrice) : '—'}</p><p className="text-sm text-[var(--text-secondary)]">{quote.coverageType || 'Cover details pending'}</p>{quote.expiryDate && <p className="text-xs text-[var(--text-muted)] mt-1">Valid until {new Date(quote.expiryDate).toLocaleDateString('en-GB')}</p>}</div>{quote.status === 'QUOTED' && <Button onClick={() => void accept(quote.id)} disabled={busy === quote.id}>{busy === quote.id ? <Loader2 size={16} className="animate-spin" /> : 'Accept Quote'}</Button>}</div> : <p className="text-sm text-[var(--text-muted)] mt-4">The provider has not supplied a premium yet.</p>}
                            </article>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
