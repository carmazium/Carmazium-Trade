import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Canonical privacy boundary for GET /listings/:slug.
 *
 * - CLASSIFIED contact details are public by design.
 * - A retail seller sees the latest incoming offer; a signed-in buyer sees only
 *   their own latest offer; guests see no offer state.
 * - AUCTION seller contact is always redacted here. The dedicated auction
 *   endpoint reveals it only to the winner after the £125 buyer fee is paid.
 */
@Injectable()
export class ListingPrivacyInterceptor implements NestInterceptor {
    constructor(private readonly prisma: PrismaService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req = context.switchToHttp().getRequest<any>();
        if (req?.method !== 'GET') return next.handle();

        return next.handle().pipe(
            mergeMap(async (response: any) => {
                const path = String(req.originalUrl || req.url || '').split('?')[0];
                if (!/^\/listings\/[^/]+$/.test(path)) return response;

                const staticListingRoutes = new Set([
                    'featured', 'my', 'stats', 'performance', 'earnings',
                ]);
                const routePart = decodeURIComponent(path.slice('/listings/'.length));
                if (staticListingRoutes.has(routePart)) return response;

                const listing = response?.data;
                if (
                    !listing ||
                    Array.isArray(listing) ||
                    !listing.id ||
                    !listing.type ||
                    !listing.seller
                ) {
                    return response;
                }

                const viewerId: string | undefined = req.user?.id;
                const sellerId: string | null = listing.sellerId ?? listing.seller?.id ?? null;
                const seller: any = { ...listing.seller };
                const result: any = { ...listing, seller };

                if (listing.type === 'AUCTION') {
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
                            openingHours: dealer.openingHours ?? null,
                            phone: null,
                            phoneAvailable: Boolean(dealer.phoneAvailable || dealer.phone),
                            website: null,
                            websiteAvailable: Boolean(dealer.websiteAvailable || dealer.website),
                            businessAddress: null,
                            businessAddressAvailable: Boolean(
                                dealer.businessAddressAvailable || dealer.businessAddress,
                            ),
                        };
                    }

                    result.offers = [];
                    return { ...response, data: result };
                }

                if (listing.type !== 'CLASSIFIED' || !sellerId) {
                    result.offers = [];
                    return { ...response, data: result };
                }

                // Offer state is private to the seller and each individual buyer.
                if (viewerId === sellerId) {
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

                // Never expose a staff/admin account as the public retail seller.
                if (seller.role === 'ADMIN') {
                    seller.phone = null;
                    seller.phoneAvailable = false;
                    seller.email = process.env.PUBLIC_SUPPORT_EMAIL || 'support@carmazium.com';
                    seller.dealerProfile = null;
                    return { ...response, data: result };
                }

                // Retail contact is intentionally public. Re-read only public contact
                // and dealership fields so dealerProfile cannot leak private columns.
                const publicContact = await this.prisma.user.findUnique({
                    where: { id: sellerId },
                    select: {
                        phone: true,
                        email: true,
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
                seller.email = publicContact?.email ?? null;
                seller.phoneAvailable = Boolean(publicContact?.phone);

                if (publicContact?.dealerProfile) {
                    seller.dealerProfile = {
                        ...publicContact.dealerProfile,
                        phoneAvailable: Boolean(publicContact.dealerProfile.phone),
                        websiteAvailable: Boolean(publicContact.dealerProfile.website),
                        businessAddressAvailable: Boolean(publicContact.dealerProfile.businessAddress),
                    };
                } else {
                    seller.dealerProfile = null;
                }

                return { ...response, data: result };
            }),
        );
    }
}
