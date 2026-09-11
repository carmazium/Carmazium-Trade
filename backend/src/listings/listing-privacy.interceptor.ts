import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable, from } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Final privacy boundary for GET /listings/:slug.
 *
 * Rules:
 * - Retail/classified contact details are public by design — no login wall.
 * - Auction seller contact remains private here; the winner-gated auction
 *   endpoint reveals it only after the £125 buyer fee is paid.
 * - Offer data is never public. An authenticated buyer may see only their own
 *   offer embedded in the listing response; everyone else receives none.
 */
@Injectable()
export class ListingPrivacyInterceptor implements NestInterceptor {
    constructor(private readonly prisma: PrismaService) {}

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req = context.switchToHttp().getRequest<any>();
        return next.handle().pipe(
            mergeMap((response: any) => from(this.sanitize(response, req))),
        );
    }

    private async sanitize(response: any, req: any) {
        if (req?.method !== 'GET') return response;

        // APP_INTERCEPTOR is global even though it is registered from
        // ListingsModule. Scope the mutation to the one public detail route;
        // admin endpoints and dashboard endpoints must retain their full data.
        const path = String(req.originalUrl || req.url || '').split('?')[0];
        if (!/^\/listings\/[^/]+$/.test(path)) return response;

        const staticListingRoutes = new Set([
            'featured', 'my', 'stats', 'performance', 'earnings',
        ]);
        const routePart = decodeURIComponent(path.slice('/listings/'.length));
        if (staticListingRoutes.has(routePart)) return response;

        const listing = response?.data;
        if (!listing || Array.isArray(listing) || !listing.id || !listing.slug || !listing.type || !listing.seller) {
            return response;
        }

        const viewerId: string | undefined = req.user?.id;

        if (Array.isArray(listing.offers)) {
            listing.offers = viewerId
                ? listing.offers.filter((offer: any) => offer?.buyerId === viewerId)
                : [];
        }

        if (listing.type === 'AUCTION') {
            listing.seller = {
                ...listing.seller,
                phone: null,
                email: null,
                phoneAvailable: !!listing.seller.phone || !!listing.seller.phoneAvailable,
                ...(listing.seller.dealerProfile ? {
                    dealerProfile: {
                        ...listing.seller.dealerProfile,
                        phone: null,
                        businessAddress: null,
                        website: null,
                        phoneAvailable: !!listing.seller.dealerProfile.phone || !!listing.seller.dealerProfile.phoneAvailable,
                    },
                } : {}),
            };
            return response;
        }

        if (listing.type !== 'CLASSIFIED' || !listing.sellerId) return response;

        // Admin-created stock is branded as CarMazium elsewhere. Never expose a
        // staff member's private account details as the seller contact.
        if (listing.seller?.role === 'ADMIN') {
            listing.seller = {
                ...listing.seller,
                email: process.env.PUBLIC_SUPPORT_EMAIL || 'support@carmazium.com',
            };
            return response;
        }

        const contact = await this.prisma.user.findUnique({
            where: { id: listing.sellerId },
            select: {
                phone: true,
                email: true,
                dealerProfile: {
                    select: {
                        phone: true,
                        businessAddress: true,
                        website: true,
                    },
                },
            },
        });

        if (!contact) return response;

        listing.seller = {
            ...listing.seller,
            phone: contact.phone,
            email: contact.email,
            phoneAvailable: !!contact.phone,
            ...(listing.seller.dealerProfile ? {
                dealerProfile: {
                    ...listing.seller.dealerProfile,
                    phone: contact.dealerProfile?.phone ?? listing.seller.dealerProfile.phone ?? null,
                    businessAddress: contact.dealerProfile?.businessAddress ?? listing.seller.dealerProfile.businessAddress ?? null,
                    website: contact.dealerProfile?.website ?? listing.seller.dealerProfile.website ?? null,
                    phoneAvailable: !!(contact.dealerProfile?.phone ?? listing.seller.dealerProfile.phone),
                },
            } : {}),
        };

        return response;
    }
}
