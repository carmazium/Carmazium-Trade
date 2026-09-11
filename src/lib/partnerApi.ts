import { apiClient } from './apiClient'

// ============================================================================
// TYPES
// ============================================================================

export interface FinanceApplication {
    id: string
    listingId: string
    userId: string
    partnerId: string
    depositAmount: string
    termMonths: number
    monthlyPayment: string | null
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'COMPLETED'
    approvalDate: string | null
    createdAt: string
    updatedAt: string
    listing?: {
        id: string
        title: string
        price: string
        slug: string
        images: string[]
        make: string | null
        model: string | null
        year: number | null
    }
    user?: {
        id: string
        firstName: string | null
        lastName: string | null
        email: string
    }
}

export interface InsuranceProvider {
    id: string
    companyName: string
}

export interface InsuranceQuote {
    id: string
    listingId: string
    userId: string
    partnerId: string
    coverageType: string | null
    quotedPrice: string | null
    status: 'PENDING' | 'QUOTED' | 'ACCEPTED' | 'EXPIRED' | 'REJECTED'
    driverAge: number
    ncbYears: number
    hasConvictions: boolean
    expiryDate: string | null
    createdAt: string
    updatedAt: string
    partner?: {
        id: string
        companyName: string
    }
    listing?: {
        id: string
        title: string
        price: string
        slug: string
        images: string[]
        make: string | null
        model: string | null
        year: number | null
    }
    user?: {
        id: string
        firstName: string | null
        lastName: string | null
        email: string
    }
}

export interface PaginatedResponse<T> {
    success: boolean
    data: T[]
    pagination: {
        total: number
        page: number
        limit: number
        totalPages: number
    }
    timestamp: string
}

export interface PartnerStats {
    pending: number
    approved: number
    rejected: number
    completed: number
    totalValue: number
}

// ============================================================================
// FINANCE PARTNER API
// ============================================================================

export async function getFinanceApplications(page = 1, limit = 20): Promise<PaginatedResponse<FinanceApplication>> {
    return apiClient<PaginatedResponse<FinanceApplication>>(
        `/finance/partner?page=${page}&limit=${limit}`
    )
}

export async function updateFinanceStatus(
    applicationId: string,
    status: FinanceApplication['status'],
    monthlyPayment?: number
): Promise<FinanceApplication> {
    const body: Record<string, unknown> = { status }
    if (monthlyPayment !== undefined) body.monthlyPayment = monthlyPayment
    const res = await apiClient<{ data: FinanceApplication }>(`/finance/${applicationId}/status`, {
        method: 'PATCH',
        body: JSON.stringify(body),
    })
    return res.data
}

export async function getFinanceStats(): Promise<PartnerStats> {
    try {
        const res = await getFinanceApplications(1, 1000)
        const apps = res.data || []
        return {
            pending: apps.filter(a => a.status === 'PENDING').length,
            approved: apps.filter(a => a.status === 'APPROVED').length,
            rejected: apps.filter(a => a.status === 'REJECTED').length,
            completed: apps.filter(a => a.status === 'COMPLETED').length,
            totalValue: apps
                .filter(a => a.status === 'APPROVED' || a.status === 'COMPLETED')
                .reduce((sum, a) => sum + (parseFloat(a.monthlyPayment || '0') * a.termMonths), 0),
        }
    } catch {
        return { pending: 0, approved: 0, rejected: 0, completed: 0, totalValue: 0 }
    }
}

// ============================================================================
// INSURANCE API
// ============================================================================

export async function getInsuranceProviders(): Promise<InsuranceProvider[]> {
    const res = await apiClient<{ data: InsuranceProvider[] }>('/insurance/providers')
    return res.data
}

export async function requestInsuranceQuote(input: {
    listingId: string
    partnerId: string
    driverAge: number
    ncbYears: number
    hasConvictions: boolean
}): Promise<InsuranceQuote> {
    const res = await apiClient<{ data: InsuranceQuote }>('/insurance/quote', {
        method: 'POST',
        body: JSON.stringify(input),
    })
    return res.data
}

export async function getMyInsuranceQuotes(page = 1, limit = 20): Promise<PaginatedResponse<InsuranceQuote>> {
    return apiClient<PaginatedResponse<InsuranceQuote>>(`/insurance/my?page=${page}&limit=${limit}`)
}

export async function acceptInsuranceQuote(quoteId: string): Promise<InsuranceQuote> {
    const res = await apiClient<{ data: InsuranceQuote }>(`/insurance/${quoteId}/accept`, {
        method: 'POST',
    })
    return res.data
}

// ============================================================================
// INSURANCE PARTNER API
// ============================================================================

export async function getInsuranceQuotes(page = 1, limit = 20): Promise<PaginatedResponse<InsuranceQuote>> {
    return apiClient<PaginatedResponse<InsuranceQuote>>(
        `/insurance/partner?page=${page}&limit=${limit}`
    )
}

export async function updateInsuranceStatus(
    quoteId: string,
    status: 'QUOTED' | 'EXPIRED' | 'REJECTED',
    quotedPrice?: number,
    coverageType?: string,
    expiryDate?: string,
): Promise<InsuranceQuote> {
    const body: Record<string, unknown> = { status }
    if (quotedPrice !== undefined) body.quotedPrice = quotedPrice
    if (coverageType) body.coverageType = coverageType
    if (expiryDate) body.expiryDate = expiryDate
    const res = await apiClient<{ data: InsuranceQuote }>(`/insurance/${quoteId}/status`, {
        method: 'PATCH',
        body: JSON.stringify(body),
    })
    return res.data
}

export async function getInsuranceStats(): Promise<PartnerStats> {
    try {
        const res = await getInsuranceQuotes(1, 1000)
        const quotes = res.data || []
        return {
            pending: quotes.filter(q => q.status === 'PENDING').length,
            approved: quotes.filter(q => q.status === 'QUOTED' || q.status === 'ACCEPTED').length,
            rejected: quotes.filter(q => q.status === 'REJECTED').length,
            completed: quotes.filter(q => q.status === 'ACCEPTED').length,
            totalValue: quotes
                .filter(q => q.status === 'ACCEPTED')
                .reduce((sum, q) => sum + parseFloat(q.quotedPrice || '0'), 0),
        }
    } catch {
        return { pending: 0, approved: 0, rejected: 0, completed: 0, totalValue: 0 }
    }
}

// ============================================================================
// HELPERS
// ============================================================================

export function formatCurrency(amount: number | string): string {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount
    if (isNaN(num)) return '£0'
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 }).format(num)
}
