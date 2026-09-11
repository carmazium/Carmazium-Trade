"use client"
import * as React from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { 
    LayoutDashboard, 
    Car, 
    Tag, 
    Gavel, 
    BarChart3, 
    MessageSquare, 
    DollarSign, 
    Settings,
    Loader2,
    PlusCircle,
    TrendingUp,
    Eye,
    ChevronRight,
    Lock,
    ShieldCheck,
    Mail,
    Phone,
    User as UserIcon,
    ArrowUpRight,
    ArrowDownRight,
    Calendar,
    Download,
    Zap,
    Trash2,
    Pencil,
    MoreVertical,
    CheckCircle2,
    Upload,
    AlertCircle,
    X,
    Clock,
    XCircle,
    Target,
    AlertTriangle,
    RefreshCw,
    Heart,
    CreditCard,
    ExternalLink,
    BadgeCheck,
    Landmark,
    Check,
    MapPin,
    Hash
} from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { useChat } from "@/context/ChatContext"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { DeleteAccountSection } from "@/components/dashboard/DeleteAccountSection"
import { Button } from "@/components/ui/Button"
import { Input } from "@/components/ui/Input"
import { MetricCard } from "@/components/dashboard/MetricCard"
import { FeaturedBadge } from "@/components/features/FeaturedBadge"
import { RecordSaleModal } from "@/components/dashboard/RecordSaleModal"
import { ChatRoomList } from "@/components/chat/ChatRoomList"
import dynamic from "next/dynamic"
const ChatWindow = dynamic(() => import("@/components/chat/ChatWindow").then(mod => mod.ChatWindow), { ssr: false })

import Link from "next/link"
import Image from "next/image"
import { 
    getUnifiedDashboard,
    getEarnings,
    exportEarningsCsv,
    resetPassword,
    updateProfile,
    getMyListings,
    deleteListing,
    boostListing,
    publishListing,
    createListingCheckoutSession,
    getOffersForListing,
    getMyOffers,
    getMyBids,
    respondToOffer,
    withdrawOffer,
    respondToCounterOffer,
    getSellerPerformance,
    getWatchlist,
    removeFromWatchlist,
    formatPrice,
    startStripeConnectOnboarding,
    getStripeConnectStatus,
    updateBankDetails,
    type UnifiedDashboardData,
    type EarningsResponse,
    type SaleRecord,
    type Listing,
    type Offer,
    type PerformanceStats,
    type WatchlistItem,
    type StripeConnectStatus
} from "@/lib/listingApi"
import { apiClient } from "@/lib/apiClient"
import { createChatRoom, type ChatRoom } from "@/lib/chatApi"
import { ImportListingModal } from "@/components/features/ImportListingModal"

export default function UnifiedUserDashboard() {
    return (
        <React.Suspense fallback={
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        }>
            <UnifiedUserDashboardContent />
        </React.Suspense>
    )
}

function UnifiedUserDashboardContent() {
    const { user, profile, loading: authLoading, refreshProfile } = useAuth()
    const { rooms, refreshRooms } = useChat()
    const searchParams = useSearchParams()
    const router = useRouter()
    const activeTab = searchParams.get("tab") || "overview"
    
    const [dashboardData, setDashboardData] = React.useState<UnifiedDashboardData | null>(null)
    const [loading, setLoading] = React.useState(true)
    // Featured Boost checkout redirects here with ?boost=success — the payment
    // itself already activates via webhook, but nothing ever confirmed it to
    // the user, who just landed back on their listings with no feedback at all.
    const [showBoostSuccess, setShowBoostSuccess] = React.useState(false)

    React.useEffect(() => {
        if (searchParams.get('boost') === 'success') {
            setShowBoostSuccess(true)
            const params = new URLSearchParams(searchParams.toString())
            params.delete('boost')
            router.replace(`?${params.toString()}`)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const setTab = (tab: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set("tab", tab)
        router.push(`?${params.toString()}`)
    }

    const fetchStats = async () => {
        if (!user) return
        try {
            const unified = await getUnifiedDashboard()
            setDashboardData(unified)
        } catch (err) {
            console.error('Failed to fetch dashboard stats:', err)
        }
    }

    React.useEffect(() => {
        if (!authLoading && user) {
            setLoading(true)
            fetchStats().finally(() => setLoading(false))
            refreshRooms()
        }
    }, [user, authLoading])

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        )
    }

    const userName = profile?.firstName ? `${profile.firstName} ${profile.lastName || ""}` : (user?.email?.split('@')[0] || "User")
    const userRole = profile?.role || "User"

    const tabs = [
        { id: "overview", label: "Overview", icon: LayoutDashboard },
        { id: "inventory", label: "Inventory", icon: Car },
        { id: "offers", label: "Incoming", icon: Tag, badge: dashboardData?.seller.incomingOffers },
        { id: "bids", label: "My Offers", icon: Gavel },
        { id: "stats", label: "Performance", icon: BarChart3 },
        { id: "messages", label: "Messages", icon: MessageSquare, badge: dashboardData?.unreadMessages },
        { id: "earnings", label: "Earnings", icon: DollarSign },
        { id: "settings", label: "Settings", icon: Settings },
    ]

    return (
        <div className="min-h-screen pt-20 pb-12">
            <div className="container mx-auto px-5 flex flex-col lg:flex-row gap-8">
                {/* Unified Sidebar */}
                <DashboardSidebar
                    role="seller"
                    userName={userName}
                    userType={`${userRole} Account`}
                    myOffersCounterBadge={dashboardData?.buyer.counteredOffersPending}
                >
                    <Link href="/sell">
                        <Button className="w-full flex items-center gap-2 shadow-neon h-12" shape="default">
                            <PlusCircle size={18} /> Create New Listing
                        </Button>
                    </Link>
                </DashboardSidebar>

                <main className="flex-1 space-y-8 min-w-0">

                    {showBoostSuccess && (
                        <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                            <CheckCircle2 size={18} className="shrink-0" />
                            <span className="flex-1 text-sm font-bold">Your listing is now Featured for the next 28 days!</span>
                            <button onClick={() => setShowBoostSuccess(false)}><X size={16} /></button>
                        </div>
                    )}

                    {/* Tab Content */}
                    <div className="min-h-[60vh] w-full min-w-0">
                        {activeTab === "overview" && <OverviewTab data={dashboardData} loading={loading} setTab={setTab} />}
                        {activeTab === "inventory" && <InventoryTab onRefreshStats={fetchStats} />}
                        {activeTab === "offers" && <OffersTab onRefreshStats={fetchStats} />}
                        {activeTab === "bids" && <OutgoingOffersTab onRefreshStats={fetchStats} />}
                        {activeTab === "watchlist" && <WatchlistTab />}
                        {activeTab === "stats" && <StatsTab />}
                        {activeTab === "messages" && <MessagesTab rooms={rooms} refreshRooms={refreshRooms} />}
                        {activeTab === "earnings" && <EarningsTab />}
                        {activeTab === "settings" && <SettingsTab profile={profile} refreshProfile={refreshProfile} />}
                    </div>
                </main>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW TAB
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({ data, loading, setTab }: { data: UnifiedDashboardData | null, loading: boolean, setTab: (t: string) => void }) {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-black font-heading uppercase tracking-tight">Unified Overview</h2>
                    <p className="text-[var(--text-muted)] text-sm font-medium">Your combined activity as a buyer and seller.</p>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard 
                    label="Active Inventory" 
                    value={data?.seller?.activeListings || 0} 
                    icon={Car} 
                    color="text-primary" 
                    bg="bg-primary/10" 
                    border="border-primary/20" 
                    loading={loading} 
                />
                <MetricCard 
                    label="Total Revenue" 
                    value={formatPrice(data?.seller?.totalRevenue || 0)} 
                    icon={DollarSign} 
                    color="text-emerald-400" 
                    bg="bg-emerald-500/10" 
                    border="border-emerald-500/20" 
                    loading={loading} 
                />
                <MetricCard 
                    label="Watchlist" 
                    value={data?.buyer?.watchlistCount || 0} 
                    icon={Heart} 
                    color="text-pink-400" 
                    bg="bg-pink-500/10" 
                    border="border-pink-500/20" 
                    loading={loading} 
                />
                <MetricCard 
                    label="Total Views" 
                    value={data?.seller?.totalViews || 0} 
                    icon={Eye} 
                    color="text-yellow-400" 
                    bg="bg-yellow-500/10" 
                    border="border-yellow-500/20" 
                    loading={loading} 
                />
            </div>

            {/* Recent Activity / Next Steps */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="glass-card p-6 border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                    <h3 className="text-lg font-black font-heading uppercase tracking-tight flex items-center gap-2 mb-6">
                        <TrendingUp className="text-primary" size={20} /> Seller Insights
                    </h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-default)] group hover:border-primary/30 transition-all">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary border border-primary/20">
                                    <Tag size={18} />
                                </div>
                                <div>
                                    <p className="font-bold text-sm">Incoming Offers</p>
                                    <p className="text-xs text-[var(--text-muted)]">You have {data?.seller?.incomingOffers || 0} pending offers to review.</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" className="text-primary hover:bg-primary/10" onClick={() => setTab('offers')}>View All</Button>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-default)] group hover:border-emerald-500/30 transition-all">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-400 border border-emerald-500/20">
                                    <DollarSign size={18} />
                                </div>
                                <div>
                                    <p className="font-bold text-sm">Earnings Status</p>
                                    <p className="text-xs text-[var(--text-muted)]">Your total realized revenue is {formatPrice(data?.seller?.totalRevenue || 0)}.</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" className="text-emerald-400 hover:bg-emerald-500/10" onClick={() => setTab('earnings')}>History</Button>
                        </div>
                    </div>
                </div>

                <div className="glass-card p-6 border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                    <h3 className="text-lg font-black font-heading uppercase tracking-tight flex items-center gap-2 mb-6">
                        <Gavel className="text-blue-400" size={20} /> Buyer Insights
                    </h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-default)] group hover:border-blue-500/30 transition-all">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-400 border border-blue-500/20">
                                    <Tag size={18} />
                                </div>
                                <div>
                                    <p className="font-bold text-sm">My Sent Offers</p>
                                    <p className="text-xs text-[var(--text-muted)]">Track the offers you've made on vehicles.</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" className="text-blue-400 hover:bg-blue-500/10" onClick={() => setTab('bids')}>Manage</Button>
                        </div>
                        <div className="flex items-center justify-between p-4 bg-[var(--bg-card)] rounded-xl border border-[var(--border-default)] group hover:border-yellow-500/30 transition-all">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-yellow-500/10 rounded-full flex items-center justify-center text-yellow-400 border border-yellow-500/20">
                                    <Heart size={18} />
                                </div>
                                <div>
                                    <p className="font-bold text-sm">Watchlist</p>
                                    <p className="text-xs text-[var(--text-muted)]">You are tracking {data?.buyer?.watchlistCount || 0} vehicles.</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" className="text-yellow-400 hover:bg-yellow-500/10">Browse</Button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// WATCHLIST TAB
// ─────────────────────────────────────────────────────────────────────────────

function WatchlistTab() {
    const [items, setItems] = React.useState<WatchlistItem[]>([])
    const [loading, setLoading] = React.useState(true)
    const [removing, setRemoving] = React.useState<string | null>(null)
    const [page, setPage] = React.useState(1)
    const [totalPages, setTotalPages] = React.useState(1)

    const fetchWatchlist = React.useCallback(async () => {
        try {
            setLoading(true)
            const res = await getWatchlist(page, 12)
            setItems(res.data || [])
            setTotalPages(res.pagination?.totalPages || 1)
        } catch (err) {
            console.error('Failed to fetch watchlist:', err)
        } finally {
            setLoading(false)
        }
    }, [page])

    React.useEffect(() => { fetchWatchlist() }, [fetchWatchlist])

    const handleRemove = async (listingId: string) => {
        try {
            setRemoving(listingId)
            await removeFromWatchlist(listingId)
            setItems(prev => prev.filter(i => i.listingId !== listingId))
        } catch (err: any) {
            alert('Failed to remove: ' + err.message)
        } finally {
            setRemoving(null)
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center">
                <h2 className="text-2xl font-black font-heading uppercase tracking-tight">My Watchlist</h2>
            </div>

            {loading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="bg-[var(--bg-card)] rounded-2xl h-64 animate-pulse border border-[var(--border-default)]" />
                    ))}
                </div>
            ) : items.length === 0 ? (
                <div className="glass-card p-20 text-center border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl border-dashed">
                    <div className="w-20 h-20 bg-pink-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-pink-500/20">
                        <Heart size={40} className="text-pink-400/50" />
                    </div>
                    <h3 className="text-xl font-black text-[var(--text-primary)] uppercase mb-2">Your Watchlist is Empty</h3>
                    <p className="text-[var(--text-muted)] text-sm max-w-md mx-auto mb-8">
                        Save the vehicles you're interested in by clicking the heart icon on any listing.
                    </p>
                    <Link href="/buy-cars">
                        <Button className="shadow-neon px-8 h-12 font-black uppercase tracking-widest">
                            Browse Listings
                        </Button>
                    </Link>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {items.map((item) => (
                            <div key={item.id} className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-2xl overflow-hidden hover:border-primary/30 transition-all group">
                                <div className="relative h-44 bg-[var(--bg-input)]">
                                    {item.listing.images?.[0] ? (
                                        <Image src={item.listing.images[0]} alt={item.listing.title} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[var(--text-secondary)]"><Car size={32} /></div>
                                    )}
                                    {item.listing.status !== 'ACTIVE' && (
                                        <div className="absolute top-2 left-2 bg-red-500/90 text-white text-xs font-black uppercase tracking-widest px-2 py-1 rounded-lg">
                                            {item.listing.status === 'SOLD' ? 'Sold' : 'Unavailable'}
                                        </div>
                                    )}
                                    <button
                                        onClick={() => handleRemove(item.listingId)}
                                        disabled={removing === item.listingId}
                                        className="absolute top-2 right-2 w-11 h-11 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center text-pink-400 hover:bg-red-500/80 hover:text-white transition-all"
                                        title="Remove from watchlist"
                                    >
                                        {removing === item.listingId
                                            ? <Loader2 size={16} className="animate-spin" />
                                            : <Heart size={16} fill="currentColor" />}
                                    </button>
                                </div>
                                <div className="p-4">
                                    <p className="font-black text-[var(--text-primary)] text-base uppercase tracking-tight truncate group-hover:text-primary transition-colors">
                                        {item.listing.title}
                                    </p>
                                    <p className="text-sm text-[var(--text-muted)] mt-0.5">
                                        {[item.listing.year, item.listing.mileage ? `${item.listing.mileage.toLocaleString()} mi` : null].filter(Boolean).join(' · ')}
                                    </p>
                                    <p className="text-primary font-black text-xl mt-2">{formatPrice(Number(item.listing.price))}</p>
                                    <Link href={`/buy-cars/${item.listing.slug}`} className="block mt-2">
                                        <Button variant="outline" className="w-full min-h-[44px] gap-1.5">
                                            View listing <ChevronRight size={14} />
                                        </Button>
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>

                    {totalPages > 1 && (
                        <div className="flex justify-center items-center gap-2">
                            <Button variant="outline" className="min-h-[44px] sm:min-h-0" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                            <span className="text-sm text-[var(--text-muted)] flex items-center px-2">Page {page} of {totalPages}</span>
                            <Button variant="outline" className="min-h-[44px] sm:min-h-0" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY TAB
// ─────────────────────────────────────────────────────────────────────────────

function InventoryTab({ onRefreshStats }: { onRefreshStats: () => void }) {
    const { profile } = useAuth()
    const [listings, setListings] = React.useState<Listing[]>([])
    const [loading, setLoading] = React.useState(true)
    const [page, setPage] = React.useState(1)
    const [totalPages, setTotalPages] = React.useState(1)
    const [deleting, setDeleting] = React.useState<string | null>(null)
    const [boosting, setBoosting] = React.useState<string | null>(null)
    const [saleListing, setSaleListing] = React.useState<Listing | null>(null)
    const [publishing, setPublishing] = React.useState<string | null>(null)
    const [showImportModal, setShowImportModal] = React.useState(false)
    const [openMenuId, setOpenMenuId] = React.useState<string | null>(null)

    const auctionDashPath = profile?.role === 'DEALER' ? '/dashboard/dealer/auctions' : '/dashboard/seller/auctions'

    const fetchListings = React.useCallback(async () => {
        try {
            setLoading(true)
            // Phase 10: includeSold=true so SOLD listings appear in history and contribute to analytics
            const data = await getMyListings({ page, limit: 10, includeSold: true })
            setListings(data.data || [])
            setTotalPages(data.pagination?.totalPages || 1)
        } catch (err) {
            console.error('Failed to fetch listings:', err)
        } finally {
            setLoading(false)
        }
    }, [page])

    React.useEffect(() => {
        fetchListings()
    }, [fetchListings])

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this listing?')) return
        try {
            setDeleting(id)
            await deleteListing(id)
            setListings(prev => prev.filter(l => l.id !== id))
            onRefreshStats()
        } catch (err: any) {
            alert('Failed to delete: ' + err.message)
        } finally {
            setDeleting(null)
        }
    }

    const handlePublish = async (listing: Listing) => {
        try {
            setPublishing(listing.id)
            const result = await publishListing(listing.id)
            if (result.activated) {
                setListings(prev => prev.map(l => l.id === listing.id ? { ...l, status: 'ACTIVE' as const } : l))
            } else if (result.pendingReview) {
                setListings(prev => prev.map(l => l.id === listing.id ? { ...l, status: 'PENDING_REVIEW' as const } : l))
            } else if (result.requiresPayment) {
                const checkout = await createListingCheckoutSession(listing.id, listing.badgeTier || 'BASIC')
                window.location.href = checkout.url
            }
        } catch (err: any) {
            alert('Failed to publish: ' + err.message)
        } finally {
            setPublishing(null)
        }
    }

    const handleBoost = async (id: string) => {
        try {
            setBoosting(id)
            const result = await boostListing(id)
            if (result.url) {
                window.location.href = result.url
            } else {
                fetchListings()
            }
        } catch (err: any) {
            alert('Boost failed: ' + err.message)
        } finally {
            setBoosting(null)
        }
    }

    const handleRelist = async (listingId: string) => {
        try {
            await apiClient(`/listings/${listingId}/status`, {
                method: 'PATCH',
                body: JSON.stringify({ status: 'ACTIVE' }),
            })
            fetchListings()
            onRefreshStats()
        } catch (err: any) {
            alert('Failed to relist: ' + err.message)
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {showImportModal && (
                <ImportListingModal
                    onClose={() => setShowImportModal(false)}
                    onImported={() => { setShowImportModal(false); fetchListings() }}
                />
            )}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                <h2 className="text-2xl font-black font-heading uppercase tracking-tight">My Inventory</h2>
                <div className="flex flex-col gap-2 w-full sm:w-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center justify-center gap-2 h-10 w-full sm:w-auto border-[var(--border-default)] text-[var(--text-secondary)] hover:text-primary dark:hover:text-white"
                        onClick={() => setShowImportModal(true)}
                    >
                        <ExternalLink size={16} /> Import Listing
                    </Button>
                    <Link href="/sell" className="w-full sm:w-auto">
                        <Button className="flex items-center justify-center gap-2 h-10 w-full shadow-neon-small" size="sm">
                            <PlusCircle size={18} /> New Listing
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="glass-card overflow-hidden border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                {/* ── Simple mobile cards (< sm) ── */}
                <div className="sm:hidden divide-y divide-[var(--border-default)]">
                    {loading ? (
                        <div className="py-16 text-center">
                            <Loader2 className="h-9 w-9 animate-spin text-primary mx-auto" />
                        </div>
                    ) : listings.length === 0 ? (
                        <div className="py-16 text-center text-[var(--text-muted)] italic px-6">
                            No listings found. Start selling today!
                        </div>
                    ) : (
                        listings.map((listing) => (
                            <div key={listing.id} className="p-4">
                                <div className="flex gap-3">
                                    <div className="relative w-20 h-16 rounded-xl overflow-hidden border border-[var(--border-default)] shrink-0">
                                        {listing.images?.[0] ? (
                                            <Image src={listing.images[0]} alt="" fill className="object-cover" />
                                        ) : (
                                            <div className="w-full h-full bg-[var(--bg-input)] flex items-center justify-center"><Car size={20} className="text-[var(--text-secondary)]" /></div>
                                        )}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="font-black text-base leading-snug truncate">{listing.title}</p>
                                        <p className="text-sm text-[var(--text-muted)] mt-0.5">{listing.year} &bull; {listing.mileage?.toLocaleString()} miles</p>
                                        <span className={`inline-flex mt-1.5 px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-widest border ${
                                            listing.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                            listing.status === 'SOLD' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                            listing.status === 'PENDING_REVIEW' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                            listing.status === 'REJECTED' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                            listing.status === 'DRAFT' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                            'bg-slate-700/50 text-[var(--text-muted)] border-[var(--border-default)]'
                                        }`}>
                                            {listing.status === 'ACTIVE' ? 'Live' : listing.status === 'SOLD' ? 'Sold' : listing.status === 'PENDING_REVIEW' ? 'Under Review' : listing.status === 'REJECTED' ? 'Rejected' : listing.status === 'DRAFT' ? 'Draft' : listing.status}
                                        </span>
                                        {listing.status === 'REJECTED' && listing.rejectionReason && (
                                            <p className="text-xs text-red-400 mt-1">{listing.rejectionReason}</p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center justify-between mt-3">
                                    <span className="text-xl font-black">{formatPrice(listing.price)}</span>
                                    <span className="text-sm text-[var(--text-muted)] flex items-center gap-1"><Eye size={14} /> {listing.viewCount || 0} views</span>
                                </div>
                                <p className="text-xs text-[var(--text-muted)] mt-1">Listed on {new Date(listing.createdAt).toLocaleDateString('en-GB')}</p>

                                <div className="grid grid-cols-2 gap-2 mt-3">
                                    {listing.status === 'DRAFT' ? (
                                        <button
                                            onClick={() => handlePublish(listing)}
                                            disabled={publishing === listing.id}
                                            className="min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-emerald-500 text-white font-bold text-sm disabled:opacity-60"
                                        >
                                            {publishing === listing.id ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                            Publish
                                        </button>
                                    ) : listing.status === 'SOLD' ? (
                                        <button
                                            onClick={() => handleRelist(listing.id)}
                                            className="min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-blue-500 text-white font-bold text-sm"
                                        >
                                            <RefreshCw size={16} /> Relist
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setSaleListing(listing)}
                                            className="min-h-[48px] flex items-center justify-center gap-2 rounded-xl bg-emerald-500 text-white font-bold text-sm"
                                        >
                                            <CheckCircle2 size={16} /> Mark Sold
                                        </button>
                                    )}
                                    <Link
                                        href={`/dashboard/seller/add-listing?editId=${listing.id}`}
                                        className="min-h-[48px] flex items-center justify-center gap-2 rounded-xl border border-[var(--border-default)] font-bold text-sm hover:bg-[var(--bg-input)]"
                                    >
                                        <Pencil size={16} /> Edit
                                    </Link>
                                </div>

                                <button
                                    onClick={() => setOpenMenuId(openMenuId === listing.id ? null : listing.id)}
                                    className="w-full min-h-[44px] flex items-center justify-center gap-1.5 mt-2 text-sm font-bold text-[var(--text-muted)]"
                                >
                                    {openMenuId === listing.id ? 'Hide more options' : 'More options'}
                                    <ChevronRight size={15} className={`transition-transform ${openMenuId === listing.id ? 'rotate-90' : ''}`} />
                                </button>

                                {openMenuId === listing.id && (
                                    <div className="mt-1 space-y-1.5 border-t border-[var(--border-default)] pt-3">
                                        {listing.status === 'ACTIVE' && (
                                            <Link
                                                href={`${auctionDashPath}?listingId=${listing.id}`}
                                                className="min-h-[46px] flex items-center gap-2.5 px-3 rounded-xl text-orange-400 bg-orange-500/5 font-bold text-sm"
                                            >
                                                <Gavel size={16} /> Put to Auction
                                            </Link>
                                        )}
                                        <button
                                            onClick={() => handleDelete(listing.id)}
                                            disabled={deleting === listing.id}
                                            className="w-full min-h-[46px] flex items-center gap-2.5 px-3 rounded-xl text-red-400 bg-red-500/5 font-bold text-sm disabled:opacity-60"
                                        >
                                            {deleting === listing.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                            Delete Listing
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* ── Full table (>= sm) ── */}
                <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[var(--bg-input)] text-[var(--text-muted)] text-xs uppercase font-black tracking-widest border-b border-[var(--border-default)]">
                            <tr>
                                <th className="px-6 py-4">Vehicle</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4">Price</th>
                                <th className="px-6 py-4">Stats</th>
                                <th className="px-6 py-4">Listed</th>
                                <th className="px-6 py-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-default)]">
                            {loading ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center">
                                        <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
                                    </td>
                                </tr>
                            ) : listings.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center text-[var(--text-muted)] italic">
                                        No listings found. Start selling today!
                                    </td>
                                </tr>
                            ) : (
                                listings.map((listing) => (
                                    <tr key={listing.id} className="hover:bg-white/[0.03] transition-all">
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3">
                                                <div className="relative w-12 h-9 rounded overflow-hidden border border-[var(--border-default)] shrink-0">
                                                    {listing.images?.[0] ? (
                                                        <Image src={listing.images[0]} alt="" fill className="object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full bg-[var(--bg-input)] flex items-center justify-center"><Car size={14} className="text-[var(--text-secondary)]" /></div>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <p className="font-bold text-sm truncate uppercase">{listing.title}</p>
                                                        {listing.isFeatured && <Zap size={12} className="text-amber-400 fill-amber-400" />}
                                                    </div>
                                                    <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-widest">{listing.year} • {listing.mileage?.toLocaleString()} miles</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-black uppercase tracking-widest border ${
                                                listing.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                listing.status === 'SOLD' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                listing.status === 'PENDING_REVIEW' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                listing.status === 'REJECTED' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                                                listing.status === 'DRAFT' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                                'bg-slate-700/50 text-[var(--text-muted)] border-[var(--border-default)]'
                                            }`}>
                                                {listing.status === 'PENDING_REVIEW' ? 'Under Review' : listing.status === 'REJECTED' ? 'Rejected' : listing.status}
                                            </span>
                                            {listing.status === 'REJECTED' && listing.rejectionReason && (
                                                <p className="text-[10px] text-red-400 mt-1 max-w-[180px]">{listing.rejectionReason}</p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-black text-sm">{formatPrice(listing.price)}</td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
                                                <span className="flex items-center gap-1"><Eye size={12} /> {listing.viewCount || 0}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-xs text-[var(--text-muted)]">
                                            {new Date(listing.createdAt).toLocaleDateString('en-GB')}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex justify-end gap-2 items-center">
                                                {listing.status === 'DRAFT' && (
                                                    <button
                                                        onClick={() => handlePublish(listing)}
                                                        disabled={publishing === listing.id}
                                                        className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-black rounded-full bg-emerald-500 text-white hover:bg-emerald-400 hover:scale-105 transition-all shadow-[0_0_12px_rgba(16,185,129,0.4)] disabled:opacity-60"
                                                    >
                                                        {publishing === listing.id ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                                        Publish
                                                    </button>
                                                )}
                                                {listing.status === 'ACTIVE' && !listing.isFeatured && (
                                                    <Button
                                                        size="sm"
                                                        className="h-8 px-3 text-xs bg-gradient-to-r from-amber-400 to-orange-500 text-black font-black"
                                                        onClick={() => handleBoost(listing.id)}
                                                        disabled={boosting === listing.id}
                                                    >
                                                        {boosting === listing.id ? <Loader2 size={12} className="animate-spin" /> : 'BOOST'}
                                                    </Button>
                                                )}
                                                <div className="relative">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === listing.id ? null : listing.id) }}
                                                        className="p-2.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                                                    >
                                                        <MoreVertical size={16} />
                                                    </button>
                                                    {openMenuId === listing.id && (
                                                    <>
                                                        <div className="fixed inset-0 z-40" onClick={() => setOpenMenuId(null)} />
                                                        <div className="absolute right-0 top-full mt-1 w-44 bg-[var(--bg-dropdown)] border border-[var(--border-default)] rounded-xl shadow-2xl z-50 py-2"
                                                            onClick={() => setOpenMenuId(null)}
                                                        >
                                                        {listing.status === 'DRAFT' && (
                                                            <button
                                                                onClick={() => handlePublish(listing)}
                                                                disabled={publishing === listing.id}
                                                                className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-emerald-500/10 text-emerald-400 w-full text-left font-bold"
                                                            >
                                                                <Upload size={14} /> Publish Listing
                                                            </button>
                                                        )}
                                                        <Link href={`/dashboard/seller/add-listing?editId=${listing.id}`} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-[var(--bg-card)]">
                                                            <Pencil size={14} /> Edit
                                                        </Link>
                                                        {listing.status === 'ACTIVE' && (
                                                            <Link href={`${auctionDashPath}?listingId=${listing.id}`} className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-orange-500/10 text-orange-400 w-full">
                                                                <Gavel size={14} /> Put to Auction
                                                            </Link>
                                                        )}
                                                        {listing.status !== 'SOLD' && (
                                                            <button
                                                                onClick={() => setSaleListing(listing)}
                                                                className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-emerald-500/10 text-emerald-400 w-full text-left"
                                                            >
                                                                <CheckCircle2 size={14} /> Mark Sold
                                                            </button>
                                                        )}
                                                        {listing.status === 'SOLD' && (
                                                            <button
                                                                onClick={() => handleRelist(listing.id)}
                                                                className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-blue-500/10 text-blue-400 w-full text-left font-bold"
                                                            >
                                                                <RefreshCw size={14} /> Relist
                                                            </button>
                                                        )}
                                                        <button
                                                            onClick={() => handleDelete(listing.id)}
                                                            className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-red-500/10 text-red-400 w-full text-left"
                                                            disabled={deleting === listing.id}
                                                        >
                                                            <Trash2 size={14} /> Delete
                                                        </button>
                                                        </div>
                                                    </>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
                {totalPages > 1 && (
                    <div className="p-4 border-t border-[var(--border-default)] flex items-center justify-between">
                        <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-widest">Page {page} of {totalPages}</p>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}>Prev</Button>
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}>Next</Button>
                        </div>
                    </div>
                )}
            </div>

            {saleListing && (
                <RecordSaleModal 
                    listing={saleListing} 
                    onClose={() => setSaleListing(null)} 
                    onSuccess={() => {
                        fetchListings()
                        onRefreshStats()
                    }} 
                />
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// OFFERS TAB (Incoming)
// ─────────────────────────────────────────────────────────────────────────────

function OffersTab({ onRefreshStats }: { onRefreshStats: () => void }) {
    const [listings, setListings] = React.useState<Listing[]>([])
    const [offersMap, setOffersMap] = React.useState<Record<string, Offer[]>>({})
    const [loading, setLoading] = React.useState(true)
    const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
    const [responding, setResponding] = React.useState<string | null>(null)
    const [countering, setCountering] = React.useState<{id: string, amount: string} | null>(null)
    const [saleContext, setSaleContext] = React.useState<{ listing: Listing; offer: Offer } | null>(null)
    const router = useRouter()
    const { refreshRooms } = useChat()

    const fetchOffers = async (quiet = false) => {
        try {
            if (!quiet) setLoading(true)
            const res = await getMyListings({ limit: 50, includeSold: true })
            const activeListings = res.data
            setListings(activeListings)

            const results = await Promise.allSettled(
                activeListings.map(async (l) => {
                    const data = await getOffersForListing(l.id)
                    return { id: l.id, data }
                })
            )

            const map: Record<string, Offer[]> = {}
            results.forEach(r => {
                if (r.status === 'fulfilled') map[r.value.id] = r.value.data
            })
            setOffersMap(map)
        } catch (err) {
            console.error('Failed to fetch offers:', err)
        } finally {
            if (!quiet) setLoading(false)
        }
    }

    React.useEffect(() => {
        fetchOffers()
        const id = setInterval(() => fetchOffers(true), 30000)
        return () => clearInterval(id)
    }, [])

    const toggleExpand = (id: string) => {
        setExpanded(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const handleRespond = async (offerId: string, listingId: string, status: 'ACCEPTED' | 'REJECTED' | 'COUNTERED', amount?: number) => {
        try {
            setResponding(offerId)
            await respondToOffer(offerId, status, amount)
            const updated = await getOffersForListing(listingId)
            setOffersMap(prev => ({ ...prev, [listingId]: updated }))
            onRefreshStats()
        } catch (err: any) {
            alert('Failed: ' + err.message)
        } finally {
            setResponding(null)
        }
    }

    const handleMessage = async (buyerId: string, listingId: string) => {
        try {
            const room = await createChatRoom(buyerId, listingId)
            await refreshRooms()
            router.push(`/dashboard/user?tab=messages&room=${room.id}`)
        } catch (err: any) {
            alert('Chat failed: ' + err.message)
        }
    }

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {saleContext && (
                <RecordSaleModal
                    listing={saleContext.listing}
                    offer={saleContext.offer}
                    onClose={() => setSaleContext(null)}
                    onSuccess={() => {
                        setSaleContext(null)
                        fetchOffers()
                        onRefreshStats()
                    }}
                />
            )}
            <h2 className="text-2xl font-black font-heading uppercase tracking-tight">Incoming Offers</h2>
            
            {loading ? (
                <div className="flex justify-center py-20"><Loader2 className="animate-spin text-primary w-10 h-10" /></div>
            ) : listings.length === 0 ? (
                <div className="text-center py-20 text-[var(--text-muted)] italic">No listings to receive offers for.</div>
            ) : (
                <div className="space-y-4">
                    {listings.map(listing => {
                        const listingOffers = offersMap[listing.id] || []
                        const pending = listingOffers.filter(o => o.status === 'PENDING').length
                        const isExpanded = expanded.has(listing.id)
                        
                        return (
                            <div key={listing.id} className="glass-card overflow-hidden border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                                <button 
                                    onClick={() => toggleExpand(listing.id)}
                                    className="w-full flex items-center gap-4 p-5 hover:bg-[var(--bg-card)] transition-all text-left"
                                >
                                    <div className="relative w-16 h-12 rounded-lg overflow-hidden shrink-0 border border-[var(--border-default)]">
                                        <Image src={listing.images?.[0] || ""} alt="" fill className="object-cover" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-bold text-[var(--text-primary)] truncate uppercase">{listing.title}</p>
                                        <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-widest">{listingOffers.length} TOTAL OFFERS</p>
                                    </div>
                                    {pending > 0 && <span className="bg-primary text-white text-xs font-black px-3 py-1 rounded-full">{pending} PENDING</span>}
                                    <ChevronRight className={`text-[var(--text-muted)] transition-transform ${isExpanded ? 'rotate-90' : ''}`} size={20} />
                                </button>

                                {isExpanded && (
                                    <div className="p-4 bg-black/20 space-y-3 border-t border-[var(--border-default)]">
                                        {listingOffers.length === 0 ? (
                                            <p className="text-center py-6 text-xs text-[var(--text-secondary)] italic">No offers on this vehicle yet.</p>
                                        ) : (
                                            listingOffers.map(offer => (
                                                <div key={offer.id} className={`flex flex-col p-4 rounded-xl border gap-3 ${offer.status === 'COUNTERED' && offer.lastCounteredBy === 'BUYER' ? 'bg-blue-500/5 border-blue-500/30' : 'bg-[var(--bg-card)] border-[var(--border-default)]'}`}>
                                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-black shrink-0">{offer.buyer?.firstName?.[0] || '?'}</div>
                                                            <div>
                                                                <p className="font-bold text-sm text-[var(--text-primary)] uppercase">{offer.buyer?.firstName} {offer.buyer?.lastName}</p>
                                                                <p className="text-lg font-black text-primary font-mono">{formatPrice(offer.amount)}</p>
                                                                {offer.status === 'COUNTERED' && offer.sellerCounterAmount != null && (
                                                                    <p className="text-[11px] font-bold text-blue-400 mt-0.5">Your counter: {formatPrice(offer.sellerCounterAmount)}</p>
                                                                )}
                                                                {offer.status === 'COUNTERED' && offer.lastCounteredBy === 'BUYER' && offer.buyerCounterAmount != null && (
                                                                    <p className="text-[11px] font-bold text-amber-400 mt-0.5">Buyer re-countered: {formatPrice(offer.buyerCounterAmount)}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="w-full sm:w-auto">
                                                            {(offer.status === 'PENDING' || (offer.status === 'COUNTERED' && offer.lastCounteredBy === 'BUYER')) ? (
                                                                <>
                                                                    <div className="sm:hidden space-y-2">
                                                                        <button
                                                                            onClick={() => handleRespond(offer.id, listing.id, 'ACCEPTED')}
                                                                            disabled={!!responding}
                                                                            className="w-full min-h-[46px] rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-60"
                                                                        >
                                                                            Accept
                                                                        </button>
                                                                        <div className="grid grid-cols-2 gap-2">
                                                                            <button
                                                                                onClick={() => setCountering({ id: offer.id, amount: '' })}
                                                                                disabled={!!responding}
                                                                                className="min-h-[46px] rounded-xl border border-blue-500/30 text-blue-400 font-bold text-sm disabled:opacity-60"
                                                                            >
                                                                                Counter
                                                                            </button>
                                                                            <button
                                                                                onClick={() => handleRespond(offer.id, listing.id, 'REJECTED')}
                                                                                disabled={!!responding}
                                                                                className="min-h-[46px] rounded-xl border border-red-500/30 text-red-400 font-bold text-sm disabled:opacity-60"
                                                                            >
                                                                                Decline
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    <div className="hidden sm:flex items-center gap-2">
                                                                        <Button size="sm" variant="outline" className="h-9 border-red-500/30 text-red-400" onClick={() => handleRespond(offer.id, listing.id, 'REJECTED')} disabled={!!responding}>Decline</Button>
                                                                        <Button size="sm" variant="outline" className="h-9 border-blue-500/30 text-blue-400" onClick={() => setCountering({ id: offer.id, amount: '' })} disabled={!!responding}>Counter</Button>
                                                                        <Button size="sm" className="h-9 bg-emerald-600 hover:bg-emerald-500" onClick={() => handleRespond(offer.id, listing.id, 'ACCEPTED')} disabled={!!responding}>Accept</Button>
                                                                    </div>
                                                                </>
                                                            ) : offer.status === 'COUNTERED' && offer.lastCounteredBy === 'SELLER' ? (
                                                                <span className="text-xs font-black uppercase tracking-widest text-blue-400/70">Awaiting buyer response</span>
                                                            ) : (
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <span className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)]">{offer.status}</span>
                                                                    {offer.status === 'ACCEPTED' && (
                                                                        <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto mt-1 sm:mt-0">
                                                                            <button onClick={() => handleMessage(offer.buyerId, listing.id)} className="min-h-[44px] sm:h-8 sm:min-h-0 rounded-xl sm:rounded-md border border-blue-500/30 sm:border-0 text-blue-400 font-bold text-sm">Message</button>
                                                                            <button onClick={() => setSaleContext({ listing, offer })} className="min-h-[44px] sm:h-8 sm:min-h-0 rounded-xl sm:rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm">Mark as Sold</button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {countering?.id === offer.id && (
                                                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-[var(--bg-card)] rounded-xl border border-blue-500/30 animate-in zoom-in-95 duration-200">
                                                            <div className="relative flex-1">
                                                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] font-bold">£</span>
                                                                <Input
                                                                    placeholder="Enter counter amount..."
                                                                    className="pl-8 bg-transparent border-[var(--border-default)] h-12 sm:h-10 text-base"
                                                                    value={countering.amount}
                                                                    onChange={(e) => setCountering({ ...countering, amount: e.target.value })}
                                                                    type="number"
                                                                />
                                                            </div>
                                                            <div className="grid grid-cols-2 sm:flex gap-2">
                                                                <Button
                                                                    className="min-h-[46px] sm:h-10 sm:min-h-0 bg-blue-600 hover:bg-blue-500"
                                                                    onClick={() => {
                                                                        handleRespond(offer.id, listing.id, 'COUNTERED', parseFloat(countering.amount))
                                                                        setCountering(null)
                                                                    }}
                                                                    disabled={!countering.amount || !!responding}
                                                                >
                                                                    Send Counter
                                                                </Button>
                                                                <Button variant="ghost" className="min-h-[46px] sm:h-10 sm:min-h-0 text-[var(--text-muted)]" onClick={() => setCountering(null)}>Cancel</Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNTDOWN TIMER HELPER
// ─────────────────────────────────────────────────────────────────────────────

function CountdownTimer({ expiresAt }: { expiresAt: Date }) {
    const [timeLeft, setTimeLeft] = React.useState('')
    React.useEffect(() => {
        function update() {
            const diff = expiresAt.getTime() - Date.now()
            if (diff <= 0) { setTimeLeft('Expired'); return }
            const h = Math.floor(diff / 3600000)
            const m = Math.floor((diff % 3600000) / 60000)
            setTimeLeft(`${h}h ${m}m remaining`)
        }
        update()
        const id = setInterval(update, 60000)
        return () => clearInterval(id)
    }, [expiresAt])
    return <p className="text-[var(--text-muted)] text-xs">{timeLeft}</p>
}

// ─────────────────────────────────────────────────────────────────────────────
// BIDS TAB (Outgoing)
// ─────────────────────────────────────────────────────────────────────────────

function outgoingOfferStatusClass(status: Offer['status']) {
    switch (status) {
        case 'ACCEPTED': return 'text-emerald-400'
        case 'PENDING': return 'text-amber-400'
        case 'COUNTERED': return 'text-blue-400'
        case 'REJECTED': return 'text-red-400'
        case 'WITHDRAWN': return 'text-[var(--text-muted)]'
        default: return 'text-[var(--text-muted)]'
    }
}

function OutgoingOffersTab({ onRefreshStats }: { onRefreshStats: () => void }) {
    const [offers, setOffers] = React.useState<Offer[]>([])
    const [loading, setLoading] = React.useState(true)
    const [actioning, setActioning] = React.useState<string | null>(null)
    const [accepting, setAccepting] = React.useState<string | null>(null)
    const [declining, setDeclining] = React.useState<string | null>(null)
    const [startingChat, setStartingChat] = React.useState<string | null>(null)
    const [counterAmounts, setCounterAmounts] = React.useState<Record<string, string>>({})
    const [buyerCountering, setBuyerCountering] = React.useState<string | null>(null)
    const router = useRouter()
    const { refreshRooms } = useChat()

    const fetchData = async (quiet = false) => {
        try {
            if (!quiet) setLoading(true)
            const o = await getMyOffers()
            setOffers(o)
        } catch (err) {
            console.error('Failed to fetch outgoing activity:', err)
        } finally {
            if (!quiet) setLoading(false)
        }
    }

    React.useEffect(() => {
        fetchData()
        const id = setInterval(() => fetchData(true), 30000)
        return () => clearInterval(id)
    }, [])

    const handleWithdraw = async (id: string) => {
        if (!confirm('Withdraw this offer?')) return
        try {
            setActioning(id)
            await withdrawOffer(id)
            await fetchData()
            onRefreshStats()
        } catch (err: any) {
            alert(err.message)
        } finally {
            setActioning(null)
        }
    }

    const handleAcceptCounter = async (offerId: string) => {
        if (!confirm("Accept the seller's counter offer? You can then message the seller to finalize the purchase.")) return
        try {
            setAccepting(offerId)
            await respondToCounterOffer(offerId, 'ACCEPTED')
            await fetchData()
            onRefreshStats()
        } catch (err: any) {
            alert(err.message || 'Failed to accept counter offer.')
        } finally {
            setAccepting(null)
        }
    }

    const handleDeclineCounter = async (offerId: string) => {
        if (!confirm('Decline this counter offer?')) return
        try {
            setDeclining(offerId)
            await respondToCounterOffer(offerId, 'REJECTED')
            await fetchData()
            onRefreshStats()
        } catch (err: any) {
            alert(err.message || 'Failed to decline counter offer.')
        } finally {
            setDeclining(null)
        }
    }

    const handleMessageSeller = async (sellerId: string | undefined, listingId: string | undefined) => {
        if (!sellerId || !listingId) {
            alert('Seller or listing information is unavailable.')
            return
        }
        try {
            setStartingChat(listingId)
            const room = await createChatRoom(sellerId, listingId)
            await refreshRooms()
            router.push(`/dashboard/user?tab=messages&room=${room.id}`)
            onRefreshStats()
        } catch (err: any) {
            alert(err.message || 'Failed to open messages.')
        } finally {
            setStartingChat(null)
        }
    }

    const handleBuyerCounter = async (offerId: string, amount: number) => {
        if (!amount || amount <= 0) return
        try {
            setBuyerCountering(offerId)
            await respondToCounterOffer(offerId, 'COUNTERED', amount)
            setCounterAmounts(prev => { const next = { ...prev }; delete next[offerId]; return next })
            await fetchData()
            onRefreshStats()
        } catch (err: any) {
            alert(err.message || 'Failed to submit counter offer.')
        } finally {
            setBuyerCountering(null)
        }
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-black font-heading uppercase tracking-tight">My Offers</h2>
            
            {/* Active Offers Section */}
            <div className="space-y-4">
                <h3 className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-2">
                    <Tag size={14} /> Outgoing Offers
                </h3>
                <div className="glass-card overflow-hidden border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                    {/* ── Simple mobile cards (< sm) ── */}
                    <div className="sm:hidden divide-y divide-[var(--border-default)]">
                        {loading ? (
                            <div className="py-16 text-center"><Loader2 className="h-9 w-9 animate-spin text-primary mx-auto" /></div>
                        ) : offers.length === 0 ? (
                            <div className="py-16 text-center text-[var(--text-secondary)] italic px-6">No outgoing offers.</div>
                        ) : (
                            offers.map(offer => {
                                const thumb = offer.listing?.images?.[0] || '/assets/images/featured-sports.png'
                                const isBuyerTurn = offer.status === 'COUNTERED' && offer.lastCounteredBy === 'SELLER'
                                const isBuyerLocked = (offer.counterAttemptsBuyer ?? 0) >= 5
                                const expiresAt = offer.counterExpiresAt ? new Date(offer.counterExpiresAt) : null
                                return (
                                    <div key={offer.id} className="p-4">
                                        <Link href={`/vehicle/${offer.listing?.slug}`} className="flex gap-3">
                                            <div className="relative w-20 h-16 rounded-xl overflow-hidden border border-[var(--border-default)] shrink-0">
                                                <Image src={thumb} alt="" fill className="object-cover" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <p className="font-black text-base leading-snug truncate">{offer.listing?.title}</p>
                                                <p className="text-lg font-black mt-0.5">{formatPrice(offer.amount)}</p>
                                                {offer.status === 'COUNTERED' && offer.sellerCounterAmount != null && (
                                                    <p className="text-sm font-bold text-blue-400 mt-0.5">Seller&apos;s counter: {formatPrice(offer.sellerCounterAmount)}</p>
                                                )}
                                            </div>
                                        </Link>
                                        <span className={`inline-flex mt-2 px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-widest bg-[var(--bg-input)] ${outgoingOfferStatusClass(offer.status)}`}>
                                            {offer.status === 'PENDING' ? 'Awaiting seller' : offer.status === 'COUNTERED' ? (isBuyerTurn ? 'Seller countered' : 'Awaiting seller') : offer.status.charAt(0) + offer.status.slice(1).toLowerCase()}
                                        </span>

                                        {offer.status === 'COUNTERED' && isBuyerLocked && (
                                            <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                                                <p className="text-amber-300 text-sm font-medium mb-1">Counter limit reached &mdash; awaiting seller&apos;s final decision.</p>
                                                {expiresAt && <CountdownTimer expiresAt={expiresAt} />}
                                            </div>
                                        )}

                                        {offer.status === 'COUNTERED' && isBuyerTurn && !isBuyerLocked && (
                                            <>
                                                <div className="grid grid-cols-2 gap-2 mt-3">
                                                    <button
                                                        onClick={() => handleAcceptCounter(offer.id)}
                                                        disabled={accepting === offer.id || declining === offer.id}
                                                        className="min-h-[46px] rounded-xl bg-emerald-600 text-white font-bold text-sm disabled:opacity-60"
                                                    >
                                                        {accepting === offer.id ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Accept counter'}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeclineCounter(offer.id)}
                                                        disabled={accepting === offer.id || declining === offer.id}
                                                        className="min-h-[46px] rounded-xl border border-red-500/30 text-red-400 font-bold text-sm disabled:opacity-60"
                                                    >
                                                        {declining === offer.id ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Decline'}
                                                    </button>
                                                </div>
                                                <div className="flex gap-2 mt-2">
                                                    <input
                                                        type="number"
                                                        placeholder="Your counter (£)"
                                                        value={counterAmounts[offer.id] ?? ''}
                                                        onChange={(e) => setCounterAmounts(prev => ({ ...prev, [offer.id]: e.target.value }))}
                                                        className="flex-1 min-h-[46px] px-3 rounded-xl bg-[var(--bg-input)] border border-[var(--border-default)] text-base"
                                                    />
                                                    <button
                                                        onClick={() => handleBuyerCounter(offer.id, parseFloat(counterAmounts[offer.id] ?? '0'))}
                                                        disabled={buyerCountering === offer.id || !counterAmounts[offer.id]}
                                                        className="min-h-[46px] px-4 rounded-xl bg-blue-600 text-white font-bold text-sm disabled:opacity-60"
                                                    >
                                                        {buyerCountering === offer.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Counter'}
                                                    </button>
                                                </div>
                                            </>
                                        )}

                                        {offer.status === 'PENDING' && (
                                            <button
                                                onClick={() => handleWithdraw(offer.id)}
                                                disabled={actioning === offer.id}
                                                className="w-full min-h-[46px] mt-3 rounded-xl border border-red-500/30 text-red-400 font-bold text-sm disabled:opacity-60"
                                            >
                                                {actioning === offer.id ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Withdraw offer'}
                                            </button>
                                        )}

                                        {(offer.status === 'ACCEPTED' || (offer.status === 'COUNTERED' && isBuyerTurn)) && (
                                            <button
                                                onClick={() => handleMessageSeller(offer.listing?.sellerId, offer.listing?.id)}
                                                disabled={startingChat === offer.listing?.id}
                                                className="w-full min-h-[46px] mt-3 rounded-xl border border-blue-500/30 text-blue-400 font-bold text-sm disabled:opacity-60"
                                            >
                                                {startingChat === offer.listing?.id ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Message seller'}
                                            </button>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>

                    {/* ── Full table (>= sm) ── */}
                    <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-[var(--bg-input)] text-xs text-[var(--text-muted)] uppercase font-black tracking-widest">
                                <tr>
                                    <th className="px-6 py-4">Vehicle</th>
                                    <th className="px-6 py-4">My Offer</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border-default)]">
                                {loading ? (
                                    <tr><td colSpan={4} className="px-6 py-10 text-center"><Loader2 className="animate-spin mx-auto text-primary" /></td></tr>
                                ) : offers.length === 0 ? (
                                    <tr><td colSpan={4} className="px-6 py-10 text-center text-[var(--text-secondary)] italic">No outgoing offers.</td></tr>
                                ) : (
                                    offers.map(offer => {
                                        const thumb = offer.listing?.images?.[0] || '/assets/images/featured-sports.png'
                                        const buyerRemaining = 5 - (offer.counterAttemptsBuyer ?? 0)
                                        const isBuyerLocked = (offer.counterAttemptsBuyer ?? 0) >= 5
                                        const expiresAt = offer.counterExpiresAt ? new Date(offer.counterExpiresAt) : null
                                        const isBuyerTurn = offer.status === 'COUNTERED' && offer.lastCounteredBy === 'SELLER'
                                        return (
                                        <tr key={offer.id} className="hover:bg-white/[0.02]">
                                            <td className="px-6 py-4">
                                                <Link href={`/vehicle/${offer.listing?.slug}`} className="flex items-center gap-3 group">
                                                    <div className="relative w-10 h-8 rounded border border-[var(--border-default)] overflow-hidden shrink-0">
                                                        <Image src={thumb} alt="" fill className="object-cover" />
                                                    </div>
                                                    <span className="font-bold text-sm uppercase group-hover:text-primary transition-colors">{offer.listing?.title}</span>
                                                </Link>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="font-black font-mono">{formatPrice(offer.amount)}</div>
                                                {offer.status === 'COUNTERED' && offer.sellerCounterAmount != null && (
                                                    <div className="text-xs font-black uppercase tracking-widest text-blue-400 mt-1">
                                                        Seller counter: {formatPrice(offer.sellerCounterAmount)}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`text-xs font-black uppercase tracking-widest ${outgoingOfferStatusClass(offer.status)}`}>
                                                    {offer.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex flex-wrap items-center justify-end gap-2">
                                                    {offer.status === 'COUNTERED' && (
                                                        <div className="flex flex-col items-end gap-2 w-full">
                                                            {/* Remaining counter count */}
                                                            {isBuyerTurn && !isBuyerLocked && (
                                                                <p className="text-xs text-[var(--text-muted)]">
                                                                    {buyerRemaining} counter-offer{buyerRemaining !== 1 ? 's' : ''} remaining
                                                                </p>
                                                            )}

                                                            {/* Locked state banner */}
                                                            {isBuyerLocked && (
                                                                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-left w-full">
                                                                    <p className="text-amber-300 text-sm font-medium mb-1">
                                                                        Counter limit reached — awaiting seller&apos;s final decision.
                                                                    </p>
                                                                    {expiresAt && <CountdownTimer expiresAt={expiresAt} />}
                                                                </div>
                                                            )}

                                                            {/* Buyer counter input (when it is buyer turn and not locked) */}
                                                            {isBuyerTurn && !isBuyerLocked && (
                                                                <div className="flex gap-2 w-full justify-end">
                                                                    <input
                                                                        type="number"
                                                                        placeholder="Your counter (£)"
                                                                        value={counterAmounts[offer.id] ?? ''}
                                                                        onChange={(e) => setCounterAmounts(prev => ({ ...prev, [offer.id]: e.target.value }))}
                                                                        className="w-36 px-3 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] text-sm"
                                                                    />
                                                                    <Button
                                                                        size="sm"
                                                                        className="h-8 bg-blue-600 hover:bg-blue-500 text-xs font-black"
                                                                        onClick={() => handleBuyerCounter(offer.id, parseFloat(counterAmounts[offer.id] ?? '0'))}
                                                                        disabled={buyerCountering === offer.id || !counterAmounts[offer.id]}
                                                                    >
                                                                        {buyerCountering === offer.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'COUNTER'}
                                                                    </Button>
                                                                </div>
                                                            )}

                                                            {/* Standard Accept/Decline actions */}
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-8 text-emerald-400 text-xs font-black"
                                                                    onClick={() => handleAcceptCounter(offer.id)}
                                                                    disabled={accepting === offer.id || declining === offer.id}
                                                                >
                                                                    {accepting === offer.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ACCEPT COUNTER'}
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-8 text-red-400 text-xs font-black"
                                                                    onClick={() => handleDeclineCounter(offer.id)}
                                                                    disabled={accepting === offer.id || declining === offer.id}
                                                                >
                                                                    {declining === offer.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'DECLINE'}
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    className="h-8 text-blue-400 text-xs font-black"
                                                                    onClick={() => handleMessageSeller(offer.listing?.sellerId, offer.listing?.id)}
                                                                    disabled={startingChat === offer.listing?.id}
                                                                >
                                                                    {startingChat === offer.listing?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'MESSAGE'}
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {offer.status === 'PENDING' && (
                                                        <Button size="sm" variant="ghost" className="h-8 text-red-400 text-xs font-black" onClick={() => handleWithdraw(offer.id)} disabled={actioning === offer.id}>WITHDRAW</Button>
                                                    )}
                                                    {offer.status === 'ACCEPTED' && (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            className="h-8 text-blue-400 text-xs font-black"
                                                            onClick={() => handleMessageSeller(offer.listing?.sellerId, offer.listing?.id)}
                                                            disabled={startingChat === offer.listing?.id}
                                                        >
                                                            {startingChat === offer.listing?.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'MESSAGE'}
                                                        </Button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        )
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// STATS TAB (Performance)
// ─────────────────────────────────────────────────────────────────────────────

function StatsTab() {
    const [performance, setPerformance] = React.useState<PerformanceStats | null>(null)
    const [loading, setLoading] = React.useState(true)

    React.useEffect(() => {
        getSellerPerformance().then(setPerformance).finally(() => setLoading(false))
    }, [])

    const maxViews = Math.max(...(performance?.recentListingViews?.map(l => l.views) || [1]), 1)

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-2xl font-black font-heading uppercase tracking-tight">Performance Analytics</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard label="Conversion Rate" value={`${performance?.conversionRate || 0}%`} icon={Target} color="text-amber-400" bg="bg-amber-500/10" border="border-amber-500/20" loading={loading} />
                <MetricCard label="Active Listings" value={performance?.totalListings || 0} icon={Car} color="text-primary" bg="bg-primary/10" border="border-primary/20" loading={loading} />
                <MetricCard
                    label="Avg Response Time"
                    value={performance?.avgResponseHours != null
                        ? performance.avgResponseHours < 1
                            ? `${Math.round(performance.avgResponseHours * 60)}m`
                            : `${performance.avgResponseHours}h`
                        : '—'}
                    icon={Clock} color="text-blue-400" bg="bg-blue-500/10" border="border-blue-500/20" loading={loading}
                />
                <MetricCard
                    label={`Seller Rating${performance?.totalReviews ? ` (${performance.totalReviews})` : ''}`}
                    value={performance?.sellerRating != null
                        ? `${performance.sellerRating}/5`
                        : performance?.totalReviews === 0 ? 'No reviews' : '—'}
                    icon={ShieldCheck} color="text-emerald-400" bg="bg-emerald-500/10" border="border-emerald-500/20" loading={loading}
                />
            </div>

            <div className="glass-card p-8 border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                <h3 className="text-lg font-black font-heading uppercase tracking-tight mb-8">Top Performing Vehicles</h3>
                {!performance?.recentListingViews?.length ? (
                    <div className="text-center py-10 text-[var(--text-secondary)] italic">No listing data available.</div>
                ) : (
                    <div className="space-y-6">
                        {performance.recentListingViews.map(l => (
                            <div key={l.id} className="space-y-2">
                                <div className="flex justify-between items-center text-xs font-black uppercase tracking-widest">
                                    <span className="text-[var(--text-muted)]">{l.title}</span>
                                    <span>{l.views} VIEWS</span>
                                </div>
                                <div className="h-2 bg-[var(--bg-card)] rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-primary rounded-full shadow-neon transition-all duration-1000" 
                                        style={{ width: `${(l.views / maxViews) * 100}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGES TAB
// ─────────────────────────────────────────────────────────────────────────────

function MessagesTab({ rooms, refreshRooms }: { rooms: ChatRoom[], refreshRooms: () => void }) {
    const [selectedRoom, setSelectedRoom] = React.useState<ChatRoom | null>(null)
    const searchParams = useSearchParams()
    const targetRoomId = searchParams.get("room")

    React.useEffect(() => {
        if (!targetRoomId) return
        void refreshRooms()
    }, [targetRoomId, refreshRooms])

    React.useEffect(() => {
        if (!targetRoomId) return
        const match = rooms.find(r => r.id === targetRoomId)
        if (match) setSelectedRoom(match)
    }, [rooms, targetRoomId])

    return (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 w-full min-w-0">
            <div className="glass-card overflow-hidden w-full min-w-0 min-h-0 h-[min(900px,calc(100vh-200px))] min-h-[440px] flex flex-col border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                <div className="shrink-0 px-5 py-4 md:px-6 md:py-5 border-b border-[var(--border-default)] flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <MessageSquare className="text-primary shrink-0" size={22} />
                        <div className="min-w-0">
                            <h2 className="text-lg md:text-xl font-bold font-heading text-[var(--text-primary)] tracking-tight">Messages</h2>
                            <p className="text-[11px] text-[var(--text-muted)] font-medium truncate">Conversations with buyers and sellers</p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={refreshRooms}
                        className="shrink-0 p-2 rounded-lg text-[var(--text-muted)] hover:text-primary hover:bg-[var(--bg-input)] transition-colors"
                        title="Refresh conversations"
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>

                <div className="flex flex-1 flex-row min-h-0 min-w-0">
                    {/* Room list — fixed width on desktop, full width on mobile when visible */}
                    <div
                        className={`flex shrink-0 flex-col min-h-0 min-w-0 w-full max-w-full border-r border-[var(--border-default)] bg-[var(--bg-card)] lg:w-80 lg:max-w-[20rem] lg:shrink-0 ${
                            selectedRoom ? "hidden lg:flex" : "flex"
                        }`}
                    >
                        <ChatRoomList onSelectRoom={setSelectedRoom} selectedRoomId={selectedRoom?.id} />
                    </div>

                    {/* Chat pane — grows to fill remaining main column */}
                    <div
                        className={`flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--bg-body)] ${
                            !selectedRoom ? "hidden w-full lg:flex lg:items-center lg:justify-center" : "flex w-full"
                        }`}
                    >
                        {selectedRoom ? (
                            <ChatWindow room={selectedRoom} onBack={() => setSelectedRoom(null)} />
                        ) : (
                            <div className="flex max-w-md flex-col items-center justify-center px-6 text-center">
                                <MessageSquare className="mb-4 h-16 w-16 text-[var(--text-secondary)] opacity-40" />
                                <p className="text-base font-semibold text-[var(--text-muted)]">Select a conversation</p>
                                <p className="mt-1 text-sm text-[var(--text-muted)]">Choose a thread from the list to read and reply</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// EARNINGS TAB
// ─────────────────────────────────────────────────────────────────────────────

function EarningsTab() {
    const [data, setData] = React.useState<EarningsResponse | null>(null)
    const [loading, setLoading] = React.useState(true)
    const [exporting, setExporting] = React.useState(false)

    React.useEffect(() => {
        getEarnings().then(setData).finally(() => setLoading(false))
    }, [])

    const handleExport = async () => {
        setExporting(true)
        try {
            await exportEarningsCsv()
        } catch (err: any) {
            alert(err.message || 'Failed to export ledger')
        } finally {
            setExporting(false)
        }
    }

    const totalRevenue = Number(data?.totalRevenue || 0)
    const totalSales = Number(data?.totalSales || 0)
    const avgSale = totalSales > 0 ? totalRevenue / totalSales : 0

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black font-heading uppercase tracking-tight">Earnings History</h2>
                    <p className="text-[var(--text-muted)] text-sm font-medium">Detailed tracking of your sold assets and revenue.</p>
                </div>
                <Button
                    className="flex items-center justify-center gap-2 min-h-[44px] sm:h-10 w-full sm:w-auto shadow-neon-small"
                    variant="outline"
                    onClick={handleExport}
                    disabled={exporting}
                >
                    {exporting ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                    {exporting ? 'Exporting…' : 'Export Ledger'}
                </Button>
            </div>

            {/* KPI summary — Total Earnings stays in sync with /listings/earnings */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="glass-card p-5 border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                    <p className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-2">Total Earnings</p>
                    <p className="text-3xl font-black text-[var(--text-primary)] tabular-nums">
                        {loading ? "—" : formatPrice(totalRevenue)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-widest mt-2">
                        Sourced from finalized sales
                    </p>
                </div>
                <div className="glass-card p-5 border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                    <p className="text-xs font-black uppercase tracking-widest text-primary mb-2">Vehicles Sold</p>
                    <p className="text-3xl font-black text-[var(--text-primary)] tabular-nums">
                        {loading ? "—" : totalSales}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-widest mt-2">
                        Lifetime
                    </p>
                </div>
                <div className="glass-card p-5 border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                    <p className="text-xs font-black uppercase tracking-widest text-blue-400 mb-2">Avg. Sale Price</p>
                    <p className="text-3xl font-black text-[var(--text-primary)] tabular-nums">
                        {loading ? "—" : formatPrice(avgSale)}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-widest mt-2">
                        Mean across all sales
                    </p>
                </div>
            </div>

            <div className="glass-card overflow-hidden border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                {/* ── Simple mobile cards (< sm) ── */}
                <div className="sm:hidden divide-y divide-[var(--border-default)]">
                    {loading ? (
                        <div className="py-16 text-center"><Loader2 className="h-9 w-9 animate-spin text-primary mx-auto" /></div>
                    ) : !data || data.sales.length === 0 ? (
                        <div className="py-16 text-center text-[var(--text-muted)] italic px-6">No sales records found.</div>
                    ) : (
                        data.sales.map((sale) => (
                            <div key={sale.id} className="p-4 flex gap-3">
                                <div className="relative w-16 h-14 rounded-xl overflow-hidden border border-[var(--border-default)] shrink-0">
                                    {sale.listing.images?.[0] ? (
                                        <Image src={sale.listing.images[0]} alt="" fill className="object-cover" />
                                    ) : (
                                        <div className="w-full h-full bg-[var(--bg-input)] flex items-center justify-center"><Car size={16} className="text-[var(--text-secondary)]" /></div>
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="font-black text-base truncate">{sale.listing.title}</p>
                                    <p className="text-sm text-[var(--text-muted)] mt-0.5 truncate">
                                        {sale.buyer ? `${sale.buyer.firstName} ${sale.buyer.lastName || ""}`.trim() : (sale as any).buyerName || "Direct buyer"}
                                    </p>
                                    <div className="flex items-center justify-between mt-1.5">
                                        <span className="text-lg font-black text-emerald-400">{formatPrice(sale.soldPrice)}</span>
                                        <span className="text-sm text-[var(--text-muted)]">{new Date(sale.createdAt).toLocaleDateString('en-GB')}</span>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* ── Full table (>= sm) ── */}
                <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-[var(--bg-input)] text-[var(--text-muted)] text-xs uppercase font-black tracking-widest border-b border-[var(--border-default)]">
                            <tr>
                                <th className="px-6 py-5">Vehicle</th>
                                <th className="px-6 py-5">Buyer</th>
                                <th className="px-6 py-5 text-right">Sold Price</th>
                                <th className="px-6 py-5 text-center">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border-default)]">
                            {loading ? (
                                <tr><td colSpan={4} className="px-6 py-20 text-center"><Loader2 className="animate-spin mx-auto text-primary" /></td></tr>
                            ) : !data || data.sales.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-20 text-center text-[var(--text-muted)] italic">
                                        No sales records found.
                                    </td>
                                </tr>
                            ) : (
                                data.sales.map((sale) => (
                                    <tr key={sale.id} className="hover:bg-white/[0.03] transition-all">
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-[var(--border-default)] shrink-0">
                                                    {sale.listing.images?.[0] ? (
                                                        <Image src={sale.listing.images[0]} alt="" fill className="object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full bg-[var(--bg-input)] flex items-center justify-center"><Car size={14} className="text-[var(--text-secondary)]" /></div>
                                                    )}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="font-bold text-sm text-[var(--text-primary)] truncate uppercase">{sale.listing.title}</p>
                                                    <p className="text-xs text-[var(--text-muted)] font-bold uppercase tracking-widest">{sale.listing.vrm || "N/A"}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <p className="text-sm font-bold text-[var(--text-secondary)] uppercase truncate">
                                                {sale.buyer
                                                    ? `${sale.buyer.firstName} ${sale.buyer.lastName || ""}`.trim()
                                                    : (sale as any).buyerName || "Direct Buyer"}
                                            </p>
                                            <p className="text-xs text-[var(--text-muted)] truncate">
                                                {sale.buyer?.email || (sale as any).buyerEmail || ""}
                                            </p>
                                        </td>
                                        <td className="px-6 py-5 text-right font-black text-emerald-400 text-sm">
                                            {formatPrice(sale.soldPrice)}
                                        </td>
                                        <td className="px-6 py-5 text-center text-xs text-[var(--text-muted)] font-bold">
                                            {new Date(sale.createdAt).toLocaleDateString('en-GB')}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS TAB
// ─────────────────────────────────────────────────────────────────────────────

function SettingsTab({ profile, refreshProfile }: { profile: any; refreshProfile: () => Promise<void> }) {
    const [oldPassword, setOldPassword] = React.useState("")
    const [newPassword, setNewPassword] = React.useState("")
    const [confirmPassword, setConfirmPassword] = React.useState("")
    const [status, setStatus] = React.useState<{ type: 'idle' | 'loading' | 'success' | 'error', message?: string }>({ type: 'idle' })
    const [connectStatus, setConnectStatus] = React.useState<StripeConnectStatus | null>(null)
    const [connectLoading, setConnectLoading] = React.useState(false)
    const [connectError, setConnectError] = React.useState("")
    const [bankName, setBankName] = React.useState("")
    const [bankSortCode, setBankSortCode] = React.useState("")
    const [bankAccountNumber, setBankAccountNumber] = React.useState("")
    const [savingBank, setSavingBank] = React.useState(false)
    const [bankSaveStatus, setBankSaveStatus] = React.useState<"idle" | "success" | "error">("idle")

    // Profile Information (name + phone) — editable
    const [firstName, setFirstName] = React.useState("")
    const [lastName, setLastName] = React.useState("")
    const [phone, setPhone] = React.useState("")
    const [location, setLocation] = React.useState("")
    const [postcode, setPostcode] = React.useState("")
    const [savingProfile, setSavingProfile] = React.useState(false)
    const [profileSaveStatus, setProfileSaveStatus] = React.useState<{ type: "idle" | "success" | "error", message?: string }>({ type: "idle" })

    React.useEffect(() => {
        if (profile) {
            setBankName(profile.bankAccountName || "")
            setBankSortCode(profile.bankSortCode || "")
            setBankAccountNumber(profile.bankAccountNumber || "")
            setFirstName(profile.firstName || "")
            setLastName(profile.lastName || "")
            setPhone(profile.phone || "")
            setLocation(profile.location || "")
            setPostcode(profile.postcode || "")
        }
    }, [profile])

    const handleSaveProfile = async () => {
        if (!firstName.trim() || !lastName.trim()) {
            setProfileSaveStatus({ type: "error", message: "First and last name are required." })
            return
        }
        if (!phone.trim()) {
            setProfileSaveStatus({ type: "error", message: "A phone number is required — it's shown on your profile and listings." })
            return
        }
        if (!location.trim()) {
            setProfileSaveStatus({ type: "error", message: "Your location is required." })
            return
        }
        if (!postcode.trim()) {
            setProfileSaveStatus({ type: "error", message: "Your postal code is required." })
            return
        }
        setSavingProfile(true)
        setProfileSaveStatus({ type: "idle" })
        try {
            await updateProfile({ firstName: firstName.trim(), lastName: lastName.trim(), phone: phone.trim(), location: location.trim(), postcode: postcode.trim() })
            await refreshProfile()
            setProfileSaveStatus({ type: "success", message: "Profile updated." })
            setTimeout(() => setProfileSaveStatus({ type: "idle" }), 3000)
        } catch (err: any) {
            setProfileSaveStatus({ type: "error", message: err.message || "Failed to save profile." })
        } finally {
            setSavingProfile(false)
        }
    }

    React.useEffect(() => {
        getStripeConnectStatus().then(setConnectStatus).catch(() => {})
    }, [])

    const handleSaveBank = async () => {
        try {
            setSavingBank(true)
            setBankSaveStatus("idle")
            await updateBankDetails({ bankAccountName: bankName, bankSortCode, bankAccountNumber })
            setBankSaveStatus("success")
            setTimeout(() => setBankSaveStatus("idle"), 3000)
        } catch {
            setBankSaveStatus("error")
        } finally {
            setSavingBank(false)
        }
    }

    React.useEffect(() => {
        if (typeof window === 'undefined') return
        const params = new URLSearchParams(window.location.search)
        if (params.get('stripe_connect')) {
            getStripeConnectStatus().then(setConnectStatus).catch(() => {})
            window.history.replaceState({}, '', window.location.pathname)
        }
    }, [])

    const handleConnectStripe = async () => {
        setConnectLoading(true)
        setConnectError("")
        try {
            const origin = window.location.origin
            const { url } = await startStripeConnectOnboarding(
                `${origin}/dashboard?tab=settings&stripe_connect=return`,
                `${origin}/dashboard?tab=settings&stripe_connect=refresh`,
            )
            window.location.href = url
        } catch (err: any) {
            setConnectError(err.message || "Failed to start Stripe Connect onboarding.")
        } finally {
            setConnectLoading(false)
        }
    }

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (newPassword !== confirmPassword) {
            setStatus({ type: 'error', message: "New passwords don't match" })
            return
        }

        try {
            setStatus({ type: 'loading' })
            await resetPassword(oldPassword, newPassword)
            setStatus({ type: 'success', message: 'Password updated successfully!' })
            setOldPassword("")
            setNewPassword("")
            setConfirmPassword("")
        } catch (err: any) {
            setStatus({ type: 'error', message: err.message || 'Failed to update password' })
        }
    }

    return (
        <div className="max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="glass-card p-8 border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                <h3 className="text-xl font-black font-heading uppercase tracking-tight flex items-center gap-2 mb-6">
                    <UserIcon className="text-primary" size={24} /> Profile Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">First Name</label>
                        <Input
                            value={firstName}
                            onChange={e => setFirstName(e.target.value)}
                            placeholder="John"
                            className="bg-[var(--bg-card)] border-[var(--border-default)] focus:border-primary text-[var(--text-primary)] h-12"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">Last Name</label>
                        <Input
                            value={lastName}
                            onChange={e => setLastName(e.target.value)}
                            placeholder="Doe"
                            className="bg-[var(--bg-card)] border-[var(--border-default)] focus:border-primary text-[var(--text-primary)] h-12"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-1.5">
                            <Mail size={12} /> Email Address
                        </label>
                        <p className="h-12 flex items-center px-4 rounded-md bg-[var(--bg-input)] border border-[var(--border-default)] text-sm font-bold text-[var(--text-muted)]">{profile?.email}</p>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-1.5">
                            <Phone size={12} /> Phone Number <span className="text-primary">*</span>
                        </label>
                        <Input
                            type="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder="07123 456789"
                            className="bg-[var(--bg-card)] border-[var(--border-default)] focus:border-primary text-[var(--text-primary)] h-12"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-1.5">
                            <MapPin size={12} /> Location <span className="text-primary">*</span>
                        </label>
                        <Input
                            value={location}
                            onChange={e => setLocation(e.target.value)}
                            placeholder="e.g. London"
                            className="bg-[var(--bg-card)] border-[var(--border-default)] focus:border-primary text-[var(--text-primary)] h-12"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest flex items-center gap-1.5">
                            <Hash size={12} /> Postal Code <span className="text-primary">*</span>
                        </label>
                        <Input
                            value={postcode}
                            onChange={e => setPostcode(e.target.value)}
                            placeholder="e.g. E1 6AN"
                            className="bg-[var(--bg-card)] border-[var(--border-default)] focus:border-primary text-[var(--text-primary)] h-12"
                        />
                    </div>
                </div>
                <p className="text-[11px] text-[var(--text-muted)] mt-4">
                    Your phone number is shown on your profile and listings — hidden from visitors who aren't logged in.
                </p>

                {profileSaveStatus.message && (
                    <div className={`mt-4 p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                        profileSaveStatus.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                        {profileSaveStatus.type === 'success' ? <ShieldCheck size={14} /> : <AlertCircle size={14} />}
                        {profileSaveStatus.message}
                    </div>
                )}

                <Button
                    onClick={handleSaveProfile}
                    disabled={savingProfile}
                    className="mt-6 px-8 h-11 shadow-neon font-black uppercase tracking-widest text-xs"
                >
                    {savingProfile ? <Loader2 size={16} className="animate-spin" /> : "Save Profile"}
                </Button>
            </div>

            <div className="glass-card p-8 border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl shadow-neon-small">
                <h3 className="text-xl font-black font-heading uppercase tracking-tight flex items-center gap-2 mb-6">
                    <Lock className="text-primary" size={24} /> Security & Password
                </h3>
                <form onSubmit={handleResetPassword} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">Current Password</label>
                        <Input 
                            type="password" 
                            placeholder="••••••••" 
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            required
                            className="bg-[var(--bg-card)] border-[var(--border-default)] focus:border-primary text-[var(--text-primary)] h-12" 
                        />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">New Password</label>
                            <Input 
                                type="password" 
                                placeholder="Min. 8 characters" 
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                className="bg-[var(--bg-card)] border-[var(--border-default)] focus:border-primary text-[var(--text-primary)] h-12" 
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">Confirm New Password</label>
                            <Input 
                                type="password" 
                                placeholder="••••••••" 
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                className="bg-[var(--bg-card)] border-[var(--border-default)] focus:border-primary text-[var(--text-primary)] h-12" 
                            />
                        </div>
                    </div>

                    {status.message && (
                        <div className={`p-4 rounded-xl text-sm font-bold flex items-center gap-2 animate-in slide-in-from-top-2 ${
                            status.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                        }`}>
                            {status.type === 'success' ? <ShieldCheck size={18} /> : <AlertCircle size={18} />}
                            {status.message}
                        </div>
                    )}

                    <Button
                        type="submit"
                        className="w-full md:w-auto px-10 h-12 shadow-neon font-black uppercase tracking-widest text-xs"
                        disabled={status.type === 'loading'}
                    >
                        {status.type === 'loading' ? <Loader2 size={18} className="animate-spin" /> : 'Update Password'}
                    </Button>
                </form>
            </div>

            {/* Payouts */}
            <div className="glass-card p-8 border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                <h3 className="text-xl font-black font-heading uppercase tracking-tight flex items-center gap-2 mb-2">
                    <CreditCard className="text-primary" size={24} /> Payouts
                </h3>
                <p className="text-sm text-[var(--text-muted)] mb-6">
                    Connect a bank account to receive your £100 seller bonus after a successful auction handover is verified.
                </p>

                {connectStatus?.onboardingComplete ? (
                    <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                        <BadgeCheck size={20} className="text-emerald-400 shrink-0" />
                        <div>
                            <p className="text-sm font-bold text-emerald-300">Bank account connected</p>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">Payouts are enabled. Your bonuses will transfer automatically after handover approval.</p>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {connectStatus?.connected && !connectStatus?.onboardingComplete && (
                            <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                                <AlertTriangle size={16} className="text-amber-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-300">Your Stripe account was created but onboarding is incomplete. Click below to finish.</p>
                            </div>
                        )}
                        {connectError && (
                            <p className="text-xs text-red-400 flex items-center gap-1"><AlertCircle size={13} /> {connectError}</p>
                        )}
                        <Button
                            onClick={handleConnectStripe}
                            disabled={connectLoading}
                            className="gap-2 shadow-neon"
                        >
                            {connectLoading
                                ? <><Loader2 size={16} className="animate-spin" /> Redirecting...</>
                                : <><ExternalLink size={16} /> Connect Bank Account</>
                            }
                        </Button>
                        <p className="text-xs text-[var(--text-muted)]">You will be taken to Stripe's secure onboarding — this takes about 2 minutes.</p>
                    </div>
                )}
            </div>

            {/* Bank Account Details — always visible as fallback payout method */}
            <div className="glass-card p-8 border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                <h3 className="text-xl font-black font-heading uppercase tracking-tight flex items-center gap-2 mb-2">
                    <Landmark className="text-amber-400" size={24} /> Bank Account Details
                </h3>
                <p className="text-sm text-[var(--text-muted)] mb-6">
                    Provide your UK bank details as a fallback. Carmazium can manually transfer your £100 bonus if Stripe Connect isn&apos;t available.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2 md:col-span-2">
                        <label className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">Account Holder Name</label>
                        <Input
                            type="text"
                            value={bankName}
                            onChange={e => setBankName(e.target.value)}
                            placeholder="e.g. John Smith"
                            className="bg-[var(--bg-card)] border-[var(--border-default)] focus:border-amber-400 text-[var(--text-primary)] h-12"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">Sort Code</label>
                        <Input
                            type="text"
                            value={bankSortCode}
                            onChange={e => setBankSortCode(e.target.value)}
                            placeholder="e.g. 00-00-00"
                            maxLength={8}
                            className="bg-[var(--bg-card)] border-[var(--border-default)] focus:border-amber-400 text-[var(--text-primary)] h-12 font-mono"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-[var(--text-muted)] uppercase tracking-widest">Account Number</label>
                        <Input
                            type="text"
                            value={bankAccountNumber}
                            onChange={e => setBankAccountNumber(e.target.value)}
                            placeholder="e.g. 12345678"
                            maxLength={8}
                            className="bg-[var(--bg-card)] border-[var(--border-default)] focus:border-amber-400 text-[var(--text-primary)] h-12 font-mono"
                        />
                    </div>
                </div>
                <div className="mt-6 flex items-center gap-4">
                    <Button
                        onClick={handleSaveBank}
                        disabled={savingBank || !bankName || !bankSortCode || !bankAccountNumber}
                        className="bg-amber-500 hover:bg-amber-400 text-black font-black px-8 h-11 shadow-none border-0"
                    >
                        {savingBank ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : "Save Bank Details"}
                    </Button>
                    {bankSaveStatus === "success" && <span className="text-emerald-400 text-sm flex items-center gap-1"><Check size={14} /> Saved</span>}
                    {bankSaveStatus === "error" && <span className="text-red-400 text-sm flex items-center gap-1"><AlertCircle size={14} /> Failed to save</span>}
                </div>
            </div>

            {/* Buyers and sellers are both routed to this unified dashboard by
                app/dashboard/page.tsx, so this settings tab — not
                buyer/settings or seller/settings, which they never reach — is
                the only place they can manage their account. It was the one
                role surface missing account deletion, which every other role
                (dealer, finance, insurance, service) already had. */}
            <DeleteAccountSection />
        </div>
    )
}
