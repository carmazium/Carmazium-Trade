import { apiClient } from './apiClient';

export type ServiceType = 'DELIVERY' | 'INSPECTION' | 'FINANCE' | 'WARRANTY';
export type CapabilityStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export type ServiceJobStatus = 'OPEN' | 'ACCEPTED' | 'PAID' | 'IN_PROGRESS' | 'COMPLETED' | 'RELEASED' | 'CANCELLED' | 'EXPIRED' | 'DISPUTED';
export type ServiceQuoteStatus = 'ACTIVE' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' | 'EXPIRED';
export type ServicePaymentStatus = 'PENDING' | 'PAID' | 'RELEASED' | 'REFUNDED' | 'FAILED';

export const SERVICE_LABELS: Record<ServiceType, string> = {
  DELIVERY: 'Delivery & Recovery', INSPECTION: 'Vehicle Inspections', FINANCE: 'Vehicle Finance', WARRANTY: 'Warranty Providers',
};

export interface JobVehicle {
  id?: string; registration?: string | null; make?: string | null; model?: string | null; year?: number | null;
  notes?: string | null; listingId?: string | null; listing?: { id: string; slug: string; title: string } | null;
}
export interface ContractorSummary {
  id: string; businessName: string | null; phone?: string | null; rating: number; totalReviews: number; serviceArea: string | null;
  user: { firstName: string | null; lastName?: string | null; email?: string; phone?: string | null };
}
export interface ServiceQuote {
  id: string; jobId: string; contractorId: string; amountPence: number; message: string | null; status: ServiceQuoteStatus;
  validUntil: string | null; createdAt: string; updatedAt: string; contractor?: ContractorSummary;
}
export interface ServicePayment {
  id: string; grossPence: number; platformFeePence: number; contractorPence: number; platformFeeRate: string;
  status: ServicePaymentStatus; paidAt: string | null; releasedAt: string | null; refundedAt: string | null;
}
export interface ServiceJob {
  id: string; customerId: string; serviceType: ServiceType; isRecovery: boolean; status: ServiceJobStatus; title: string;
  description: string | null; pickupPostcode: string | null; pickupAddress: string | null; deliveryPostcode: string | null;
  deliveryAddress: string | null; servicePostcode: string | null; serviceAddress: string | null; requestedFor: string | null;
  expiresAt: string; acceptedQuoteId: string | null; contractorId: string | null; agreedAmountPence: number | null;
  platformFeePence: number | null; contractorAmountPence: number | null; sourceOfferId: string | null; sourceAuctionId: string | null;
  acceptedAt: string | null; startedAt: string | null; completedAt: string | null; confirmedAt: string | null;
  cancelledAt: string | null; cancelReason: string | null; createdAt: string; updatedAt: string; vehicles: JobVehicle[];
  customer?: { id: string; firstName: string | null; lastName?: string | null; email?: string; phone?: string | null } | null;
  contractor?: ContractorSummary | null; quotes?: ServiceQuote[]; payment?: ServicePayment | null;
  _count?: { quotes: number; vehicles?: number }; viewerRole?: 'customer' | 'contractor' | 'admin' | 'bidder';
}
export interface ContractorCapability {
  id: string; contractorId: string; serviceType: ServiceType; status: CapabilityStatus; appliedAt: string; reviewedAt: string | null; reviewNote: string | null;
  contractor?: ContractorSummary & { user: { id: string; firstName: string | null; lastName: string | null; email: string; stripeConnectAccountId: string | null; stripeConnectOnboardingComplete: boolean } };
  reviewedBy?: { firstName: string | null; lastName: string | null } | null;
}
export interface MyCapabilities {
  profile: { id: string; businessName: string | null; phone: string | null; serviceArea: string | null } | null;
  capabilities: ContractorCapability[]; stripeConnect: { connected: boolean; complete: boolean };
}
export const formatPence = (p: number) => `£${(p / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface CreateJobInput {
  serviceType: ServiceType; isRecovery?: boolean; title: string; description?: string; pickupPostcode?: string; pickupAddress?: string;
  deliveryPostcode?: string; deliveryAddress?: string; servicePostcode?: string; serviceAddress?: string; requestedFor?: string; vehicles: JobVehicle[];
}
export async function createJob(input: CreateJobInput): Promise<ServiceJob> {
  const r = await apiClient<{ data: ServiceJob }>('/services/jobs', { method: 'POST', body: JSON.stringify(input) }); return r.data;
}
export async function createJobFromPurchase(input: { offerId?: string; auctionId?: string; deliveryPostcode: string; deliveryAddress?: string; requestedFor?: string }): Promise<ServiceJob> {
  const r = await apiClient<{ data: ServiceJob }>('/services/jobs/from-purchase', { method: 'POST', body: JSON.stringify(input) }); return r.data;
}
export async function getMyJobs(): Promise<ServiceJob[]> { const r = await apiClient<{ data: ServiceJob[] }>('/services/jobs/my'); return r.data; }
export async function getJob(id: string): Promise<ServiceJob> { const r = await apiClient<{ data: ServiceJob }>(`/services/jobs/${id}`); return r.data; }
export async function cancelJob(id: string, reason?: string): Promise<void> { await apiClient(`/services/jobs/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }); }
export async function acceptQuote(jobId: string, quoteId: string): Promise<string> {
  const r = await apiClient<{ data: { checkoutUrl: string } }>(`/services/jobs/${jobId}/quotes/${quoteId}/accept`, { method: 'POST' }); return r.data.checkoutUrl;
}
export async function confirmCompletion(id: string): Promise<void> { await apiClient(`/services/jobs/${id}/confirm`, { method: 'POST' }); }
export async function disputeJob(id: string, reason?: string): Promise<void> { await apiClient(`/services/jobs/${id}/dispute`, { method: 'POST', body: JSON.stringify({ reason }) }); }

export async function applyCapability(input: { serviceType: ServiceType; businessName?: string; phone?: string; serviceArea?: string }): Promise<ContractorCapability> {
  const r = await apiClient<{ data: ContractorCapability }>('/services/capabilities', { method: 'POST', body: JSON.stringify(input) }); return r.data;
}
export async function getMyCapabilities(): Promise<MyCapabilities> { const r = await apiClient<{ data: MyCapabilities }>('/services/capabilities/my'); return r.data; }
export async function getJobFeed(serviceType?: ServiceType): Promise<ServiceJob[]> {
  const q = serviceType ? `?serviceType=${serviceType}` : ''; const r = await apiClient<{ data: ServiceJob[] }>(`/services/jobs/feed${q}`); return r.data;
}
export async function getAssignedJobs(): Promise<ServiceJob[]> { const r = await apiClient<{ data: ServiceJob[] }>('/services/jobs/assigned'); return r.data; }
export async function upsertQuote(jobId: string, input: { amountPence: number; message?: string; validUntil?: string }): Promise<ServiceQuote> {
  const r = await apiClient<{ data: ServiceQuote }>(`/services/jobs/${jobId}/quote`, { method: 'PUT', body: JSON.stringify(input) }); return r.data;
}
export async function withdrawQuote(jobId: string): Promise<void> { await apiClient(`/services/jobs/${jobId}/quote`, { method: 'DELETE' }); }
export async function startJob(id: string): Promise<void> { await apiClient(`/services/jobs/${id}/start`, { method: 'POST' }); }
export async function completeJob(id: string): Promise<void> { await apiClient(`/services/jobs/${id}/complete`, { method: 'POST' }); }

export async function adminGetCapabilities(status?: CapabilityStatus): Promise<ContractorCapability[]> {
  const q = status ? `?status=${status}` : ''; const r = await apiClient<{ data: ContractorCapability[] }>(`/admin/services/capabilities${q}`); return r.data;
}
export async function adminReviewCapability(id: string, input: { status: CapabilityStatus; reviewNote?: string }): Promise<ContractorCapability> {
  const r = await apiClient<{ data: ContractorCapability }>(`/admin/services/capabilities/${id}`, { method: 'PATCH', body: JSON.stringify(input) }); return r.data;
}
export async function adminGetJobs(status?: ServiceJobStatus): Promise<ServiceJob[]> {
  const q = status ? `?status=${status}` : ''; const r = await apiClient<{ data: ServiceJob[] }>(`/admin/services/jobs${q}`); return r.data;
}
export async function adminResolveDispute(id: string, input: { outcome: 'RELEASE' | 'REFUND'; note?: string }): Promise<void> {
  await apiClient(`/admin/services/jobs/${id}/resolve`, { method: 'POST', body: JSON.stringify(input) });
}
