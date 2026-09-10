import { apiClient } from './apiClient';

/**
 * How the dealer's business is constituted. Decides which evidence the KYC form
 * asks for — a sole trader has no VAT number and no Companies House record, so
 * demanding either would lock them out of dealer verification entirely.
 */
export type BusinessType = 'PRIVATE_LIMITED' | 'SOLE_PROPRIETORSHIP';

export interface DealerKycData {
  id?: string;
  dealerProfileId?: string;
  businessType: BusinessType;
  companyHouseName: string;
  representativeName: string;
  representativePosition: string;
  vatNumber: string;
  vatProof?: string;
  companyRegistrationNumber: string;
  companyRegistrationProof?: string;
  personOfSignificantControl: string;
  directorName: string;
  directorIdProof?: string;
  /** Sole traders only — utility bill or bank statement. */
  proofOfAddress?: string;
  businessWebsite: string;
  businessRegisteredAddress: string;
  tradingAddress?: string;
  googleReviewsLink?: string;
  paymentReference?: string;
  paymentScreenshot?: string;
  stripePaymentIntentId?: string;
  stripeChargedAt?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  documentStatuses?: Record<
    string,
    {
      status: 'PENDING' | 'APPROVED' | 'REJECTED';
      note: string;
    }
  >;
  submittedAt?: string;
  reviewedAt?: string;
}


export async function getDealerKyc(): Promise<DealerKycData | null> {
  const result = await apiClient<{ data: DealerKycData | null }>('/dealers/kyc');
  return result.data;
}

export async function submitDealerKyc(data: Partial<DealerKycData>): Promise<DealerKycData> {
  const result = await apiClient<{ data: DealerKycData }>('/dealers/kyc', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return result.data;
}

/** Creates a Stripe Checkout Session for the £1 KYC fee — redirect the browser to `url`. */
export async function createKycCheckoutSession(): Promise<{
  url?: string;
  alreadyPaid: boolean;
  chargedAt?: string;
}> {
  const result = await apiClient<{ data: { url?: string; alreadyPaid: boolean; chargedAt?: string } }>(
    '/dealers/kyc/checkout',
    { method: 'POST' },
  );
  return result.data;
}
