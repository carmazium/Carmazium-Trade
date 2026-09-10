import { apiClient } from './apiClient';

export interface AdminStats {
  totalUsers: number;
  totalListings: number;
  activeListings: number;
  soldListings: number;
  totalAuctions: number;
  activeAuctions: number;
  endedAuctions: number;
  totalBids: number;
  totalRevenue: number;
}

export interface AnalyticsMonth {
  month: string;
  newUsers: number;
  newListings: number;
  revenue: number;
}

export async function getAdminStats(): Promise<AdminStats> {
  const result = await apiClient<{ data: AdminStats }>('/admin/stats');
  return result.data;
}

export async function getAdminAnalytics(): Promise<AnalyticsMonth[]> {
  const result = await apiClient<{ data: AnalyticsMonth[] }>('/admin/analytics');
  return result.data;
}

export async function getAdminUsers(page = 1, limit = 20, search?: string) {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set('search', search);
  const result = await apiClient<any>(`/admin/users?${params.toString()}`);
  return result;
}

export async function getAdminUserDetail(id: string) {
  const result = await apiClient<{ data: any }>(`/admin/users/${id}`);
  return result.data;
}

export async function getAdminDealersKycArchive(page = 1, limit = 20) {
  const result = await apiClient<any>(`/admin/dealers/kyc-archive?page=${page}&limit=${limit}`);
  return result;
}

export async function getAdminListings(page = 1, limit = 20, sellerRole?: string) {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (sellerRole) query.set('sellerRole', sellerRole);
  const result = await apiClient<any>(`/admin/listings?${query.toString()}`);
  return result;
}

export async function getAdminListing(id: string) {
  const result = await apiClient<{ data: any }>(`/admin/listings/${id}`);
  return result.data;
}

export async function getAdminAuctions(page = 1, limit = 20) {
  const result = await apiClient<any>(`/admin/auctions?page=${page}&limit=${limit}`);
  return result;
}

export async function getAllDealers() {
  const result = await apiClient<{ data: any[] }>('/admin/dealers');
  return result.data;
}

export async function assignAuctionWinner(auctionId: string, dealerId: string) {
  const result = await apiClient<any>(`/admin/auctions/${auctionId}/assign-winner`, {
    method: 'POST',
    body: JSON.stringify({ dealerId }),
  });
  return result;
}

export async function refundAuctionBuyerFee(auctionId: string, reason?: string) {
  const result = await apiClient<any>(`/admin/auctions/${auctionId}/refund-buyer-fee`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return result;
}

export async function getAdminTransactions(page = 1, limit = 20) {
  const result = await apiClient<any>(`/admin/transactions?page=${page}&limit=${limit}`);
  return result;
}

export async function getPendingHandovers() {
  const result = await apiClient<{ data: any[] }>('/admin/handovers/pending');
  return result.data;
}

export async function approveHandover(auctionId: string) {
  const result = await apiClient<any>(`/admin/handovers/${auctionId}/approve`, { method: 'POST' });
  return result;
}

export async function denyHandover(auctionId: string) {
  const result = await apiClient<any>(`/admin/handovers/${auctionId}/deny`, { method: 'POST' });
  return result;
}

export async function getPendingPayouts() {
  const result = await apiClient<{ data: any[] }>('/admin/payouts/pending');
  return result.data;
}

export async function retryPayout(auctionId: string) {
  const result = await apiClient<any>(`/admin/payouts/${auctionId}/retry`, { method: 'POST' });
  return result;
}

export async function markPayoutPaidManually(auctionId: string) {
  const result = await apiClient<any>(`/admin/payouts/${auctionId}/mark-paid`, { method: 'POST' });
  return result;
}

export async function updateUserRole(userId: string, role: string) {
  const result = await apiClient<any>(`/admin/users/${userId}/role`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
  return result;
}

export async function banUser(userId: string) {
  return apiClient<any>(`/admin/users/${userId}/ban`, { method: 'PATCH' });
}

export async function unbanUser(userId: string) {
  return apiClient<any>(`/admin/users/${userId}/unban`, { method: 'PATCH' });
}

export async function lockUser(userId: string) {
  return apiClient<any>(`/admin/users/${userId}/lock`, { method: 'PATCH' });
}

export async function unlockUser(userId: string) {
  return apiClient<any>(`/admin/users/${userId}/unlock`, { method: 'PATCH' });
}

export async function deleteListingForce(listingId: string) {
  const result = await apiClient<any>(`/admin/listings/${listingId}`, {
    method: 'DELETE',
  });
  return result;
}

// ─── Listing Review ───────────────────────────────────────────────────────────

export async function getPendingListingReviews() {
  const result = await apiClient<{ data: any[] }>('/admin/listings/pending-review');
  return result.data;
}

export async function updateListingAsAdmin(listingId: string, fields: Record<string, unknown>) {
  const result = await apiClient<any>(`/admin/listings/${listingId}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
  return result;
}

export async function approveListing(listingId: string) {
  const result = await apiClient<any>(`/admin/listings/${listingId}/approve`, { method: 'POST' });
  return result;
}

export async function rejectListing(listingId: string, reason: string) {
  const result = await apiClient<any>(`/admin/listings/${listingId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
  return result;
}

export async function getPendingKycList() {
  const result = await apiClient<{ data: any[] }>('/admin/dealers/kyc-pending');
  return result.data;
}

export async function reviewKyc(id: string, fields: { field: string; status: 'APPROVED' | 'REJECTED'; note?: string }[]) {
  const result = await apiClient<any>(`/admin/dealers/kyc/${id}/review`, {
    method: 'PATCH',
    body: JSON.stringify({ fields }),
  });
  return result;
}

// ─── Traffic Analytics ────────────────────────────────────────────────────────

export interface TrafficOverview {
  pageViews: number;
  uniqueVisitors: number;
  pagesPerVisit: number;
  searches: number;
}

export interface TrafficByDay {
  date: string;
  sessions: number;
  pageviews: number;
}

export interface BusySlot {
  dow?: number;
  hour?: number;
  sessions: number;
}

export interface TopPage { url: string; views: number }
export interface Referrer { referrer: string; count: number }
export interface GeoItem { city?: string; country?: string; count: number }
export interface DeviceItem { device: string; count: number }
export interface SearchItem { query: string; count: number }

export interface TrafficAnalytics {
  overview: TrafficOverview;
  trafficByDay: TrafficByDay[];
  busyDayOfWeek: { dow: number; sessions: number }[];
  busyHour: { hour: number; sessions: number }[];
  topPages: TopPage[];
  referrers: Referrer[];
  topCities: { city: string; count: number }[];
  topCountries: { country: string; count: number }[];
  devices: DeviceItem[];
  topSearches: SearchItem[];
}

export async function getTrafficAnalytics(from?: string, to?: string): Promise<TrafficAnalytics> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const qs = params.toString();
  // /analytics/traffic returns the object directly (no StandardResponse wrapper)
  return apiClient<TrafficAnalytics>(`/analytics/traffic${qs ? `?${qs}` : ''}`);
}

