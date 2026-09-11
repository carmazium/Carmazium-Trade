/**
 * API Client for Listing Operations
 */

export type BodyTypeValue = 'SEDAN' | 'SUV' | 'HATCHBACK' | 'COUPE' | 'CONVERTIBLE' | 'ESTATE' | 'CROSSOVER' | 'SPORTS_CAR' | 'MINIVAN' | 'PICKUP_TRUCK' | 'STATION_WAGON' | 'MPV' | 'VAN'
export type VehicleConditionValue = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'CAT_S' | 'CAT_N' | 'CAT_C' | 'CAT_D'
export type EuroStandardValue = 'EURO_4' | 'EURO_5' | 'EURO_6' | 'EURO_6D'
export type VehicleTypeValue = 'CAR' | 'HGV' | 'MOTORCYCLE'

export interface CreateListingRequest {
    title: string
    price: number
    mileage: number
    year: number
    vrm: string
    images: string[]
    listingType: 'AUCTION' | 'CLASSIFIED'
    // Offer price range (enables offer system)
    priceMin?: number
    priceMax?: number
    // Vehicle identity
    make?: string
    model?: string
    vin?: string
    // Condition & compliance
    condition?: VehicleConditionValue
    ulezCompliant?: boolean
    euroStandard?: EuroStandardValue
    // Technical specs
    description?: string
    fuelType?: 'PETROL' | 'DIESEL' | 'ELECTRIC' | 'HYBRID' | 'PLUGIN_HYBRID' | 'LPG' | 'HYDROGEN_CELL'
    transmission?: 'MANUAL' | 'AUTOMATIC' | 'SEMI_AUTOMATIC' | 'CVT'
    bodyType?: BodyTypeValue
    color?: string
    doors?: number
    seats?: number
    engineSize?: number
    bhp?: number
    features?: string[]
    location?: string
    co2Emissions?: number
    // DVLA extended fields
    motStatus?: string
    taxStatus?: string
    motExpiryDate?: string
    taxDueDate?: string
    markedForExport?: boolean
    monthOfFirstRegistration?: string
    wheelplan?: string
    typeApproval?: string
    status?: 'DRAFT' | 'ACTIVE' | 'SOLD'
    badgeTier?: 'FREE' | 'BASIC' | 'STANDARD' | 'PREMIUM'
    vehicleType?: VehicleTypeValue
    isImported?: boolean
    stolenRecovered?: boolean
    hasOutstandingFinance?: boolean
    isLegalRegisteredKeeper?: boolean
    writeOffCategory?: 'NONE' | 'CAT_S' | 'CAT_N' | 'CAT_A' | 'CAT_B'
    // Extended vehicle details
    variant?: string
    driveType?: string
    numberOfKeys?: number
    serviceHistory?: string
    owners?: string
    torqueNm?: number
    topSpeedMph?: number
    zeroTo60Mph?: number
    combinedMpg?: number
    extraUrbanMpg?: number
    bannerLabel?: string
    videoUrls?: string[]
    isDepartedSale?: boolean
    departedRelationship?: string
    notOwnerRelationship?: string
    deliveryAvailable?: boolean
    deliveryPricePerMile?: number | null
    deliveryMaxMiles?: number | null
}

export interface CreateListingResponse {
    success: boolean
    data: {
        id: string
        slug: string
        title: string
        price: number
        createdAt: string
    }
    timestamp: string
}

/**
 * Create a new listing
 */
import { apiClient } from './apiClient'

export async function createListing(data: CreateListingRequest): Promise<CreateListingResponse> {
    return apiClient<CreateListingResponse>('/listings', {
        method: 'POST',
        body: JSON.stringify(data),
    })
}

// ─── DVLA Lookup ────────────────────────────────────────────────────────────

export interface DvlaLookupResult {
    vrm: string
    make?: string
    colour?: string
    year?: number
    engineSize?: number
    co2Emissions?: number
    fuelType?: string
    euroStandard?: string
    motStatus?: string
    motExpiryDate?: string
    taxStatus?: string
    taxDueDate?: string
    wheelplan?: string
    typeApproval?: string
    revenueWeight?: number
    markedForExport?: boolean
    monthOfFirstRegistration?: string
    dateOfLastV5CIssued?: string
    realDrivingEmissions?: string
    dataSource: 'DVLA'
}

export async function dvlaLookup(vrm: string): Promise<DvlaLookupResult> {
    return apiClient<DvlaLookupResult>('/dvla/lookup', {
        method: 'POST',
        body: JSON.stringify({ vrm }),
    })
}

/**
 * Listing type returned from API
 */
export interface Listing {
    id: string
    slug: string
    title: string
    description: string | null
    price: string | number
    images: string[]
    videoUrls?: string[]
    make: string | null
    model: string | null
    year: number | null
    mileage: number | null
    vrm: string | null
    vin: string | null
    fuelType: string | null
    transmission: string | null
    bodyType: string | null
    type: 'AUCTION' | 'CLASSIFIED'
    status: 'DRAFT' | 'PENDING_REVIEW' | 'ACTIVE' | 'OFFER_ACCEPTED' | 'SOLD' | 'WITHDRAWN' | 'REJECTED'
    rejectionReason?: string | null
    viewCount: number
    color: string | null
    doors: number | null
    seats: number | null
    engineSize: number | null
    bhp: number | null
    features: string | string[] | null
    location: string | null
    latitude: number | null
    longitude: number | null
    condition: VehicleConditionValue | null
    ulezCompliant: boolean | null
    euroStandard: EuroStandardValue | null
    isImported?: boolean | null
    co2Emissions: number | null
    // DVLA extended fields
    motStatus: string | null
    taxStatus: string | null
    motExpiryDate: string | null
    taxDueDate: string | null
    markedForExport: boolean | null
    monthOfFirstRegistration: string | null
    wheelplan: string | null
    typeApproval: string | null
    // Extended vehicle details
    variant: string | null
    driveType: string | null
    numberOfKeys: number | null
    serviceHistory: string | null
    owners: string | null
    torqueNm: number | null
    topSpeedMph: number | null
    zeroTo60Mph: number | null
    combinedMpg: number | null
    extraUrbanMpg: number | null
    exteriorGrade: number | null
    writeOffCategory?: 'NONE' | 'CAT_S' | 'CAT_N' | 'CAT_A' | 'CAT_B' | null
    bannerLabel: string | null
    isDepartedSale?: boolean | null
    departedRelationship?: string | null
    notOwnerRelationship?: string | null
    // Delivery fields (Phase 15)
    deliveryAvailable?: boolean | null
    deliveryPricePerMile?: number | string | null
    deliveryMaxMiles?: number | null
    sellerId: string | null
    // Mandatory listing HPI report once it has been seeded by the review workflow
    // — null/undefined means none exists yet, not that one is empty.
    hpiReport?: { status: 'PENDING' | 'COMPLETED'; isClear: boolean; purchasedAt: string } | null
    isFeatured: boolean
    featuredUntil: string | null
    badgeTier: string | null
    priceMin: string | number | null
    priceMax: string | number | null
    createdAt: string
    updatedAt: string
    linkedListingId?: string | null
    linkedListing?: {
        id: string
        type: string
        auction?: { id: string; status: string; endTime: string } | null
    } | null
    importedFromUrl?: string | null
    importedSource?: string | null
    // Latest offer on this listing (populated in detail view)
    offers?: LatestOffer[]
    // Auction relation (populated in detail view for AUCTION type listings)
    auction?: {
        id: string
        status: 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'CANCELLED'
        reservePrice: string | number
        startTime: string
        endTime: string
        winnerId: string | null
        winningBidAmount: string | number | null
        buyItNowPrice?: number | null
        buyItNowPendingBuyerId?: string | null
    } | null
    // Bids on this listing (populated in detail view)
    bids?: { amount: string | number; bidderId: string }[]
    // Added seller relation details
    seller?: {
        id: string
        role?: string
        /**
         * Set by the backend for admin-created listings, which are presented as
         * CarMazium's own rather than under the staff member's name. Drives the
         * "CarMazium Official" badge — see components/listing/SellerVerificationBadge.
         */
        isOfficial?: boolean
        firstName: string | null
        lastName: string | null
        profileImage: string | null
        listingCount?: number
        // `phone` is null for anonymous viewers even if the seller has one on
        // file — check `phoneAvailable` to distinguish "hidden" from "unset"
        phone?: string | null
        phoneAvailable?: boolean
        dealerProfile?: {
            id: string
            companyName: string
            logo: string | null
            description: string | null
            phone: string | null
            phoneAvailable?: boolean
            website: string | null
        } | null
    } | null
}

export interface ListingsResponse {
    success: boolean
    data: Listing[]
    pagination: {
        total: number
        page: number
        limit: number
        totalPages: number
    }
    timestamp: string
}

export interface ListingFilters {
    minPrice?: number
    maxPrice?: number
    make?: string
    model?: string
    /** @deprecated use minYear */
    year?: number
    minYear?: number
    maxYear?: number
    minMileage?: number
    maxMileage?: number
    fuelType?: string
    fuelTypes?: string[]
    transmission?: string
    transmissions?: string[]
    features?: string[]
    bodyType?: string
    color?: string
    minDoors?: number
    minSeats?: number
    minEngine?: number
    maxEngine?: number
    maxCo2?: number
    condition?: VehicleConditionValue
    conditions?: VehicleConditionValue[]
    ulezCompliant?: boolean
    euroStandard?: EuroStandardValue
    isImported?: boolean
    markedForExport?: boolean
    vehicleType?: string
    minBhp?: number
    maxBhp?: number
    sellerType?: string
    location?: string
    listingType?: string
    sortBy?: string
    search?: string
    page?: number
    limit?: number
    deliveryAvailable?: boolean
}

/**
 * Fetch all listings with optional filters
 */
export async function getListings(filters?: ListingFilters): Promise<ListingsResponse> {
    const params = new URLSearchParams()

    if (filters) {
        if (filters.minPrice !== undefined) params.append('minPrice', filters.minPrice.toString())
        if (filters.maxPrice !== undefined) params.append('maxPrice', filters.maxPrice.toString())
        if (filters.make) params.append('make', filters.make)
        if (filters.model) params.append('model', filters.model)
        if (filters.minYear !== undefined) params.append('minYear', filters.minYear.toString())
        if (filters.maxYear !== undefined) params.append('maxYear', filters.maxYear.toString())
        if (filters.year !== undefined) params.append('year', filters.year.toString())
        if (filters.minMileage !== undefined) params.append('minMileage', filters.minMileage.toString())
        if (filters.maxMileage !== undefined) params.append('maxMileage', filters.maxMileage.toString())
        if (filters.fuelTypes?.length) params.append('fuelTypes', filters.fuelTypes.join(','))
        else if (filters.fuelType) params.append('fuelType', filters.fuelType)
        if (filters.transmissions?.length) params.append('transmissions', filters.transmissions.join(','))
        else if (filters.transmission) params.append('transmission', filters.transmission)
        if (filters.features?.length) params.append('features', filters.features.join(','))
        if (filters.bodyType) params.append('bodyType', filters.bodyType)
        if (filters.color) params.append('color', filters.color)
        if (filters.minDoors !== undefined) params.append('minDoors', filters.minDoors.toString())
        if (filters.minSeats !== undefined) params.append('minSeats', filters.minSeats.toString())
        if (filters.conditions?.length) params.append('conditions', filters.conditions.join(','))
        else if (filters.condition) params.append('condition', filters.condition)
        if (filters.ulezCompliant !== undefined) params.append('ulezCompliant', filters.ulezCompliant.toString())
        if (filters.euroStandard) params.append('euroStandard', filters.euroStandard)
        if (filters.isImported !== undefined) params.append('isImported', String(filters.isImported))
        if (filters.markedForExport !== undefined) params.append('markedForExport', String(filters.markedForExport))
        if (filters.vehicleType) params.append('vehicleType', filters.vehicleType)
        if (filters.minBhp !== undefined) params.append('minBhp', filters.minBhp.toString())
        if (filters.maxBhp !== undefined) params.append('maxBhp', filters.maxBhp.toString())
        if (filters.sellerType) params.append('sellerType', filters.sellerType)
        if (filters.location) params.append('location', filters.location)
        if (filters.listingType) params.append('listingType', filters.listingType)
        if (filters.sortBy) params.append('sortBy', filters.sortBy)
        if (filters.search) params.append('search', filters.search)
        if (filters.page) params.append('page', filters.page.toString())
        if (filters.limit) params.append('limit', filters.limit.toString())
        if (filters.deliveryAvailable !== undefined) params.append('deliveryAvailable', String(filters.deliveryAvailable))
    }

    return apiClient<ListingsResponse>(`/listings${params.toString() ? `?${params.toString()}` : ''}`, {
        method: 'GET',
        next: { revalidate: 60 },
    })
}

/**
 * Fetch a single listing by slug
 */
export async function getListingBySlug(slug: string): Promise<Listing> {
    const data = await apiClient<{ data: Listing }>(`/listings/${slug}`, {
        method: 'GET',
        cache: 'no-store',
    })
    return data.data
}

/**
 * Format price with commas and 2 decimal places
 */
export function formatPrice(price: number | string): string {
    const numPrice = typeof price === 'string' ? parseFloat(price) : price
    if (isNaN(numPrice)) return '£0.00'
    return `£${numPrice.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ============================================================================
// AUTHENTICATED API CALLS (require JWT token)
// ============================================================================

/**
 * Seller stats response type
 */
export interface SellerStats {
    totalListings: number
    activeListings: number
    soldListings: number
    draftListings: number
    totalViews: number
    totalRevenue: number
}

/**
 * Fetch current user's listings (authenticated)
 *
 * Pass `includeSold: true` to include SOLD listings — required for offer dashboards
 * that must display accepted offers after the sale has been recorded.
 */
export async function getMyListings(filters?: ListingFilters & { includeSold?: boolean }): Promise<ListingsResponse> {
    const params = new URLSearchParams()
    if (filters) {
        if (filters.page) params.append('page', filters.page.toString())
        if (filters.limit) params.append('limit', filters.limit.toString())
        if (filters.includeSold) params.append('includeSold', 'true')
    }

    const endpoint = `/listings/my${params.toString() ? `?${params.toString()}` : ''}`
    return apiClient<ListingsResponse>(endpoint, { method: 'GET', cache: 'no-store' })
}

/**
 * Fetch seller dashboard statistics (authenticated)
 */
export async function getSellerStats(): Promise<SellerStats> {
    const data = await apiClient<{ data: SellerStats }>('/listings/stats', { method: 'GET', cache: 'no-store' })
    return data.data
}

/**
 * Create listing with authentication
 */
export async function createAuthenticatedListing(data: CreateListingRequest): Promise<CreateListingResponse> {
    return apiClient<CreateListingResponse>('/listings', {
        method: 'POST',
        body: JSON.stringify(data),
    })
}

/**
 * Delete a listing (authenticated)
 */
export async function deleteListing(listingId: string): Promise<void> {
    await apiClient(`/listings/${listingId}`, { method: 'DELETE' })
}

/**
 * Partially update a listing's fields (authenticated, must own listing)
 */
export async function updateListing(listingId: string, fields: Partial<Record<string, unknown>>): Promise<Listing> {
    const data = await apiClient<{ data: Listing }>(`/listings/${listingId}`, {
        method: 'PATCH',
        body: JSON.stringify(fields),
    })
    return data.data
}

/**
 * Update listing status (authenticated)
 */
export async function updateListingStatus(listingId: string, status: string): Promise<Listing> {
    const data = await apiClient<{ data: Listing }>(`/listings/${listingId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
    })
    return data.data
}

/**
 * Boost a listing to Featured status for 28 days (authenticated)
 * In bypass mode: immediately activates. In Stripe mode: returns { url } for redirect.
 */
export interface BoostResult {
    bypassed?: boolean
    boostId?: string
    expiresAt?: string
    url?: string
    message?: string
}

export async function boostListing(listingId: string): Promise<BoostResult> {
    const data = await apiClient<{ data: BoostResult }>(`/featured-boost/${listingId}`, {
        method: 'POST',
    })
    return data.data
}

/**
 * Get featured listings (public)
 */
export async function getFeaturedListings(): Promise<Listing[]> {
    try {
        const data = await apiClient<{ data: Listing[] }>('/listings/featured', {
            method: 'GET',
            next: { revalidate: 300 },
        })
        return data.data || []
    } catch {
        return []
    }
}

// ============================================================================
// BUYER API FUNCTIONS
// ============================================================================

export interface Bid {
    id: string
    listingId: string
    amount: string | number
    isWinning: boolean
    createdAt: string
    listing: {
        id: string
        title: string
        slug: string
        images: string[]
        price: string | number
        status: string
        make: string | null
        model: string | null
        year: number | null
        sellerId?: string | null
        auction?: {
            id: string
            status: 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'CANCELLED'
            endTime: string
            winnerId: string | null
            winningBidAmount: string | number | null
        } | null
    }
}

export interface BidsResponse {
    success: boolean
    data: Bid[]
    pagination: {
        total: number
        page: number
        limit: number
        totalPages: number
    }
}

export interface BuyerStats {
    activeBids: number
    wonAuctions: number
    watchlistCount: number
    totalSpent: number
}

/**
 * Get buyer's bids (authenticated)
 */
export async function getMyBids(page = 1, limit = 20): Promise<BidsResponse> {
    return apiClient<BidsResponse>(`/bids/my?page=${page}&limit=${limit}`, {
        method: 'GET',
        cache: 'no-store',
    })
}

/**
 * Get buyer dashboard stats (authenticated)
 */
export async function getBuyerStats(): Promise<BuyerStats> {
    const data = await apiClient<{ data: BuyerStats }>('/bids/stats', {
        method: 'GET',
        cache: 'no-store',
    })
    return data.data
}

export interface UnifiedDashboardData {
    buyer: {
        activeBids: number
        watchlistCount: number
        /** Offers where the seller countered and the buyer must respond (unified dashboard API) */
        counteredOffersPending?: number
    }
    seller: {
        totalListings: number
        activeListings: number
        soldListings: number
        totalViews: number
        totalRevenue: number
        incomingOffers: number
    }
    unreadMessages: number
}

/**
 * Get unified dashboard data (authenticated)
 */
export async function getUnifiedDashboard(): Promise<UnifiedDashboardData> {
    const data = await apiClient<{ data: UnifiedDashboardData }>('/dashboard/unified', {
        method: 'GET',
        cache: 'no-store',
    })
    return data.data
}

/**
 * Place a bid on a listing (authenticated)
 */
export async function placeBid(listingId: string, amount: number): Promise<Bid> {
    const data = await apiClient<{ data: Bid }>('/bids', {
        method: 'POST',
        body: JSON.stringify({ listingId, amount }),
    })
    return data.data
}

// ============================================================================
// WATCHLIST API FUNCTIONS
// ============================================================================

export interface WatchlistItem {
    id: string
    listingId: string
    createdAt: string
    listing: {
        id: string
        title: string
        slug: string
        images: string[]
        price: string | number
        status: string
        make: string | null
        model: string | null
        year: number | null
        mileage: number | null
        viewCount: number
    }
}

export interface WatchlistResponse {
    success: boolean
    data: WatchlistItem[]
    pagination: {
        total: number
        page: number
        limit: number
        totalPages: number
    }
}

/**
 * Get user's watchlist (authenticated)
 */
export async function getWatchlist(page = 1, limit = 20): Promise<WatchlistResponse> {
    return apiClient<WatchlistResponse>(`/watchlist?page=${page}&limit=${limit}`, {
        method: 'GET',
        cache: 'no-store',
    })
}

/**
 * Add listing to watchlist (authenticated)
 */
export async function addToWatchlist(listingId: string): Promise<WatchlistItem> {
    const data = await apiClient<{ data: WatchlistItem }>(`/watchlist/${listingId}`, {
        method: 'POST',
    })
    return data.data
}

/**
 * Remove listing from watchlist (authenticated)
 */
export async function removeFromWatchlist(listingId: string): Promise<void> {
    await apiClient(`/watchlist/${listingId}`, {
        method: 'DELETE',
    })
}

/**
 * Check if listing is in watchlist (authenticated)
 */
export async function isInWatchlist(listingId: string): Promise<boolean> {
    try {
        const data = await apiClient<{ data: { inWatchlist: boolean } }>(`/watchlist/check/${listingId}`, {
            method: 'GET',
        })
        return data.data?.inWatchlist || false
    } catch (e) {
        return false
    }
}

// ============================================================================
// SERVICE PROVIDER (CONTRACTOR) API FUNCTIONS
// ============================================================================

export interface ServiceRequest {
    id: string
    serviceType: string
    status: 'PENDING' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
    description: string | null
    quotedPrice: string | number | null
    acceptedPrice: string | number | null
    scheduledDate: string | null
    completedDate: string | null
    createdAt: string
    requester: {
        id: string
        firstName: string | null
        lastName: string | null
        email: string
    }
}

export interface ServiceRequestsResponse {
    success: boolean
    data: ServiceRequest[]
    pagination: {
        total: number
        page: number
        limit: number
        totalPages: number
    }
}

export interface ContractorStats {
    pendingJobs: number
    activeJobs: number
    completedJobs: number
    totalEarnings: number
}

/**
 * Get contractor's service requests (jobs) (authenticated)
 */
export async function getContractorJobs(page = 1, limit = 20): Promise<ServiceRequestsResponse> {
    return apiClient<ServiceRequestsResponse>(`/service-requests/contractor?page=${page}&limit=${limit}`, {
        method: 'GET',
        cache: 'no-store',
    })
}

/**
 * Get contractor dashboard stats (authenticated)
 */
export async function getContractorStats(): Promise<ContractorStats> {
    const data = await apiClient<{ data: ContractorStats }>('/service-requests/contractor/stats', {
        method: 'GET',
        cache: 'no-store',
    })
    return data.data
}

/**
 * Update service request status (authenticated)
 */
export async function updateJobStatus(requestId: string, status: string): Promise<ServiceRequest> {
    const data = await apiClient<{ data: ServiceRequest }>(`/service-requests/${requestId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
    })
    return data.data
}

// ============================================================================
// PROFILE UPDATE API
// ============================================================================

export interface UpdateProfileRequest {
    firstName?: string
    lastName?: string
    phone?: string
    profileImage?: string
    notifyOnSale?: boolean
    showPublicProfile?: boolean
    location?: string
    postcode?: string
    preferences?: Record<string, any>
}

/**
 * Update current user's profile (authenticated)
 */
export async function updateProfile(data: UpdateProfileRequest): Promise<any> {
    return apiClient('/users/me', {
        method: 'PATCH',
        body: JSON.stringify(data),
    })
}

/**
 * Reset user password (authenticated)
 */
export async function resetPassword(oldPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
    return apiClient<{ success: boolean; message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ oldPassword, newPassword }),
    })
}

// ============================================================================
// TRANSACTIONS & EARNINGS API
// ============================================================================

export interface Transaction {
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

export interface TransactionsResponse {
    success: boolean
    data: Transaction[]
    pagination: {
        total: number
        page: number
        limit: number
        totalPages: number
    }
}

export interface EarningsStats {
    available: number
    pendingClearance: number
    totalYTD: number
}

/**
 * Get user's transactions (authenticated)
 */
export async function getMyTransactions(page = 1, limit = 20): Promise<TransactionsResponse> {
    return apiClient<TransactionsResponse>(`/transactions/my?page=${page}&limit=${limit}`, {
        method: 'GET',
        cache: 'no-store',
    })
}

/**
 * Get earnings statistics (authenticated)
 */
export async function getEarningsStats(): Promise<EarningsStats> {
    const data = await apiClient<{ data: EarningsStats }>('/transactions/stats', {
        method: 'GET',
        cache: 'no-store',
    })
    return data.data
}

// ============================================================================
// SELLER PERFORMANCE API
// ============================================================================

export interface PerformanceStats {
    totalRevenue: number
    totalViews: number
    totalListings: number
    conversionRate: number
    recentListingViews: Array<{
        id: string
        title: string
        views: number
        date: string
    }>
    avgResponseHours: number | null
    sellerRating: number | null
    totalReviews: number
}

/**
 * Get seller performance analytics (authenticated)
 */
export async function getSellerPerformance(): Promise<PerformanceStats> {
    const data = await apiClient<{ data: PerformanceStats }>('/listings/performance', {
        method: 'GET',
        cache: 'no-store',
    })
    return data.data
}

// ============================================================================
// OFFERS API FUNCTIONS
// ============================================================================

export interface LatestOffer {
    id: string
    amount: string | number
    amountMin: string | number | null
    amountMax: string | number | null
    status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'COUNTERED'
    message: string | null
    buyerId: string
    counterAmount: string | number | null
    sellerCounterAmount?: string | number | null
    buyerCounterAmount?: string | number | null
    finalAmount?: string | number | null
    createdAt: string
    counterAttemptsBuyer?: number
    counterAttemptsSeller?: number
    counterExpiresAt?: string | null
    lastCounteredBy?: 'BUYER' | 'SELLER' | null
}

export interface Offer extends LatestOffer {
    listingId: string
    updatedAt: string
    buyer?: {
        id: string
        firstName: string | null
        lastName: string | null
        email: string
        profileImage: string | null
    }
    listing?: {
        id: string
        title: string
        slug: string
        images: string[]
        price: string | number
        priceMin: string | number | null
        priceMax: string | number | null
        status: string
        make: string | null
        model: string | null
        year: number | null
        sellerId: string
        // Delivery fields (Phase 15)
        deliveryAvailable?: boolean | null
        deliveryPricePerMile?: number | string | null
        deliveryMaxMiles?: number | null
        latitude?: number | null
        longitude?: number | null
    }
}

export interface OffersResponse {
    success: boolean
    data: Offer[]
    timestamp: string
}

/**
 * Buyer: Submit an offer on a listing
 */
export async function makeOffer(
    listingId: string,
    amount: number,
    message?: string,
    amountMin?: number,
    amountMax?: number,
): Promise<Offer> {
    const data = await apiClient<{ data: Offer }>('/offers', {
        method: 'POST',
        body: JSON.stringify({ listingId, amount, amountMin, amountMax, message }),
    })
    return data.data
}

/**
 * Buyer: Get all my submitted offers
 */
export async function getMyOffers(): Promise<Offer[]> {
    const data = await apiClient<OffersResponse>('/offers/my', {
        method: 'GET',
        cache: 'no-store',
    })
    return data.data
}

/**
 * Buyer: Get MY latest offer for a specific listing
 * Returns null if the user has not made any offer on this listing.
 */
export async function getMyOfferForListing(listingId: string): Promise<LatestOffer | null> {
    try {
        const data = await apiClient<{ data: LatestOffer | null }>(`/offers/my/${listingId}`, {
            method: 'GET',
            cache: 'no-store',
        })
        return data.data
    } catch {
        return null
    }
}

/**
 * Seller: Record a final sale for a listing
 */
export async function recordSale(listingId: string, data: { soldPrice: number; buyerId?: string; buyerName?: string; buyerEmail?: string; buyerPostcode?: string }): Promise<Listing> {
    const res = await apiClient<{ data: Listing }>(`/listings/${listingId}/sold`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    })
    return res.data
}

/**
 * Seller/Dealer: Get earnings history
 */
export interface SaleRecord {
    id: string
    listingId: string
    sellerId: string
    buyerId: string | null
    buyerName: string | null
    buyerEmail: string | null
    listedPrice: string | number
    soldPrice: string | number
    createdAt: string
    listing: {
        title: string
        images: string[]
        vrm: string | null
        price: string | number
    }
    buyer?: {
        firstName: string | null
        lastName: string | null
        email: string
    }
}

export interface AuctionSaleRecord {
    id: string
    listingId: string
    winningBidAmount: number
    sellerBonus: number
    sellerBonusReleasedAt: string | null
    createdAt: string
    listing: {
        id: string
        title: string
        images: string[]
        vrm: string | null
    }
    winner: {
        id: string
        firstName: string | null
        lastName: string | null
        email: string
    } | null
}

export interface EarningsResponse {
    sales: SaleRecord[]
    // Combined across retail + auction channels — the vehicle price in both
    // cases is settled privately (Carmazium never processes it), so both are
    // counted the same way here for an accurate "how much business have I
    // done" total. totalAuctionBonus below is the only amount Carmazium
    // actually paid out.
    totalRevenue: number
    totalSales: number
    auctionSales: AuctionSaleRecord[]
    totalAuctionRevenue: number
    totalAuctionSales: number
    totalAuctionBonus: number
}

export async function getEarnings(): Promise<EarningsResponse> {
    const data = await apiClient<{ data: EarningsResponse }>('/listings/earnings', {
        method: 'GET',
        cache: 'no-store',
    })
    return data.data
}

export async function exportEarningsCsv(): Promise<void> {
    const { getAccessToken } = await import('./supabase')
    const token = await getAccessToken()
    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://carmazium-hjoh9w.fly.dev'
    const res = await fetch(`${API_URL}/listings/earnings/export`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!res.ok) throw new Error('Export failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'earnings.csv'
    a.click()
    URL.revokeObjectURL(url)
}

/**
 * Seller: Get all offers on a specific listing
 */
export async function getOffersForListing(listingId: string): Promise<Offer[]> {
    const data = await apiClient<OffersResponse>(`/offers/listing/${listingId}`, {
        method: 'GET',
        cache: 'no-store',
    })
    return data.data
}

/**
 * Seller: Accept or reject an offer
 */
export async function respondToOffer(
    offerId: string,
    status: 'ACCEPTED' | 'REJECTED' | 'COUNTERED',
    counterAmount?: number,
): Promise<Offer> {
    const data = await apiClient<{ data: Offer }>(`/offers/${offerId}/respond`, {
        method: 'PATCH',
        body: JSON.stringify({ status, counterAmount }),
    })
    return data.data
}

export async function withdrawOffer(offerId: string): Promise<Offer> {
    const data = await apiClient<{ data: Offer }>(`/offers/${offerId}/withdraw`, {
        method: 'PATCH',
    })
    return data.data
}

export async function respondToCounterOffer(offerId: string, status: 'ACCEPTED' | 'REJECTED' | 'COUNTERED', counterAmount?: number): Promise<Offer> {
    const data = await apiClient<{ data: Offer }>(`/offers/${offerId}/respond-counter`, {
        method: 'PATCH',
        body: JSON.stringify({ status, counterAmount }),
    })
    return data.data
}

/**
 * Seller: Get total count of pending offers across all their listings.
 * Used to drive the pulsating badge on the Offers sidebar tab.
 */
export async function getPendingOffersCount(): Promise<number> {
    try {
        const data = await apiClient<{ data: { count: number } }>('/offers/pending-count', {
            method: 'GET',
            cache: 'no-store',
        })
        return data.data?.count ?? 0
    } catch {
        return 0
    }
}

export async function getBuyerActionCount(): Promise<number> {
    try {
        const data = await apiClient<{ data: { count: number } }>('/offers/buyer-action-count', {
            method: 'GET',
            cache: 'no-store',
        })
        return data.data?.count ?? 0
    } catch {
        return 0
    }
}

/**
 * Payments: Create HPI Checkout Session
 */
export async function createHpiCheckoutSession(vrm: string, listingId: string): Promise<{ url: string }> {
    const data = await apiClient<{ data: { url: string } }>('/payments/hpi-checkout', {
        method: 'POST',
        body: JSON.stringify({ vrm, listingId }),
    })
    return data.data
}

/**
 * Payments: Create Listing Checkout Session
 */
export async function createListingCheckoutSession(listingId: string, badgeTier: string): Promise<{ url: string }> {
    const data = await apiClient<{ data: { url: string } }>('/payments/listing-checkout', {
        method: 'POST',
        body: JSON.stringify({ listingId, badgeTier }),
    })
    return data.data
}

/**
 * Submit a DRAFT (or previously-REJECTED) listing for admin review after verifying payment.
 * Returns { activated: true } if already live (rare — idempotent re-call),
 * { activated: false, pendingReview: true } once submitted and awaiting an admin decision, or
 * { activated: false, requiresPayment: true } if the listing fee hasn't been paid yet.
 */
export async function publishListing(listingId: string): Promise<{ activated: boolean; requiresPayment?: boolean; pendingReview?: boolean }> {
    const data = await apiClient<{ data: { activated: boolean; requiresPayment?: boolean; pendingReview?: boolean } }>(`/listings/${listingId}/publish`, {
        method: 'POST',
    })
    return data.data
}

/**
 * Damage Analysis: Save detected damage records
 */
export async function saveDamageRecords(listingId: string, detections: any[]): Promise<{ success: boolean }> {
    return apiClient<{ success: boolean }>(`/damage/${listingId}/save`, {
        method: 'POST',
        body: JSON.stringify({ detections }),
    })
}

/**
 * Damage Analysis: Get damage records for a listing
 */
export async function getDamageRecords(listingId: string): Promise<any[]> {
    const data = await apiClient<{ data: any[] }>(`/damage/${listingId}`, {
        method: 'GET',
    })
    return data.data
}

// ─── Dual-channel (auction + retail simultaneously) ───────────────────────────

export async function alsoListRetail(
    listingId: string,
    price: number,
    badgeTier: 'BASIC' | 'STANDARD' | 'PREMIUM',
): Promise<{ linkedListingId: string }> {
    const data = await apiClient<{ data: { linkedListingId: string } }>(`/listings/${listingId}/also-list-retail`, {
        method: 'POST',
        body: JSON.stringify({ price, badgeTier }),
    })
    return data.data
}

export async function alsoAuction(
    listingId: string,
    dto: { startTime: string; reservePrice: number; startingBid: number; minIncrement?: number; buyItNowPrice?: number },
): Promise<{ linkedListingId: string; auctionId: string }> {
    const data = await apiClient<{ data: { linkedListingId: string; auctionId: string } }>(`/listings/${listingId}/also-auction`, {
        method: 'POST',
        body: JSON.stringify(dto),
    })
    return data.data
}

export async function createListingCheckout(
    listingId: string,
    badgeTier: 'BASIC' | 'STANDARD' | 'PREMIUM',
): Promise<{ url: string }> {
    const data = await apiClient<{ data: { url: string } }>(`/payments/listing-checkout`, {
        method: 'POST',
        body: JSON.stringify({ listingId, badgeTier }),
    })
    return data.data
}

// ─── Stripe Connect ──────────────────────────────────────────────────────────

export interface StripeConnectStatus {
    connected: boolean
    onboardingComplete: boolean
    accountId?: string
    chargesEnabled?: boolean
    payoutsEnabled?: boolean
}

export async function startStripeConnectOnboarding(returnUrl: string, refreshUrl: string): Promise<{ url: string }> {
    const res = await apiClient<{ data: { url: string } }>('/users/stripe-connect/onboard', {
        method: 'POST',
        body: JSON.stringify({ returnUrl, refreshUrl }),
    })
    return res.data
}

export async function getStripeConnectStatus(): Promise<StripeConnectStatus> {
    const res = await apiClient<{ data: StripeConnectStatus }>('/users/stripe-connect/status')
    return res.data
}

export interface BankDetails {
    bankAccountName: string
    bankSortCode: string
    bankAccountNumber: string
    payoutPreference: string
}

export async function updateBankDetails(data: Partial<BankDetails>): Promise<BankDetails> {
    const res = await apiClient<{ data: BankDetails }>('/users/me/bank-details', {
        method: 'PATCH',
        body: JSON.stringify(data),
    })
    return res.data
}

// ─── Listing Import ──────────────────────────────────────────────────────────

export interface ScrapedListingPreview {
    platform: 'AUTOTRADER' | 'CARGURUS' | 'CARWOW'
    originalUrl: string
    title: string
    price?: number
    make?: string
    model?: string
    year?: number
    mileage?: number
    fuelType?: string
    transmission?: string
    color?: string
    bodyType?: string
    doors?: number
    engineSize?: number
    bhp?: number
    description?: string
    images: string[]
    location?: string
    vrm?: string
    vin?: string
}

export async function previewImport(url: string): Promise<ScrapedListingPreview> {
    const res = await apiClient<{ data: ScrapedListingPreview }>('/listings/preview-import', {
        method: 'POST',
        body: JSON.stringify({ url }),
    })
    return res.data
}

export async function importFromUrl(params: {
    url: string
    price: number
    vrm: string
    title?: string
    badgeTier?: string
}): Promise<Listing> {
    const res = await apiClient<{ data: Listing }>('/listings/import-from-url', {
        method: 'POST',
        body: JSON.stringify(params),
    })
    return res.data
}
