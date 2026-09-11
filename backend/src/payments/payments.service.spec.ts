const mockPaymentIntentsCreate = jest.fn();
const mockCustomersCreate = jest.fn();
const mockEphemeralKeysCreate = jest.fn();
const mockCheckoutSessionsCreate = jest.fn();
const mockCheckoutSessionsRetrieve = jest.fn();
const mockRefundsCreate = jest.fn();
const mockConstructEvent = jest.fn();

jest.mock('stripe', () => {
    const MockStripe = jest.fn().mockImplementation(() => ({
        paymentIntents: { create: mockPaymentIntentsCreate },
        customers: { create: mockCustomersCreate },
        ephemeralKeys: { create: mockEphemeralKeysCreate },
        checkout: { sessions: { create: mockCheckoutSessionsCreate, retrieve: mockCheckoutSessionsRetrieve } },
        refunds: { create: mockRefundsCreate },
        webhooks: { constructEvent: mockConstructEvent },
        transfers: { create: jest.fn() },
    }));
    return { __esModule: true, default: MockStripe };
});

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { HpiService } from '../hpi/hpi.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { EmailService } from '../email/email.service';

function prismaMock() {
    return {
        listing: { findUnique: jest.fn(), update: jest.fn() },
        user: {
            findUnique: jest.fn().mockResolvedValue({
                id: 'winner-1', email: 'winner@example.com', stripeCustomerId: 'cus_1', firstName: 'Win', lastName: 'Ner',
            }),
            update: jest.fn(),
            updateMany: jest.fn(),
            findMany: jest.fn().mockResolvedValue([]),
        },
        auction: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
        transaction: {
            create: jest.fn().mockResolvedValue({ id: 'txn-1' }),
            update: jest.fn(),
            findUnique: jest.fn(),
            findFirst: jest.fn(),
            findMany: jest.fn(),
        },
        sale: { findFirst: jest.fn(), create: jest.fn() },
        dealerKyc: { findUnique: jest.fn(), findFirst: jest.fn() },
        hpiReport: { findUnique: jest.fn() },
        hpiReportEmailRequest: { findFirst: jest.fn() },
        featuredBoost: { update: jest.fn() },
        $transaction: jest.fn(async (arg: any) => Array.isArray(arg) ? Promise.all(arg) : arg({})),
    } as any;
}

async function build(prisma: any): Promise<PaymentsService> {
    const module: TestingModule = await Test.createTestingModule({
        providers: [
            PaymentsService,
            { provide: PrismaService, useValue: prisma },
            {
                provide: ConfigService,
                useValue: {
                    get: (key: string) => ({
                        STRIPE_SECRET_KEY: 'sk_test_mock',
                        STRIPE_PUBLISHABLE_KEY: 'pk_test_mock',
                        STRIPE_WEBHOOK_SECRET: 'whsec_mock',
                        FRONTEND_URL: 'https://www.carmazium.com',
                    } as Record<string, string>)[key],
                },
            },
            { provide: HpiService, useValue: { createPendingReport: jest.fn(), requestEmailDelivery: jest.fn() } },
            { provide: NotificationsService, useValue: { create: jest.fn().mockResolvedValue(null) } },
            { provide: NotificationsGateway, useValue: { sendNotification: jest.fn() } },
            { provide: EmailService, useValue: { sendKycSubmissionAdminAlert: jest.fn() } },
            { provide: ModuleRef, useValue: { get: jest.fn() } },
        ],
    }).compile();
    return module.get(PaymentsService);
}

const LISTING = {
    id: 'listing-1',
    title: 'BMW M3',
    slug: 'bmw-m3',
    price: 30000,
    images: [],
    deletedAt: null,
};

beforeEach(() => {
    jest.clearAllMocks();
    mockCheckoutSessionsCreate.mockResolvedValue({ id: 'cs_1', url: 'https://checkout.stripe.com/cs_1' });
    mockEphemeralKeysCreate.mockResolvedValue({ secret: 'ek_1' });
    mockPaymentIntentsCreate.mockResolvedValue({ id: 'pi_1', client_secret: 'secret_1' });
});

describe('PaymentsService — CarMazium vehicle-fund boundary', () => {
    it.each(['DEPOSIT', 'FULL_PAYMENT'] as const)(
        'refuses new %s hosted checkout sessions',
        async (type) => {
            const prisma = prismaMock();
            const service = await build(prisma);
            await expect(service.createCheckoutSession('listing-1', 'winner-1', 1, type, 'gbp'))
                .rejects.toThrow(BadRequestException);
            expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
            expect(prisma.transaction.create).not.toHaveBeenCalled();
        },
    );

    it.each(['DEPOSIT', 'FULL_PAYMENT'] as const)(
        'refuses new %s native Payment Sheet intents',
        async (type) => {
            const prisma = prismaMock();
            const service = await build(prisma);
            await expect(service.createPaymentSheet('listing-1', 'winner-1', 1, type, 'gbp'))
                .rejects.toThrow(BadRequestException);
            expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
            expect(prisma.transaction.create).not.toHaveBeenCalled();
        },
    );
});

describe('PaymentsService — £125 auction buyer fee', () => {
    it('creates a hosted £125 checkout only for the actual winning dealer', async () => {
        const prisma = prismaMock();
        prisma.listing.findUnique.mockResolvedValue(LISTING);
        prisma.auction.findFirst.mockResolvedValue({ id: 'auction-1', winnerId: 'winner-1', buyerFeePaid: false });
        const service = await build(prisma);

        const result = await service.createCheckoutSession('listing-1', 'winner-1', 1, 'COMMISSION', 'gbp');

        expect(result.url).toContain('stripe.com');
        expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
            line_items: [expect.objectContaining({
                price_data: expect.objectContaining({ unit_amount: 12500 }),
            })],
            metadata: expect.objectContaining({
                listingId: 'listing-1',
                auctionId: 'auction-1',
                userId: 'winner-1',
                type: 'COMMISSION',
            }),
        }));
        expect(prisma.transaction.create).toHaveBeenCalledWith({
            data: expect.objectContaining({ amount: 125, type: 'COMMISSION', userId: 'winner-1' }),
        });
    });

    it('rejects an authenticated user who is not the auction winner', async () => {
        const prisma = prismaMock();
        prisma.listing.findUnique.mockResolvedValue(LISTING);
        prisma.auction.findFirst.mockResolvedValue({ id: 'auction-1', winnerId: 'someone-else', buyerFeePaid: false });
        const service = await build(prisma);

        await expect(service.createCheckoutSession('listing-1', 'winner-1', 125, 'COMMISSION', 'gbp'))
            .rejects.toThrow(ForbiddenException);
        expect(mockCheckoutSessionsCreate).not.toHaveBeenCalled();
    });

    it('rejects a second fee checkout once buyerFeePaid is true', async () => {
        const prisma = prismaMock();
        prisma.listing.findUnique.mockResolvedValue(LISTING);
        prisma.auction.findFirst.mockResolvedValue({ id: 'auction-1', winnerId: 'winner-1', buyerFeePaid: true });
        const service = await build(prisma);

        await expect(service.createCheckoutSession('listing-1', 'winner-1', 125, 'COMMISSION', 'gbp'))
            .rejects.toThrow('already been paid');
    });
});

describe('PaymentsService — platform fees/services', () => {
    it('keeps listing-fee Payment Sheet support', async () => {
        const prisma = prismaMock();
        prisma.listing.findUnique.mockResolvedValue(LISTING);
        const service = await build(prisma);

        await service.createPaymentSheet('listing-1', 'winner-1', 1, 'LISTING_FEE', 'gbp', 'PREMIUM');

        expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(expect.objectContaining({
            amount: 2500,
            metadata: expect.objectContaining({ type: 'LISTING_FEE', badgeTier: 'PREMIUM' }),
        }));
    });

    it('keeps auction-fee Payment Sheet support and derives £125 server-side', async () => {
        const prisma = prismaMock();
        prisma.listing.findUnique.mockResolvedValue(LISTING);
        prisma.auction.findFirst.mockResolvedValue({ id: 'auction-1', winnerId: 'winner-1', buyerFeePaid: false });
        const service = await build(prisma);

        await service.createPaymentSheet('listing-1', 'winner-1', 1, 'COMMISSION', 'gbp');

        expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(expect.objectContaining({ amount: 12500 }));
    });
});

describe('PaymentsService — £100 refund / £25 retained', () => {
    it('does nothing when called without an explicit failed-sale reason', async () => {
        const prisma = prismaMock();
        const service = await build(prisma);

        await service.issueRefundForAuction('auction-1');

        expect(prisma.auction.findUnique).not.toHaveBeenCalled();
        expect(mockRefundsCreate).not.toHaveBeenCalled();
    });

    it('refunds exactly £100 and records a negative REFUND row while leaving the £125 COMMISSION intact', async () => {
        const prisma = prismaMock();
        prisma.auction.findUnique.mockResolvedValue({
            id: 'auction-1',
            buyerFeePaid: true,
            buyerFeeTransactionId: 'txn-fee',
            sellerBonusReleased: false,
        });
        prisma.transaction.findUnique.mockResolvedValue({
            id: 'txn-fee',
            listingId: 'listing-1',
            userId: 'winner-1',
            amount: 125,
            type: 'COMMISSION',
            status: 'COMPLETED',
            stripePaymentId: 'cs_fee',
        });
        prisma.transaction.findFirst.mockResolvedValue(null);
        mockCheckoutSessionsRetrieve.mockResolvedValue({ payment_intent: 'pi_fee' });
        mockRefundsCreate.mockResolvedValue({ id: 're_100' });
        const service = await build(prisma);

        await service.issueRefundForAuction('auction-1', 'FAILED_SALE');

        expect(mockRefundsCreate).toHaveBeenCalledWith(
            { payment_intent: 'pi_fee', amount: 10000 },
            { idempotencyKey: 'auction-buyer-fee-refund-txn-fee' },
        );
        expect(prisma.transaction.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                listingId: 'listing-1',
                userId: 'winner-1',
                amount: -100,
                type: 'REFUND',
                status: 'COMPLETED',
                stripePaymentId: 're_100',
            }),
        });
        expect(prisma.transaction.update).not.toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'txn-fee' },
            data: expect.objectContaining({ status: 'REFUNDED' }),
        }));
    });

    it('will not refund after the seller incentive has been released', async () => {
        const prisma = prismaMock();
        prisma.auction.findUnique.mockResolvedValue({
            id: 'auction-1',
            buyerFeePaid: true,
            buyerFeeTransactionId: 'txn-fee',
            sellerBonusReleased: true,
        });
        const service = await build(prisma);

        await expect(service.issueRefundForAuction('auction-1', 'FAILED_SALE'))
            .rejects.toThrow('seller bonus');
        expect(mockRefundsCreate).not.toHaveBeenCalled();
    });
});
