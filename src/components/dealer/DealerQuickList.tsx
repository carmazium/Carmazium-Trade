"use client"

import * as React from "react"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { Textarea } from "@/components/ui/Textarea"
import {
    Search, Loader2, BadgeCheck, Upload, X,
    CheckCircle, ArrowRight, Sparkles, Info,
    LocateFixed, AlertTriangle, Zap, Gavel, List, Play,
    Star, Shield, BadgeCheck as BadgeCheckIcon, ChevronRight,
} from "lucide-react"
import Image from "next/image"
import { ImageUpload } from "@/components/listing/ImageUpload"
import { PendingReviewModal } from "@/components/listing/PendingReviewModal"
import {
    createListing, publishListing, createListingCheckoutSession,
    type CreateListingRequest,
    type BodyTypeValue, type EuroStandardValue, type VehicleTypeValue,
} from "@/lib/listingApi"
import { apiClient } from "@/lib/apiClient"
import { dvlaLookup } from "@/lib/dvlaApi"
import { aiGenerateDescription } from "@/lib/aiApi"
import { useAuth } from "@/context/AuthContext"
import { VehicleDamageMapper, type DamageRecord } from "@/components/listing/VehicleDamageMapper"
import { useRouter, useSearchParams } from "next/navigation"

// ─── Required fields for publish completeness (must match inventory page) ────
// Condition is required here too so the form enforces it before save.
const EDIT_REQUIRED = ['transmission', 'bodyType', 'description', 'condition', 'images'] as const

// ─── Component ────────────────────────────────────────────────────────────────

export function DealerQuickList() {
    const { user } = useAuth()
    const router = useRouter()
    const searchParams = useSearchParams()
    const editId = searchParams.get('editId')
    const editSlug = searchParams.get('editSlug')
    // When coming from inventory "Complete listing" we want to trigger publish after save
    const returnPublish = searchParams.get('returnPublish') === 'true'

    // ─── State ────────────────────────────────────────────────────────────────
    const [vrm,             setVrm]             = React.useState("")
    const [dvlaLoading,     setDvlaLoading]     = React.useState(false)
    const [dvlaError,       setDvlaError]       = React.useState<string | null>(null)
    const [dvlaData,        setDvlaData]        = React.useState<any>(null)

    const [model,           setModel]           = React.useState("")
    const [price,           setPrice]           = React.useState("")
    const [mileage,         setMileage]         = React.useState("")
    const [location,        setLocation]        = React.useState("")
    const [geoLoading,      setGeoLoading]      = React.useState(false)
    const [description,     setDescription]     = React.useState("")
    const [images,          setImages]          = React.useState<string[]>([])
    const [condition,       setCondition]       = React.useState("")
    const [transmission,    setTransmission]    = React.useState("")
    const [bodyType,        setBodyType]        = React.useState<BodyTypeValue | "">("")
    // New fields for better buyer trust
    const [serviceHistory,  setServiceHistory]  = React.useState("")
    const [owners,          setOwners]          = React.useState("")
    const [editLoading,     setEditLoading]     = React.useState(false)

    const [isGeneratingDesc, setIsGeneratingDesc] = React.useState(false)
    const [generateDescError, setGenerateDescError] = React.useState<string | null>(null)
    const [isSubmitting,     setIsSubmitting]     = React.useState(false)
    const [submitError,      setSubmitError]      = React.useState<string | null>(null)
    const [publishAs,        setPublishAs]        = React.useState<"ACTIVE" | "DRAFT">("ACTIVE")
    const [listingType,      setListingType]      = React.useState<"CLASSIFIED" | "AUCTION">("CLASSIFIED")
    const [pendingReview,    setPendingReview]    = React.useState<{ title: string } | null>(null)
    const [videoUrls,        setVideoUrls]        = React.useState<string[]>([])
    const [videoUrlInput,    setVideoUrlInput]    = React.useState("")
    const [videoUrlError,    setVideoUrlError]    = React.useState("")
    const [damageRecords,    setDamageRecords]    = React.useState<DamageRecord[]>([])
    // Plan-selection modal (shown after saving in "complete listing" edit flow)
    const [showPlanModal,    setShowPlanModal]    = React.useState(false)
    const [planPublishing,   setPlanPublishing]   = React.useState(false)

    // ─── Load existing listing when editing ───────────────────────────────────
    React.useEffect(() => {
        if (!editId) return
        setEditLoading(true)
        apiClient<{ data: any }>(`/listings/${editSlug || editId}`)
            .then(res => {
                const l = res.data
                setVrm(l.vrm || '')
                setModel(l.model || '')
                setPrice(l.price ? String(l.price) : '')
                setMileage(l.mileage ? String(l.mileage) : '')
                setLocation(l.location || '')
                setDescription(l.description || '')
                setImages(l.images || [])
                setVideoUrls(l.videoUrls || [])
                setCondition(l.condition || '')
                setTransmission(l.transmission || '')
                setBodyType((l.bodyType as BodyTypeValue) || '')
                setServiceHistory(l.serviceHistory || '')
                setOwners(l.owners || '')
                // Preserve the original listing type so we never silently overwrite
                // an AUCTION listing as CLASSIFIED
                setListingType(l.type === 'AUCTION' ? 'AUCTION' : 'CLASSIFIED')
                setPublishAs(l.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT')
                // Reconstruct dvlaData from listing fields so DVLA section appears
                setDvlaData({
                    make: l.make,
                    model: l.model,
                    year: l.year,
                    colour: l.color,
                    fuelType: l.fuelType,
                    engineSize: l.engineSize,
                    motStatus: l.motStatus,
                    taxStatus: l.taxStatus,
                    euroStandard: l.euroStandard,
                    co2Emissions: l.co2Emissions,
                    motExpiryDate: l.motExpiryDate,
                    taxDueDate: l.taxDueDate,
                    monthOfFirstRegistration: l.monthOfFirstRegistration,
                    wheelplan: l.wheelplan,
                    typeApproval: l.typeApproval,
                    markedForExport: l.markedForExport,
                })
            })
            .catch(err => setDvlaError('Failed to load listing: ' + err.message))
            .finally(() => setEditLoading(false))
    }, [editId, editSlug])

    // ─── DVLA Lookup ──────────────────────────────────────────────────────────
    const handleLookup = async () => {
        if (!vrm.trim()) return
        setDvlaLoading(true)
        setDvlaError(null)
        setDvlaData(null)

        try {
            const r = await dvlaLookup(vrm.trim())
            setDvlaData(r)
            if (r.model) setModel(r.model)

            if (r.motHistory?.length) {
                const latest = r.motHistory.find((m: any) => m.odometerValue)
                if (latest?.odometerValue) setMileage(latest.odometerValue)
            }
        } catch (err: any) {
            setDvlaError(err.message || "Vehicle not found")
        } finally {
            setDvlaLoading(false)
        }
    }

    // ─── AI Description ───────────────────────────────────────────────────────
    const handleGenerateDescription = async () => {
        if (!dvlaData) return
        setIsGeneratingDesc(true)
        setGenerateDescError(null)
        try {
            const result = await aiGenerateDescription({
                make:           dvlaData.make,
                model:          model || dvlaData.model,
                year:           dvlaData.year ? String(dvlaData.year) : undefined,
                fuelType:       dvlaData.fuelType,
                color:          dvlaData.colour || dvlaData.primaryColour || dvlaData.color,
                engineSize:     dvlaData.engineSize ? String(dvlaData.engineSize) : undefined,
                mileage,
                condition,
                transmission:   transmission || undefined,
                bodyType:       bodyType || undefined,
                serviceHistory: serviceHistory || undefined,
                owners:         owners || undefined,
            })
            if (result?.text) {
                setDescription(result.text)
            } else {
                setGenerateDescError("AI returned an empty description — please try again.")
            }
        } catch (error: any) {
            const msg = error?.message || String(error)
            if (msg !== 'AUTH_REDIRECT') {
                setGenerateDescError(msg || "AI generation failed — please try again.")
            }
            console.error("AI Generation failed:", error)
        } finally {
            setIsGeneratingDesc(false)
        }
    }

    // ─── Geolocation ──────────────────────────────────────────────────────────
    const handleGeolocate = () => {
        if (!navigator.geolocation) return
        setGeoLoading(true)
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    const res = await fetch(
                        `https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`
                    )
                    const data = await res.json()
                    const city = data?.address?.city || data?.address?.town || data?.address?.village || ""
                    const postcode = data?.address?.postcode || ""
                    setLocation(`${city}${postcode ? `, ${postcode}` : ""}`)
                } catch { }
                setGeoLoading(false)
            },
            () => setGeoLoading(false),
            { timeout: 5000 }
        )
    }

    // ─── Submit ───────────────────────────────────────────────────────────────
    // In edit mode all five required fields must be filled before the Save button activates.
    const canSubmit = !!(
        vrm && dvlaData && price && images.length > 0 &&
        (!editId || (transmission && bodyType && description.trim() && condition))
    )

    const handleSubmit = async () => {
        if (!user || !dvlaData) return
        setIsSubmitting(true)
        setSubmitError(null)

        try {
            const priceNum = parseFloat(price)
            const resolvedModel = model || dvlaData.model || ''

            let ulez = false
            const ft = (dvlaData.fuelType || "").toUpperCase()
            const es = (dvlaData.euroStandard || "").toUpperCase()
            if (ft === "ELECTRIC" || ft === "PLUGIN_HYBRID" || es.includes("EURO_6") || (ft === "PETROL" && es === "EURO_4")) {
                ulez = true
            }

            const titleParts = [dvlaData.make, resolvedModel, dvlaData.year].filter(Boolean)
            const payload: CreateListingRequest = {
                title:        titleParts.join(' ') || vrm,
                price:        priceNum,
                priceMin:     priceNum,
                priceMax:     priceNum,
                mileage:      parseInt(mileage) || 0,
                year:         dvlaData.year || new Date().getFullYear(),
                vrm:          vrm.toUpperCase(),
                images,
                listingType,
                status:       publishAs,
                badgeTier:    listingType === "AUCTION" ? "FREE" : "BASIC",
                vehicleType:  "CAR" as VehicleTypeValue,
                make:         dvlaData.make || undefined,
                model:        resolvedModel || undefined,
                description:  description || undefined,
                transmission: transmission as any || undefined,
                bodyType:     bodyType as BodyTypeValue || undefined,
                fuelType:     dvlaData.fuelType as any || undefined,
                color:        dvlaData.colour || undefined,
                engineSize:   dvlaData.engineSize || undefined,
                co2Emissions: dvlaData.co2Emissions || undefined,
                euroStandard: (dvlaData.euroStandard as EuroStandardValue) || undefined,
                motStatus:    dvlaData.motStatus || undefined,
                taxStatus:    dvlaData.taxStatus || undefined,
                motExpiryDate: dvlaData.motExpiryDate || undefined,
                taxDueDate:   dvlaData.taxDueDate || undefined,
                monthOfFirstRegistration: dvlaData.monthOfFirstRegistration || undefined,
                wheelplan:    dvlaData.wheelplan || undefined,
                typeApproval: dvlaData.typeApproval || undefined,
                markedForExport: dvlaData.markedForExport ?? undefined,
                ulezCompliant: ulez,
                location:     location || undefined,
                condition:    condition as any || undefined,
                isImported:   false,
                videoUrls:    videoUrls.length > 0 ? videoUrls : undefined,
                // Extended trust fields
                serviceHistory: serviceHistory || undefined,
                owners:         owners || undefined,
            }

            if (editId) {
                // Always save as DRAFT in edit mode — publishing goes through the
                // plan-selection modal so the dealer picks a tier and payment is gated.
                await apiClient(`/listings/${editId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({ ...payload, status: 'DRAFT' }),
                })
                if (damageRecords.length > 0) {
                    await apiClient(`/damage/${editId}/save`, {
                        method: 'POST',
                        body: JSON.stringify({
                            detections: damageRecords.map(r => ({
                                part: r.zone, type: r.description, imageUrl: r.photoUrl, size: '', severity: 'medium',
                            })),
                        }),
                    }).catch(e => console.error('Failed to save damage records:', e))
                }
                if (returnPublish) {
                    setShowPlanModal(true)
                } else {
                    router.push('/dashboard/dealer/inventory')
                }
            } else {
                const newListing = await createListing(payload)
                if (damageRecords.length > 0 && (newListing as any).id) {
                    await apiClient(`/damage/${(newListing as any).id}/save`, {
                        method: 'POST',
                        body: JSON.stringify({
                            detections: damageRecords.map(r => ({
                                part: r.zone, type: r.description, imageUrl: r.photoUrl, size: '', severity: 'medium',
                            })),
                        }),
                    }).catch(e => console.error('Failed to save damage records:', e))
                }
                // FREE-tier (auction) listings have no payment step and are submitted
                // straight to review — surface that instead of implying it's already live.
                if (listingType === 'AUCTION' && payload.status !== 'DRAFT') {
                    setPendingReview({ title: payload.title })
                } else {
                    router.push('/dashboard/dealer/inventory')
                }
            }
        } catch (error: any) {
            setSubmitError(error.message || "Failed to save listing.")
        } finally {
            setIsSubmitting(false)
        }
    }

    // ─── Plan selection confirm (returnPublish edit flow) ─────────────────────
    const handlePlanConfirm = async (tier: 'BASIC' | 'STANDARD' | 'PREMIUM') => {
        if (!editId) return
        setPlanPublishing(true)
        try {
            // Same server-side check the wizard does: admins list free, so
            // publishListing() activates outright and checkout would only reject them.
            const publish = await publishListing(editId)
            if (publish.activated || publish.pendingReview) {
                router.push('/dashboard/dealer/inventory')
                return
            }
            const checkout = await createListingCheckoutSession(editId, tier)
            window.location.href = checkout.url
        } catch (err: any) {
            alert('Failed to publish: ' + (err.message || 'Please try again.'))
            setPlanPublishing(false)
        }
    }

    // ─── Render ───────────────────────────────────────────────────────────────
    if (editLoading) return (
        <div className="p-10 flex items-center justify-center">
            <Loader2 className="animate-spin text-primary" size={32} />
        </div>
    )

    // In edit mode: show which of the 5 required fields still need filling
    const editMissingFields = editId ? [
        !transmission    && 'Transmission',
        !bodyType        && 'Body Type',
        !description.trim() && 'Description',
        !condition       && 'Condition',
        images.length === 0 && 'Photos (at least 1)',
    ].filter(Boolean) as string[] : []

    return (
        <div className="p-6 md:p-10 space-y-8">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2.5 bg-primary/10 border border-primary/20 rounded-xl">
                        <Zap size={22} className="text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl md:text-3xl font-black font-heading  tracking-tight">
                            {editId ? 'Complete Listing' : 'Quick List'}
                        </h1>
                        <p className="text-xs text-[var(--text-muted)] uppercase tracking-widest font-bold">
                            {editId ? 'Fill in the remaining details to publish your vehicle' : 'VRM → Auto-fill → Photos → Publish'}
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Edit-mode required-fields banner ─────────────────────────── */}
            {editId && (
                <div className={`flex items-start gap-3 p-4 rounded-xl border text-sm ${editMissingFields.length === 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200' : 'bg-blue-500/10 border-blue-500/20 text-blue-200'}`}>
                    <Info size={16} className={`shrink-0 mt-0.5 ${editMissingFields.length === 0 ? 'text-emerald-400' : 'text-blue-400'}`} />
                    <div>
                        {editMissingFields.length === 0 ? (
                            <>
                                <p className="font-bold text-emerald-300 mb-0.5">All required fields complete</p>
                                <p className="text-xs text-emerald-200/70">Click "Save & Choose Plan" to go live.</p>
                            </>
                        ) : (
                            <>
                                <p className="font-bold text-blue-300 mb-0.5">Complete these fields to publish ({editMissingFields.length} remaining)</p>
                                <p className="text-xs text-blue-200/70">
                                    Still needed: <span className="text-blue-300 font-semibold">{editMissingFields.join(', ')}</span>
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── Listing Type Selector ─────────────────────────────────────── */}
            {!editId && (
                <section className="space-y-3">
                    <h2 className="text-sm font-black uppercase tracking-widest text-[var(--text-muted)]">Listing Type</h2>
                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setListingType("CLASSIFIED")}
                            className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${listingType === "CLASSIFIED" ? "border-primary/60 bg-primary/10 text-primary" : "border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:border-primary/30"}`}
                        >
                            <List size={18} className={listingType === "CLASSIFIED" ? "text-primary" : ""} />
                            <div>
                                <p className="font-bold text-sm">Retail Listing</p>
                                <p className="text-[11px] opacity-60 mt-0.5">Fixed price, buyer offers</p>
                            </div>
                        </button>
                        <button
                            type="button"
                            onClick={() => setListingType("AUCTION")}
                            className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${listingType === "AUCTION" ? "border-orange-500/60 bg-orange-500/10 text-orange-600 dark:text-orange-400" : "border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:border-primary/30"}`}
                        >
                            <Gavel size={18} className={listingType === "AUCTION" ? "text-orange-400" : ""} />
                            <div>
                                <p className="font-bold text-sm">Auction</p>
                                <p className="text-[11px] opacity-60 mt-0.5">Live bidding, 5h duration</p>
                            </div>
                        </button>
                    </div>
                </section>
            )}

            {/* ── SECTION 1: VRM Lookup ────────────────────────────────────── */}
            <section className="space-y-4">
                <h2 className="text-sm font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary text-xs font-black">1</span>
                    Vehicle Identification
                </h2>
                <div className="flex flex-col sm:flex-row gap-3">
                    <Input
                        placeholder="e.g. AB12 CDE"
                        value={vrm}
                        onChange={(e) => { setVrm(e.target.value.toUpperCase()); setDvlaData(null); setDvlaError(null) }}
                        className="bg-[var(--bg-input)] border-primary/20 uppercase font-mono tracking-widest text-lg h-14 focus:border-primary flex-1 max-w-xs placeholder:text-[var(--text-secondary)]"
                    />
                    <Button
                        type="button"
                        disabled={!vrm || dvlaLoading}
                        onClick={handleLookup}
                        className="bg-primary hover:bg-primary/90 text-white font-bold px-8 h-14 uppercase tracking-widest gap-2 shadow-neon transition-transform active:scale-95"
                    >
                        {dvlaLoading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                        Lookup
                    </Button>
                </div>
                {dvlaError && <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle size={12} /> {dvlaError}</p>}

                {/* DVLA Result Card */}
                {dvlaData && (
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex items-center gap-2 mb-4">
                            <BadgeCheck size={18} className="text-emerald-400" />
                            <span className="text-sm font-bold text-emerald-400">DVLA Data Retrieved</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                            {[
                                { label: "Make",   value: dvlaData.make },
                                { label: "Model",  value: model || dvlaData.model },
                                { label: "Year",   value: dvlaData.year },
                                { label: "Colour", value: dvlaData.colour || dvlaData.primaryColour },
                                { label: "Fuel",   value: dvlaData.fuelType },
                                { label: "Engine", value: dvlaData.engineSize ? `${dvlaData.engineSize}cc` : null },
                                { label: "MOT",    value: dvlaData.motStatus },
                                { label: "Tax",    value: dvlaData.taxStatus },
                            ].filter(f => f.value).map(f => (
                                <div key={f.label}>
                                    <span className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] block">{f.label}</span>
                                    <span className="font-semibold">{f.value}</span>
                                </div>
                            ))}
                        </div>
                        {!dvlaData.model && (
                            <div className="mt-4 pt-4 border-t border-[var(--border-default)]">
                                <label className="text-xs font-bold uppercase tracking-widest text-amber-400 block mb-1.5 flex items-center gap-1">
                                    <AlertTriangle size={12} /> Model not returned by DVLA — enter manually
                                </label>
                                <Input
                                    placeholder="e.g. Octavia, Golf, 3 Series"
                                    value={model}
                                    onChange={e => setModel(e.target.value)}
                                    className="bg-[var(--bg-input)] border-amber-500/30 h-10 focus:border-amber-400 max-w-xs placeholder:text-[var(--text-secondary)]"
                                />
                            </div>
                        )}
                        {dvlaData.model && (
                            <div className="mt-4 pt-4 border-t border-[var(--border-default)]">
                                <label className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)] block mb-1.5">Model (editable)</label>
                                <Input
                                    value={model}
                                    onChange={e => setModel(e.target.value)}
                                    className="bg-[var(--bg-input)] border-[var(--border-default)] h-10 focus:border-primary max-w-xs placeholder:text-[var(--text-secondary)]"
                                />
                            </div>
                        )}
                    </div>
                )}
            </section>

            {/* ── SECTION 2: Essentials ────────────────────────────────────── */}
            {dvlaData && (
                <section className="space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-sm font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary text-xs font-black">2</span>
                        Essentials
                    </h2>

                    {/* Price / Mileage / Location */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-[var(--text-muted)]">Asking Price *</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] font-bold text-lg">£</span>
                                <Input
                                    type="number"
                                    placeholder="15,000"
                                    value={price}
                                    onChange={(e) => setPrice(e.target.value)}
                                    className="bg-[var(--bg-input)] border-[var(--border-default)] pl-8 h-12 focus:border-primary text-lg font-bold placeholder:text-[var(--text-secondary)]"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-[var(--text-muted)]">
                                Mileage
                                {mileage && <span className="text-emerald-400 ml-2 normal-case text-xs">● Auto-filled from MOT</span>}
                            </label>
                            <Input
                                type="number"
                                placeholder="45,000"
                                value={mileage}
                                onChange={(e) => setMileage(e.target.value)}
                                className="bg-[var(--bg-input)] border-[var(--border-default)] h-12 focus:border-primary placeholder:text-[var(--text-secondary)]"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-[var(--text-muted)]">Dealership Location</label>
                            <div className="flex gap-2">
                                <Input
                                    placeholder="London, SW1A 1AA"
                                    value={location}
                                    onChange={(e) => setLocation(e.target.value)}
                                    className="bg-[var(--bg-input)] border-[var(--border-default)] h-12 focus:border-primary flex-1 placeholder:text-[var(--text-secondary)]"
                                />
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={handleGeolocate}
                                    disabled={geoLoading}
                                    className="border-[var(--border-default)] h-12 px-3 text-[var(--text-muted)] hover:text-primary dark:hover:text-white shrink-0"
                                >
                                    {geoLoading ? <Loader2 size={16} className="animate-spin" /> : <LocateFixed size={16} />}
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* Condition * */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-[var(--text-muted)] flex items-center gap-1">
                            Condition
                            {editId && <span className="text-primary">*</span>}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {["EXCELLENT", "GOOD", "FAIR", "POOR"].map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setCondition(c)}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${condition === c
                                        ? "border-primary bg-primary/10 text-primary shadow-[0_0_12px_rgba(237,28,36,0.15)]"
                                        : "border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:border-primary/30"
                                    }`}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Transmission * */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-[var(--text-muted)] flex items-center gap-1">
                            Transmission
                            {editId && <span className="text-primary">*</span>}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { value: 'MANUAL',         label: 'Manual' },
                                { value: 'AUTOMATIC',      label: 'Automatic' },
                                { value: 'SEMI_AUTOMATIC', label: 'Semi-Auto' },
                                { value: 'CVT',            label: 'CVT' },
                            ].map(({ value, label }) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setTransmission(value)}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${transmission === value
                                        ? "border-primary bg-primary/10 text-primary shadow-[0_0_12px_rgba(237,28,36,0.15)]"
                                        : "border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:border-primary/30"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Body Type * */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-[var(--text-muted)] flex items-center gap-1">
                            Body Type
                            {editId && <span className="text-primary">*</span>}
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { value: 'HATCHBACK',    label: 'Hatchback' },
                                { value: 'SEDAN',        label: 'Saloon' },
                                { value: 'ESTATE',       label: 'Estate' },
                                { value: 'SUV',          label: 'SUV' },
                                { value: 'CROSSOVER',    label: 'Crossover' },
                                { value: 'COUPE',        label: 'Coupé' },
                                { value: 'CONVERTIBLE',  label: 'Convertible' },
                                { value: 'MPV',          label: 'MPV' },
                                { value: 'VAN',          label: 'Van' },
                                { value: 'PICKUP_TRUCK', label: 'Pickup' },
                            ].map(({ value, label }) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setBodyType(value as BodyTypeValue)}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${bodyType === value
                                        ? "border-primary bg-primary/10 text-primary shadow-[0_0_12px_rgba(237,28,36,0.15)]"
                                        : "border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:border-primary/30"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Service History */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-[var(--text-muted)]">
                            Service History
                            <span className="text-[var(--text-secondary)] font-normal ml-1 normal-case">— helps buyers trust the vehicle</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {[
                                { value: 'FULL_MAIN_DEALER',  label: 'Full Main Dealer' },
                                { value: 'FULL_INDEPENDENT',  label: 'Full Independent' },
                                { value: 'PARTIAL',           label: 'Partial' },
                                { value: 'NONE',              label: 'None' },
                                { value: 'UNKNOWN',           label: 'Unknown' },
                            ].map(({ value, label }) => (
                                <button
                                    key={value}
                                    type="button"
                                    onClick={() => setServiceHistory(value)}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${serviceHistory === value
                                        ? "border-primary bg-primary/10 text-primary shadow-[0_0_12px_rgba(237,28,36,0.15)]"
                                        : "border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:border-primary/30"
                                    }`}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Number of Owners */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-[var(--text-muted)]">
                            Previous Owners
                            <span className="text-[var(--text-secondary)] font-normal ml-1 normal-case">— number of keepers</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {['1', '2', '3', '4+'].map(v => (
                                <button
                                    key={v}
                                    type="button"
                                    onClick={() => setOwners(v)}
                                    className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider border transition-all ${owners === v
                                        ? "border-primary bg-primary/10 text-primary shadow-[0_0_12px_rgba(237,28,36,0.15)]"
                                        : "border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:border-primary/30"
                                    }`}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* ── SECTION 3: Photos ───────────────────────────────────────── */}
            {dvlaData && (
                <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '100ms' }}>
                    <h2 className="text-sm font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary text-xs font-black">3</span>
                        Photos
                        {editId && <span className="text-primary text-xs font-black">*</span>}
                        {images.length > 0 && <span className="text-emerald-400 text-xs bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">{images.length} uploaded</span>}
                    </h2>
                    <ImageUpload
                        onImagesChange={setImages}
                        maxImages={30}
                        existingImages={images}
                    />

                    <div className="pt-6 border-t border-[var(--border-default)]">
                        <h3 className="text-sm font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2 mb-4">
                            <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary text-xs font-black">★</span>
                            Damage Mapping
                            <span className="text-xs text-[var(--text-secondary)] normal-case font-normal">— optional, increases buyer trust</span>
                        </h3>
                        <VehicleDamageMapper
                            bodyType={bodyType || dvlaData?.bodyType || undefined}
                            existingRecords={damageRecords}
                            onComplete={(records) => setDamageRecords(records)}
                        />
                    </div>
                </section>
            )}

            {/* ── SECTION 4: Description ──────────────────────────────────── */}
            {dvlaData && (
                <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '200ms' }}>
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary text-xs font-black">4</span>
                            Description
                            {editId
                                ? <span className="text-primary text-xs font-black">* Required to publish</span>
                                : <span className="text-xs text-[var(--text-secondary)] normal-case font-normal">Optional</span>
                            }
                        </h2>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={isGeneratingDesc}
                            onClick={handleGenerateDescription}
                            className="border-[var(--border-default)] text-[var(--text-muted)] hover:text-primary dark:hover:text-white gap-2 bg-[var(--bg-input)] text-xs"
                        >
                            {isGeneratingDesc ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                            AI Generate
                        </Button>
                    </div>
                    <Textarea
                        placeholder="Leave blank or use AI Generate to auto-write a professional listing description..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="bg-[var(--bg-input)] border-[var(--border-default)] min-h-[120px] placeholder:text-[var(--text-secondary)] focus:border-primary"
                    />
                    {generateDescError && (
                        <p className="text-xs text-red-400 flex items-center gap-1.5">
                            <AlertTriangle size={12} />
                            {generateDescError}
                        </p>
                    )}
                </section>
            )}

            {/* ── SECTION 5: Video Links ──────────────────────────────────── */}
            {dvlaData && (
                <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '250ms' }}>
                    <h2 className="text-sm font-black uppercase tracking-widest text-[var(--text-muted)] flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-primary text-xs font-black">5</span>
                        Video Links
                        <span className="text-xs text-[var(--text-secondary)] normal-case font-normal">Optional · up to 5</span>
                    </h2>
                    <div className="flex gap-2">
                        <Input
                            placeholder="Paste a YouTube, Instagram, Facebook or X video URL"
                            value={videoUrlInput}
                            onChange={e => { setVideoUrlInput(e.target.value); setVideoUrlError("") }}
                            className="bg-[var(--bg-input)] border-[var(--border-default)] placeholder:text-[var(--text-secondary)] flex-1"
                        />
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-[var(--border-default)] bg-[var(--bg-card)] text-[var(--text-secondary)] hover:bg-white/10 shrink-0"
                            onClick={() => {
                                const url = videoUrlInput.trim()
                                if (!url) return
                                if (videoUrls.length >= 5) { setVideoUrlError("Maximum 5 video links allowed."); return }
                                const isValid = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch|x\.com|twitter\.com)/.test(url)
                                if (!isValid) { setVideoUrlError("Only YouTube, Instagram, Facebook or X links are accepted."); return }
                                if (videoUrls.includes(url)) { setVideoUrlError("This URL has already been added."); return }
                                setVideoUrls([...videoUrls, url])
                                setVideoUrlInput("")
                            }}
                        >
                            <Play size={14} className="mr-1" /> Add
                        </Button>
                    </div>
                    {videoUrlError && <p className="text-xs text-red-400">{videoUrlError}</p>}
                    {videoUrls.length > 0 && (
                        <div className="space-y-2">
                            {videoUrls.map((url, idx) => {
                                const platform = url.includes('youtube.com') || url.includes('youtu.be') ? 'YouTube'
                                    : url.includes('instagram.com') ? 'Instagram'
                                    : url.includes('facebook.com') || url.includes('fb.watch') ? 'Facebook'
                                    : 'X / Twitter'
                                return (
                                    <div key={idx} className="flex items-center gap-2 p-2 rounded-lg bg-[var(--bg-input)] border border-[var(--border-default)]">
                                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/20 shrink-0">{platform}</span>
                                        <span className="text-xs text-blue-400 truncate flex-1">{url}</span>
                                        <button type="button" onClick={() => setVideoUrls(videoUrls.filter((_, i) => i !== idx))} className="text-[var(--text-muted)] hover:text-red-400 transition-colors shrink-0">
                                            <X size={14} />
                                        </button>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </section>
            )}

            {/* ── SUBMIT BAR ──────────────────────────────────────────────── */}
            {dvlaData && (
                <section className="animate-in fade-in slide-in-from-bottom-4 duration-500" style={{ animationDelay: '300ms' }}>
                    {submitError && (
                        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
                            <AlertTriangle size={16} /> {submitError}
                        </div>
                    )}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 p-5 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl">
                        {/* Publish toggle — hidden in edit mode (publishing goes through plan modal) */}
                        {!editId && (
                            <div className="flex gap-2 p-1 bg-[var(--bg-input)] rounded-xl border border-[var(--border-default)]">
                                <button
                                    type="button"
                                    onClick={() => setPublishAs("ACTIVE")}
                                    className={`flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${publishAs === "ACTIVE"
                                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.15)]"
                                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                                    }`}
                                >
                                    Publish Live
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPublishAs("DRAFT")}
                                    className={`flex-1 sm:flex-none px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${publishAs === "DRAFT"
                                        ? "bg-gray-500/20 text-[var(--text-secondary)] border border-gray-500/30"
                                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                                    }`}
                                >
                                    Save Draft
                                </button>
                            </div>
                        )}

                        <div className="flex-1" />

                        <Button
                            type="button"
                            disabled={!canSubmit || isSubmitting}
                            onClick={handleSubmit}
                            className="h-14 px-10 text-lg font-bold shadow-neon gap-2 disabled:opacity-40 w-full sm:w-auto"
                        >
                            {isSubmitting ? (
                                <><Loader2 size={20} className="animate-spin" /> {editId ? 'Saving...' : 'Creating...'}</>
                            ) : editId && returnPublish ? (
                                <>Save & Choose Plan <ArrowRight size={20} /></>
                            ) : editId ? (
                                <>Save Changes <ArrowRight size={20} /></>
                            ) : publishAs === "ACTIVE" ? (
                                <>Publish Listing <ArrowRight size={20} /></>
                            ) : (
                                <>Save as Draft <ArrowRight size={20} /></>
                            )}
                        </Button>
                    </div>
                </section>
            )}

            {/* ── Plan-selection modal (returnPublish flow) ────────────────── */}
            {showPlanModal && editId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="relative w-full max-w-lg bg-[var(--bg-dropdown)] border border-[var(--border-default)] rounded-2xl p-6 shadow-2xl">
                        <button
                            onClick={() => { setShowPlanModal(false); router.push('/dashboard/dealer/inventory') }}
                            className="absolute top-4 right-4 p-1.5 rounded-lg hover:bg-white/10 text-[var(--text-muted)] hover:text-primary dark:hover:text-white transition-colors"
                        >
                            <X size={18} />
                        </button>

                        <h2 className="text-lg font-black  font-heading uppercase tracking-tight mb-1">
                            Choose a Listing Plan
                        </h2>
                        <p className="text-xs text-[var(--text-muted)] mb-5">
                            Details saved. Select a tier to go live — you can always upgrade later.
                        </p>

                        <div className="grid grid-cols-2 gap-3 mb-3">
                            {/* FREE */}
                            <button
                                onClick={() => handlePlanConfirm('BASIC')}
                                disabled={planPublishing}
                                className="flex flex-col p-4 rounded-xl border border-[var(--border-default)] bg-white/[0.02] hover:border-white/25 hover:bg-[var(--bg-card)] transition-all text-left disabled:opacity-50"
                            >
                                <p className="font-bold text-sm mb-1">Basic</p>
                                <p className="text-2xl font-black  mb-3">£1</p>
                                <ul className="space-y-1 text-[11px] text-[var(--text-muted)]">
                                    <li className="flex items-center gap-1.5"><CheckCircle size={11} className="text-emerald-400" /> Basic listing</li>
                                    <li className="flex items-center gap-1.5"><CheckCircle size={11} className="text-emerald-400" /> Offer system</li>
                                    <li className="flex items-center gap-1.5 text-[var(--text-secondary)]"><X size={11} /> No trust badges</li>
                                </ul>
                            </button>

                            {/* STANDARD */}
                            <button
                                onClick={() => handlePlanConfirm('STANDARD')}
                                disabled={planPublishing}
                                className="relative flex flex-col p-4 rounded-xl border border-blue-500/30 bg-blue-500/5 hover:border-blue-500/60 hover:bg-blue-500/10 transition-all text-left disabled:opacity-50"
                            >
                                <p className="text-blue-400 font-bold text-sm mb-1 flex items-center gap-1"><Shield size={12} /> Standard</p>
                                <p className="text-2xl font-black  mb-3">£10</p>
                                <ul className="space-y-1 text-[11px] text-[var(--text-muted)]">
                                    <li className="flex items-center gap-1.5"><BadgeCheckIcon size={11} className="text-blue-400" /> VIN Report badge</li>
                                    <li className="flex items-center gap-1.5"><BadgeCheckIcon size={11} className="text-blue-400" /> Verified Seller badge</li>
                                    <li className="flex items-center gap-1.5 text-[var(--text-secondary)]"><X size={11} /> No featured boost</li>
                                </ul>
                            </button>
                        </div>

                        {/* PREMIUM */}
                        <button
                            onClick={() => handlePlanConfirm('PREMIUM')}
                            disabled={planPublishing}
                            className="relative w-full flex items-center gap-4 p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60 hover:bg-amber-500/10 transition-all text-left disabled:opacity-50"
                        >
                            <span className="absolute -top-2.5 left-4 text-xs bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold px-3 py-0.5 rounded-full flex items-center gap-1">
                                <Star size={9} /> Best Value
                            </span>
                            <div className="flex-1">
                                <p className="text-amber-400 font-bold text-sm flex items-center gap-1"><Star size={12} /> Premium</p>
                                <p className="text-lg font-black">£25</p>
                            </div>
                            <ul className="space-y-1 text-[11px] text-[var(--text-muted)]">
                                <li className="flex items-center gap-1.5"><Zap size={11} className="text-amber-400" /> Featured boost (28 days)</li>
                                <li className="flex items-center gap-1.5"><Zap size={11} className="text-amber-400" /> Priority in search results</li>
                                <li className="flex items-center gap-1.5"><Zap size={11} className="text-amber-400" /> Featured badge</li>
                            </ul>
                        </button>

                        {planPublishing && (
                            <div className="mt-4 flex items-center justify-center gap-2 text-[var(--text-muted)] text-sm">
                                <Loader2 size={16} className="animate-spin" /> Publishing…
                            </div>
                        )}
                    </div>
                </div>
            )}

            <PendingReviewModal
                open={!!pendingReview}
                listingTitle={pendingReview?.title}
                onContinue={() => router.push('/dashboard/dealer/inventory')}
            />
        </div>
    )
}
