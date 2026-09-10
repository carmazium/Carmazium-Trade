"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import {
    Gavel, Flame, Calendar, Zap, Users, Search, RefreshCw,
    Clock, Trophy, CheckCircle,
    ChevronRight, Timer, Gauge, Fuel, Car, MapPin,
    BadgeCheck, ShieldCheck, Star, Truck,
    ArrowRight, ChevronDown, FileText, Lock, Handshake, Banknote,
    Eye, TrendingUp, CreditCard, Box, Filter,
    X, Loader2, RotateCcw, EyeOff,
} from "lucide-react"
import { CountdownTimer } from "@/components/features/CountdownTimer"
import { CardImageCarousel } from "@/components/features/CardImageCarousel"
import { WishlistButton } from "@/components/features/WishlistButton"
import { FeaturedBadge } from "@/components/features/FeaturedBadge"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { BODY_TYPE_LABELS, FUEL_TYPE_LABELS } from "@/lib/vehicleLabels"
import { BODY_TYPE_ICONS, BODY_TYPE_LABELS as SIDEBAR_BODY_TYPE_LABELS, BODY_TYPE_KEYS } from "@/components/icons/BodyTypeIcons"
import { CAR_MAKES, getModelsForMake } from "@/lib/carData"
import { useLocation } from "@/context/LocationContext"
import { haversineDistanceMiles } from "@/lib/distance"
import { useAnalytics } from "@/hooks/useAnalytics"
import type { VehicleConditionValue, EuroStandardValue } from "@/lib/listingApi"
import {
    getActiveAuctions, getScheduledAuctions, getCurrentBid,
    getBidCount, isAntiSnipeActive, type Auction,
} from "@/lib/auctionApi"
import { RequireAuth } from "@/components/auth/RequireAuth"
import { TRADE_EXCHANGE_ROLES, canAccessTradeStock } from "@/lib/tradeAccess"
import { useAuth } from "@/context/AuthContext"

// ─── Filters ──────────────────────────────────────────────────────────────────

type SortOption = "ending_soon" | "newest" | "price_low" | "price_high"

const SORT_LABELS: Record<SortOption, string> = {
    ending_soon: "Ending Soonest",
    newest: "Newest Listed",
    price_low: "Price: Low to High",
    price_high: "Price: High to Low",
}

const TRANSMISSION_LABELS: Record<string, string> = {
    MANUAL: 'Manual', AUTOMATIC: 'Automatic', SEMI_AUTOMATIC: 'Semi-Automatic', CVT: 'CVT',
}

const CONDITION_OPTIONS: { value: VehicleConditionValue; label: string }[] = [
    { value: 'EXCELLENT', label: 'Excellent' },
    { value: 'GOOD', label: 'Good' },
    { value: 'FAIR', label: 'Fair' },
    { value: 'POOR', label: 'Poor' },
    { value: 'CAT_S', label: 'CAT S (write-off)' },
    { value: 'CAT_N', label: 'CAT N (write-off)' },
    { value: 'CAT_C', label: 'CAT C (write-off)' },
    { value: 'CAT_D', label: 'CAT D (write-off)' },
]

const EURO_OPTIONS: { value: EuroStandardValue; label: string }[] = [
    { value: 'EURO_4', label: 'Euro 4' },
    { value: 'EURO_5', label: 'Euro 5' },
    { value: 'EURO_6', label: 'Euro 6' },
    { value: 'EURO_6D', label: 'Euro 6d' },
]

const POPULAR_FEATURES = [
    'Air Conditioning', 'Climate Control', 'Alloy Wheels',
    'Parking Sensors (Front)', 'Parking Sensors (Rear)', 'Reverse Camera',
    'Sat Nav', 'Bluetooth / Hands Free', 'DAB Radio',
    'Heated Seats', 'Cruise Control', 'Panoramic Roof',
    'Apple CarPlay', 'Android Auto', 'Keyless Entry',
    'Lane Assist', 'Blind Spot Monitoring', 'Adaptive Cruise Control',
] as const

const DISTANCE_CHIPS = [10, 25, 50, 100, 200] as const

const CURRENT_YEAR = new Date().getFullYear()

// ─── Filter State ─────────────────────────────────────────────────────────────

interface FilterState {
    vehicleType: string
    make: string
    model: string
    bodyType: string
    minPrice: string
    maxPrice: string
    minYear: string
    maxYear: string
    minMileage: string
    maxMileage: string
    fuelTypes: string[]
    transmissions: string[]
    color: string
    minDoors: string
    minSeats: string
    minEngine: string
    maxEngine: string
    maxCo2: string
    conditions: VehicleConditionValue[]
    ulezCompliant: 'yes' | 'no' | ''
    euroStandard: EuroStandardValue | ''
    minBhp: string
    maxBhp: string
    features: string[]
    location: string
    maxDistanceMi: number | null
    sellerType: 'PRIVATE' | 'DEALER' | ''
    deliveryAvailable: boolean
    isImported: 'yes' | 'no' | ''
    sortBy: SortOption
}

const INITIAL_FILTERS: FilterState = {
    vehicleType: 'CAR', make: '', model: '', bodyType: '',
    minPrice: '', maxPrice: '',
    minYear: '', maxYear: '',
    minMileage: '', maxMileage: '',
    fuelTypes: [], transmissions: [],
    color: '', minDoors: '', minSeats: '',
    minEngine: '', maxEngine: '', maxCo2: '',
    conditions: [], ulezCompliant: '', euroStandard: '',
    minBhp: '', maxBhp: '',
    features: [], location: '', maxDistanceMi: null,
    sellerType: '', deliveryAvailable: false, isImported: '',
    sortBy: 'ending_soon',
}

// ─── Collapsible Section ──────────────────────────────────────────────────────

function FilterSection({ title, children, defaultOpen = false }: {
    title: string; children: React.ReactNode; defaultOpen?: boolean
}) {
    const [open, setOpen] = React.useState(defaultOpen)
    return (
        <div className="border-b border-[var(--border-default)] pb-4">
            <button type="button" onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between text-sm font-bold uppercase text-[var(--text-muted)] tracking-wide hover:text-[var(--text-secondary)] transition-colors cursor-pointer py-1"
            >
                {title}
                <ChevronDown size={16} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && <div className="mt-3">{children}</div>}
        </div>
    )
}

// ─── Range Pair Input ─────────────────────────────────────────────────────────

function RangeInputs({ minVal, maxVal, onMinChange, onMaxChange, minPlaceholder = 'Min', maxPlaceholder = 'Max' }: {
    minVal: string; maxVal: string
    onMinChange: (v: string) => void; onMaxChange: (v: string) => void
    minPlaceholder?: string; maxPlaceholder?: string
}) {
    return (
        <div className="flex gap-2">
            <Input type="number" placeholder={minPlaceholder} value={minVal}
                onChange={(e) => onMinChange(e.target.value)}
                className="h-9 text-sm" />
            <Input type="number" placeholder={maxPlaceholder} value={maxVal}
                onChange={(e) => onMaxChange(e.target.value)}
                className="h-9 text-sm" />
        </div>
    )
}

function FilterTag({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span className="inline-flex items-center gap-1.5 bg-primary/10 border border-primary/30 text-primary text-xs font-bold px-3 py-1.5 rounded-full">
            {label}
            <button onClick={onRemove} className="ml-1 hover:opacity-60 cursor-pointer"><X size={12} /></button>
        </span>
    )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatStartsIn(startTime: string): string {
    const diff = new Date(startTime).getTime() - Date.now()
    if (diff <= 0) return "Starting…"
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor((diff % 3_600_000) / 60_000)
    if (h > 0) return `${h}h ${m}m`
    return `${m}m`
}

// ─── Auction Card ─────────────────────────────────────────────────────────────

function AuctionCard({ auction, index }: { auction: Auction; index: number }) {
    const currentBid = getCurrentBid(auction)
    const bidCount = getBidCount(auction)
    const antiSnipe = isAntiSnipeActive(auction)
    const isActive = auction.status === "ACTIVE"
    const image = auction.listing.images?.[0] ?? "/assets/images/hero-bg.png"
    const vehicle = `${auction.listing.year ?? ""} ${auction.listing.make ?? ""} ${auction.listing.model ?? ""}`.trim()
    const l = auction.listing
    const hasSpecs = l.year || l.mileage != null || l.fuelType || l.bodyType || l.location || l.deliveryAvailable
    const grade = auction.listing.exteriorGrade
    const gradeStyle: { dot: string; text: string; border: string; bg: string; label: string } | null =
        grade === 1 ? { dot: 'bg-emerald-500', text: 'text-emerald-300', border: 'border-emerald-500/40', bg: 'bg-emerald-500/15', label: 'Excellent — minimal/no wear' } :
        grade === 2 ? { dot: 'bg-lime-500',    text: 'text-lime-300',    border: 'border-lime-500/40',    bg: 'bg-lime-500/15',    label: 'Very good — light wear' } :
        grade === 3 ? { dot: 'bg-amber-500',   text: 'text-amber-300',   border: 'border-amber-500/40',   bg: 'bg-amber-500/15',   label: 'Good — moderate damage' } :
        grade === 4 ? { dot: 'bg-orange-500',  text: 'text-orange-300',  border: 'border-orange-500/40',  bg: 'bg-orange-500/15',  label: 'Fair — noticeable damage' } :
        grade === 5 ? { dot: 'bg-red-500',     text: 'text-red-300',     border: 'border-red-500/40',     bg: 'bg-red-500/15',     label: 'Poor — heavy damage' } :
        null

    return (
        <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.06, duration: 0.4 }}
        >
            <Link
                href={`/auctions/live/${auction.id}`}
                className="group block bg-[var(--bg-card)] rounded-2xl overflow-hidden border border-[var(--border-default)] hover:border-red-500/30 transition-all duration-300 hover:shadow-[0_8px_30px_rgba(220,38,38,0.12)] hover:-translate-y-1"
            >
                {/* Image */}
                <div className="relative h-52 overflow-hidden">
                    {auction.listing.images && auction.listing.images.length > 1 ? (
                        <CardImageCarousel
                            images={auction.listing.images}
                            alt={auction.listing.title}
                            sizes="(max-width: 768px) 100vw, 33vw"
                            imageClassName="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                    ) : (
                        <Image
                            src={image}
                            alt={auction.listing.title}
                            fill
                            sizes="(max-width: 768px) 100vw, 33vw"
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                        />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/10 to-transparent pointer-events-none z-10" />

                    {/* Featured Badge — matches Buy Cars card treatment */}
                    {auction.listing.isFeatured && <FeaturedBadge />}

                    {/* Status badge + trust badges stack */}
                    <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-1.5">
                        <div className="flex items-center gap-2">
                            {isActive ? (
                                <span className="flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-bold px-2.5 py-1 rounded-full shadow-[0_0_10px_rgba(220,38,38,0.5)]">
                                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> LIVE
                                </span>
                            ) : (
                                <span className="flex items-center gap-1.5 bg-black/60 backdrop-blur text-slate-300 text-[10px] font-bold px-2.5 py-1 rounded-full border border-[var(--border-default)]">
                                    <Clock size={9} /> {formatStartsIn(auction.startTime)}
                                </span>
                            )}
                            {antiSnipe && (
                                <span className="flex items-center gap-1 bg-amber-500/90 text-white text-[9px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                                    <Zap size={8} /> SNIPE
                                </span>
                            )}
                        </div>
                        {(l.badgeTier === 'STANDARD' || l.badgeTier === 'PREMIUM') && (
                            <div className="flex flex-col gap-1.5 drop-shadow-md">
                                <div className="flex items-center gap-1 bg-white/90 backdrop-blur-md text-emerald-700 text-[10px] font-bold px-2 py-1 rounded shadow-sm border border-emerald-500/30">
                                    <ShieldCheck size={12} className="text-emerald-500" /> Verified
                                </div>
                                <div className="flex items-center gap-1 bg-white/90 backdrop-blur-md text-blue-700 text-[10px] font-bold px-2 py-1 rounded shadow-sm border border-blue-500/30">
                                    <BadgeCheck size={12} className="text-blue-500" /> VIN Report
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Top-right stack: wishlist, bid count, grade */}
                    <div className="absolute top-3 right-3 z-20 flex flex-col items-end gap-1.5">
                        <WishlistButton listingId={auction.listing.id} />
                        <div className="flex items-center gap-1 bg-black/50 backdrop-blur px-2.5 py-1 rounded-full border border-[var(--border-default)] text-white text-[10px] font-bold">
                            <Users size={10} className="text-slate-400" /> {bidCount}
                        </div>
                        {gradeStyle && (
                            <span
                                title={gradeStyle.label}
                                className={`inline-flex items-center gap-1.5 backdrop-blur ${gradeStyle.bg} ${gradeStyle.text} border ${gradeStyle.border} px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${gradeStyle.dot}`} />
                                Grade {grade}
                            </span>
                        )}
                    </div>

                </div>

                {/* Footer */}
                <div className="px-4 pt-3 pb-4">
                    {/* Vehicle label — moved out of the image so it can't collide with the carousel counter */}
                    <div className="mb-3">
                        <p className="text-[var(--text-muted)] text-[10px] uppercase tracking-widest font-bold mb-0.5">{vehicle}</p>
                        <h3 className="text-[var(--text-primary)] font-bold text-base leading-tight line-clamp-1">{auction.listing.title}</h3>
                    </div>

                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold">
                                {bidCount > 0 ? "Current Bid" : "Starting Bid"}
                            </p>
                            <p className="text-2xl font-black text-[var(--text-primary)] font-mono mt-0.5">
                                £{currentBid.toLocaleString()}
                            </p>
                        </div>
                        <div className="text-right">
                            {isActive ? (
                                <>
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold">Ends In</p>
                                    <div className="text-red-400 font-mono font-bold text-sm mt-0.5">
                                        <CountdownTimer targetDate={new Date(auction.endTime)} minimal />
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="text-[10px] text-[var(--text-muted)] uppercase tracking-widest font-bold">Starts In</p>
                                    <p className="text-[var(--text-secondary)] font-mono font-bold text-sm mt-0.5">{formatStartsIn(auction.startTime)}</p>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Badge Tier Label — mirrors the Buy Cars card treatment */}
                    {l.badgeTier && l.badgeTier !== 'FREE' && (
                        <div className="flex items-center gap-2 mb-2">
                            {l.badgeTier === 'PREMIUM' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-gradient-to-r from-amber-500/20 to-orange-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
                                    <Star size={10} className="fill-amber-400" /> Premium
                                </span>
                            )}
                            {l.badgeTier === 'STANDARD' && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide bg-blue-500/15 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">
                                    <ShieldCheck size={10} /> Standard
                                </span>
                            )}
                        </div>
                    )}

                    {/* Estate chip — mirrors the Buy Cars card treatment */}
                    {l.isDepartedSale && (
                        <div className="flex items-center gap-2 mb-2">
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide bg-slate-500/10 dark:bg-[var(--bg-card)] text-slate-600 dark:text-[var(--text-muted)] border border-slate-500/20 dark:border-[var(--border-default)] px-2 py-0.5 rounded-full">
                                Estate
                            </span>
                        </div>
                    )}

                    {/* Specs Tags — mirrors the Buy Cars card treatment */}
                    {hasSpecs && (
                        <div className="flex flex-wrap gap-1.5 mb-3">
                            {l.year && (
                                <span className="inline-flex items-center gap-1 bg-slate-500/10 dark:bg-[var(--bg-card)] border border-slate-500/20 dark:border-[var(--border-default)] text-slate-600 dark:text-[var(--text-muted)] text-[10px] font-semibold px-2 py-1 rounded-md">
                                    <Calendar size={10} /> {l.year}
                                </span>
                            )}
                            {l.mileage != null && (
                                <span className="inline-flex items-center gap-1 bg-slate-500/10 dark:bg-[var(--bg-card)] border border-slate-500/20 dark:border-[var(--border-default)] text-slate-600 dark:text-[var(--text-muted)] text-[10px] font-semibold px-2 py-1 rounded-md">
                                    <Gauge size={10} /> {l.mileage.toLocaleString()} mi
                                </span>
                            )}
                            {l.fuelType && FUEL_TYPE_LABELS[l.fuelType] && (
                                <span className="inline-flex items-center gap-1 bg-slate-500/10 dark:bg-[var(--bg-card)] border border-slate-500/20 dark:border-[var(--border-default)] text-slate-600 dark:text-[var(--text-muted)] text-[10px] font-semibold px-2 py-1 rounded-md">
                                    <Fuel size={10} /> {FUEL_TYPE_LABELS[l.fuelType]}
                                </span>
                            )}
                            {l.bodyType && BODY_TYPE_LABELS[l.bodyType] && (
                                <span className="inline-flex items-center gap-1 bg-slate-500/10 dark:bg-[var(--bg-card)] border border-slate-500/20 dark:border-[var(--border-default)] text-slate-600 dark:text-[var(--text-muted)] text-[10px] font-semibold px-2 py-1 rounded-md">
                                    <Car size={10} /> {BODY_TYPE_LABELS[l.bodyType]}
                                </span>
                            )}
                            {l.location && (
                                <span className="inline-flex items-center gap-1 bg-slate-500/10 dark:bg-[var(--bg-card)] border border-slate-500/20 dark:border-[var(--border-default)] text-slate-600 dark:text-[var(--text-muted)] text-[10px] font-semibold px-2 py-1 rounded-md">
                                    <MapPin size={10} /> {l.location.split(',')[0].trim()}
                                </span>
                            )}
                            {l.deliveryAvailable && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                    <Truck size={11} /> Delivery
                                </span>
                            )}
                        </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-[var(--border-default)]">
                        {auction.buyItNowPrice ? (
                            <span className="text-[10px] text-[var(--text-muted)]">Buy it now: £{Number(auction.buyItNowPrice).toLocaleString()}</span>
                        ) : (
                            <span />
                        )}
                        <span className={`flex items-center gap-1 text-xs font-bold transition-colors ${isActive ? "text-primary group-hover:text-red-400" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"}`}>
                            {isActive ? "Bid Now" : "View"} <ChevronRight size={12} />
                        </span>
                    </div>
                </div>
            </Link>
        </motion.div>
    )
}

// ─── Skeleton Card ────────────────────────────────────────────────────────────

function SkeletonCard() {
    return (
        <div className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl overflow-hidden animate-pulse">
            <div className="h-52 bg-[var(--bg-input)]" />
            <div className="p-4 space-y-3">
                <div className="h-3 bg-[var(--bg-input)] rounded w-1/3" />
                <div className="h-6 bg-[var(--bg-input)] rounded w-1/2" />
                <div className="h-px bg-[var(--bg-card)]" />
                <div className="flex justify-between">
                    <div className="h-3 bg-[var(--bg-input)] rounded w-1/4" />
                    <div className="h-3 bg-[var(--bg-input)] rounded w-1/5" />
                </div>
            </div>
        </div>
    )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: "live" | "upcoming" }) {
    return (
        <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[var(--bg-input)] border border-[var(--border-default)] flex items-center justify-center mb-4 shadow-lg">
                {tab === "live" ? <Flame size={24} className="text-[var(--text-muted)]" /> : <Calendar size={24} className="text-[var(--text-muted)]" />}
            </div>
            <p className="text-[var(--text-secondary)] font-bold text-sm">
                {tab === "live" ? "No live auctions right now" : "No upcoming auctions"}
            </p>
            <p className="text-[var(--text-muted)] text-xs mt-1.5 max-w-xs leading-relaxed">
                {tab === "live"
                    ? "Auctions go live automatically at their scheduled time. Check back soon."
                    : "New auctions are added regularly — check back to catch the next one."}
            </p>
            <Link href="/sell" className="mt-5 inline-flex items-center gap-2 text-xs font-bold text-primary hover:text-red-400 transition-colors">
                List your car for auction <ChevronRight size={13} />
            </Link>
        </div>
    )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuctionsBrowsePage() {
    const [activeTab, setActiveTab] = React.useState<"live" | "upcoming">("live")
    const [track, setTrack] = React.useState<"seller" | "buyer">("seller")
    const [liveAuctions, setLiveAuctions] = React.useState<Auction[]>([])
    const [scheduledAuctions, setScheduledAuctions] = React.useState<Auction[]>([])
    const [loading, setLoading] = React.useState(true)
    const [error, setError] = React.useState<string | null>(null)
    const [search, setSearch] = React.useState("")
    const [lastRefresh, setLastRefresh] = React.useState(Date.now())

    const { user, profile, loading: authLoading } = useAuth()
    const canTrade = canAccessTradeStock(profile)

    const { location: userLocation, setPostcode } = useLocation()
    const { trackEvent } = useAnalytics()
    const [detectingLocation, setDetectingLocation] = React.useState(false)

    // Debounced search tracking — the search box filters live with no submit
    // button, so log a 'search' analytics event only once typing settles.
    React.useEffect(() => {
        const q = search.trim()
        if (!q) return
        const timer = setTimeout(() => trackEvent('search', { query: q }), 800)
        return () => clearTimeout(timer)
    }, [search, trackEvent])

    // Filters — draft (`filters`, edited in the sidebar) vs `appliedFilters`
    // (committed on "Apply Filters", same two-stage pattern as /search)
    const [isFilterOpen, setIsFilterOpen] = React.useState(false)
    const [filters, setFilters] = React.useState<FilterState>(INITIAL_FILTERS)
    const [appliedFilters, setAppliedFilters] = React.useState<FilterState>(INITIAL_FILTERS)

    const set = <K extends keyof FilterState>(key: K, val: FilterState[K]) =>
        setFilters(prev => ({ ...prev, [key]: val }))

    const load = React.useCallback(async () => {
        // Guests and non-dealers never get the grid, and /auctions/active and
        // /auctions/scheduled now refuse them outright — fetching anyway would
        // just paint "Failed to load auctions" behind the gate.
        if (authLoading || !canTrade) {
            setLoading(false)
            return
        }
        try {
            setLoading(true)
            setError(null)
            const [live, scheduled] = await Promise.all([getActiveAuctions(), getScheduledAuctions()])
            setLiveAuctions(live)
            setScheduledAuctions(scheduled)
            setLastRefresh(Date.now())
        } catch {
            setError("Failed to load auctions.")
        } finally {
            setLoading(false)
        }
    }, [authLoading, canTrade])

    React.useEffect(() => { load() }, [load])

    const sourceAuctions = activeTab === "live" ? liveAuctions : scheduledAuctions

    const handleDetectLocation = async () => {
        if (!navigator?.geolocation) return
        setDetectingLocation(true)
        try {
            const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
            )
            const { latitude, longitude } = pos.coords
            const resp = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            )
            const data = await resp.json()
            const city = data.address?.city || data.address?.town || data.address?.village || data.address?.county || ''
            if (city) set('location', city)
        } catch {
            // silently ignore — user may have denied permission
        } finally {
            setDetectingLocation(false)
        }
    }

    const activeFilterCount = React.useMemo(() => {
        let count = 0
        if (appliedFilters.vehicleType && appliedFilters.vehicleType !== 'CAR') count++
        if (appliedFilters.make) count++
        if (appliedFilters.model) count++
        if (appliedFilters.bodyType) count++
        if (appliedFilters.minPrice || appliedFilters.maxPrice) count++
        if (appliedFilters.minYear || appliedFilters.maxYear) count++
        if (appliedFilters.minMileage || appliedFilters.maxMileage) count++
        if (appliedFilters.fuelTypes.length) count++
        if (appliedFilters.transmissions.length) count++
        if (appliedFilters.color) count++
        if (appliedFilters.minDoors) count++
        if (appliedFilters.minSeats) count++
        if (appliedFilters.minEngine || appliedFilters.maxEngine) count++
        if (appliedFilters.maxCo2) count++
        if (appliedFilters.conditions.length) count++
        if (appliedFilters.ulezCompliant) count++
        if (appliedFilters.euroStandard) count++
        if (appliedFilters.minBhp || appliedFilters.maxBhp) count++
        if (appliedFilters.features.length) count++
        if (appliedFilters.location) count++
        if (appliedFilters.maxDistanceMi) count++
        if (appliedFilters.sellerType) count++
        if (appliedFilters.deliveryAvailable) count++
        if (appliedFilters.isImported) count++
        return count
    }, [appliedFilters])

    const handleApplyFilters = () => {
        setAppliedFilters({ ...filters })
        setIsFilterOpen(false)
    }
    const handleResetFilters = () => {
        setFilters(INITIAL_FILTERS)
        setAppliedFilters(INITIAL_FILTERS)
    }
    const handleSortChange = (value: SortOption) => {
        setFilters(prev => ({ ...prev, sortBy: value }))
        setAppliedFilters(prev => ({ ...prev, sortBy: value }))
    }
    const toggleFuelType = (f: string) => setFilters(prev => ({ ...prev, fuelTypes: prev.fuelTypes.includes(f) ? prev.fuelTypes.filter(x => x !== f) : [...prev.fuelTypes, f] }))
    const toggleTransmission = (t: string) => setFilters(prev => ({ ...prev, transmissions: prev.transmissions.includes(t) ? prev.transmissions.filter(x => x !== t) : [...prev.transmissions, t] }))
    const clearFilter = (patch: Partial<FilterState>) => {
        const u = { ...appliedFilters, ...patch }
        setFilters(u); setAppliedFilters(u)
    }

    const displayed = React.useMemo(() => {
        let filtered = sourceAuctions.filter(a => {
            const l = a.listing
            if (search) {
                const q = search.toLowerCase()
                const matchesSearch =
                    l.title.toLowerCase().includes(q) ||
                    (l.make ?? "").toLowerCase().includes(q) ||
                    (l.model ?? "").toLowerCase().includes(q)
                if (!matchesSearch) return false
            }
            if (appliedFilters.vehicleType && l.vehicleType && l.vehicleType !== appliedFilters.vehicleType) return false
            if (appliedFilters.make && l.make !== appliedFilters.make) return false
            if (appliedFilters.model && l.model !== appliedFilters.model) return false
            if (appliedFilters.bodyType && l.bodyType !== appliedFilters.bodyType) return false
            const price = getCurrentBid(a)
            if (appliedFilters.minPrice && price < Number(appliedFilters.minPrice)) return false
            if (appliedFilters.maxPrice && price > Number(appliedFilters.maxPrice)) return false
            if (appliedFilters.minYear && (!l.year || l.year < Number(appliedFilters.minYear))) return false
            if (appliedFilters.maxYear && (!l.year || l.year > Number(appliedFilters.maxYear))) return false
            if (appliedFilters.minMileage && (l.mileage == null || l.mileage < Number(appliedFilters.minMileage))) return false
            if (appliedFilters.maxMileage && (l.mileage == null || l.mileage > Number(appliedFilters.maxMileage))) return false
            if (appliedFilters.fuelTypes.length && (!l.fuelType || !appliedFilters.fuelTypes.includes(l.fuelType))) return false
            if (appliedFilters.transmissions.length && (!l.transmission || !appliedFilters.transmissions.includes(l.transmission))) return false
            if (appliedFilters.color && !(l.color ?? '').toLowerCase().includes(appliedFilters.color.toLowerCase())) return false
            if (appliedFilters.minDoors && (l.doors == null || l.doors < Number(appliedFilters.minDoors))) return false
            if (appliedFilters.minSeats && (l.seats == null || l.seats < Number(appliedFilters.minSeats))) return false
            if (appliedFilters.minEngine && (l.engineSize == null || l.engineSize < Number(appliedFilters.minEngine))) return false
            if (appliedFilters.maxEngine && (l.engineSize == null || l.engineSize > Number(appliedFilters.maxEngine))) return false
            if (appliedFilters.maxCo2 && (l.co2Emissions == null || l.co2Emissions > Number(appliedFilters.maxCo2))) return false
            if (appliedFilters.conditions.length && (!l.condition || !appliedFilters.conditions.includes(l.condition as VehicleConditionValue))) return false
            if (appliedFilters.ulezCompliant && (l.ulezCompliant == null || (appliedFilters.ulezCompliant === 'yes') !== l.ulezCompliant)) return false
            if (appliedFilters.euroStandard && l.euroStandard !== appliedFilters.euroStandard) return false
            if (appliedFilters.minBhp && (l.bhp == null || l.bhp < Number(appliedFilters.minBhp))) return false
            if (appliedFilters.maxBhp && (l.bhp == null || l.bhp > Number(appliedFilters.maxBhp))) return false
            if (appliedFilters.features.length && !appliedFilters.features.every(f => (l.features ?? []).includes(f))) return false
            if (appliedFilters.location && !(l.location ?? '').toLowerCase().includes(appliedFilters.location.toLowerCase())) return false
            if (appliedFilters.sellerType) {
                const isDealer = !!l.seller?.dealerProfile
                if (appliedFilters.sellerType === 'DEALER' && !isDealer) return false
                if (appliedFilters.sellerType === 'PRIVATE' && isDealer) return false
            }
            if (appliedFilters.deliveryAvailable && !l.deliveryAvailable) return false
            if (appliedFilters.isImported === 'yes' && !l.isImported) return false
            if (appliedFilters.isImported === 'no' && l.isImported) return false
            return true
        })

        if (appliedFilters.maxDistanceMi && userLocation?.lat && userLocation?.lng) {
            filtered = filtered.filter(a =>
                a.listing.latitude != null && a.listing.longitude != null &&
                haversineDistanceMiles(userLocation.lat!, userLocation.lng!, a.listing.latitude, a.listing.longitude) <= appliedFilters.maxDistanceMi!
            )
        }

        return filtered.sort((a, b) => {
            switch (appliedFilters.sortBy) {
                case "price_low": return getCurrentBid(a) - getCurrentBid(b)
                case "price_high": return getCurrentBid(b) - getCurrentBid(a)
                case "newest": return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                case "ending_soon":
                default:
                    return new Date(a.endTime).getTime() - new Date(b.endTime).getTime()
            }
        })
    }, [sourceAuctions, search, appliedFilters, userLocation])

    // A signed-in buyer or seller is bounced off the WHOLE route, hero included —
    // not just the grid below. There is nothing on this page for them: they can't
    // browse the stock, can't bid, and the pitch underneath is aimed at dealers.
    //
    // Guests are deliberately NOT blocked here. They still get the hero and How
    // It Works — that is the dealer-recruitment pitch, it shows no vehicles, and
    // it is what makes the Trade Exchange findable by the dealers it is for.
    //
    // Gated on `!authLoading` on purpose: this page is server-rendered for SEO
    // and AuthContext always starts unresolved, so blocking during the loading
    // window would serve crawlers a "Dealers only" panel instead of the pitch.
    if (!authLoading && user && !canTrade) {
        return (
            <div className="min-h-screen" style={{ background: 'var(--bg-body)' }}>
                <RequireAuth allowedRoles={TRADE_EXCHANGE_ROLES} requireVerifiedDealer>{null}</RequireAuth>
            </div>
        )
    }

    return (
        <div className="min-h-screen" style={{ background: 'var(--bg-body)' }}>

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <section className="relative overflow-hidden text-white" style={{ marginTop: '-80px', paddingTop: '80px' }}>
                {/* Hero image */}
                <Image
                    src="/assets/images/live-auction-hero.jpg"
                    alt="Live car auction"
                    fill
                    priority
                    className="object-cover object-center"
                />
                {/* Overlays keep text readable: a lighter left-anchored scrim in light mode (so the photo still shows through on the right), a fuller dark wash in dark mode */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/55 via-black/15 to-transparent dark:bg-gradient-to-b dark:from-slate-900/80 dark:via-slate-900/70 dark:to-slate-900" />
                <div className="absolute inset-0 dark:bg-[radial-gradient(ellipse_at_top_left,rgba(237,28,36,0.18)_0%,transparent_55%)]" />
                <div className="absolute inset-0 dark:bg-[radial-gradient(ellipse_at_bottom_right,rgba(15,23,42,0.85)_0%,transparent_60%)]" />

                <div className="container mx-auto px-6 py-20 md:py-28 relative z-10">
                    <div className="max-w-4xl">
                        {/* Live pill */}
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="inline-flex items-center gap-2.5 bg-red-600/10 border border-red-500/20 rounded-full px-4 py-1.5 mb-6"
                        >
                            <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                            <span className="text-xs font-bold text-red-400 uppercase tracking-widest">
                                {liveAuctions.length > 0 ? `${liveAuctions.length} Auction${liveAuctions.length !== 1 ? "s" : ""} Live Now` : "Carmazium Live Auctions"}
                            </span>
                        </motion.div>

                        <motion.h1
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.05, duration: 0.6 }}
                            className="text-5xl md:text-7xl font-black font-heading tracking-tight leading-[0.92] mb-5"
                        >
                            The Gavel<br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-red-700">
                                Drops Here.
                            </span>
                        </motion.h1>

                        <motion.p
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.12 }}
                            className="text-slate-400 text-lg max-w-lg leading-relaxed mb-8"
                        >
                            Real-time bidding on verified vehicles. Compete live, win fairly, connect with sellers instantly.
                        </motion.p>

                        {/* Stats row */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.24 }}
                            className="flex flex-wrap items-center gap-x-8 gap-y-3"
                        >
                            {[
                                { icon: Flame, label: `${liveAuctions.length} Live`, color: "text-red-400" },
                                { icon: Calendar, label: `${scheduledAuctions.length} Upcoming`, color: "text-slate-400" },
                                { icon: Timer, label: "24-Hour Auctions", color: "text-slate-400" },
                                { icon: Zap, label: "Anti-Snipe Rule", color: "text-amber-400" },
                                { icon: CheckCircle, label: "Free to List", color: "text-emerald-400" },
                            ].map(({ icon: Icon, label, color }) => (
                                <div key={label} className={`flex items-center gap-1.5 text-sm font-semibold ${color}`}>
                                    <Icon size={13} /> {label}
                                </div>
                            ))}
                        </motion.div>

                        {/* List Your Car CTA — moved up from the page-bottom closing card so it's
                            visible without scrolling past the whole How It Works section */}
                        <motion.div
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.32 }}
                            className="mt-8"
                        >
                            <Link href="/sell" className="inline-block w-full sm:w-auto">
                                <Button size="lg" shape="pill" className="w-full sm:w-auto px-6 sm:px-10 text-sm sm:text-lg shadow-neon group">
                                    List Your Car for Auction
                                    <ArrowRight className="ml-2 w-4 h-4 shrink-0 group-hover:translate-x-1 transition-transform" />
                                </Button>
                            </Link>
                        </motion.div>
                    </div>
                </div>

                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            </section>

            {/* Everything from here to the How It Works section is dealer-only:
                the section tabs, the filters and the vehicle grid. The hero
                above and the How It Works block below stay public on purpose —
                they are the dealer-recruitment pitch, and neither shows a
                single auction vehicle.

                There is deliberately no blurred teaser of real stock any more.
                It showed live trade prices to whoever loaded the page, which is
                exactly what a trade-only room must not do. */}
            <RequireAuth
                title="Sign up to enter the Trade Exchange"
                signupRole="DEALER"
                allowedRoles={TRADE_EXCHANGE_ROLES}
                requireVerifiedDealer
                message="Live and upcoming vehicle auctions are open to registered dealers. Signing up takes a minute."
            >

            {/* ── Trade Exchange section tabs ──────────────────────────────
                The outer layer: which part of the Trade Exchange you're in.
                Auction is the only section today, so this row looks redundant
                on its own — it exists so a second section (trade sales, direct
                buy) can be added without restructuring the page or moving the
                Live/Upcoming tabs that sit inside this one.

                Deliberately NOT merged with the Live/Upcoming row below: those
                filter auctions BY STATE, this selects the section. Collapsing
                them would put "Upcoming" and "Trade Sales" in the same control
                as if they were the same kind of choice. */}
            <div className="border-b" style={{ borderColor: 'var(--border-default)', background: 'var(--bg-body)' }}>
                <div className="container mx-auto px-4 md:px-6">
                    <nav className="flex items-center gap-1" aria-label="Trade Exchange sections">
                        <span
                            aria-current="page"
                            className="relative px-4 py-3 text-sm font-black uppercase tracking-widest text-primary"
                        >
                            Auction
                            <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary rounded-full" />
                        </span>
                    </nav>
                </div>
            </div>

            {/* ── Filter bar ───────────────────────────────────────────────── */}
            <div className="sticky top-[80px] z-30 backdrop-blur-xl border-b" style={{ background: 'var(--bg-header)', borderColor: 'var(--border-default)' }}>
                <div className="container mx-auto px-4 md:px-6 py-3 md:py-0 md:h-14 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4">
                    {/* Tabs */}
                    <div className="flex items-center gap-1 bg-[var(--bg-input)] border border-[var(--border-default)] rounded-xl p-1 self-start md:self-auto">
                        {(["live", "upcoming"] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`relative px-3 md:px-5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${
                                    activeTab === tab ? "text-primary" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                                }`}
                            >
                                {activeTab === tab && (
                                    <motion.div
                                        layoutId="tab-bg"
                                        className="absolute inset-0 bg-primary/20 border border-primary/30 rounded-lg"
                                        transition={{ type: "spring", bounce: 0.2, duration: 0.3 }}
                                    />
                                )}
                                <span className="relative z-10 flex items-center gap-1.5 md:gap-2">
                                    {tab === "live" ? <Flame size={11} className={activeTab === tab ? "text-red-400" : ""} /> : <Calendar size={11} />}
                                    {tab}
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${activeTab === tab ? "bg-primary/30 text-red-300" : "bg-[var(--bg-card)] text-[var(--text-muted)]"}`}>
                                        {tab === "live" ? liveAuctions.length : scheduledAuctions.length}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Search + filters toggle + refresh — full width on mobile, capped on md+ */}
                    <div className="flex items-center gap-2 w-full md:w-auto md:flex-1 md:max-w-lg">
                        <div className="relative flex-1 min-w-0">
                            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search make, model…"
                                className="w-full bg-[var(--bg-input)] border border-[var(--border-default)] rounded-xl pl-9 pr-3 py-1.5 text-xs placeholder-[var(--text-muted)] focus:outline-none focus:border-primary/40 transition-colors"
                            />
                        </div>
                        <button
                            onClick={() => setIsFilterOpen(v => !v)}
                            className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold uppercase tracking-widest transition-all ${
                                isFilterOpen || activeFilterCount > 0
                                    ? "border-primary/40 text-primary bg-primary/10"
                                    : "border-[var(--border-default)] text-[var(--text-muted)] hover:text-primary dark:hover:text-white hover:border-primary/30"
                            }`}
                        >
                            <Filter size={13} /> Filters
                            {activeFilterCount > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-primary/30 text-red-300">{activeFilterCount}</span>
                            )}
                        </button>
                        <button
                            onClick={load}
                            disabled={loading}
                            className="shrink-0 p-2 rounded-xl border border-[var(--border-default)] text-[var(--text-muted)] hover:text-primary dark:hover:text-white hover:border-primary/30 transition-all"
                            title="Refresh"
                        >
                            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Auction Grid ──────────────────────────────────────────────── */}
            <div className="container mx-auto px-5 py-8 flex flex-col lg:flex-row gap-8">

                {/* ── Sidebar Overlay (Mobile) ── */}
                {isFilterOpen && (
                    <div
                        className="fixed inset-0 z-[55] bg-slate-950/80 backdrop-blur-sm lg:hidden transition-opacity"
                        onClick={() => setIsFilterOpen(false)}
                    />
                )}

                {/* ── Sidebar ──────────────────────────────────────────────────── */}
                <aside className={`
                    fixed inset-x-0 bottom-0 z-[60] lg:z-10 flex flex-col h-[85vh] bg-[var(--bg-dropdown)] border-t border-[var(--border-default)] rounded-t-3xl shadow-2xl transition-transform duration-300
                    lg:static lg:w-72 lg:flex-shrink-0 lg:glass-card lg:border lg:rounded-2xl lg:shadow-none lg:translate-y-0 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:flex lg:flex-col lg:overflow-visible lg:p-0
                    ${isFilterOpen ? 'translate-y-0' : 'translate-y-full lg:translate-y-0'}
                `}>
                    <div className="flex justify-between items-center p-6 pb-4 border-b border-[var(--border-default)] lg:px-6 lg:pt-6 lg:pb-4 lg:border-b lg:border-[var(--border-default)] shrink-0">
                        <h3 className="font-heading font-bold text-xl">Filters</h3>
                        <div className="flex items-center gap-4">
                            {activeFilterCount > 0 && (
                                <button onClick={handleResetFilters} className="text-xs text-primary font-normal cursor-pointer hover:underline flex items-center gap-1">
                                    <RotateCcw size={12} /> Reset All
                                </button>
                            )}
                            <button
                                onClick={() => setIsFilterOpen(false)}
                                className="lg:hidden text-[var(--text-muted)] hover:text-primary dark:hover:text-white bg-[var(--bg-card)] w-8 h-8 rounded-full flex items-center justify-center"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="px-6 py-4 overflow-y-auto flex-1 scrollbar-hide">
                        <div className="space-y-4">
                            {/* Vehicle Category */}
                            <div className="pb-4 border-b border-[var(--border-default)]">
                                <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)] mb-3">Vehicle Category</p>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { value: 'CAR', label: '🚗 Cars' },
                                        { value: 'MOTORCYCLE', label: '🏍 Bikes' },
                                        { value: 'HGV', label: '🚛 HGV' },
                                    ].map((opt) => {
                                        const active = filters.vehicleType === opt.value
                                        return (
                                            <button key={opt.value} type="button"
                                                onClick={() => setFilters(prev => ({ ...prev, vehicleType: opt.value }))}
                                                className={`py-2.5 rounded-lg border text-sm font-semibold transition-all text-center ${
                                                    active
                                                        ? 'border-primary bg-primary/10 text-primary shadow-[0_0_12px_rgba(237,28,36,0.15)]'
                                                        : 'border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:border-primary/30 hover:text-[var(--text-secondary)]'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Body Type — hidden for motorcycles */}
                            {filters.vehicleType !== 'MOTORCYCLE' && (
                            <FilterSection title="Body Type">
                                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                                    {BODY_TYPE_KEYS.map((key) => {
                                        const Icon = BODY_TYPE_ICONS[key]
                                        const isActive = filters.bodyType === key
                                        return (
                                            <button key={key} type="button"
                                                onClick={() => set('bodyType', filters.bodyType === key ? '' : key)}
                                                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${isActive ? 'bg-primary/15 text-primary border border-primary/30' : 'text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-secondary)] dark:hover:text-white border border-transparent'}`}
                                            >
                                                <Icon className="w-8 h-4 shrink-0" />{SIDEBAR_BODY_TYPE_LABELS[key]}
                                            </button>
                                        )
                                    })}
                                </div>
                            </FilterSection>
                            )}

                            {/* Make & Model */}
                            <FilterSection title="Make / Model" defaultOpen={true}>
                                <div className="space-y-2">
                                    <div className="relative">
                                        <input
                                            list="auction-make-options"
                                            placeholder="Make (e.g. BMW)"
                                            value={filters.make}
                                            onChange={(e) => {
                                                set('make', e.target.value)
                                                set('model', '')
                                            }}
                                            className="h-9 w-full rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] px-3 text-sm placeholder:text-[var(--text-muted)] focus:border-primary focus:outline-none"
                                        />
                                        <datalist id="auction-make-options">
                                            {CAR_MAKES.map(m => <option key={m} value={m} />)}
                                        </datalist>
                                    </div>
                                    {(() => {
                                        const models = getModelsForMake(filters.make)
                                        return models.length > 0 ? (
                                            <div className="max-h-44 overflow-y-auto rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] space-y-0.5 p-1">
                                                <button
                                                    type="button"
                                                    onClick={() => set('model', '')}
                                                    className={`w-full text-left px-3 py-2 rounded text-sm transition-all ${!filters.model ? 'bg-primary/15 text-primary font-semibold' : 'text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-secondary)] dark:hover:text-white'}`}
                                                >
                                                    All {filters.make} models
                                                </button>
                                                {models.map(m => (
                                                    <button
                                                        key={m}
                                                        type="button"
                                                        onClick={() => set('model', m)}
                                                        className={`w-full text-left px-3 py-2 rounded text-sm transition-all ${filters.model === m ? 'bg-primary/15 text-primary font-semibold' : 'text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-secondary)] dark:hover:text-white'}`}
                                                    >
                                                        {m}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <Input
                                                placeholder="Model (e.g. M4)"
                                                value={filters.model}
                                                onChange={(e) => set('model', e.target.value)}
                                                className="h-9 text-sm bg-[var(--bg-input)] border-[var(--border-default)] placeholder:text-[var(--text-muted)]"
                                            />
                                        )
                                    })()}
                                </div>
                            </FilterSection>

                            {/* Current Bid Range */}
                            <FilterSection title="Current Bid (£)" defaultOpen={true}>
                                <RangeInputs minVal={filters.minPrice} maxVal={filters.maxPrice}
                                    onMinChange={(v) => set('minPrice', v)} onMaxChange={(v) => set('maxPrice', v)}
                                    minPlaceholder="Min £" maxPlaceholder="Max £" />
                            </FilterSection>

                            {/* Year Range */}
                            <FilterSection title="Year">
                                <RangeInputs minVal={filters.minYear} maxVal={filters.maxYear}
                                    onMinChange={(v) => set('minYear', v)} onMaxChange={(v) => set('maxYear', v)}
                                    minPlaceholder="From" maxPlaceholder={`${CURRENT_YEAR}`} />
                            </FilterSection>

                            {/* Mileage Range */}
                            <FilterSection title="Mileage (miles)">
                                <RangeInputs minVal={filters.minMileage} maxVal={filters.maxMileage}
                                    onMinChange={(v) => set('minMileage', v)} onMaxChange={(v) => set('maxMileage', v)}
                                    minPlaceholder="Min" maxPlaceholder="Max" />
                            </FilterSection>

                            {/* Fuel Type */}
                            <FilterSection title="Fuel Type">
                                <div className="space-y-2">
                                    {Object.entries(FUEL_TYPE_LABELS).map(([value, label]) => (
                                        <label key={value} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer hover:text-primary transition-colors">
                                            <input type="checkbox" checked={filters.fuelTypes.includes(value)} onChange={() => toggleFuelType(value)}
                                                className="accent-primary rounded w-4 h-4 bg-[var(--bg-input)] border-[var(--border-default)]" />
                                            {label}
                                        </label>
                                    ))}
                                </div>
                            </FilterSection>

                            {/* Transmission */}
                            <FilterSection title="Transmission">
                                <div className="space-y-2">
                                    {Object.entries(TRANSMISSION_LABELS).map(([value, label]) => (
                                        <label key={value} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer hover:text-primary transition-colors">
                                            <input type="checkbox" checked={filters.transmissions.includes(value)} onChange={() => toggleTransmission(value)}
                                                className="accent-primary rounded w-4 h-4 bg-[var(--bg-input)] border-[var(--border-default)]" />
                                            {label}
                                        </label>
                                    ))}
                                </div>
                            </FilterSection>

                            {/* Colour */}
                            <FilterSection title="Colour">
                                <Input placeholder="e.g. White, Black, Blue" value={filters.color}
                                    onChange={(e) => set('color', e.target.value)}
                                    className="h-9 text-sm bg-[var(--bg-input)] border-[var(--border-default)] placeholder:text-[var(--text-muted)]" />
                            </FilterSection>

                            {/* Doors */}
                            <FilterSection title="Doors">
                                <div className="flex gap-2">
                                    {['2', '3', '4', '5'].map(d => (
                                        <button key={d} type="button"
                                            onClick={() => set('minDoors', filters.minDoors === d ? '' : d)}
                                            className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-all cursor-pointer ${filters.minDoors === d ? 'border-primary bg-primary/15 text-primary' : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-primary/30'}`}
                                        >{d}+</button>
                                    ))}
                                </div>
                            </FilterSection>

                            {/* Seats */}
                            <FilterSection title="Seats">
                                <div className="flex gap-2">
                                    {['2', '4', '5', '7'].map(s => (
                                        <button key={s} type="button"
                                            onClick={() => set('minSeats', filters.minSeats === s ? '' : s)}
                                            className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-all cursor-pointer ${filters.minSeats === s ? 'border-primary bg-primary/15 text-primary' : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-primary/30'}`}
                                        >{s}+</button>
                                    ))}
                                </div>
                            </FilterSection>

                            {/* Engine Size */}
                            <FilterSection title="Engine Size (cc)">
                                <RangeInputs minVal={filters.minEngine} maxVal={filters.maxEngine}
                                    onMinChange={(v) => set('minEngine', v)} onMaxChange={(v) => set('maxEngine', v)}
                                    minPlaceholder="Min cc" maxPlaceholder="Max cc" />
                            </FilterSection>

                            {/* CO₂ Emissions */}
                            <FilterSection title="CO₂ (g/km)">
                                <div className="space-y-2">
                                    <Input placeholder="Max g/km" type="number" value={filters.maxCo2}
                                        onChange={(e) => set('maxCo2', e.target.value)}
                                        className="h-9 text-sm bg-[var(--bg-input)] border-[var(--border-default)] placeholder:text-[var(--text-muted)]" />
                                    <div className="flex gap-2">
                                        {['100', '120', '150', '200'].map(v => (
                                            <button key={v} type="button"
                                                onClick={() => set('maxCo2', filters.maxCo2 === v ? '' : v)}
                                                className={`flex-1 py-1.5 rounded-md border text-xs font-semibold transition-all cursor-pointer ${filters.maxCo2 === v ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-primary/30'}`}
                                            >≤{v}</button>
                                        ))}
                                    </div>
                                </div>
                            </FilterSection>

                            {/* Condition */}
                            <FilterSection title="Condition">
                                <div className="space-y-1">
                                    {CONDITION_OPTIONS.map(opt => {
                                        const isActive = filters.conditions.includes(opt.value)
                                        const isCat = opt.value.startsWith('CAT')
                                        return (
                                            <button key={opt.value} type="button"
                                                onClick={() => set('conditions', isActive
                                                    ? filters.conditions.filter(c => c !== opt.value)
                                                    : [...filters.conditions, opt.value]
                                                )}
                                                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all cursor-pointer flex items-center gap-2 ${isActive ? 'bg-primary/15 text-primary border border-primary/30' : isCat ? 'text-amber-500/70 hover:bg-amber-500/10 border border-transparent' : 'text-[var(--text-muted)] hover:bg-[var(--bg-card)] hover:text-[var(--text-secondary)] dark:hover:text-white border border-transparent'}`}
                                            >
                                                <span className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${isActive ? 'bg-primary border-primary' : 'border-white/20'}`}>
                                                    {isActive && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                                </span>
                                                {opt.label}
                                            </button>
                                        )
                                    })}
                                </div>
                            </FilterSection>

                            {/* UK Compliance */}
                            <FilterSection title="UK Compliance">
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-xs text-[var(--text-muted)] mb-1.5 flex items-center gap-1"><ShieldCheck size={11} /> ULEZ / CAZ</p>
                                        <div className="flex gap-2">
                                            {(['yes', 'no', ''] as const).map((v) => (
                                                <button key={v} type="button"
                                                    onClick={() => set('ulezCompliant', v)}
                                                    className={`flex-1 py-1.5 rounded-md border text-xs font-semibold transition-all ${filters.ulezCompliant === v && v !== '' ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300' : v === '' ? filters.ulezCompliant === '' ? 'border-primary bg-primary/10 text-primary' : 'border-[var(--border-default)] text-[var(--text-muted)]' : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-primary/30'}`}
                                                >
                                                    {v === 'yes' ? '✓ ULEZ' : v === 'no' ? '✗ Non' : 'Either'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-[var(--text-muted)] mb-1.5">Euro Standard</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {([{ value: '' as EuroStandardValue | '', label: 'Any' }, ...EURO_OPTIONS]).map(o => (
                                                <button
                                                    key={o.value}
                                                    type="button"
                                                    onClick={() => set('euroStandard', o.value as EuroStandardValue | '')}
                                                    className={`px-3 py-1.5 rounded-md border text-xs font-semibold transition-all cursor-pointer ${filters.euroStandard === o.value ? 'border-primary bg-primary/15 text-primary' : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-primary/30 hover:text-[var(--text-secondary)]'}`}
                                                >
                                                    {o.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </FilterSection>

                            {/* BHP / Power */}
                            <FilterSection title="Power (BHP)">
                                <RangeInputs minVal={filters.minBhp} maxVal={filters.maxBhp}
                                    onMinChange={(v) => set('minBhp', v)} onMaxChange={(v) => set('maxBhp', v)}
                                    minPlaceholder="Min BHP" maxPlaceholder="Max BHP" />
                            </FilterSection>

                            {/* Features / Options */}
                            <FilterSection title="Features / Options">
                                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                    {POPULAR_FEATURES.map(feat => (
                                        <label key={feat} className="flex items-center gap-2 text-sm text-[var(--text-secondary)] cursor-pointer hover:text-primary transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={filters.features.includes(feat)}
                                                onChange={() => setFilters(prev => ({
                                                    ...prev,
                                                    features: prev.features.includes(feat)
                                                        ? prev.features.filter(f => f !== feat)
                                                        : [...prev.features, feat]
                                                }))}
                                                className="accent-primary rounded w-4 h-4 bg-[var(--bg-input)] border-[var(--border-default)]"
                                            />
                                            {feat}
                                        </label>
                                    ))}
                                </div>
                            </FilterSection>

                            {/* Location */}
                            <FilterSection title="Location" defaultOpen={true}>
                                <div className="space-y-1.5">
                                    <div className="flex gap-2">
                                        <Input
                                            placeholder="e.g. London, Manchester, B1…"
                                            value={filters.location}
                                            onChange={(e) => set('location', e.target.value)}
                                            className="h-9 text-sm bg-[var(--bg-input)] border-[var(--border-default)] placeholder:text-[var(--text-muted)] flex-1"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleDetectLocation}
                                            disabled={detectingLocation}
                                            title="Use my location"
                                            className="h-9 w-9 flex items-center justify-center rounded-md border border-[var(--border-default)] bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-50 shrink-0"
                                        >
                                            {detectingLocation
                                                ? <Loader2 size={14} className="animate-spin" />
                                                : <MapPin size={14} />
                                            }
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-[var(--text-secondary)]">Matches listings by city or postcode area</p>
                                </div>
                            </FilterSection>

                            {/* Distance */}
                            <FilterSection title="Distance">
                                <div className="space-y-2">
                                    {!userLocation?.lat && (
                                        <div className="space-y-2">
                                            <p className="text-xs text-[var(--text-muted)]">Allow location or enter your postcode:</p>
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="e.g. M1 1AA"
                                                    className="flex-1 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs placeholder:text-[var(--text-secondary)] focus:outline-none focus:border-primary/50"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') setPostcode((e.target as HTMLInputElement).value)
                                                    }}
                                                    onBlur={(e) => { if (e.target.value) setPostcode(e.target.value) }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    <select
                                        value={filters.maxDistanceMi ?? ''}
                                        onChange={(e) => set('maxDistanceMi', e.target.value === '' ? null : Number(e.target.value))}
                                        disabled={!userLocation?.lat}
                                        className="w-full bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-xs text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus:border-primary/50"
                                    >
                                        <option value="">Any distance</option>
                                        {DISTANCE_CHIPS.map(d => (
                                            <option key={d} value={d}>Within {d} mi</option>
                                        ))}
                                    </select>
                                    {userLocation?.lat && userLocation.source === 'postcode' && userLocation.postcode && (
                                        <p className="text-[10px] text-[var(--text-secondary)]">Using: {userLocation.postcode}</p>
                                    )}
                                </div>
                            </FilterSection>

                            {/* Seller Type */}
                            <FilterSection title="Seller Type">
                                <div className="flex gap-2">
                                    {([
                                        { value: '' as const, label: 'All' },
                                        { value: 'PRIVATE' as const, label: 'Private' },
                                        { value: 'DEALER' as const, label: 'Dealer' },
                                    ]).map(opt => (
                                        <button key={opt.value} type="button"
                                            onClick={() => set('sellerType', opt.value)}
                                            className={`flex-1 py-1.5 rounded-md border text-xs font-semibold transition-all cursor-pointer ${filters.sellerType === opt.value ? 'border-primary bg-primary/15 text-primary' : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-primary/30'}`}
                                        >{opt.label}</button>
                                    ))}
                                </div>
                            </FilterSection>

                            {/* Delivery */}
                            <FilterSection title="Delivery">
                                <button
                                    type="button"
                                    onClick={() => set('deliveryAvailable', !filters.deliveryAvailable)}
                                    className={`flex items-center gap-2 w-full py-1.5 px-2.5 rounded-md border text-xs font-semibold transition-all ${
                                        filters.deliveryAvailable
                                            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                                            : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-primary/30'
                                    }`}
                                >
                                    <Truck size={12} />
                                    Delivery available
                                </button>
                            </FilterSection>

                            {/* Import status */}
                            <FilterSection title="Import">
                                <div className="flex flex-col gap-2">
                                    <button
                                        type="button"
                                        onClick={() => set('isImported', filters.isImported === 'yes' ? '' : 'yes')}
                                        className={`flex items-center gap-2 w-full py-1.5 px-2.5 rounded-md border text-xs font-semibold transition-all ${
                                            filters.isImported === 'yes'
                                                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                                                : 'border-[var(--border-default)] text-[var(--text-muted)] hover:border-primary/30'
                                        }`}
                                    >
                                        Imported vehicles
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => set('isImported', filters.isImported === 'no' ? '' : 'no')}
                                        className={`flex items-center gap-2 w-full py-1.5 px-2.5 rounded-md border text-xs font-semibold transition-all ${
                                            filters.isImported === 'no'
                                                ? 'border-primary/60 text-primary bg-transparent'
                                                : 'border-dashed border-[var(--border-default)] text-[var(--text-muted)] hover:border-primary/30 bg-transparent'
                                        }`}
                                    >
                                        <EyeOff size={12} />
                                        Hide imported cars
                                    </button>
                                </div>
                            </FilterSection>
                        </div>
                    </div>

                    {/* Footer — pinned Apply button (visible on both mobile and desktop) */}
                    <div className="p-4 border-t border-[var(--border-default)] bg-[var(--bg-dropdown)] shrink-0 lg:bg-transparent lg:border-[var(--border-default)]">
                        <Button className="w-full shadow-neon py-6 text-lg lg:py-3 lg:text-sm" onClick={handleApplyFilters}>
                            <span className="lg:hidden">Show Results</span>
                            <span className="hidden lg:inline">Apply Filters</span>
                        </Button>
                    </div>
                </aside>

                {/* ── Results Column ─────────────────────────────────────────── */}
                <div className="flex-1 min-w-0">
                    {/* Sort Bar */}
                    <div className="flex justify-between items-center mb-6 gap-4 flex-wrap">
                        <p className="text-[var(--text-muted)] text-sm">
                            {loading ? <span>Loading...</span> : <>Showing <span className="font-bold">{displayed.length}</span> of <span className="font-bold">{sourceAuctions.length}</span> {activeTab} auctions</>}
                        </p>
                        <select value={appliedFilters.sortBy} onChange={(e) => handleSortChange(e.target.value as SortOption)}
                            className="bg-transparent border border-[var(--border-default)] rounded-lg px-3 py-2 text-sm font-bold cursor-pointer outline-none hover:border-primary/30">
                            {(Object.keys(SORT_LABELS) as SortOption[]).map(opt => (
                                <option key={opt} value={opt} className="bg-[var(--bg-dropdown)] text-[var(--text-primary)]">{SORT_LABELS[opt]}</option>
                            ))}
                        </select>
                    </div>

                    {/* Active Filter Tags */}
                    {activeFilterCount > 0 && (
                        <div className="flex flex-wrap gap-2 mb-6">
                            {appliedFilters.vehicleType !== 'CAR' && <FilterTag label={appliedFilters.vehicleType} onRemove={() => clearFilter({ vehicleType: 'CAR' })} />}
                            {appliedFilters.bodyType && <FilterTag label={SIDEBAR_BODY_TYPE_LABELS[appliedFilters.bodyType]} onRemove={() => clearFilter({ bodyType: '' })} />}
                            {appliedFilters.make && <FilterTag label={`Make: ${appliedFilters.make}`} onRemove={() => clearFilter({ make: '' })} />}
                            {appliedFilters.model && <FilterTag label={`Model: ${appliedFilters.model}`} onRemove={() => clearFilter({ model: '' })} />}
                            {(appliedFilters.minPrice || appliedFilters.maxPrice) && (
                                <FilterTag label={`£${appliedFilters.minPrice || '0'} – £${appliedFilters.maxPrice || '∞'}`} onRemove={() => clearFilter({ minPrice: '', maxPrice: '' })} />
                            )}
                            {(appliedFilters.minYear || appliedFilters.maxYear) && (
                                <FilterTag label={`${appliedFilters.minYear || ''}–${appliedFilters.maxYear || ''}`} onRemove={() => clearFilter({ minYear: '', maxYear: '' })} />
                            )}
                            {(appliedFilters.minMileage || appliedFilters.maxMileage) && (
                                <FilterTag label={`${appliedFilters.minMileage || '0'}–${appliedFilters.maxMileage || '∞'} mi`} onRemove={() => clearFilter({ minMileage: '', maxMileage: '' })} />
                            )}
                            {appliedFilters.fuelTypes.map(f => <FilterTag key={f} label={FUEL_TYPE_LABELS[f] ?? f} onRemove={() => clearFilter({ fuelTypes: appliedFilters.fuelTypes.filter(x => x !== f) })} />)}
                            {appliedFilters.transmissions.map(t => <FilterTag key={t} label={TRANSMISSION_LABELS[t] ?? t} onRemove={() => clearFilter({ transmissions: appliedFilters.transmissions.filter(x => x !== t) })} />)}
                            {appliedFilters.color && <FilterTag label={`Colour: ${appliedFilters.color}`} onRemove={() => clearFilter({ color: '' })} />}
                            {appliedFilters.conditions.map(c => {
                                const label = CONDITION_OPTIONS.find(o => o.value === c)?.label ?? c
                                return <FilterTag key={c} label={`Condition: ${label}`} onRemove={() => clearFilter({ conditions: appliedFilters.conditions.filter(x => x !== c) })} />
                            })}
                            {appliedFilters.ulezCompliant && <FilterTag label={appliedFilters.ulezCompliant === 'yes' ? 'ULEZ Compliant' : 'Non-ULEZ'} onRemove={() => clearFilter({ ulezCompliant: '' })} />}
                            {appliedFilters.euroStandard && <FilterTag label={appliedFilters.euroStandard.replace('_', ' ')} onRemove={() => clearFilter({ euroStandard: '' })} />}
                            {(appliedFilters.minBhp || appliedFilters.maxBhp) && <FilterTag label={`BHP: ${appliedFilters.minBhp || '0'}–${appliedFilters.maxBhp || '∞'}`} onRemove={() => clearFilter({ minBhp: '', maxBhp: '' })} />}
                            {appliedFilters.features.map(f => <FilterTag key={f} label={f} onRemove={() => clearFilter({ features: appliedFilters.features.filter(x => x !== f) })} />)}
                            {appliedFilters.location && <FilterTag label={`Near: ${appliedFilters.location}`} onRemove={() => clearFilter({ location: '' })} />}
                            {appliedFilters.maxDistanceMi && <FilterTag label={`Within ${appliedFilters.maxDistanceMi} mi`} onRemove={() => clearFilter({ maxDistanceMi: null })} />}
                            {appliedFilters.sellerType && <FilterTag label={appliedFilters.sellerType === 'DEALER' ? 'Dealer' : 'Private Seller'} onRemove={() => clearFilter({ sellerType: '' })} />}
                            {appliedFilters.deliveryAvailable && (
                                <FilterTag label="Delivery available" onRemove={() => clearFilter({ deliveryAvailable: false })} />
                            )}
                            {appliedFilters.isImported && (
                                <FilterTag
                                    label={appliedFilters.isImported === 'yes' ? 'Imported' : 'Imported hidden'}
                                    onRemove={() => clearFilter({ isImported: '' })}
                                />
                            )}
                        </div>
                    )}

                    {error && (
                        <div className="text-center py-16 space-y-3">
                            <p className="text-red-400 text-sm">{error}</p>
                            <button onClick={load} className="text-primary underline text-xs">Try again</button>
                        </div>
                    )}

                    {loading && !error && (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
                        </div>
                    )}

                    {!loading && !error && (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={activeTab}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5"
                            >
                                {displayed.length === 0 ? (
                                    <EmptyState tab={activeTab} />
                                ) : (
                                    displayed.map((auction, i) => (
                                        <AuctionCard key={auction.id} auction={auction} index={i} />
                                    ))
                                )}
                            </motion.div>
                        </AnimatePresence>
                    )}

                    {!loading && (
                        <p className="text-center text-[var(--text-muted)] text-[10px] mt-8 font-mono">
                            Updated {new Date(lastRefresh).toLocaleTimeString("en-GB")}
                        </p>
                    )}
                </div>
            </div>

            </RequireAuth>

        </div>
    )
}
