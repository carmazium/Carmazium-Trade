/**
 * Payment API Client
 */
import { apiClient } from './apiClient'

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CheckoutSessionResult {
    url: string
    sessionId: string
    transactionId: string
}

export interface SessionStatus {
    status: string
    paymentStatus: string
    customerEmail: string | null
    metadata: Record<string, string>
    amountTotal: number | null
    currency: string | null
}

export interface PaymentTransaction {
    id: string
    listingId: string
    amount: string | number
    type: 'DEPOSIT' | 'FULL_PAYMENT' | 'COMMISSION' | 'REFUND' | 'HPI_REPORT' | 'LISTING_FEE' | 'BOOST'
    status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'REFUNDED'
    stripePaymentId: string | null
    description: string | null
    createdAt: string
    listing?: {
        id: string
        title: string
        slug: string
        images: string[]
        make: string | null
        model: string | null
        year: number | null
    }
}

// ─── API Functions ──────────────────────────────────────────────────────────

/**
 * Create a Stripe Checkout Session and get the redirect URL.
 */
export async function createCheckoutSession(
    listingId: string,
    amount: number,
    type: 'DEPOSIT' | 'FULL_PAYMENT' | 'COMMISSION' = 'FULL_PAYMENT',
    currency = 'gbp',
): Promise<CheckoutSessionResult> {
    const data = await apiClient<{ data: CheckoutSessionResult }>('/payments/checkout', {
        method: 'POST',
        body: JSON.stringify({ listingId, amount, type, currency }),
    })
    return data.data
}

/**
 * Poll the status of a Stripe Checkout Session.
 */
export async function getSessionStatus(sessionId: string): Promise<SessionStatus> {
    const data = await apiClient<{ data: SessionStatus }>(`/payments/session-status/${sessionId}`, {
        method: 'GET',
    })
    return data.data
}

/**
 * Webhook fallback: apply the £125 auction buyer fee if the Stripe webhook was delayed.
 */
export async function applyAuctionFee(sessionId: string): Promise<{ applied: boolean }> {
    const data = await apiClient<{ data: { applied: boolean } }>('/payments/apply-auction-fee', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
    })
    return data.data
}

/**
 * Webhook fallback: apply the £1 dealer KYC verification fee if the Stripe webhook was delayed.
 */
export async function applyKycFee(sessionId: string): Promise<{ applied: boolean }> {
    const data = await apiClient<{ data: { applied: boolean } }>('/payments/apply-kyc-fee', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
    })
    return data.data
}

/**
 * Webhook fallback: generate the HPI report if the Stripe webhook was delayed or missed.
 */
export async function applyHpiFee(sessionId: string): Promise<{ applied: boolean }> {
    const data = await apiClient<{ data: { applied: boolean } }>('/payments/apply-hpi-fee', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
    })
    return data.data
}

/**
 * Webhook fallback: register the buyer's paid HPI report email delivery if the Stripe webhook was delayed or missed.
 */
export async function applyHpiEmailFee(sessionId: string): Promise<{ applied: boolean }> {
    const data = await apiClient<{ data: { applied: boolean } }>('/payments/apply-hpi-email-fee', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
    })
    return data.data
}

/**
 * Fetch payment history for the current user.
 */
export async function getPaymentHistory(): Promise<PaymentTransaction[]> {
    const data = await apiClient<{ data: PaymentTransaction[] }>('/payments/history', {
        method: 'GET',
        cache: 'no-store',
    })
    return data.data
}

/**
 * Start payment for an accepted TradeXchange service quote. The backend
 * re-derives the amount from the locked transaction row; no client amount is
 * trusted. Stripe's webhook is the only authority that marks the job paid.
 */
export async function createTradeXchangeCheckout(jobId: string): Promise<CheckoutSessionResult> {
    const data = await apiClient<{ data: CheckoutSessionResult }>('/payments/tradexchange-checkout', {
        method: 'POST',
        body: JSON.stringify({ jobId }),
    })
    return data.data
}


/** Webhook-delay fallback for a completed TradeXchange Stripe checkout. */
export async function applyTradeXchangePayment(sessionId: string): Promise<{ applied: boolean; paymentStatus?: string }> {
    const data = await apiClient<{ data: { applied: boolean; paymentStatus?: string } }>('/payments/apply-tradexchange-payment', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
    })
    return data.data
}
