"use client"

import * as React from "react"
import { Loader2, FileText, CheckCircle, XCircle, Clock } from "lucide-react"
import { Button } from "@/components/ui/Button"
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar"
import { useAuth } from "@/context/AuthContext"
import {
    getFinanceApplications,
    updateFinanceStatus,
    formatCurrency,
    type FinanceApplication,
} from "@/lib/partnerApi"

export default function FinanceApplicationsPage() {
    const { user, profile, loading: authLoading } = useAuth()
    const [applications, setApplications] = React.useState<FinanceApplication[]>([])
    const [loading, setLoading] = React.useState(true)
    const [updating, setUpdating] = React.useState<string | null>(null)
    const [statusFilter, setStatusFilter] = React.useState<string>("ALL")
    const [page, setPage] = React.useState(1)
    const [total, setTotal] = React.useState(0)
    const limit = 15

    React.useEffect(() => {
        async function fetchData() {
            if (!user) return
            try {
                setLoading(true)
                const res = await getFinanceApplications(page, limit)
                setApplications(res.data || [])
                setTotal(res.pagination?.total || 0)
            } catch (err) {
                console.error('Failed to fetch applications:', err)
            } finally {
                setLoading(false)
            }
        }
        if (!authLoading && user) fetchData()
    }, [user, authLoading, page])

    const handleStatusUpdate = async (id: string, status: FinanceApplication['status']) => {
        try {
            setUpdating(id)
            const updated = await updateFinanceStatus(id, status)
            setApplications(prev => prev.map(a => a.id === id ? { ...a, ...updated } : a))
        } catch (err) {
            console.error('Failed to update status:', err)
        } finally {
            setUpdating(null)
        }
    }

    if (authLoading) {
        return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /></div>
    }

    const userName = profile?.firstName ? `${profile.firstName} ${profile.lastName || ""}` : (user?.email?.split('@')[0] || "User")
    const filtered = statusFilter === "ALL" ? applications : applications.filter(a => a.status === statusFilter)
    const totalPages = Math.ceil(total / limit)

    return (
        <div className="min-h-screen pt-20 pb-12">
            <div className="container mx-auto px-5 flex flex-col lg:flex-row gap-8">
                <DashboardSidebar role="finance" userName={userName} userType="Finance Partner" />
                <main className="flex-1 space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <h1 className="text-2xl font-black font-heading flex items-center gap-2"><FileText className="text-primary" /> Finance Applications</h1>
                        <div className="flex gap-2 flex-wrap">
                            {["ALL", "PENDING", "APPROVED", "REJECTED", "COMPLETED"].map(s => (
                                <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${statusFilter === s ? 'bg-primary text-white' : 'bg-[var(--bg-card)] text-[var(--text-muted)] hover:bg-white/10 hover:text-primary'}`}>
                                    {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="glass-card overflow-hidden border border-[var(--border-default)] bg-[var(--bg-card)] rounded-2xl">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-[var(--bg-input)] text-[var(--text-muted)] text-xs uppercase font-black tracking-widest"><tr><th className="px-6 py-4">Applicant</th><th className="px-6 py-4">Vehicle</th><th className="px-6 py-4 text-right">Deposit</th><th className="px-6 py-4 text-center">Term</th><th className="px-6 py-4 text-center">Status</th><th className="px-6 py-4">Date</th><th className="px-6 py-4 text-right">Actions</th></tr></thead>
                                <tbody className="divide-y divide-[var(--border-default)]/80">
                                    {loading ? <tr><td colSpan={7} className="px-6 py-12 text-center"><Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" /></td></tr> : filtered.length === 0 ? <tr><td colSpan={7} className="px-6 py-12 text-center text-[var(--text-muted)] italic">No applications found.</td></tr> : filtered.map(app => (
                                        <tr key={app.id} className="hover:bg-[var(--bg-card)] transition-colors">
                                            <td className="px-6 py-4"><div className="font-bold">{app.user?.firstName} {app.user?.lastName}</div><div className="text-xs text-[var(--text-muted)]">{app.user?.email}</div></td>
                                            <td className="px-6 py-4"><div className="text-sm">{app.listing?.title || 'Unknown'}</div><div className="text-xs text-[var(--text-muted)]">{formatCurrency(app.listing?.price || 0)}</div></td>
                                            <td className="px-6 py-4 text-right font-bold">{formatCurrency(app.depositAmount)}</td>
                                            <td className="px-6 py-4 text-center">{app.termMonths} mo</td>
                                            <td className="px-6 py-4 text-center"><span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${app.status === 'PENDING' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' : app.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : app.status === 'REJECTED' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{app.status === 'PENDING' && <Clock size={10} />}{app.status === 'APPROVED' && <CheckCircle size={10} />}{app.status === 'REJECTED' && <XCircle size={10} />}{app.status}</span></td>
                                            <td className="px-6 py-4 text-sm text-[var(--text-secondary)]">{new Date(app.createdAt).toLocaleDateString()}</td>
                                            <td className="px-6 py-4 text-right">{updating === app.id ? <Loader2 size={16} className="animate-spin text-primary inline" /> : app.status === 'PENDING' ? <div className="flex gap-2 justify-end"><Button size="sm" className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white border border-emerald-500/20 h-8 text-xs" onClick={() => handleStatusUpdate(app.id, 'APPROVED')}>Approve</Button><Button size="sm" variant="outline" className="border-red-500/20 text-red-500 hover:bg-red-500/10 h-8 text-xs" onClick={() => handleStatusUpdate(app.id, 'REJECTED')}>Reject</Button></div> : app.status === 'APPROVED' ? <Button size="sm" className="bg-blue-500/10 text-blue-400 hover:bg-blue-500 hover:text-white border border-blue-500/20 h-8 text-xs" onClick={() => handleStatusUpdate(app.id, 'COMPLETED')}>Complete</Button> : null}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {totalPages > 1 && <div className="p-4 border-t border-[var(--border-default)] flex justify-between items-center"><span className="text-sm text-[var(--text-muted)]">Page {page} of {totalPages} ({total} total)</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="text-xs">Previous</Button><Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="text-xs">Next</Button></div></div>}
                    </div>
                </main>
            </div>
        </div>
    )
}
