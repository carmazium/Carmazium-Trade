import { supabase } from '@/lib/supabase'

export type TradeServiceCategory = 'delivery' | 'inspection' | 'finance' | 'warranty'
export type TradeOfferStatus = 'submitted' | 'withdrawn' | 'accepted' | 'declined' | 'expired'

export interface ProviderJobFeedRow {
    id: string
    category: TradeServiceCategory
    title: string
    description: string
    collection_location?: string | null
    delivery_location?: string | null
    preferred_date?: string | null
    budget_pence?: number | null
    vehicle_label?: string | null
    created_at: string
    offer_count: number
    my_business_id: string
    my_offer_id?: string | null
    my_offer_amount_pence?: number | null
    my_offer_status?: TradeOfferStatus | null
}

export interface MyServiceOffer {
    id: string
    job_id: string
    amount_pence: number
    status: TradeOfferStatus
    created_at: string
    message?: string | null
    available_from?: string | null
    service_jobs?: {
        id: string
        category: TradeServiceCategory
        title: string
        status?: string | null
    } | null
}

export const TRADE_PLATFORM_FEE_BPS = 900

export const tradeServiceCategoryLabel: Record<TradeServiceCategory, string> = {
    delivery: 'Delivery & Recovery',
    inspection: 'Vehicle Inspection',
    finance: 'Vehicle Finance',
    warranty: 'Vehicle Warranty',
}

export function tradeFeeBreakdown(amountPence: number) {
    const gross = Math.max(0, Math.round(amountPence))
    const fee = Math.round((gross * TRADE_PLATFORM_FEE_BPS) / 10_000)
    return { gross, fee, net: gross - fee }
}

export function formatTradePounds(pence: number | null | undefined) {
    if (pence === null || pence === undefined) return '—'
    return new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: 'GBP',
        minimumFractionDigits: pence % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
    }).format(pence / 100)
}

export function poundsToPence(value: string): number | null {
    const cleaned = value.replace(/[£,\s]/g, '')
    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
    const pence = Math.round(Number(cleaned) * 100)
    return pence > 0 ? pence : null
}

function tradeError(error: { message?: string } | null, fallback: string): Error {
    return new Error(error?.message || fallback)
}

/**
 * RLS-backed redacted marketplace feed. The database decides which service
 * categories the signed-in provider is approved to see; customer contact
 * details are intentionally not returned here.
 */
export async function getProviderJobFeed(category: TradeServiceCategory | 'all' = 'all'): Promise<ProviderJobFeedRow[]> {
    const { data, error } = await supabase.rpc(
        'provider_job_feed',
        category === 'all' ? {} : { _category: category },
    )
    if (error) throw tradeError(error, 'Could not load available jobs')
    return (data ?? []) as ProviderJobFeedRow[]
}

export async function submitServiceOffer(input: {
    jobId: string
    businessId: string
    amountPence: number
    message?: string
    availableFrom?: string
}): Promise<string> {
    const { data, error } = await supabase.rpc('submit_service_offer', {
        _job_id: input.jobId,
        _business_id: input.businessId,
        _amount_pence: input.amountPence,
        ...(input.message ? { _message: input.message } : {}),
        ...(input.availableFrom ? { _available_from: input.availableFrom } : {}),
    })
    if (error) throw tradeError(error, 'Could not send quote')
    return String(data ?? '')
}

export async function withdrawServiceOffer(offerId: string): Promise<void> {
    const { error } = await supabase.rpc('withdraw_service_offer', { _offer_id: offerId })
    if (error) throw tradeError(error, 'Could not withdraw quote')
}

export async function getMyServiceOffers(): Promise<MyServiceOffer[]> {
    const { data, error } = await supabase
        .from('service_job_offers')
        .select('*, service_jobs(id, category, title, status)')
        .order('created_at', { ascending: false })
        .limit(200)
    if (error) throw tradeError(error, 'Could not load your quotes')
    return (data ?? []) as unknown as MyServiceOffer[]
}
