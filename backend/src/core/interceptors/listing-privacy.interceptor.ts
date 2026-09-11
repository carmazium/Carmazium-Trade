import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Final privacy boundary for the public single-listing response.
 *
 * The listing service is shared by several authenticated/admin flows, so the
 * public API rules are enforced here without changing those internal callers:
 *
 * - CLASSIFIED: seller contact is intentionally public, including to guests.
 * - CLASSIFIED offers: seller sees the latest offer; another signed-in user
 *   sees only their own latest offer; guests see no offer data.
 * - AUCTION: seller contact remains locked on the generic listing endpoint.
 *   Auction winner contact is exposed only by the auction-specific, buyer-fee
 *   gated endpoints.
 */
@Injectable()
export class ListingPrivacyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<any>();

    if (request.method !== 'GET') return next.handle();

    return next.handle().pipe(
      mergeMap(async (response: any) => {
        const listing = response?.data;
        const path = String(request.originalUrl || request.url || '').split('?')[0];

        // Only touch the public single-listing shape. Arrays, dashboard payloads,
        // stats and all non-listing responses pass through unchanged.
        if (
          !/^\/listings\/[^/]+$/.test(path) ||
          !listing ||
          Array.isArray(listing) ||
          !listing.id ||
          !listing.type ||
          !listing.seller
        ) {
          return response;
        }

        const viewerId: string | undefined = request.user?.id;
        const sellerId: string | null = listing.sellerId ?? listing.seller?.id ?? null;
        const seller = { ...listing.seller };
        const result = { ...listing, seller };

        if (listing.type === 'CLASSIFIED') {
          // Retail contact is intentionally public. Re-read only the contact and
          // public dealership fields because the service may have redacted phone
          // numbers for an anonymous viewer.
          if (sellerId) {
            const publicContact = await this.prisma.user.findUnique({
              where: { id: sellerId },
              select: {
                phone: true,
                dealerProfile: {
                  select: {
                    companyName: true,
                    logo: true,
                    description: true,
                    phone: true,
                    website: true,
                    businessAddress: true,
                    openingHours: true,
                    isVerified: true,
                  },
                },
              },
            });

            seller.phone = publicContact?.phone ?? null;
            seller.phoneAvailable = Boolean(publicContact?.phone);

            if (publicContact?.dealerProfile) {
              seller.dealerProfile = {
                ...publicContact.dealerProfile,
                phoneAvailable: Boolean(publicContact.dealerProfile.phone),
                businessAddressAvailable: Boolean(publicContact.dealerProfile.businessAddress),
                websiteAvailable: Boolean(publicContact.dealerProfile.website),
              };
            } else {
              seller.dealerProfile = null;
            }
          }

          // Offer state is private between the seller and each individual buyer.
          if (viewerId && sellerId && viewerId === sellerId) {
            result.offers = Array.isArray(listing.offers) ? listing.offers.slice(0, 1) : [];
          } else if (viewerId) {
            const ownOffer = await this.prisma.offer.findFirst({
              where: { listingId: listing.id, buyerId: viewerId },
              orderBy: { createdAt: 'desc' },
              select: {
                id: true,
                amount: true,
                status: true,
                message: true,
                buyerId: true,
                createdAt: true,
              },
            });
            result.offers = ownOffer ? [ownOffer] : [];
          } else {
            result.offers = [];
          }
        } else if (listing.type === 'AUCTION') {
          // Never leak auction seller contact through /listings/:slug. The
          // auction-specific winner endpoint unlocks it only after the £125 fee.
          seller.phoneAvailable = Boolean(seller.phoneAvailable || seller.phone);
          seller.phone = null;
          if ('email' in seller) {
            seller.emailAvailable = Boolean(seller.emailAvailable || seller.email);
            seller.email = null;
          }

          if (seller.dealerProfile) {
            const dealer = seller.dealerProfile;
            seller.dealerProfile = {
              companyName: dealer.companyName,
              logo: dealer.logo ?? null,
              description: dealer.description ?? null,
              isVerified: Boolean(dealer.isVerified),
              phone: null,
              phoneAvailable: Boolean(dealer.phoneAvailable || dealer.phone),
              website: null,
              websiteAvailable: Boolean(dealer.websiteAvailable || dealer.website),
              businessAddress: null,
              businessAddressAvailable: Boolean(
                dealer.businessAddressAvailable || dealer.businessAddress,
              ),
              openingHours: dealer.openingHours ?? null,
            };
          }

          result.offers = [];
        }

        return { ...response, data: result };
      }),
    );
  }
}
