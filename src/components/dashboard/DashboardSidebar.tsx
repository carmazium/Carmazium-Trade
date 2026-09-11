"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
    LayoutDashboard,
    Car,
    PlusCircle,
    DollarSign,
    Settings,
    LogOut,
    MessageSquare,
    Heart,
    Clock,
    Gavel,
    BarChart3,
    Briefcase,
    Menu,
    X,
    ChevronRight,
    Banknote,
    FileText,
    Shield,
    ShieldCheck,
    ClipboardList,
    Tag,
    Users,
    Kanban,
    Building2,
    Handshake,
    Receipt,
    TrendingUp,
    Megaphone,
    Newspaper,
    LifeBuoy,
    Loader2,
} from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { useChat } from "@/context/ChatContext"
import { DEALER_ROUTE_CONFIG } from "@/config/dealerRouteConfig"
import { getPendingOffersCount, getBuyerActionCount } from "@/lib/listingApi"
import { getOrCreateSupportRoom } from "@/lib/chatApi"

const ROLE_MESSAGES_HREF: Record<string, string> = {
    buyer: "/dashboard/user?tab=messages",
    seller: "/dashboard/user?tab=messages",
    provider: "/dashboard/service/messages",
    finance: "/dashboard/finance/messages",
    insurance: "/dashboard/insurance/messages",
    dealer: "/dashboard/dealer/messages",
}

interface SidebarProps {
    role: "buyer" | "seller" | "provider" | "finance" | "insurance" | "dealer" | "admin"
    userName?: string
    userType?: string
    children?: React.ReactNode
    myOffersCounterBadge?: number
}

export function DashboardSidebar({ role, userName: initialUserName, userType: initialUserType, children, myOffersCounterBadge }: SidebarProps) {
    const pathname = usePathname()
    const { profile, user, signOut } = useAuth()
    const { unreadCount } = useChat()
    const router = useRouter()
    const searchParams = useSearchParams()
    const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false)
    const [pendingOffersCount, setPendingOffersCount] = React.useState(0)
    const [contactingSupport, setContactingSupport] = React.useState(false)

    React.useEffect(() => {
        if (!user) return
        const fetchCount = () => {
            if (role === 'seller') {
                getPendingOffersCount().then(setPendingOffersCount).catch(() => {})
            } else if (role === 'buyer') {
                getBuyerActionCount().then(setPendingOffersCount).catch(() => {})
            }
        }
        fetchCount()
        const interval = setInterval(fetchCount, 60_000)
        return () => clearInterval(interval)
    }, [role, user])

    const handleSignOut = async (e: React.MouseEvent) => {
        e.preventDefault()
        await signOut()
        router.push('/')
    }

    const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen)

    const handleContactSupport = async () => {
        if (contactingSupport) return
        setContactingSupport(true)
        try {
            const room = await getOrCreateSupportRoom()
            const base = ROLE_MESSAGES_HREF[role] || "/dashboard/user?tab=messages"
            router.push(`${base}${base.includes("?") ? "&" : "?"}room=${room.id}`)
            setIsMobileMenuOpen(false)
        } catch (err) {
            console.error("Failed to start support chat:", err)
        } finally {
            setContactingSupport(false)
        }
    }

    const userName = (initialUserName && initialUserName !== "John Doe" && initialUserName !== "Apex Customs" && initialUserName !== "User")
        ? initialUserName
        : (profile?.firstName ? `${profile.firstName} ${profile.lastName || ""}` : (user?.email?.split('@')[0] || "User"))

    const formatRole = (raw: string | undefined): string => {
        const key = raw?.toUpperCase().replace(/\s*ACCOUNT\s*/i, '').trim()
        switch (key) {
            case 'BUYER':
            case 'SELLER': return 'Buyer/Seller Account'
            case 'DEALER': return 'Dealer Account'
            case 'ADMIN': return 'Admin Account'
            case 'CONTRACTOR': return 'Service Provider'
            case 'FINANCE_PARTNER': return 'Finance Partner'
            case 'INSURANCE_PARTNER': return 'Insurance Partner'
            default: return raw || (role.charAt(0).toUpperCase() + role.slice(1) + ' Account')
        }
    }
    const displayType = formatRole(initialUserType || profile?.role)

    type LinkObj = { href: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }>; badge?: number }

    const unifiedLinks = [
        { href: "/dashboard/user?tab=overview", label: "Overview", icon: LayoutDashboard },
        { href: "/dashboard/user?tab=inventory", label: "Inventory", icon: Car },
        { href: "/dashboard/user?tab=offers", label: "Offers", icon: Tag, badge: pendingOffersCount },
        { href: "/dashboard/user?tab=bids", label: "My Offers", icon: Gavel },
        { href: "/dashboard/user?tab=watchlist", label: "Watchlist", icon: Heart },
        { href: "/dashboard/user?tab=stats", label: "Stats", icon: BarChart3 },
        { href: "/dashboard/user?tab=messages", label: "Messages", icon: MessageSquare, badge: unreadCount },
        { href: "/dashboard/user?tab=earnings", label: "Earnings", icon: DollarSign },
        { href: "/dashboard/user?tab=settings", label: "Settings", icon: Settings },
    ]

    const sellerLinks: LinkObj[] = [
        ...unifiedLinks.slice(0, 2),
        { href: "/dashboard/seller/auctions", label: "Auctions", icon: Gavel },
        ...unifiedLinks.slice(2),
    ]

    const links: Record<string, LinkObj[]> = {
        buyer: unifiedLinks,
        seller: sellerLinks,
        provider: [
            { href: "/dashboard/service", label: "Overview", icon: LayoutDashboard },
            { href: "/dashboard/service/jobs", label: "Jobs", icon: Briefcase },
            { href: "/dashboard/service/capabilities", label: "Service areas", icon: ShieldCheck },
            { href: "/dashboard/service/messages", label: "Messages", icon: MessageSquare, badge: unreadCount },
            { href: "/dashboard/service/settings", label: "Settings", icon: Settings },
        ],
        finance: [
            { href: "/dashboard/finance", label: "Overview", icon: LayoutDashboard },
            { href: "/dashboard/finance/applications", label: "Applications", icon: FileText },
            { href: "/dashboard/finance/messages", label: "Messages", icon: MessageSquare, badge: unreadCount },
            { href: "/dashboard/finance/settings", label: "Settings", icon: Settings },
        ],
        insurance: [
            { href: "/dashboard/insurance", label: "Overview", icon: LayoutDashboard },
            { href: "/dashboard/insurance/quotes", label: "Quotes", icon: ClipboardList },
            { href: "/dashboard/insurance/messages", label: "Messages", icon: MessageSquare, badge: unreadCount },
            { href: "/dashboard/insurance/settings", label: "Settings", icon: Settings },
        ],
        dealer: DEALER_ROUTE_CONFIG.filter(r => !r.hidden).map(route => ({
            href: route.href,
            label: route.label,
            icon: route.icon,
            badge: route.href === '/dashboard/dealer/messages' ? unreadCount : undefined
        })),
        admin: [
            { href: "/dashboard/admin", label: "Overview", icon: LayoutDashboard },
            { href: "/dashboard/admin/messages", label: "Messages", icon: MessageSquare, badge: unreadCount },
            { href: "/dashboard/admin/users", label: "Accounts", icon: Users },
            { href: "/sell", label: "Create Listing", icon: PlusCircle },
            { href: "/dashboard/admin/listings", label: "Listings", icon: Car },
            { href: "/dashboard/admin/hpi", label: "HPI Reports", icon: ShieldCheck },
            { href: "/dashboard/admin/auctions", label: "Auctions", icon: Gavel },
            { href: "/dashboard/admin/handovers", label: "Handovers", icon: Handshake },
            { href: "/dashboard/admin/transactions", label: "Transactions", icon: Receipt },
            { href: "/dashboard/admin/analytics", label: "Analytics", icon: TrendingUp },
            { href: "/dashboard/admin/dealer-verification", label: "Dealer KYC", icon: Shield },
            { href: "/dashboard/admin/services", label: "Trade Services", icon: Briefcase },
            { href: "/dashboard/admin/dealers", label: "All Dealers", icon: Building2 },
            { href: "/dashboard/admin/marketing-popup", label: "Marketing Popup", icon: Megaphone },
            { href: "/dashboard/admin/blog", label: "Blog", icon: Newspaper },
        ]
    }

    const currentLinks = React.useMemo(() => {
        const base = links[role as keyof typeof links] || []
        if (!myOffersCounterBadge || myOffersCounterBadge < 1) return base
        return base.map((link) =>
            link.href.includes("tab=bids")
                ? { ...link, badge: myOffersCounterBadge }
                : link,
        )
    }, [role, myOffersCounterBadge])
    const mobileLinks = currentLinks.slice(0, 5)
    const isAdmin = profile?.role === 'ADMIN'

    return (
        <>
            <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 backdrop-blur-lg border-t pb-[env(safe-area-inset-bottom)]" style={{ background: 'var(--bg-dropdown)', borderColor: 'var(--border-default)' }}>
                <div className="flex justify-around items-center py-2 px-1">
                    {mobileLinks.map((link) => {
                        const linkPath = link.href.split('?')[0]
                        const isActive = pathname === "/dashboard/user" && linkPath === "/dashboard/user"
                            ? (searchParams.get("tab") === new URL(link.href, window.location.origin).searchParams.get("tab"))
                            : pathname === linkPath
                        const Icon = link.icon
                        return (
                            <Link key={link.href} href={link.href} className={`flex flex-col items-center justify-center py-2 px-3 rounded-lg min-w-[60px] relative transition-all ${isActive ? "text-primary" : ""}`} style={!isActive ? { color: 'var(--text-muted)' } : undefined}>
                                <div className="relative">
                                    <Icon size={20} />
                                    {link.badge && link.badge > 0 && (
                                        link.href.includes('tab=offers') ? (
                                            <span className="absolute -top-2 -right-2">
                                                <span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-primary opacity-60" />
                                                <span className="relative inline-flex items-center justify-center rounded-full bg-primary text-white text-[8px] font-black w-4 h-4">{link.badge > 9 ? '9+' : link.badge}</span>
                                            </span>
                                        ) : (
                                            <span className="absolute -top-2 -right-2 bg-primary text-white text-xs font-bold w-4 h-4 rounded-full flex items-center justify-center">{link.badge > 9 ? '9+' : link.badge}</span>
                                        )
                                    )}
                                </div>
                                <span className={`text-xs mt-1 font-medium ${isActive ? 'text-primary' : ''}`}>{link.label}</span>
                                {isActive && <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 bg-primary rounded-full" />}
                            </Link>
                        )
                    })}
                    <button onClick={toggleMobileMenu} className={`flex flex-col items-center justify-center py-2 px-3 rounded-lg min-w-[60px] transition-all ${isMobileMenuOpen ? "text-primary" : ""}`} style={!isMobileMenuOpen ? { color: 'var(--text-muted)' } : undefined}>
                        {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                        <span className="text-xs mt-1 font-medium">More</span>
                    </button>
                </div>
            </div>

            {isMobileMenuOpen && <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden" onClick={() => setIsMobileMenuOpen(false)} />}

            <div className={`lg:hidden fixed bottom-[72px] left-0 right-0 z-40 border-t rounded-t-2xl transition-transform duration-300 ease-out shadow-[0_-10px_40px_rgba(0,0,0,0.5)] ${isMobileMenuOpen ? "translate-y-0" : "translate-y-[120%]"}`} style={{ background: 'var(--bg-dropdown)', borderColor: 'var(--border-default)' }}>
                <div className="p-4 pb-12 space-y-2 max-h-[60vh] overflow-y-auto">
                    <div className="flex items-center gap-3 p-3 rounded-xl mb-4" style={{ background: 'var(--bg-card)' }}>
                        <div className="w-10 h-10 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold text-sm border border-primary/30">{(userName || "U").split(" ").filter(Boolean).map(n => n[0]).join("").toUpperCase().slice(0, 2)}</div>
                        <div><h3 className="font-bold text-sm">{userName}</h3><p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{displayType}</p></div>
                    </div>
                    {currentLinks.slice(5).map((link) => {
                        const isActive = pathname === link.href
                        const Icon = link.icon
                        return (
                            <Link key={link.href} href={link.href} onClick={() => setIsMobileMenuOpen(false)} className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? "bg-primary text-white" : "hover:bg-primary/5 dark:hover:bg-[var(--bg-card)]"}`} style={!isActive ? { color: 'var(--text-secondary)' } : undefined}>
                                <div className="flex items-center gap-3"><Icon size={18} /><span className="text-sm font-medium">{link.label}</span>{link.badge && link.badge > 0 && <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-primary/20 text-primary'}`}>{link.badge}</span>}</div><ChevronRight size={16} className="opacity-40" />
                            </Link>
                        )
                    })}
                    {role !== "admin" && <button onClick={handleContactSupport} disabled={contactingSupport} className="w-full flex items-center gap-3 px-4 py-3 text-primary hover:bg-primary/10 rounded-xl transition-all disabled:opacity-50">{contactingSupport ? <Loader2 size={18} className="animate-spin" /> : <LifeBuoy size={18} />}Contact CarMazium Support</button>}
                    {children && <div className="pt-2">{children}</div>}
                    <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-xl transition-all"><LogOut size={18} /> Sign Out</button>
                </div>
            </div>

            <aside className="hidden lg:block w-72 shrink-0 self-start">
                <div className="glass-card p-5 !sticky top-24">
                    <div className="flex items-center gap-3 mb-6 p-3 rounded-xl" style={{ background: 'var(--bg-input)' }}>
                        <div className="w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-primary font-bold text-lg border border-primary/30">{(userName || "U").split(" ").filter(Boolean).map(n => n[0]).join("").toUpperCase().slice(0, 2)}</div>
                        <div className="overflow-hidden"><h3 className="font-bold truncate text-sm">{userName}</h3><p className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{displayType}</p></div>
                    </div>
                    <nav className="space-y-1">
                        {currentLinks.map((link) => {
                            const linkPath = link.href.split('?')[0]
                            const isActive = pathname === "/dashboard/user" && linkPath === "/dashboard/user" ? (searchParams.get("tab") === new URL(link.href, window.location.origin).searchParams.get("tab")) : pathname === linkPath
                            const Icon = link.icon
                            return (
                                <Link key={link.href} href={link.href} className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-lg text-sm transition-all ${isActive ? "bg-primary text-white font-semibold" : "hover:bg-primary/5 dark:hover:bg-[var(--bg-card)] hover:text-primary dark:hover:text-white"}`} style={!isActive ? { color: 'var(--text-muted)' } : undefined}>
                                    <div className="flex items-center gap-3 relative"><Icon size={18} />{link.label}</div>
                                    {link.badge && link.badge > 0 && (link.href.includes('tab=offers') ? <span className="relative flex items-center justify-center"><span className="animate-ping absolute inline-flex h-3 w-3 rounded-full bg-primary opacity-60" /><span className="relative inline-flex items-center justify-center rounded-full bg-primary text-white text-xs font-black min-w-[18px] h-[18px] px-1">{link.badge > 9 ? '9+' : link.badge}</span></span> : <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20' : 'bg-primary/20 text-primary'}`}>{link.badge}</span>)}
                                </Link>
                            )
                        })}
                    </nav>
                    {isAdmin && role !== 'admin' && <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-default)' }}><Link href="/dashboard/admin" className="flex items-center gap-3 px-4 py-2.5 text-blue-500 dark:text-blue-400 dark:hover:text-white hover:bg-blue-500/10 rounded-lg transition-all text-sm font-semibold"><Shield size={18} /> Admin Panel</Link></div>}
                    {role !== 'admin' && <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-default)' }}><button onClick={handleContactSupport} disabled={contactingSupport} className="w-full flex items-center gap-3 px-4 py-2.5 text-primary hover:bg-primary/10 rounded-lg transition-all text-sm font-semibold disabled:opacity-50">{contactingSupport ? <Loader2 size={18} className="animate-spin" /> : <LifeBuoy size={18} />}Contact Support</button></div>}
                    {children && <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-default)' }}>{children}</div>}
                    <div className="mt-4 pt-4 border-t" style={{ borderColor: 'var(--border-default)' }}><button onClick={handleSignOut} className="w-full flex items-center gap-3 px-4 py-2.5 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all text-sm" style={{ color: 'var(--text-muted)' }}><LogOut size={18} /> Sign Out</button></div>
                </div>
            </aside>
            <div className="hidden" />
        </>
    )
}
