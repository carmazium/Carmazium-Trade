import { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { ListingPrivacyInterceptor } from './listing-privacy.interceptor';

describe('ListingPrivacyInterceptor', () => {
    const publicDealer = {
        companyName: 'Example Motors',
        logo: 'logo.png',
        description: 'Dealer',
        phone: '0121 000 0000',
        website: 'https://example.test',
        businessAddress: 'Birmingham',
        openingHours: null,
        isVerified: true,
    };

    function makePrisma() {
        return {
            user: {
                findUnique: jest.fn().mockResolvedValue({
                    phone: '07123 456789',
                    email: 'seller@example.test',
                    dealerProfile: publicDealer,
                }),
            },
            offer: {
                findFirst: jest.fn(),
            },
        } as any;
    }

    function context(viewerId?: string): ExecutionContext {
        return {
            switchToHttp: () => ({
                getRequest: () => ({
                    method: 'GET',
                    originalUrl: '/listings/example-car',
                    user: viewerId ? { id: viewerId } : undefined,
                }),
            }),
        } as any;
    }

    function handler(data: any): CallHandler {
        return { handle: () => of({ data }) } as any;
    }

    const baseClassified = {
        id: 'listing-1',
        slug: 'example-car',
        type: 'CLASSIFIED',
        sellerId: 'seller-1',
        seller: {
            id: 'seller-1',
            role: 'DEALER',
            phone: null,
            dealerProfile: { ...publicDealer, stripeAccountId: 'must-not-leak' },
        },
        offers: [{
            id: 'offer-latest', amount: 9500, status: 'PENDING', message: 'latest',
            buyerId: 'buyer-2', createdAt: new Date(),
        }],
    };

    it('publishes retail contact to guests but no offer state or private dealer fields', async () => {
        const prisma = makePrisma();
        const interceptor = new ListingPrivacyInterceptor(prisma);
        const response = await firstValueFrom(interceptor.intercept(context(), handler(baseClassified)));

        expect(response.data.offers).toEqual([]);
        expect(response.data.seller.phone).toBe('07123 456789');
        expect(response.data.seller.email).toBe('seller@example.test');
        expect(response.data.seller.dealerProfile.companyName).toBe('Example Motors');
        expect(response.data.seller.dealerProfile.stripeAccountId).toBeUndefined();
    });

    it('lets the retail seller see the latest incoming offer', async () => {
        const prisma = makePrisma();
        const interceptor = new ListingPrivacyInterceptor(prisma);
        const response = await firstValueFrom(interceptor.intercept(context('seller-1'), handler(baseClassified)));

        expect(response.data.offers).toHaveLength(1);
        expect(response.data.offers[0].id).toBe('offer-latest');
        expect(prisma.offer.findFirst).not.toHaveBeenCalled();
    });

    it('lets a buyer see only their own latest offer', async () => {
        const prisma = makePrisma();
        prisma.offer.findFirst.mockResolvedValue({
            id: 'offer-own', amount: 9000, status: 'PENDING', message: 'mine',
            buyerId: 'buyer-1', createdAt: new Date(),
        });
        const interceptor = new ListingPrivacyInterceptor(prisma);
        const response = await firstValueFrom(interceptor.intercept(context('buyer-1'), handler(baseClassified)));

        expect(response.data.offers).toHaveLength(1);
        expect(response.data.offers[0].id).toBe('offer-own');
        expect(prisma.offer.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { listingId: 'listing-1', buyerId: 'buyer-1' },
        }));
    });

    it('redacts auction contact and offer state on the generic listing endpoint', async () => {
        const prisma = makePrisma();
        const interceptor = new ListingPrivacyInterceptor(prisma);
        const auctionListing = {
            ...baseClassified,
            type: 'AUCTION',
            seller: {
                ...baseClassified.seller,
                phone: '07123 456789',
                email: 'seller@example.test',
                dealerProfile: publicDealer,
            },
        };
        const response = await firstValueFrom(interceptor.intercept(context('buyer-1'), handler(auctionListing)));

        expect(response.data.offers).toEqual([]);
        expect(response.data.seller.phone).toBeNull();
        expect(response.data.seller.email).toBeNull();
        expect(response.data.seller.dealerProfile.phone).toBeNull();
        expect(response.data.seller.dealerProfile.website).toBeNull();
        expect(response.data.seller.dealerProfile.businessAddress).toBeNull();
        expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
});
