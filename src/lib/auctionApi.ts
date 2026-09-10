import { apiClient } from './apiClient';

const API = '';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuctionStatus = 'SCHEDULED' | 'ACTIVE' | 'ENDED' | 'CANCELLED';

export interface AuctionBid {
    id: string;
    amount: string | number;
    bidderId: string;
    bidder?: { id: string; firstName: string | null; lastName: string | null };
    timestamp: string;
    createdAt: string;
}

export interface AuctionSeller {
    id: string;
    firstName: string | null;
    lastName: string | null;
    // Real values are only present once this viewer has won this specific
    // auction AND paid the buyer fee — everyone else gets null + the
    // *Available flag so the frontend can render a locked/blurred placeholder
    // instead of silently hiding the field.
    phone?: string | null;
    phoneAvailable?: boolean;
    email?: string | null;
    emailAvailable?: boolean;
    dealerProfile?: {
        companyName: string;
        logo: string | null;
        businessAddress?: string | null;
        businessAddressAvailable?: boolean;
        website?: string | null;
        websiteAvailable?: boolean;
        phone?: string | null;
        phoneAvailable?: boolean;
    } | null;
}

export interface AuctionListing {
    id: string;
    title: string;
    slug: string;
    images: string[];
    make: string | null;
    model: string | null;
    year: number | null;
    mileage: number | null;
    price: number | null;
    description: string | null;
    // Specs
    fuelType: string | null;
    transmission: string | null;
    bodyType: string | null;
    color: string | null;
    doors: number | null;
    seats: number | null;
    engineSize: number | null;
    bhp: number | null;
    // Compliance
    condition: string | null;
    ulezCompliant: boolean | null;
    euroStandard: string | null;
    co2Emissions: number | null;
    // Exterior grade (1 best → 5 worst) — Motorway-style
    exteriorGrade: number | null;
    owners: string | null;
    serviceHistory: string | null;
    // Only present if the seller purchased an HPI report
    hpiReport?: { status: 'PENDING' | 'COMPLETED'; isClear: boolean } | null;
    // Trust/promo — same fields the Buy Cars card reads
    badgeTier?: string | null;
    isFeatured?: boolean;
    deliveryAvailable?: boolean;
    isDepartedSale?: boolean | null;
    // Identity
    vrm: string | null;
    vin: string | null;
    writeOffCategory: string | null;
    // History
    motStatus: string | null;
    motExpiryDate: string | null;
    taxStatus: string | null;
    taxDueDate: string | null;
    monthOfFirstRegistration: string | null;
    // Features & location
    features: string[] | null;
    location: string | null;
    latitude?: number | null;
    longitude?: number | null;
    vehicleType?: 'CAR' | 'MOTORCYCLE' | 'HGV';
    isImported?: boolean;
    type: 'AUCTION' | 'CLASSIFIED';
    status: string;
    sellerId: string | null;
    seller?: AuctionSeller | null;
    bids?: AuctionBid[];
    _count?: { bids: number };
}

export interface Auction {
    id: string;
    listingId: string;
    status: AuctionStatus;
    startTime: string;
    endTime: string;
    reservePrice: string | number;
    startingBid: string | number;
    minIncrement: string | number;
    winnerId: string | null;
    winningBidAmount: string | number | null;
    buyerFeePaid: boolean;
    handoverProofUrl: string | null;
    handoverSubmittedAt: string | null;
    sellerBonusReleased: boolean;
    sellerBonusReleasedAt?: string | null;
    stripePayoutTransferId?: string | null;
    stripePayoutError?: string | null;
    stripeRefundError?: string | null;
    manualPayoutConfirmedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    listing: AuctionListing;
    winner?: { id: string; firstName: string | null; lastName: string | null } | null;
    // Buy It Now fields
    buyItNowPrice?: number | null;
    buyItNowPendingBuyerId?: string | null;
    buyItNowPendingAt?: string | null;  // ISO string from API
    // Digest — seller-authored custom tags/batch labels and self-rating
    customTags?: string[];
    sellerSelfRating?: number | null;
}

export interface CreateAuctionRequest {
    listingId: string;
    startTime: string;       // ISO datetime — endTime is always startTime + 24h server-side
    reservePrice: number;
    startingBid: number;
    minIncrement?: number;   // default 100
    buyItNowPrice?: number;  // optional, omit or 0 to disable BIN
}

export interface UpdateAuctionRequest {
    startTime?: string;
    reservePrice?: number;
    startingBid?: number;
    minIncrement?: number;
}

export interface BidBroadcastPayload {
    bidId: string;
    auctionId: string;
    listingId: string;
    amount: number;
    bidderInitials: string;
    bidderId: string;
    timestamp: string;
    newEndTime?: string;
}

export interface AuctionEndPayload {
    auctionId: string;
    winnerId: string | null;
    winningBidAmount: number | null;
    reserveMet: boolean;
}

// ─── API Functions ────────────────────────────────────────────────────────────

export async function getActiveAuctions(): Promise<Auction[]> {
    const res = await apiClient<any>(`${API}/auctions/active`);
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    return [];
}

export async function getScheduledAuctions(): Promise<Auction[]> {
    const res = await apiClient<any>(`${API}/auctions/scheduled`);
    // findAllScheduled is paginated: StandardResponse wraps { data: [...], total }
    if (Array.isArray(res?.data?.data)) return res.data.data;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res)) return res;
    return [];
}

export async function getMyAuctions(): Promise<Auction[]> {
    const res = await apiClient<any>(`${API}/auctions/my/list`);
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    // Paginated response: StandardResponse wraps { data: Auction[], total: N }
    if (Array.isArray(res?.data?.data)) return res.data.data;
    return [];
}

export async function getWonAuctions(page = 1, limit = 50): Promise<Auction[]> {
    const res = await apiClient<unknown>(`${API}/auctions/my/won?page=${page}&limit=${limit}`);
    // Backend wraps in StandardResponse ({data:{data,total}}); older test envs return the array directly.
    const r = res as { data?: { data?: Auction[] } | Auction[] } | Auction[];
    if (Array.isArray(r)) return r;
    if (r?.data && Array.isArray(r.data)) return r.data;
    if (r?.data && "data" in r.data && Array.isArray(r.data.data)) return r.data.data;
    return [];
}

// Single-auction lookup through the winner-gated list endpoint rather than the
// public findOne — that's the only query that includes the seller's phone/email
// (safe here because it's filtered to `winnerId = requesting user`).
export async function getWonAuctionById(id: string): Promise<Auction | null> {
    const list = await getWonAuctions(1, 200);
    return list.find(a => a.id === id) ?? null;
}

export async function getAuction(id: string): Promise<Auction> {
    const res = await apiClient<{ data: Auction }>(`${API}/auctions/${id}`);
    return res.data;
}

export async function createAuction(dto: CreateAuctionRequest): Promise<Auction> {
    const res = await apiClient<{ data: Auction }>(`${API}/auctions`, {
        method: 'POST',
        body: JSON.stringify(dto),
    });
    return res.data;
}

export async function updateAuction(id: string, dto: UpdateAuctionRequest): Promise<Auction> {
    const res = await apiClient<{ data: Auction }>(`${API}/auctions/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(dto),
    });
    return res.data;
}

export async function cancelAuction(id: string): Promise<Auction> {
    const res = await apiClient<{ data: Auction }>(`${API}/auctions/${id}/cancel`, {
        method: 'PATCH',
    });
    return res.data;
}

export async function closeAuctionEarly(id: string): Promise<void> {
    await apiClient<any>(`${API}/auctions/${id}/close`, { method: 'POST' });
}

export async function acceptBidEarly(auctionId: string, bidId: string): Promise<void> {
    await apiClient<any>(`${API}/auctions/${auctionId}/accept-bid`, {
        method: 'POST',
        body: JSON.stringify({ bidId }),
    });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getCurrentBid(auction: Auction): number {
    const bids = auction.listing?.bids;
    if (bids && bids.length > 0) {
        return Number(bids[0].amount);
    }
    return Number(auction.startingBid);
}

export function getBidCount(auction: Auction): number {
    return auction.listing?._count?.bids ?? auction.listing?.bids?.length ?? 0;
}

export function isAntiSnipeActive(auction: Auction): boolean {
    if (auction.status !== 'ACTIVE') return false;
    const tenMinutes = 10 * 60 * 1000;
    return new Date(auction.endTime).getTime() - Date.now() <= tenMinutes;
}

// ─── Buy It Now & Cancel Bid API Functions ────────────────────────────────────

export async function triggerBuyItNow(auctionId: string): Promise<void> {
    await apiClient(`/auctions/${auctionId}/bin-trigger`, { method: 'POST' });
}

export async function confirmBuyItNow(auctionId: string): Promise<void> {
    await apiClient(`/auctions/${auctionId}/bin-confirm`, { method: 'POST' });
}

export async function declineBuyItNow(auctionId: string): Promise<void> {
    await apiClient(`/auctions/${auctionId}/bin-decline`, { method: 'POST' });
}

export async function cancelBid(bidId: string): Promise<void> {
    await apiClient(`/bids/${bidId}/cancel`, { method: 'PATCH' });
}

// ─── Digest — custom tags & self-rating ───────────────────────────────────────

export interface UpdateAuctionDigestRequest {
    customTags?: string[];
    sellerSelfRating?: number;
}

export async function updateAuctionDigest(auctionId: string, data: UpdateAuctionDigestRequest): Promise<Auction> {
    const res = await apiClient<{ data: Auction }>(`${API}/auctions/${auctionId}/digest`, {
        method: 'PATCH',
        body: JSON.stringify(data),
    });
    return res.data;
}

// Socket events consumed by live auction page (no API function needed — socket.on() directly):
// 'bin:pending' → { auctionId: string; buyerId: string }
// 'bid:cancelled' → { auctionId: string; bidId: string }
