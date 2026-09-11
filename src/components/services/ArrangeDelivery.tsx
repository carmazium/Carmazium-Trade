"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Truck, Loader2, ArrowRight } from "lucide-react"
import { createJobFromPurchase } from "@/lib/servicesApi"

export function ArrangeDelivery({ offerId, auctionId, compact = false }: { offerId?: string; auctionId?: string; compact?: boolean }) {
    const router = useRouter()
    const [open, setOpen] = React.useState(false)
    const [postcode, setPostcode] = React.useState("")
    const [busy, setBusy] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)

    const go = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!postcode.trim()) return setError("Enter the delivery postcode")
        setBusy(true); setError(null)
        try {
            const job = await createJobFromPurchase({ offerId, auctionId, deliveryPostcode: postcode.trim() })
            router.push(`/services/jobs/${job.id}?posted=1`)
        } catch (err: any) {
            setError(err?.message || "Could not create the delivery job")
            setBusy(false)
        }
    }

    if (!open) {
        return (
            <button type="button" onClick={() => setOpen(true)}
                className={compact
                    ? "inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
                    : "inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-primary/40 text-primary text-sm font-black uppercase tracking-widest hover:bg-primary/10 transition-colors"}>
                <Truck size={compact ? 13 : 16} /> Get delivery quotes
            </button>
        )
    }

    return (
        <form onSubmit={go} className="flex flex-col sm:flex-row sm:items-center gap-2">
            <input autoFocus className="rounded-xl border px-3 py-2 text-sm font-mono uppercase outline-none focus:border-primary bg-[var(--bg-input)] border-[var(--border-default)] text-[var(--text-primary)] w-full sm:w-40"
                placeholder="Deliver to postcode" value={postcode} onChange={e => setPostcode(e.target.value)} maxLength={10} aria-label="Delivery postcode" />
            <button type="submit" disabled={busy}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-widest hover:bg-primary/90 disabled:opacity-60">
                {busy ? <Loader2 className="animate-spin" size={14} /> : <>Post job <ArrowRight size={13} /></>}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--text-muted)] hover:underline">Cancel</button>
            {error && <span className="text-xs text-red-500">{error}</span>}
        </form>
    )
}
