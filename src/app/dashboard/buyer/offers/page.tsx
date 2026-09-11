"use client"

import * as React from "react"
import { getMyOffers, withdrawOffer, respondToCounterOffer, type Offer } from "@/lib/listingApi"
import { getMyDeliveryRequests, createDeliveryRequest, cancelDeliveryRequest, completeDeliveryRequest, type DeliveryRequest, type DeliveryStatus } from "@/lib/deliveryApi"
import { ArrangeDelivery } from "@/components/services/ArrangeDelivery"
import { createChatRoom } from "@/lib/chatApi"
import { useRouter } from "next/navigation"
import { Loader2, AlertTriangle, Tag, Clock, CheckCircle, XCircle, Eye, Truck } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { useAuth } from "@/context/AuthContext"

function StatusBadge({ status }: { status: Offer['status'] }) {
    const styles: Record<string, string> = {
        PENDING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        ACCEPTED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        REJECTED: 'bg-red-500/15 text-red-300 border-red-500/30',
        WITHDRAWN: 'bg-gray-500/15 text-[var(--text-muted)] border-gray-500/30',
        COUNTERED: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    }
    const icons: Record<string, React.ReactNode> = {
        PENDING: <Clock size={11} />,
        ACCEPTED: <CheckCircle size={11} />,
        REJECTED: <XCircle size={11} />,
        WITHDRAWN: <XCircle size={11} />,
        COUNTERED: <Clock size={11} />,
    }
    return <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${styles[status] ?? ''}`}>{icons[status]} {status}</span>
}

function StatusMessage({ status, amount, counterAmount }: { status: Offer['status'], amount: string | number, counterAmount?: string | number | null }) {
    const formatted = `£${Number(amount).toLocaleString('en-GB')}`
    const counterFormatted = counterAmount ? `£${Number(counterAmount).toLocaleString('en-GB')}` : null
    if (status === 'PENDING') return <p className="text-xs text-amber-300 mt-1.5">Awaiting seller response for your offer of {formatted}</p>
    if (status === 'ACCEPTED') return <p className="text-xs text-emerald-300 mt-1.5">Your offer of {formatted} was accepted! Contact the seller to complete the purchase.</p>
    if (status === 'REJECTED') return <p className="text-xs text-red-300 mt-1.5">Your offer of {formatted} was declined. You may visit the listing to make a new offer.</p>
    if (status === 'COUNTERED' && counterFormatted) return <p className="text-xs text-blue-300 mt-1.5">The seller countered with <strong>{counterFormatted}</strong>. Accept or make a new offer.</p>
    return null
}

function StatusDeliveryBadge({ status }: { status: DeliveryStatus }) {
    const styles: Record<DeliveryStatus, string> = {
        PENDING: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
        ACCEPTED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
        DECLINED: 'bg-red-500/15 text-red-300 border-red-500/30',
        CANCELLED: 'bg-gray-500/15 text-[var(--text-muted)] border-gray-500/30',
        COMPLETED: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    }
    const labels: Record<DeliveryStatus, string> = {
        PENDING: 'Delivery Requested · Awaiting confirmation', ACCEPTED: 'Delivery Confirmed', DECLINED: 'Delivery Declined', CANCELLED: 'Delivery Cancelled', COMPLETED: 'Delivered',
    }
    return <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${styles[status]}`}><Truck size={11} /> {labels[status]}</span>
}

interface DeliveryFormListing { id: string; latitude?: number | null; longitude?: number | null; deliveryPricePerMile?: number | string | null; deliveryMaxMiles?: number | null }

function DeliveryRequestForm({ listing, onSuccess }: { listing: DeliveryFormListing, onSuccess: () => void }) {
    const [street, setStreet] = React.useState('')
    const [city, setCity] = React.useState('')
    const [postcode, setPostcode] = React.useState('')
    const [notes, setNotes] = React.useState('')
    const [submitting, setSubmitting] = React.useState(false)
    const [costPreview, setCostPreview] = React.useState<{ distanceMiles: number; estimatedCostGbp: number } | null>(null)
    const [postcodeError, setPostcodeError] = React.useState<string | null>(null)
    const [showForm, setShowForm] = React.useState(false)
    const [formError, setFormError] = React.useState<string | null>(null)
    const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
    const pricePerMile = listing.deliveryPricePerMile ? Number(listing.deliveryPricePerMile) : 0

    const handlePostcodeChange = (val: string) => {
        const upper = val.toUpperCase(); setPostcode(upper); setPostcodeError(null); setCostPreview(null)
        if (debounceTimer.current) clearTimeout(debounceTimer.current)
        if (upper.length < 3) return
        debounceTimer.current = setTimeout(async () => {
            if (!listing.latitude || !listing.longitude) return
            try {
                const params = new URLSearchParams({ originLat: String(listing.latitude), originLng: String(listing.longitude), postcode: upper, pricePerMile: String(pricePerMile) })
                const res = await fetch(`/api/delivery-distance?${params.toString()}`); const data = await res.json()
                if (!res.ok) { setPostcodeError('Enter a valid UK postcode'); return }
                setCostPreview(data)
            } catch { setPostcodeError('Unable to estimate cost — check your postcode') }
        }, 600)
    }

    const outsideRadius = listing.deliveryMaxMiles && costPreview && costPreview.distanceMiles > listing.deliveryMaxMiles
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!street.trim() || !city.trim() || !postcode.trim()) { setFormError('Please fill in street, city, and postcode.'); return }
        if (outsideRadius) return
        setSubmitting(true); setFormError(null)
        try {
            await createDeliveryRequest({ listingId: listing.id, deliveryAddress: { street: street.trim(), city: city.trim(), postcode: postcode.trim() }, deliveryNotes: notes.trim() || undefined })
            onSuccess(); setShowForm(false)
        } catch (err: any) { setFormError(err.message || 'Failed to submit delivery request') }
        finally { setSubmitting(false) }
    }

    if (!showForm) return <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors font-bold"><Truck size={12} /> Add delivery request</button>

    return (
        <form onSubmit={handleSubmit} className="space-y-2 mt-2">
            <p className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1.5"><Truck size={12} /> Delivery Request</p>
            {formError && <p className="text-xs text-red-400">{formError}</p>}
            <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2"><input type="text" placeholder="Street address" value={street} onChange={(e) => setStreet(e.target.value)} className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50 placeholder:text-[var(--text-secondary)] transition-colors" /></div>
                <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} className="bg-[var(--bg-input)] border border-[var(--border-default)] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50 placeholder:text-[var(--text-secondary)] transition-colors" />
                <div>
                    <input type="text" placeholder="Postcode" value={postcode} onChange={(e) => handlePostcodeChange(e.target.value)} className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50 placeholder:text-[var(--text-secondary)] transition-colors uppercase" />
                    {postcodeError && <p className="text-xs text-red-400 mt-0.5">{postcodeError}</p>}
                    {outsideRadius && <p className="text-xs text-red-400 mt-0.5">Delivery not available — outside seller&apos;s {listing.deliveryMaxMiles} mile radius.</p>}
                    {costPreview && !outsideRadius && <p className="text-xs text-emerald-400 mt-0.5">{pricePerMile > 0 ? `Estimated cost: £${costPreview.estimatedCostGbp} (${costPreview.distanceMiles} mi)` : `Distance: ${costPreview.distanceMiles} mi · Cost: TBD`}</p>}
                    {!costPreview && !postcodeError && postcode.length >= 3 && <p className="text-xs text-[var(--text-muted)] mt-0.5">Estimating cost...</p>}
                </div>
                <div className="col-span-2"><textarea placeholder="Delivery notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] text-xs rounded-lg px-3 py-2 focus:outline-none focus:border-primary/50 placeholder:text-[var(--text-secondary)] transition-colors resize-none" /></div>
            </div>
            <div className="flex items-center gap-2">
                <button type="submit" disabled={submitting || !!outsideRadius} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50">{submitting ? <Loader2 size={11} className="animate-spin" /> : <Truck size={11} />}{submitting ? 'Submitting...' : 'Request Delivery'}</button>
                <button type="button" onClick={() => setShowForm(false)} className="text-xs text-[var(--text-muted)] dark:hover:text-white transition-colors">Cancel</button>
            </div>
        </form>
    )
}

export default function BuyerOffersPage() {
    const { user, profile, loading: authLoading } = useAuth()
    const [offers, setOffers] = React.useState<Offer[]>([])
    const [myDeliveryRequests, setMyDeliveryRequests] = React.useState<DeliveryRequest[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [startingChat, setStartingChat] = React.useState<string | null>(null)
    const [withdrawing, setWithdrawing] = React.useState<string | null>(null)
    const [accepting, setAccepting] = React.useState<string | null>(null)
    const [declining, setDeclining] = React.useState<string | null>(null)
    const router = useRouter()
    const refreshDeliveryRequests = React.useCallback(() => { getMyDeliveryRequests().then(setMyDeliveryRequests).catch(console.error) }, [])

    React.useEffect(() => {
        const load = async () => {
            if (!user) return
            try { setLoading(true); const data = await getMyOffers(); setOffers(data); getMyDeliveryRequests().then(setMyDeliveryRequests).catch(console.error) }
            catch (err: any) { setError(err.message || "Failed to load offers") }
            finally { setLoading(false) }
        }
        if (!authLoading) load()
    }, [user, authLoading])

    const handleMessageSeller = async (sellerId: string | undefined, listingId: string) => { if (!sellerId) { alert("Seller information is currently unavailable."); return } setStartingChat(listingId); try { const room = await createChatRoom(sellerId, listingId); router.push(`/dashboard/buyer/messages?room=${room.id}`) } catch (err: any) { console.error("Failed to start chat:", err); alert(err.message || "Failed to start chat.") } finally { setStartingChat(null) } }
    const handleWithdraw = async (offerId: string) => { if (!confirm("Are you sure you want to withdraw this offer? This action cannot be undone.")) return; setWithdrawing(offerId); try { await withdrawOffer(offerId); setOffers(prev => prev.map(o => o.id === offerId ? { ...o, status: 'WITHDRAWN' } : o)) } catch (err: any) { alert(err.message || "Failed to withdraw offer.") } finally { setWithdrawing(null) } }
    const handleAcceptCounter = async (offerId: string) => { if (!confirm("Accept the seller's counter offer? You can then chat with the seller to finalize the purchase.")) return; setAccepting(offerId); try { const updated = await respondToCounterOffer(offerId, 'ACCEPTED'); setOffers(prev => prev.map(o => o.id === offerId ? { ...o, ...updated } : o)) } catch (err: any) { alert(err.message || "Failed to accept counter offer.") } finally { setAccepting(null) } }
    const handleDeclineCounter = async (offerId: string) => { if (!confirm("Are you sure you want to decline this counter offer?")) return; setDeclining(offerId); try { await respondToCounterOffer(offerId, 'REJECTED'); setOffers(prev => prev.map(o => o.id === offerId ? { ...o, status: 'REJECTED' } : o)) } catch (err: any) { alert(err.message || "Failed to decline counter offer.") } finally { setDeclining(null) } }
    const handleCancelDelivery = async (deliveryId: string) => { try { await cancelDeliveryRequest(deliveryId); refreshDeliveryRequests() } catch (err) { console.error(err) } }
    const handleCompleteDelivery = async (deliveryId: string) => { try { await completeDeliveryRequest(deliveryId); refreshDeliveryRequests() } catch (err) { console.error(err) } }

    if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
    const userName = profile?.firstName ? `${profile.firstName} ${profile.lastName || ""}` : (user?.email?.split('@')[0] || "User")

    return (
        <div className="min-h-screen pt-20 pb-12"><div className="container mx-auto px-5 flex flex-col lg:flex-row gap-8"><DashboardSidebar role="buyer" userName={userName} userType={profile?.role ? `${profile.role} Account` : "Buyer Account"} /><main className="flex-1 space-y-6">
            <div className="flex justify-between items-center mb-6"><h1 className="text-3xl font-bold font-heading flex items-center gap-3"><Tag className="text-primary" size={28} /> My Offers</h1><Link href="/search" className="bg-primary text-white font-bold py-2.5 px-6 rounded-lg shadow-neon hover:scale-105 transition-all flex items-center gap-2">Browse Cars</Link></div>
            {error && <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 flex items-center gap-3 text-red-400"><AlertTriangle size={20} /><span>{error}</span></div>}
            <div className="glass-card overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left"><thead className="bg-[var(--bg-input)] text-[var(--text-muted)] text-xs uppercase font-bold tracking-wider"><tr><th className="px-6 py-5">Vehicle</th><th className="px-6 py-5">Status</th><th className="px-6 py-5">Offer Amount</th><th className="px-6 py-5">Date</th><th className="px-6 py-5 text-right">Actions</th></tr></thead><tbody className="divide-y divide-[var(--border-default)]">
                {loading ? <tr><td colSpan={5} className="px-6 py-16 text-center"><Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" /><p className="text-[var(--text-muted)] font-medium">Loading offers...</p></td></tr> : offers.length === 0 && !error ? <tr><td colSpan={5} className="px-6 py-16 text-center"><Tag className="w-12 h-12 text-[var(--text-secondary)] mx-auto mb-4" /><h2 className="text-xl font-bold mb-2">No Offers Yet</h2><p className="text-[var(--text-muted)] mb-6 text-sm">Browse listings with offer ranges and make your first offer.</p><Link href="/search"><button className="bg-[var(--bg-card)] border border-[var(--border-default)] font-bold px-6 py-2.5 rounded-lg hover:bg-[var(--bg-card-hover)] transition-colors">Browse Cars</button></Link></td></tr> : offers.map((offer) => {
                    const listing = offer.listing; const image = listing?.images?.[0] ?? "/assets/images/featured-sports.png"; const slug = listing?.slug ?? ""; const deliveryReq = myDeliveryRequests.find(r => r.listingId === listing?.id); const showDeliveryCTA = listing?.deliveryAvailable && (!deliveryReq || deliveryReq.status === 'DECLINED' || deliveryReq.status === 'CANCELLED')
                    return <React.Fragment key={offer.id}>
                        <tr className="hover:bg-[var(--bg-card)] transition-colors group"><td className="px-6 py-5"><div className="flex items-center gap-4"><Link href={`/buy-cars/${slug}`} className="shrink-0 relative w-16 h-12 rounded object-cover overflow-hidden bg-[var(--bg-input)] border border-[var(--border-default)] group-hover:border-primary/50 transition-colors"><Image src={image} alt={listing?.title ?? ""} fill className="object-cover" /></Link><div><Link href={`/buy-cars/${slug}`} className="font-bold text-[15px] hover:text-primary transition-colors block mb-1">{listing?.title ?? "Listing"}</Link><div className="text-xs text-[var(--text-muted)]">{listing?.year} • {listing?.make} {listing?.model}</div></div></div></td>
                        <td className="px-6 py-5"><StatusBadge status={offer.status} /></td><td className="px-6 py-5"><div className="font-mono text-lg font-bold mb-1">£{Number(offer.status === 'ACCEPTED' ? (offer.finalAmount ?? offer.counterAmount ?? offer.amount) : offer.amount).toLocaleString('en-GB')}</div>{offer.status === 'ACCEPTED' && <div className="text-xs text-emerald-400 font-bold mt-0.5">AGREED PRICE</div>}{offer.status === 'COUNTERED' && offer.counterAmount && <div className="text-xs text-blue-400 font-bold mt-0.5">COUNTER: £{Number(offer.counterAmount).toLocaleString('en-GB')}</div>}{listing?.price && <div className="text-xs text-[var(--text-muted)] uppercase tracking-widest font-semibold mt-0.5">ASKING: £{Number(listing.price).toLocaleString('en-GB')}</div>}</td>
                        <td className="px-6 py-5"><div className="text-sm font-medium">{new Date(offer.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div><div className="text-xs text-[var(--text-muted)] mt-1">{new Date(offer.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div></td>
                        <td className="px-6 py-5 text-right"><div className="flex items-center justify-end gap-2">{offer.status === 'COUNTERED' && <div className="flex items-center gap-1"><button onClick={() => handleAcceptCounter(offer.id)} disabled={accepting === offer.id || declining === offer.id} className="inline-flex items-center justify-center h-10 px-3 text-sm font-bold text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-xl transition-all hover:scale-105 disabled:opacity-50">{accepting === offer.id ? <Loader2 size={16} className="animate-spin" /> : "Accept"}</button><button onClick={() => handleDeclineCounter(offer.id)} disabled={accepting === offer.id || declining === offer.id} className="inline-flex items-center justify-center h-10 px-3 text-sm font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-all hover:scale-105 disabled:opacity-50">{declining === offer.id ? <Loader2 size={16} className="animate-spin" /> : "Decline"}</button></div>}{offer.status === 'PENDING' && <button disabled={withdrawing === offer.id} className="inline-flex items-center justify-center h-10 px-3 text-sm font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-all hover:scale-105 disabled:opacity-50" onClick={() => handleWithdraw(offer.id)}>{withdrawing === offer.id ? <Loader2 size={16} className="animate-spin" /> : "Cancel"}</button>}<button onClick={() => handleMessageSeller(offer.listing?.sellerId, offer.listing?.id || "")} disabled={startingChat === offer.listing?.id} className="inline-flex items-center justify-center h-10 px-3 text-sm font-bold text-blue-400 dark:hover:text-white hover:bg-white/10 rounded-xl transition-all hover:scale-105 disabled:opacity-50">{startingChat === offer.listing?.id ? <Loader2 size={16} className="animate-spin" /> : "Message"}</button><Link href={`/buy-cars/${slug}`} className="inline-flex items-center justify-center w-10 h-10 text-[var(--text-muted)] dark:hover:text-white hover:bg-white/10 rounded-xl transition-all hover:scale-105"><Eye size={18} /></Link></div></td></tr>
                        {offer.status === 'ACCEPTED' && <tr className="bg-[var(--bg-input)]"><td colSpan={5} className="px-6 py-3 border-t border-[var(--border-default)]"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><p className="text-xs text-[var(--text-muted)]">Need it moved? Approved transporters quote the route and you pay CarMazium, not the driver.</p><ArrangeDelivery offerId={offer.id} compact /></div></td></tr>}
                        {listing?.deliveryAvailable && <tr className="bg-[var(--bg-input)]"><td colSpan={5} className="px-6 py-3 border-t border-[var(--border-default)]">{deliveryReq && deliveryReq.status !== 'DECLINED' && deliveryReq.status !== 'CANCELLED' ? <div className="flex items-center justify-between"><StatusDeliveryBadge status={deliveryReq.status} />{deliveryReq.status === 'PENDING' && <button onClick={() => handleCancelDelivery(deliveryReq.id)} className="text-xs text-[var(--text-muted)] dark:hover:text-white transition-colors underline">Cancel request</button>}{deliveryReq.status === 'ACCEPTED' && <button onClick={() => handleCompleteDelivery(deliveryReq.id)} className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors underline">Mark as received</button>}</div> : showDeliveryCTA ? <DeliveryRequestForm listing={{ id: listing.id, latitude: listing.latitude, longitude: listing.longitude, deliveryPricePerMile: listing.deliveryPricePerMile, deliveryMaxMiles: listing.deliveryMaxMiles }} onSuccess={refreshDeliveryRequests} /> : null}</td></tr>}
                    </React.Fragment>
                })}
            </tbody></table></div></div>
        </main></div></div>
    )
}
