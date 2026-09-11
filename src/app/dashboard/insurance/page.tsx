"use client"

import * as React from "react"
import Link from "next/link"
import { Loader2, Clock, CheckCircle, XCircle, Shield, ClipboardList, TrendingUp, DollarSign } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { useAuth } from "@/context/AuthContext"
import {
    getInsuranceStats,
    getInsuranceQuotes,
    updateInsuranceStatus,
    formatCurrency,
    type InsuranceQuote,
    type PartnerStats
} from "@/lib/partnerApi"

export default function InsuranceDashboard() {
    const { user, profile, loading: authLoading } = useAuth()
    const [stats, setStats] = React.useState<PartnerStats | null>(null)
    const [quotes, setQuotes] = React.useState<InsuranceQuote[]>([])
    const [loading, setLoading] = React.useState(true)
    const [updating, setUpdating] = React.useState<string | null>(null)

    React.useEffect(() => {
        async function fetchData() {
            if (!user) return
            try {
                setLoading(true)
                const [statsData, quotesData] = await Promise.all([
                    getInsuranceStats(),
                    getInsuranceQuotes(1, 5),
                ])
                setStats(statsData)
                setQuotes(quotesData.data || [])
            } catch (err) {
                console.error('Failed to fetch insurance data:', err)
            } finally {
                setLoading(false)
            }
        }
        if (!authLoading && user) fetchData()
    }, [user, authLoading])

    const handleStatusUpdate = async (id: string, status: Parameters<typeof updateInsuranceStatus>[1]) => {
        try {
            setUpdating(id)
            const updated = await updateInsuranceStatus(id, status)
            setQuotes(prev => prev.map(q => q.id === id ? updated : q))
            const newStats = await getInsuranceStats()
            setStats(newStats)
        } catch (err) {
            console.error('Failed to update status:', err)
        } finally {
            setUpdating(null)
        }
    }

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
        )
    }

    const userName = profile?.firstName ? `${profile.firstName} ${profile.lastName || ""}` : (user?.email?.split('@')[0] || "User")

    return (
        <div className="min-h-screen pt-20 pb-12">
            <div className="container mx-auto px-5 flex flex-col lg:flex-row gap-8">
                <DashboardSidebar role="insurance" userName={userName} userType="Insurance Partner" />

                <main className="flex-1 space-y-8">
                    {/* Stats Row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="glass-card p-6 border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-yellow-500/20 rounded-lg"><Clock size={18} className="text-yellow-400" /></div>
                            </div>
                            <p className="text-[var(--text-muted)] text-xs mb-1 uppercase tracking-widest font-bold">Pending</p>
                            <h3 className="text-3xl font-black font-heading">
                                {loading ? "..." : stats?.pending || 0}
                            </h3>
                        </div>
                        <div className="glass-card p-6 border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-blue-500/20 rounded-lg"><ClipboardList size={18} className="text-blue-400" /></div>
                            </div>
                            <p className="text-[var(--text-muted)] text-xs mb-1 uppercase tracking-widest font-bold">Quoted</p>
                            <h3 className="text-3xl font-black font-heading text-blue-400">
                                {loading ? "..." : stats?.approved || 0}
                            </h3>
                        </div>
                        <div className="glass-card p-6 border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-emerald-500/20 rounded-lg"><CheckCircle size={18} className="text-emerald-400" /></div>
                            </div>
                            <p className="text-[var(--text-muted)] text-xs mb-1 uppercase tracking-widest font-bold">Accepted</p>
                            <h3 className="text-3xl font-black font-heading text-emerald-400">
                                {loading ? "..." : stats?.completed || 0}
                            </h3>
                        </div>
                        <div className="glass-card p-6 border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl hover:bg-white/10 transition-colors">
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-primary/20 rounded-lg"><DollarSign size={18} className="text-primary" /></div>
                            </div>
                            <p className="text-[var(--text-muted)] text-xs mb-1 uppercase tracking-widest font-bold">Premium Revenue</p>
                            <h3 className="text-2xl font-black font-heading text-primary">
                                {loading ? "..." : formatCurrency(stats?.totalValue || 0)}
                            </h3>
                        </div>
                    </div>

                    {/* Recent Quotes Table */}
                    <div className="glass-card overflow-hidden border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                        <div className="p-6 border-b border-[var(--border-default)] flex justify-between items-center bg-[var(--bg-card)]">
                            <h2 className="text-xl font-black font-heading uppercase tracking-tight flex items-center gap-2">
                                <Shield className="text-primary" /> Recent Quote Requests
                            </h2>
                            <Link href="/dashboard/insurance/quotes" className="text-primary hover:text-primary dark:hover:text-white text-sm font-black transition-colors uppercase">View All</Link>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-[var(--bg-input)] text-[var(--text-muted)] text-xs uppercase font-black tracking-widest">
                                    <tr>
                                        <th className="px-6 py-4">Applicant</th>
                                        <th className="px-6 py-4">Vehicle</th>
                                        <th className="px-6 py-4 text-center">Age</th>
                                        <th className="px-6 py-4 text-center">NCB</th>
                                        <th className="px-6 py-4 text-center">Status</th>
                                        <th className="px-6 py-4 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[var(--border-default)]/80">
                                    {loading ? (
                                        <tr><td colSpan={6} className="px-6 py-12 text-center"><Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" /></td></tr>
                                    ) : quotes.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-12 text-center text-[var(--text-muted)] italic">
                                                No quote requests yet. Requests will appear here once buyers apply for insurance.
                                            </td>
                                        </tr>
                                    ) : (
                                        quotes.map((quote) => (
                                            <tr key={quote.id} className="hover:bg-[var(--bg-card)] transition-colors">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold">{quote.user?.firstName} {quote.user?.lastName}</div>
                                                    <div className="text-xs text-[var(--text-muted)]">{quote.user?.email}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm">{quote.listing?.title || 'Unknown Vehicle'}</div>
                                                    <div className="text-xs text-[var(--text-muted)]">{formatCurrency(quote.listing?.price || 0)}</div>
                                                </td>
                                                <td className="px-6 py-4 text-center">{quote.driverAge}</td>
                                                <td className="px-6 py-4 text-center">{quote.ncbYears} yr</td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${quote.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                                                        quote.status === 'QUOTED' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                                                            quote.status === 'ACCEPTED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                                                                quote.status === 'EXPIRED' ? 'bg-gray-500/10 text-[var(--text-muted)] border-gray-500/20' :
                                                                    'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                                                        {quote.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {updating === quote.id ? (
                                                        <Loader2 size={16} className="animate-spin text-primary inline" />
                                                    ) : quote.status === 'PENDING' ? (
                                                        <div className="flex gap-2 justify-end">
                                                            <Button size="sm" className="bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-primary dark:hover:text-white border border-blue-500/20 h-8 text-xs"
                                                                onClick={() => handleStatusUpdate(quote.id, 'QUOTED')}>
                                                                Provide Quote
                                                            </Button>
                                                            <Button size="sm" variant="outline" className="border-red-500/20 text-red-500 hover:bg-red-500/10 h-8 text-xs"
                                                                onClick={() => handleStatusUpdate(quote.id, 'REJECTED')}>
                                                                Reject
                                                            </Button>
                                                        </div>
                                                    ) : null}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    )
}
