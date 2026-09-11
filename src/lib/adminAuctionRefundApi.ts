import { apiClient } from './apiClient';

export interface FailedAuctionSaleRefundResult {
    auctionId: string;
    reason: string;
    status: 'CANCELLED';
    listingStatus: 'DRAFT';
    refundedAmount: number;
    nonRefundableAmount: number;
    refund?: {
        id: string;
        amount: string | number;
        stripePaymentId: string | null;
        createdAt: string;
    } | null;
}

/**
 * Admin-only failed-sale action. This is deliberately separate from rejecting
 * handover proof: proof rejection asks the seller to resubmit and never refunds
 * the buyer. A genuine failed/cancelled sale refunds £100 of the £125 buyer fee.
 */
export async function refundFailedAuctionSale(
    auctionId: string,
    reason: string,
): Promise<FailedAuctionSaleRefundResult> {
    const result = await apiClient<{ data: FailedAuctionSaleRefundResult }>(
        `/admin/auctions/${auctionId}/refund-failed-sale`,
        {
            method: 'POST',
            body: JSON.stringify({ reason }),
        },
    );
    return result.data;
}
