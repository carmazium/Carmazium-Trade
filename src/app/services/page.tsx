"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { useAuth } from "@/context/AuthContext"
import {
    acceptServiceOffer,
    cancelServiceJob,
    formatTradePounds,
    getMyServiceJobs,
    getServiceJobOfferBoard,
    postServiceJob,
    poundsToPence,
    submitTradeLead,
    tradeServiceCategoryLabel,
    type LeadServiceCategory,
    type MyServiceJob,
    type ServiceOfferBoardRow,
    type TradeServiceCategory,
} from "@/lib/tradexchangeApi"
import { createTradeXchangeCheckout } from "@/lib/paymentApi"
import {
    PlusCircle, Briefcase, ArrowRight, Loader2, AlertCircle, CheckCircle2,
    Gavel, X, ShieldCheck, CreditCard,
} from "lucide-react"
import { GiTowTruck, GiMagnifyingGlass, GiRibbonMedal, GiMoneyStack, GiSpanner, GiUmbrella } from "react-icons/gi"

type Tab = 'services' | 'jobs' | 'post'

type ServiceCard = {
    category?: TradeServiceCategory
    title: string
    icon: React.ComponentType<{ size?: number }>
    desc: string
    color: string
    bg: string
    link?: string
    enabled: boolean
    action: string
}

const services: ServiceCard[] = [
    {
        category: 'delivery', title: "Vehicle Delivery", icon: GiTowTruck,
        desc: "Post a delivery or recovery route and receive private quotes from approved transport providers.",
        color: "text-blue-400", bg: "bg-blue-500/10", enabled: true, action: "Post a delivery job",
    },
    {
        category: 'inspection', title: "Car Inspection", icon: GiMagnifyingGlass,
        desc: "Request an independent vehicle inspection and compare quotes from approved inspection providers.",
        color: "text-emerald-400", bg: "bg-emerald-500/10", enabled: true, action: "Request an inspection",
    },
    {
        category: 'warranty', title: "Warranty Coverage", icon: GiRibbonMedal,
        desc: "Send a warranty enquiry to approved providers. Any policy is quoted and issued by the provider.",
        color: "text-purple-400", bg: "bg-purple-500/10", enabled: true, action: "Request warranty quotes",
    },
    {
        category: 'finance', title: "Vehicle Financing", icon: GiMoneyStack,
        desc: "Send a consented finance enquiry to approved finance providers without sharing it publicly.",
        color: "text-amber-400", bg: "bg-amber-500/10", enabled: true, action: "Make a finance enquiry",
    },
    {
        title: "Maintenance", icon: GiSpanner,
        desc: "Routine and specialist maintenance remains available through CarMazium's existing service-request flow.",
        color: "text-primary", bg: "bg-primary/10", link: "/dashboard/service/jobs", enabled: true, action: "Open service requests",
    },
    {
        title: "Insurance", icon: GiUmbrella,
        desc: "Use CarMazium's existing insurance journey for vehicle cover enquiries and quote options.",
        color: "text-cyan-400", bg: "bg-cyan-500/10", link: "/insurance", enabled: true, action: "Explore insurance",
    },
]

function formatJobLocation(job: MyServiceJob) {
    if (job.category === 'delivery') {
        return [job.collection_location, job.delivery_location].filter(Boolean).join(' → ') || 'Location supplied in request'
    }
    return job.collection_location || 'Location supplied in request'
}

function statusLabel(status: string) {
    return status.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function ServicesPage() {
    const { user, profile, loading: authLoading } = useAuth()
    const [activeTab, setActiveTab] = React.useState<Tab>('services')
    const [category, setCategory] = React.useState<TradeServiceCategory>('delivery')
    const [jobs, setJobs] = React.useState<MyServiceJob[]>([])
    const [jobsLoading, setJobsLoading] = React.useState(false)
    const [jobFilter, setJobFilter] = React.useState<'all' | 'delivery' | 'inspection'>('all')
    const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null)
    const [quotes, setQuotes] = React.useState<ServiceOfferBoardRow[]>([])
    const [quotesLoading, setQuotesLoading] = React.useState(false)
    const [busy, setBusy] = React.useState<string | null>(null)
    const [error, setError] = React.useState<string | null>(null)
    const [notice, setNotice] = React.useState<string | null>(null)

    const [title, setTitle] = React.useState('')
    const [description, setDescription] = React.useState('')
    const [budget, setBudget] = React.useState('')
    const [collection, setCollection] = React.useState('')
    const [delivery, setDelivery] = React.useState('')
    const [preferredDate, setPreferredDate] = React.useState('')
    const [vehicleLabel, setVehicleLabel] = React.useState('')
    const [registration, setRegistration] = React.useState('')
    const [contactPhone, setContactPhone] = React.useState('')
    const [contactEmail, setContactEmail] = React.useState('')
    const [consent, setConsent] = React.useState(false)

    React.useEffect(() => {
        if (profile?.phone && !contactPhone) setContactPhone(profile.phone)
        if (user?.email && !contactEmail) setContactEmail(user.email)
    }, [profile?.phone, user?.email])

    React.useEffect(() => {
        if (typeof window === 'undefined') return
        const params = new URLSearchParams(window.location.search)
        const requestedService = params.get('service') as TradeServiceCategory | null
        const requestedTab = params.get('tab') as Tab | null
        if (requestedService && ['delivery', 'inspection', 'finance', 'warranty'].includes(requestedService)) {
            setCategory(requestedService)
            setActiveTab('post')
        } else if (requestedTab && ['services', 'jobs', 'post'].includes(requestedTab)) {
            setActiveTab(requestedTab)
        }
    }, [])

    const loadJobs = React.useCallback(async () => {
        if (!user) {
            setJobs([])
            return
        }
        setJobsLoading(true)
        setError(null)
        try {
            setJobs(await getMyServiceJobs())
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not load your service jobs.')
        } finally {
            setJobsLoading(false)
        }
    }, [user])

    React.useEffect(() => {
        if (!authLoading && activeTab === 'jobs') void loadJobs()
    }, [authLoading, activeTab, loadJobs])

    const chooseService = (service: ServiceCard) => {
        if (service.link) return
        if (!service.category) return
        setCategory(service.category)
        setActiveTab('post')
        setError(null)
        setNotice(null)
    }

    const openQuotes = async (jobId: string) => {
        if (selectedJobId === jobId) {
            setSelectedJobId(null)
            setQuotes([])
            return
        }
        setSelectedJobId(jobId)
        setQuotesLoading(true)
        setError(null)
        try {
            setQuotes(await getServiceJobOfferBoard(jobId))
        } catch (err) {
            setQuotes([])
            setError(err instanceof Error ? err.message : 'Could not load quotes.')
        } finally {
            setQuotesLoading(false)
        }
    }

    const payJob = async (jobId: string) => {
        setBusy(`pay:${jobId}`)
        setError(null)
        try {
            const checkout = await createTradeXchangeCheckout(jobId)
            if (!checkout.url) throw new Error('Stripe did not return a payment page.')
            window.location.assign(checkout.url)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not open payment.')
            setBusy(null)
        }
    }

    const acceptQuote = async (jobId: string, offerId: string) => {
        setBusy(`quote:${offerId}`)
        setError(null)
        setNotice(null)
        try {
            await acceptServiceOffer(offerId)
            await loadJobs()
            setNotice('Quote accepted. Opening secure payment…')
            await payJob(jobId)
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not accept this quote.')
            setBusy(null)
        }
    }

    const cancelJob = async (jobId: string) => {
        if (!window.confirm('Cancel this service request?')) return
        setBusy(`cancel:${jobId}`)
        setError(null)
        try {
            await cancelServiceJob(jobId, 'Cancelled by customer')
            setNotice('Service request cancelled.')
            setSelectedJobId(null)
            await loadJobs()
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not cancel this request.')
        } finally {
            setBusy(null)
        }
    }

    const resetForm = () => {
        setTitle('')
        setDescription('')
        setBudget('')
        setCollection('')
        setDelivery('')
        setPreferredDate('')
        setVehicleLabel('')
        setRegistration('')
        setConsent(false)
    }

    const submitRequest = async (event: React.FormEvent) => {
        event.preventDefault()
        setError(null)
        setNotice(null)
        if (!user) {
            window.location.href = `/auth/login?redirect=${encodeURIComponent(`/services?service=${category}`)}`
            return
        }

        setBusy('post')
        try {
            if (category === 'delivery' || category === 'inspection') {
                if (title.trim().length < 3) throw new Error('Please add a clear job title.')
                if (description.trim().length < 10) throw new Error('Please describe the work required.')
                if (!collection.trim()) throw new Error(category === 'delivery' ? 'Please add the collection location.' : 'Please add the inspection location.')
                if (category === 'delivery' && !delivery.trim()) throw new Error('Please add the delivery location.')
                const budgetPence = budget.trim() ? poundsToPence(budget) : null
                if (budget.trim() && !budgetPence) throw new Error('Please enter a valid budget in pounds.')

                await postServiceJob({
                    category,
                    title: title.trim(),
                    description: description.trim(),
                    collectionLocation: collection.trim(),
                    deliveryLocation: category === 'delivery' ? delivery.trim() : undefined,
                    preferredDate: preferredDate || undefined,
                    budgetPence,
                    contactPhone: contactPhone.trim() || undefined,
                    vehicleLabel: vehicleLabel.trim() || undefined,
                })
                setNotice(`${tradeServiceCategoryLabel[category]} request posted. Approved providers can now send private quotes.`)
                resetForm()
                await loadJobs()
                setActiveTab('jobs')
            } else {
                if (!registration.trim()) throw new Error('Please enter the vehicle registration.')
                if (description.trim().length < 10) throw new Error('Please describe what you need from the provider.')
                if (!consent) throw new Error('Please confirm that CarMazium may share these contact details with approved providers for this enquiry.')
                if (!contactEmail.trim() && !contactPhone.trim()) throw new Error('Please provide an email address or phone number.')

                await submitTradeLead({
                    type: category as LeadServiceCategory,
                    registration: registration.trim().toUpperCase(),
                    vehicleDetails: { label: vehicleLabel.trim() || undefined },
                    enquiryDetails: { description: description.trim(), title: title.trim() || undefined },
                    contactName: profile ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim() : undefined,
                    contactEmail: contactEmail.trim() || undefined,
                    contactPhone: contactPhone.trim() || undefined,
                    contactConsent: true,
                })
                setNotice(`${tradeServiceCategoryLabel[category]} enquiry submitted securely to approved providers.`)
                resetForm()
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not submit your request.')
        } finally {
            setBusy(null)
        }
    }

    const visibleJobs = jobs.filter(job => jobFilter === 'all' || job.category === jobFilter)
    const isLead = category === 'finance' || category === 'warranty'

    return (
        <div className="min-h-screen pt-24 pb-20">
            <div className="container mx-auto px-5 mb-16 text-center">
                <h1 className="text-4xl md:text-5xl font-heading font-bold mb-4">Carmazium Service Hub</h1>
                <p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-10">
                    Find trusted professionals or find work. The all-in-one automotive marketplace.
                </p>

                <div className="flex justify-center mb-10 overflow-x-auto">
                    <div className="bg-[var(--bg-card)] p-1 rounded-full inline-flex border border-[var(--border-default)] shadow-lg min-w-max">
                        <button onClick={() => setActiveTab('services')} className={`px-6 md:px-8 py-3 rounded-full text-sm font-bold transition-all ${activeTab === 'services' ? 'bg-[var(--bg-card-hover)] shadow-sm' : 'text-[var(--text-muted)] hover:text-primary dark:hover:text-white'}`}>SERVICES</button>
                        <button onClick={() => setActiveTab('jobs')} className={`px-6 md:px-8 py-3 rounded-full text-sm font-bold transition-all ${activeTab === 'jobs' ? 'bg-primary text-white shadow-neon' : 'text-[var(--text-muted)] hover:text-primary dark:hover:text-white'}`}>
                            <span className="flex items-center gap-2"><Briefcase size={16} /> MY JOBS</span>
                        </button>
                        <button onClick={() => setActiveTab('post')} className={`px-6 md:px-8 py-3 rounded-full text-sm font-bold transition-all ${activeTab === 'post' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-[var(--text-muted)] hover:text-primary dark:hover:text-white'}`}>
                            <span className="flex items-center gap-2"><PlusCircle size={16} /> NEW REQUEST</span>
                        </button>
                    </div>
                </div>

                {error && <div className="max-w-4xl mx-auto mb-6 glass-card p-4 border border-red-500/30 text-red-300 text-left flex items-start gap-3"><AlertCircle size={18} className="mt-0.5 shrink-0" /><span>{error}</span></div>}
                {notice && <div className="max-w-4xl mx-auto mb-6 glass-card p-4 border border-emerald-500/30 text-emerald-300 text-left flex items-center gap-3"><CheckCircle2 size={18} className="shrink-0" /><span>{notice}</span></div>}

                <div className="min-h-[400px]">
                    {activeTab === 'services' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20 text-left">
                                {services.map((service) => {
                                    const Icon = service.icon
                                    const card = (
                                        <div className="glass-card p-8 group hover:bg-[var(--bg-card)] transition-colors duration-300 flex flex-col h-full relative overflow-hidden cursor-pointer">
                                            <div className={`w-14 h-14 ${service.bg} ${service.color} rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}><Icon size={28} /></div>
                                            <h3 className="text-xl font-bold mb-3 group-hover:text-primary transition-colors">{service.title}</h3>
                                            <p className="text-[var(--text-muted)] text-sm leading-relaxed mb-6 flex-grow">{service.desc}</p>
                                            <div className="pt-6 border-t border-[var(--border-default)] mt-auto flex items-center text-primary font-bold text-sm group-hover:translate-x-2 transition-transform">
                                                {service.action} <ArrowRight className="ml-2 w-4 h-4" />
                                            </div>
                                        </div>
                                    )
                                    return service.link ? <Link key={service.title} href={service.link}>{card}</Link> : <button key={service.title} type="button" className="text-left" onClick={() => chooseService(service)}>{card}</button>
                                })}
                            </div>
                        </div>
                    )}

                    {activeTab === 'jobs' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 text-left max-w-5xl mx-auto">
                            {!user && !authLoading ? (
                                <div className="glass-card p-10 text-center">
                                    <Briefcase size={48} className="mx-auto mb-4 text-primary opacity-70" />
                                    <h2 className="text-2xl font-bold mb-2">Sign in to see your service requests</h2>
                                    <p className="text-[var(--text-muted)] mb-6">Posted jobs, competing quotes, accepted providers and payment status are private to your account.</p>
                                    <Button asChild><Link href="/auth/login?redirect=%2Fservices%3Ftab%3Djobs">Sign in</Link></Button>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-8">
                                        <div><h2 className="text-2xl font-bold">My Service Jobs</h2><p className="text-sm text-[var(--text-muted)] mt-1">Only you can compare the providers competing for your request.</p></div>
                                        <select value={jobFilter} onChange={e => setJobFilter(e.target.value as typeof jobFilter)} className="bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg px-4 py-2 text-sm focus:outline-none">
                                            <option value="all">All Types</option><option value="delivery">Delivery</option><option value="inspection">Inspection</option>
                                        </select>
                                    </div>
                                    {jobsLoading ? <div className="glass-card p-12 flex justify-center"><Loader2 className="animate-spin text-primary" /></div> : visibleJobs.length === 0 ? (
                                        <div className="glass-card p-12 text-center text-[var(--text-muted)]"><Briefcase size={56} className="mx-auto mb-4 opacity-30" /><p className="text-xl font-medium">No service jobs yet</p><Button className="mt-5" onClick={() => setActiveTab('post')}>Create your first request</Button></div>
                                    ) : (
                                        <div className="space-y-4">
                                            {visibleJobs.map(job => (
                                                <article key={job.id} className="glass-card p-6">
                                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                                        <div className="min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2 mb-1"><h3 className="font-bold text-lg">{job.title}</h3><span className="text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-input)]">{statusLabel(job.status)}</span></div>
                                                            <p className="text-sm text-[var(--text-muted)]">{tradeServiceCategoryLabel[job.category]} · {formatJobLocation(job)}</p>
                                                            {job.vehicle_label && <p className="text-sm text-[var(--text-secondary)] mt-2">Vehicle: {job.vehicle_label}</p>}
                                                            <p className="text-sm text-[var(--text-muted)] mt-3">{job.description}</p>
                                                        </div>
                                                        <div className="md:text-right shrink-0">
                                                            {job.budget_pence ? <p className="text-xl font-bold text-emerald-400">{formatTradePounds(job.budget_pence)}</p> : <p className="text-sm text-[var(--text-muted)]">Open budget</p>}
                                                            <p className="text-xs text-[var(--text-muted)] mt-1">Posted {new Date(job.created_at).toLocaleDateString('en-GB')}</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-3 mt-5 pt-5 border-t border-[var(--border-default)]">
                                                        {job.status === 'open' && <Button size="sm" onClick={() => void openQuotes(job.id)} disabled={quotesLoading && selectedJobId === job.id}><Gavel size={14} className="mr-2" />{selectedJobId === job.id ? 'Hide quotes' : 'Compare quotes'}</Button>}
                                                        {job.status === 'awaiting_payment' && <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => void payJob(job.id)} disabled={busy === `pay:${job.id}`}><CreditCard size={14} className="mr-2" />{busy === `pay:${job.id}` ? 'Opening…' : `Pay ${formatTradePounds(job.agreed_amount_pence)}`}</Button>}
                                                        {['draft', 'open', 'awaiting_payment'].includes(job.status) && <Button size="sm" variant="outline" onClick={() => void cancelJob(job.id)} disabled={busy === `cancel:${job.id}`}><X size={14} className="mr-2" />Cancel</Button>}
                                                    </div>

                                                    {selectedJobId === job.id && (
                                                        <div className="mt-5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-input)] p-4">
                                                            <h4 className="font-bold mb-3">Private competing quotes</h4>
                                                            {quotesLoading ? <div className="py-6 flex justify-center"><Loader2 className="animate-spin text-primary" /></div> : quotes.length === 0 ? <p className="text-sm text-[var(--text-muted)] py-4">No providers have quoted yet.</p> : (
                                                                <div className="space-y-3">
                                                                    {quotes.map(quote => (
                                                                        <div key={quote.offer_id} className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-card)] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                                            <div><div className="flex items-center gap-2"><p className="font-bold">{quote.business_name}</p>{quote.verification_status === 'verified' && <ShieldCheck size={15} className="text-emerald-400" />}</div>{quote.message && <p className="text-sm text-[var(--text-muted)] mt-1">{quote.message}</p>}{quote.available_from && <p className="text-xs text-[var(--text-muted)] mt-1">Available from {new Date(quote.available_from).toLocaleDateString('en-GB')}</p>}</div>
                                                                            <div className="flex items-center gap-3 md:justify-end"><span className="font-bold text-xl text-emerald-400">{formatTradePounds(quote.amount_pence)}</span>{quote.status === 'submitted' && <Button size="sm" onClick={() => void acceptQuote(job.id, quote.offer_id)} disabled={busy === `quote:${quote.offer_id}`} >{busy === `quote:${quote.offer_id}` ? <Loader2 size={14} className="animate-spin" /> : 'Accept & pay'}</Button>}</div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                            <p className="text-xs text-[var(--text-muted)] mt-4">Provider contact details remain private until the selected quote is paid. TradeXchange service payments include CarMazium's 9% service fee within the agreed amount.</p>
                                                        </div>
                                                    )}
                                                </article>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    )}

                    {activeTab === 'post' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto text-left">
                            <div className="glass-strong p-8 rounded-2xl border border-[var(--border-default)]">
                                <h2 className="text-2xl font-bold mb-2 flex items-center gap-2"><PlusCircle className="text-emerald-500" /> {isLead ? 'Create a New Enquiry' : 'Create a New Request'}</h2>
                                <p className="text-sm text-[var(--text-muted)] mb-6">{isLead ? 'Your contact details are shared only with approved providers after you give consent.' : 'Approved providers see a redacted request and compete with private quotes.'}</p>
                                <form className="space-y-6" onSubmit={submitRequest}>
                                    <div className="space-y-2">
                                        <label className="text-sm font-bold text-[var(--text-secondary)]">Service Type</label>
                                        <select value={category} onChange={e => setCategory(e.target.value as TradeServiceCategory)} className="w-full h-10 rounded-md bg-[var(--bg-input)] border border-[var(--border-default)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50">
                                            <option value="delivery">Delivery & Recovery</option><option value="inspection">Vehicle Inspection</option><option value="finance">Vehicle Finance</option><option value="warranty">Vehicle Warranty</option>
                                        </select>
                                    </div>

                                    {isLead ? (
                                        <>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                <div className="space-y-2"><label className="text-sm font-bold text-[var(--text-secondary)]">Vehicle Registration</label><Input value={registration} onChange={e => setRegistration(e.target.value.toUpperCase())} placeholder="e.g. AB12 CDE" /></div>
                                                <div className="space-y-2"><label className="text-sm font-bold text-[var(--text-secondary)]">Vehicle</label><Input value={vehicleLabel} onChange={e => setVehicleLabel(e.target.value)} placeholder="e.g. 2021 BMW 320d" /></div>
                                            </div>
                                            <div className="space-y-2"><label className="text-sm font-bold text-[var(--text-secondary)]">What do you need?</label><textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full min-h-[120px] rounded-md bg-[var(--bg-input)] border border-[var(--border-default)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 custom-scrollbar resize-none" placeholder={category === 'finance' ? 'Tell approved finance providers what type of finance or stock funding you are looking for…' : 'Tell approved warranty providers what cover you need…'} /></div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6"><div className="space-y-2"><label className="text-sm font-bold text-[var(--text-secondary)]">Contact Email</label><Input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} /></div><div className="space-y-2"><label className="text-sm font-bold text-[var(--text-secondary)]">Contact Phone</label><Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} /></div></div>
                                            <label className="flex items-start gap-3 rounded-xl border border-[var(--border-default)] bg-[var(--bg-input)] p-4 cursor-pointer"><input type="checkbox" className="mt-1" checked={consent} onChange={e => setConsent(e.target.checked)} /><span className="text-sm text-[var(--text-secondary)]">I agree that CarMazium may share the contact details above with approved {category === 'finance' ? 'finance' : 'warranty'} providers solely so they can respond to this enquiry.</span></label>
                                        </>
                                    ) : (
                                        <>
                                            <div className="space-y-2"><label className="text-sm font-bold text-[var(--text-secondary)]">Job Title</label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder={category === 'delivery' ? 'e.g. Transport needed for Mercedes C-Class' : 'e.g. Pre-purchase inspection for Audi A4'} /></div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6"><div className="space-y-2"><label className="text-sm font-bold text-[var(--text-secondary)]">Vehicle</label><Input value={vehicleLabel} onChange={e => setVehicleLabel(e.target.value)} placeholder="e.g. 2020 Mercedes C-Class" /></div><div className="space-y-2"><label className="text-sm font-bold text-[var(--text-secondary)]">Budget Estimate</label><Input value={budget} onChange={e => setBudget(e.target.value)} placeholder="e.g. £300" /></div></div>
                                            <div className={`grid grid-cols-1 ${category === 'delivery' ? 'sm:grid-cols-2' : ''} gap-6`}><div className="space-y-2"><label className="text-sm font-bold text-[var(--text-secondary)]">{category === 'delivery' ? 'Collection Location' : 'Inspection Location'}</label><Input value={collection} onChange={e => setCollection(e.target.value)} placeholder="Postcode or town" /></div>{category === 'delivery' && <div className="space-y-2"><label className="text-sm font-bold text-[var(--text-secondary)]">Delivery Location</label><Input value={delivery} onChange={e => setDelivery(e.target.value)} placeholder="Postcode or town" /></div>}</div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6"><div className="space-y-2"><label className="text-sm font-bold text-[var(--text-secondary)]">Preferred Date</label><Input type="date" value={preferredDate} onChange={e => setPreferredDate(e.target.value)} /></div><div className="space-y-2"><label className="text-sm font-bold text-[var(--text-secondary)]">Contact Phone</label><Input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="Shared only after booking" /></div></div>
                                            <div className="space-y-2"><label className="text-sm font-bold text-[var(--text-secondary)]">Description</label><textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full min-h-[120px] rounded-md bg-[var(--bg-input)] border border-[var(--border-default)] p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 custom-scrollbar resize-none" placeholder="Describe the vehicle and any specific requirements…" /></div>
                                        </>
                                    )}

                                    <Button type="submit" disabled={busy === 'post'} className="w-full py-6 text-lg bg-emerald-600 hover:bg-emerald-700">{busy === 'post' ? <><Loader2 size={18} className="mr-2 animate-spin" />Submitting…</> : user ? (isLead ? 'Send Enquiry Securely' : 'Post Job Now') : 'Sign In to Continue'}</Button>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <section className="container mx-auto px-5">
                <div className="glass-strong p-12 rounded-3xl text-center relative overflow-hidden mt-20">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -z-0 translate-x-1/2 -translate-y-1/2" />
                    <div className="relative z-10"><h2 className="text-3xl md:text-4xl font-bold font-heading mb-6">Are you an Automotive Professional?</h2><p className="text-xl text-[var(--text-secondary)] max-w-2xl mx-auto mb-8">Join CarMazium's verified provider network. Approved delivery and inspection businesses compete for jobs, while approved finance and warranty providers receive consented enquiries.</p><div className="flex flex-col sm:flex-row gap-4 justify-center"><Button asChild size="lg" className="shadow-neon px-8"><Link href="/dashboard/dealer">Join as a Provider</Link></Button><Button asChild variant="outline" size="lg" className="px-8"><Link href="/auctions">How Trade Exchange Works</Link></Button></div></div>
                </div>
            </section>
        </div>
    )
}
