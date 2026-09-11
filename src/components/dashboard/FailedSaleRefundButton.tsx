"use client"

import * as React from "react"
import { Loader2, Undo2 } from "lucide-react"
import { refundFailedAuctionSale } from "@/lib/adminAuctionRefundApi"

export function FailedSaleRefundButton({
    auctionId,
    onCompleted,
}: {
    auctionId: string
    onCompleted?: () => void
}) {
    const [processing, setProcessing] = React.useState(false)

    const handleRefund = async () => {
        const reason = window.prompt(
            "Why did this auction sale genuinely fail or get cancelled?\n\nRejecting unclear handover proof is NOT a failed sale — use the handover review page for that.",
        )
        if (!reason?.trim()) return
        if (reason.trim().length < 5) {
            window.alert("Please enter a clear failed-sale reason.")
            return
        }

        const confirmed = window.confirm(
            "Cancel this auction sale?\n\n£100 of the buyer's £125 auction fee will be refunded. The £25 platform fee remains non-refundable. The auction will return to draft, any linked retail listing auto-closed by this auction will be restored, and the recorded auction sale will be reversed.\n\nThis action is only for a genuine failed/cancelled sale.",
        )
        if (!confirmed) return

        try {
            setProcessing(true)
            await refundFailedAuctionSale(auctionId, reason.trim())
            window.alert("Failed sale cancelled. £100 refunded; £25 platform fee retained. Listing returned to draft.")
            onCompleted?.()
        } catch (error: any) {
            window.alert(error?.message || "Failed-sale refund could not be completed.")
        } finally {
            setProcessing(false)
        }
    }

    return (
        <button
            type="button"
            onClick={handleRefund}
            disabled={processing}
            className="p-2.5 hover:bg-red-500/10 rounded-lg transition-colors text-red-400 hover:text-red-300 inline-flex disabled:opacity-40 cursor-pointer"
            title="Cancel genuine failed sale and refund £100 (retain £25)"
        >
            {processing ? <Loader2 size={16} className="animate-spin" /> : <Undo2 size={16} />}
        </button>
    )
}
