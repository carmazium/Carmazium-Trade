import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { HpiService } from '../hpi/hpi.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { EmailService } from '../email/email.service';
import { resolveFrontendUrl } from '../core/frontend-url';

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly hpiService: HpiService,
        private readonly notificationsService: NotificationsService,
        private readonly notificationsGateway: NotificationsGateway,
        private readonly emailService: EmailService,
        private readonly moduleRef: ModuleRef,
    ) {}

    private async notifyListingSubmittedForReview(listingId: string) {
        try {
            const listing = await this.prisma.listing.findUnique({
                where: { id: listingId },
                select: { id: true, title: true, sellerId: true },
            });
            if (!listing?.sellerId) return;
            const notification = await this.notificationsService.create({
                userId: listing.sellerId,
                type: 'LISTING_SUBMITTED',
                title: 'Listing Submitted for Review',
                message: `"${listing.title}" has been submitted and is awaiting admin review before it goes live.`,
                link: '/dashboard/seller/listings',
                entityType: 'Listing',
                entityId: listing.id,
                actionType: 'SUBMITTED',
            }).catch(() => null);
            if (notification) this.notificationsGateway.sendNotification(listing.sellerId, notification);
        } catch {
            // best-effort only
        }
    }

    /** Historical helper retained only for already-created legacy Stripe sessions. */
    private async notifyDepositPaid(listingId: string, buyerId?: string) {
        try {
            const listing = await this.prisma.listing.findUnique({
                where: { id: listingId },
                select: { id: true, title: true, sellerId: true },
            });
            if (!listing?.sellerId) return;
            const buyer = buyerId
                ? await this.prisma.user.findUnique({ where: { id: buyerId }, select: { firstName: true, lastName: true } })
                : null;
            const buyerName = buyer ? `${buyer.firstName ?? ''} ${buyer.lastName ?? ''}`.trim() || 'A buyer' : 'A buyer';
            const notification = await this.notificationsService.create({
                userId: listing.sellerId,
                type: 'SYSTEM',
                title: 'Refundable deposit received',
                message: `${buyerName} has paid a legacy refundable deposit for "${listing.title}".`,
                link: '/dashboard/seller/listings',
                entityType: 'Listing',
                entityId: listing.id,
            }).catch(() => null);
            if (notification) this.notificationsGateway.sendNotification(listing.sellerId, notification);
        } catch {
            // best-effort only
        }
    }

    private readonly HPI_REPORT_PRICE = 9.99;
    private readonly LISTING_FEES = {
        BASIC: 1.00,
        STANDARD: 10.00,
        PREMIUM: 25.00,
    };
    private readonly AUCTION_BUYER_FEE = 125;
    private readonly AUCTION_SELLER_BONUS = 100;
    private readonly AUCTION_PLATFORM_FEE = 25;

    private async markServiceJobPaid(jobId: string, paymentId: string, paymentIntentId: string | null) {
        try {
            const { ServicesService } = await import('../services/services.service');
            const services = this.moduleRef.get(ServicesService, { strict: false });
            await services.markPaid(jobId, paymentId, paymentIntentId);
        } catch (e: any) {
            this.logger.error(`SERVICE_JOB webhook for job ${jobId} failed: ${e?.message}`);
            throw e;
        }
    }

    async getStripeClient() {
        return this.getStripe();
    }

    private async getStripe() {
        const Stripe = (await import('stripe')).default;
        return new Stripe(this.config.get<string>('STRIPE_SECRET_KEY')!, {
            apiVersion: '2026-02-25.clover',
        });
    }

    isStripeInTestMode(): boolean {
        const key = this.config.get<string>('STRIPE_SECRET_KEY') ?? '';
        return key.startsWith('sk_test_');
    }

    /**
     * CarMazium does not collect vehicle sale funds. This endpoint is retained
     * for API compatibility, but it creates only the £125 auction buyer-fee
     * checkout. Vehicle deposits and full-price payments are buyer-to-seller.
     */
    async createCheckoutSession(
        listingId: string,
        userId: string,
        clientAmount: number,
        type: 'DEPOSIT' | 'FULL_PAYMENT' | 'COMMISSION' = 'COMMISSION',
        currency = 'gbp',
    ) {
        if (type !== 'COMMISSION') {
            throw new BadRequestException(
                'CarMazium does not collect vehicle deposits or purchase funds. Pay the seller directly after inspection.',
            );
        }

        const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
        if (!listing || listing.deletedAt) throw new NotFoundException(`Listing "${listingId}" not found`);

        const auction = await this.prisma.auction.findFirst({
            where: { listingId, status: 'ENDED', deletedAt: null },
            select: { id: true, winnerId: true, buyerFeePaid: true },
        });
        if (!auction || auction.winnerId !== userId) {
            throw new ForbiddenException('Only the winning dealer can pay this auction buyer fee.');
        }
        if (auction.buyerFeePaid) throw new BadRequestException('The auction buyer fee has already been paid.');

        const amount = this.AUCTION_BUYER_FEE;
        if (Math.abs(amount - clientAmount) > 0.01) {
            this.logger.warn(
                `Auction fee client amount ${clientAmount} did not match £${amount} for listing=${listingId} user=${userId}; using server amount.`,
            );
        }

        const stripe = await this.getStripe();
        const baseUrl = resolveFrontendUrl(this.config.get<string>('FRONTEND_URL') || this.config.get<string>('NEXT_PUBLIC_BASE_URL'));
        const transaction = await this.prisma.transaction.create({
            data: {
                listingId,
                userId,
                amount,
                type: 'COMMISSION' as any,
                status: 'PENDING',
                description: `Auction buyer fee — ${listing.title} (£${this.AUCTION_SELLER_BONUS} refundable portion + £${this.AUCTION_PLATFORM_FEE} non-refundable platform fee)`,
            },
        });

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: [{
                price_data: {
                    currency,
                    product_data: {
                        name: 'Auction Buyer Fee — CarMazium',
                        description: `£${this.AUCTION_SELLER_BONUS} refundable if the qualifying sale fails · £${this.AUCTION_PLATFORM_FEE} platform fee non-refundable in all cases`,
                    },
                    unit_amount: Math.round(amount * 100),
                },
                quantity: 1,
            }],
            metadata: {
                transactionId: transaction.id,
                listingId,
                auctionId: auction.id,
                userId,
                type: 'COMMISSION',
            },
            success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/checkout/cancel?listing_id=${listingId}&type=COMMISSION`,
        });

        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { stripePaymentId: session.id },
        });
        return { url: session.url, sessionId: session.id, transactionId: transaction.id };
    }

    async createHpiSession(vrm: string, userId: string, listingId: string) {
        const stripe = await this.getStripe();
        const baseUrl = resolveFrontendUrl(this.config.get<string>('FRONTEND_URL'));
        const transaction = await this.prisma.transaction.create({
            data: {
                userId,
                listingId,
                amount: this.HPI_REPORT_PRICE,
                type: 'HPI_REPORT' as any,
                status: 'PENDING',
                description: `Comprehensive HPI Report for ${vrm}`,
            },
        });
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    product_data: { name: 'Comprehensive HPI Report', description: `Full history check for vehicle ${vrm}` },
                    unit_amount: Math.round(this.HPI_REPORT_PRICE * 100),
                },
                quantity: 1,
            }],
            metadata: { transactionId: transaction.id, userId, vrm, listingId, type: 'HPI_REPORT' },
            success_url: `${baseUrl}/sell?hpi_success=true&vrm=${vrm}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/sell?hpi_cancel=true`,
        });
        await this.prisma.transaction.update({ where: { id: transaction.id }, data: { stripePaymentId: session.id } });
        return { url: session.url };
    }

    async createHpiEmailSession(listingId: string, userId: string, returnPath: string) {
        const stripe = await this.getStripe();
        const baseUrl = resolveFrontendUrl(this.config.get<string>('FRONTEND_URL'));
        if (!/^\/(buy-cars|auctions)\//.test(returnPath)) throw new BadRequestException('Invalid return path');
        const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, select: { vrm: true } });
        if (!listing) throw new NotFoundException('Listing not found');
        const transaction = await this.prisma.transaction.create({
            data: {
                userId,
                listingId,
                amount: this.HPI_REPORT_PRICE,
                type: 'HPI_REPORT_EMAIL' as any,
                status: 'PENDING',
                description: `Vehicle history report emailed for ${listing.vrm || listingId}`,
            },
        });
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    product_data: {
                        name: 'Vehicle History Report — Emailed Copy',
                        description: 'Get this vehicle’s history report sent to your email as a PDF',
                    },
                    unit_amount: Math.round(this.HPI_REPORT_PRICE * 100),
                },
                quantity: 1,
            }],
            metadata: { transactionId: transaction.id, userId, listingId, type: 'HPI_REPORT_EMAIL' },
            success_url: `${baseUrl}${returnPath}?hpi_email_success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}${returnPath}?hpi_email_cancel=true`,
        });
        await this.prisma.transaction.update({ where: { id: transaction.id }, data: { stripePaymentId: session.id } });
        return { url: session.url };
    }

    async createListingSession(badgeTier: 'BASIC' | 'STANDARD' | 'PREMIUM', userId: string, listingId: string) {
        const actor = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
        if (actor?.role === 'ADMIN') {
            throw new BadRequestException('Admin listings are free — no listing fee is charged. Submit the listing directly.');
        }
        const listing = await this.prisma.listing.findUnique({
            where: { id: listingId },
            select: { sellerId: true, type: true, deletedAt: true, hpiReport: { select: { id: true } } },
        });
        if (!listing || listing.deletedAt) throw new NotFoundException('Listing not found');
        if (listing.sellerId !== userId) throw new ForbiddenException('You do not own this listing.');
        if (listing.type !== 'CLASSIFIED') throw new BadRequestException('Auction listings are free and do not use retail listing checkout.');
        if (!listing.hpiReport) throw new BadRequestException('A fresh HPI/history report is required before paying the Retail Listing fee.');

        const stripe = await this.getStripe();
        const baseUrl = resolveFrontendUrl(this.config.get<string>('FRONTEND_URL'));
        const amount = this.LISTING_FEES[badgeTier];
        const transaction = await this.prisma.transaction.create({
            data: { userId, listingId, amount, type: 'LISTING_FEE' as any, status: 'PENDING', description: `${badgeTier} Listing Fee` },
        });
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    product_data: { name: `CarMazium ${badgeTier} Listing`, description: 'Professional listing fee for your vehicle' },
                    unit_amount: Math.round(amount * 100),
                },
                quantity: 1,
            }],
            metadata: { transactionId: transaction.id, userId, listingId, badgeTier, type: 'LISTING_FEE' },
            success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/dashboard/user?tab=inventory`,
        });
        await this.prisma.transaction.update({ where: { id: transaction.id }, data: { stripePaymentId: session.id } });
        return { url: session.url };
    }

    async createPaymentSheet(
        listingId: string,
        userId: string,
        clientAmount: number,
        type: 'DEPOSIT' | 'FULL_PAYMENT' | 'COMMISSION' | 'LISTING_FEE' | 'HPI_REPORT' = 'COMMISSION',
        currency = 'gbp',
        badgeTier?: 'BASIC' | 'STANDARD' | 'PREMIUM',
        vrm?: string,
    ) {
        if (type === 'DEPOSIT' || type === 'FULL_PAYMENT') {
            throw new BadRequestException(
                'CarMazium does not collect vehicle deposits or purchase funds. Pay the seller directly after inspection.',
            );
        }
        const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
        if (!listing || listing.deletedAt) throw new NotFoundException(`Listing "${listingId}" not found`);
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        let amount: number;
        if (type === 'COMMISSION') {
            const auction = await this.prisma.auction.findFirst({
                where: { listingId, status: 'ENDED', deletedAt: null },
                select: { winnerId: true, buyerFeePaid: true },
            });
            if (!auction || auction.winnerId !== userId) throw new ForbiddenException('Only the winning dealer can pay this auction buyer fee.');
            if (auction.buyerFeePaid) throw new BadRequestException('The auction buyer fee has already been paid.');
            amount = this.AUCTION_BUYER_FEE;
        } else if (type === 'LISTING_FEE') {
            if (!badgeTier || !(badgeTier in this.LISTING_FEES)) {
                throw new BadRequestException('badgeTier is required and must be BASIC, STANDARD, or PREMIUM for a LISTING_FEE payment.');
            }
            amount = this.LISTING_FEES[badgeTier];
        } else {
            if (!vrm) throw new BadRequestException('vrm is required for a HPI_REPORT payment.');
            amount = this.HPI_REPORT_PRICE;
        }

        if (Math.abs(amount - clientAmount) > 0.01) {
            this.logger.warn(`Payment Sheet client amount ${clientAmount} did not match server amount ${amount} for ${type}; using server amount.`);
        }

        const stripe = await this.getStripe();
        let customerId = user.stripeCustomerId ?? null;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
                metadata: { userId },
            });
            customerId = customer.id;
            await this.prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
        }
        const ephemeralKey = await stripe.ephemeralKeys.create({ customer: customerId }, { apiVersion: '2026-02-25.clover' });
        const descriptionMap: Record<string, string> = {
            COMMISSION: `Auction buyer fee — ${listing.title}`,
            LISTING_FEE: `${badgeTier ?? ''} Listing Fee — ${listing.title}`.trim(),
            HPI_REPORT: `Comprehensive HPI Report for ${vrm}`,
        };
        const transaction = await this.prisma.transaction.create({
            data: { listingId, userId, amount, type: type as any, status: 'PENDING', description: descriptionMap[type] },
        });
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(amount * 100),
            currency,
            customer: customerId,
            automatic_payment_methods: { enabled: true },
            metadata: {
                transactionId: transaction.id,
                listingId,
                userId,
                type,
                ...(badgeTier ? { badgeTier } : {}),
                ...(vrm ? { vrm } : {}),
            },
        });
        await this.prisma.transaction.update({ where: { id: transaction.id }, data: { stripePaymentId: paymentIntent.id } });
        return {
            clientSecret: paymentIntent.client_secret,
            ephemeralKey: ephemeralKey.secret,
            customerId,
            transactionId: transaction.id,
            publishableKey: this.config.get<string>('STRIPE_PUBLISHABLE_KEY') ?? '',
        };
    }

    async getSessionStatus(sessionId: string, userId: string) {
        const stripe = await this.getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const transaction = await this.prisma.transaction.findFirst({
            where: { stripePaymentId: sessionId },
            select: { userId: true },
        });
        const kyc = await this.prisma.dealerKyc.findFirst({
            where: { stripeCheckoutSessionId: sessionId } as any,
            select: { dealerProfile: { select: { userId: true } } },
        });
        const ownerId = session.metadata?.userId || transaction?.userId || kyc?.dealerProfile?.userId;
        if (!ownerId || ownerId !== userId) throw new ForbiddenException('This payment session does not belong to you.');
        return {
            status: session.status,
            paymentStatus: session.payment_status,
            customerEmail: session.customer_details?.email ?? null,
            metadata: session.metadata,
            amountTotal: session.amount_total,
            currency: session.currency,
        };
    }

    async getPaymentHistory(userId: string) {
        return this.prisma.transaction.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: {
                listing: { select: { id: true, title: true, slug: true, images: true, make: true, model: true, year: true } },
            },
        });
    }

    async handleWebhook(rawBody: Buffer, signature: string) {
        const stripe = await this.getStripe();
        const webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
        let event: any;
        try {
            event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret!);
        } catch (err: any) {
            throw new BadRequestException(`Webhook signature verification failed: ${err.message}`);
        }

        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const { transactionId, listingId, type, boostId, kycId } = session.metadata;
                if (type === 'KYC_VERIFICATION' && kycId) {
                    await this.markKycFeePaid(kycId, session.payment_intent ?? session.id);
                }
                if (type === 'SERVICE_JOB' && session.metadata.jobId && session.metadata.paymentId) {
                    await this.markServiceJobPaid(
                        session.metadata.jobId,
                        session.metadata.paymentId,
                        typeof session.payment_intent === 'string' ? session.payment_intent : null,
                    );
                }
                if (boostId) {
                    await this.prisma.$transaction([
                        this.prisma.featuredBoost.update({
                            where: { id: boostId },
                            data: { isActive: true, stripePaymentId: session.payment_intent ?? session.id },
                        }),
                        this.prisma.listing.update({
                            where: { id: listingId },
                            data: { isFeatured: true, featuredUntil: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000) },
                        }),
                    ]);
                }
                if (transactionId) {
                    await this.prisma.transaction.update({
                        where: { id: transactionId },
                        data: { status: 'COMPLETED', stripePaymentId: session.payment_intent ?? session.id },
                    });
                }

                // Historical legacy sessions may still arrive. We honour them,
                // but no new DEPOSIT/FULL_PAYMENT session can be created above.
                if (type === 'DEPOSIT') this.notifyDepositPaid(listingId, session.metadata?.userId).catch(() => {});
                if (type === 'FULL_PAYMENT') {
                    const buyerId: string | undefined = session.metadata?.userId;
                    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, select: { sellerId: true, price: true } });
                    await this.prisma.$transaction(async (tx) => {
                        await tx.listing.update({ where: { id: listingId }, data: { status: 'SOLD' } });
                        const alreadyRecorded = await tx.sale.findFirst({ where: { listingId } });
                        if (!alreadyRecorded && listing?.sellerId) {
                            await tx.sale.create({ data: { listingId, sellerId: listing.sellerId, buyerId: buyerId ?? null, soldPrice: listing.price ?? 0 } });
                        }
                    });
                }
                if (type === 'LISTING_FEE') {
                    const badgeTier = session.metadata.badgeTier;
                    await this.prisma.listing.update({
                        where: { id: listingId },
                        data: { status: 'PENDING_REVIEW', badgeTier, rejectionReason: null },
                    });
                    this.notifyListingSubmittedForReview(listingId).catch(() => {});
                }
                if (type === 'HPI_REPORT') {
                    const { vrm } = session.metadata;
                    this.hpiService.createPendingReport(listingId, vrm, transactionId).catch(err =>
                        console.error('Failed to register HPI report request after payment:', err));
                }
                if (type === 'HPI_REPORT_EMAIL') {
                    const buyerId: string | undefined = session.metadata?.userId;
                    if (buyerId) this.hpiService.requestEmailDelivery(listingId, buyerId, transactionId).catch(err =>
                        console.error('Failed to register HPI report email delivery after payment:', err));
                }
                if (type === 'COMMISSION') {
                    const auction = await this.prisma.auction.findFirst({
                        where: { listingId, status: 'ENDED', deletedAt: null },
                        select: { id: true, winnerId: true },
                    });
                    if (auction?.winnerId === session.metadata?.userId) {
                        await this.prisma.auction.update({
                            where: { id: auction.id },
                            data: { buyerFeePaid: true, buyerFeeTransactionId: transactionId },
                        });
                    } else {
                        this.logger.error(`Refused to unlock auction ${auction?.id ?? listingId}: buyer-fee payer is not the winner.`);
                    }
                }
                break;
            }

            case 'payment_intent.succeeded': {
                const pi = event.data.object;
                const { transactionId, listingId, type, badgeTier, vrm } = pi.metadata ?? {};
                if (transactionId) {
                    await this.prisma.transaction.update({
                        where: { id: transactionId },
                        data: { status: 'COMPLETED', stripePaymentId: pi.id },
                    });
                }
                if (type === 'LISTING_FEE' && listingId) {
                    await this.prisma.listing.update({
                        where: { id: listingId },
                        data: { status: 'PENDING_REVIEW', badgeTier, rejectionReason: null },
                    });
                    this.notifyListingSubmittedForReview(listingId).catch(() => {});
                }
                if (type === 'DEPOSIT' && listingId) this.notifyDepositPaid(listingId, pi.metadata?.userId).catch(() => {});
                if (type === 'FULL_PAYMENT' && listingId) {
                    const buyerId: string | undefined = pi.metadata?.userId;
                    const listing = await this.prisma.listing.findUnique({ where: { id: listingId }, select: { sellerId: true, price: true } });
                    await this.prisma.$transaction(async (tx) => {
                        await tx.listing.update({ where: { id: listingId }, data: { status: 'SOLD' } });
                        const alreadyRecorded = await tx.sale.findFirst({ where: { listingId } });
                        if (!alreadyRecorded && listing?.sellerId) {
                            await tx.sale.create({ data: { listingId, sellerId: listing.sellerId, buyerId: buyerId ?? null, soldPrice: listing.price ?? 0 } });
                        }
                    });
                }
                if (type === 'COMMISSION' && listingId) {
                    const auction = await this.prisma.auction.findFirst({
                        where: { listingId, status: 'ENDED', deletedAt: null },
                        select: { id: true, winnerId: true },
                    });
                    if (auction?.winnerId === pi.metadata?.userId) {
                        await this.prisma.auction.update({
                            where: { id: auction.id },
                            data: { buyerFeePaid: true, buyerFeeTransactionId: transactionId },
                        });
                    }
                }
                if (type === 'HPI_REPORT' && listingId) {
                    this.hpiService.createPendingReport(listingId, vrm, transactionId).catch(err =>
                        console.error('Failed to register HPI report request after Payment Sheet payment:', err));
                }
                if (type === 'HPI_REPORT_EMAIL' && listingId) {
                    const buyerId: string | undefined = pi.metadata?.userId;
                    if (buyerId) this.hpiService.requestEmailDelivery(listingId, buyerId, transactionId).catch(err =>
                        console.error('Failed to register HPI report email delivery after Payment Sheet payment:', err));
                }
                break;
            }

            case 'checkout.session.expired': {
                const session = event.data.object;
                const { transactionId } = session.metadata ?? {};
                if (transactionId) {
                    await this.prisma.transaction.update({ where: { id: transactionId }, data: { status: 'FAILED' } });
                }
                break;
            }

            case 'account.updated': {
                const account = event.data.object as any;
                const isComplete = !!(
                    account.details_submitted && account.charges_enabled && account.payouts_enabled &&
                    (!account.requirements?.currently_due || account.requirements.currently_due.length === 0)
                );
                await this.prisma.user.updateMany({
                    where: { stripeConnectAccountId: account.id },
                    data: { stripeConnectOnboardingComplete: isComplete },
                });
                break;
            }
        }
        return { received: true };
    }

    private async markKycFeePaid(kycId: string, stripePaymentId: string) {
        const kyc = await this.prisma.dealerKyc.findUnique({ where: { id: kycId }, include: { dealerProfile: true } });
        if (!kyc || (kyc as any).stripeChargedAt) return;
        const existingStatuses = (kyc.documentStatuses as Record<string, any>) || {};
        await this.prisma.dealerKyc.update({
            where: { id: kycId },
            data: {
                stripeChargedAt: new Date(),
                stripePaymentIntentId: stripePaymentId,
                documentStatuses: {
                    ...existingStatuses,
                    paymentReference: { status: 'APPROVED', note: 'Stripe verified' },
                    paymentScreenshot: { status: 'APPROVED', note: 'Stripe verified' },
                },
            } as any,
        });
        const companyName = kyc.dealerProfile?.companyName ?? 'A dealer';
        const admins = await this.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, email: true } });
        await Promise.all(admins.map(admin => this.notificationsService.create({
            userId: admin.id,
            type: 'SYSTEM',
            title: 'Dealer KYC Submitted — £1 Verification Paid',
            message: `${companyName} has paid the £1 KYC verification fee and is ready for review.`,
            data: { kycId, stripePaymentId, companyName },
            link: '/admin/kyc',
        }).catch(() => {})));
        const adminEmails = admins.map(a => a.email).filter(Boolean);
        if (adminEmails.length > 0) await this.emailService.sendKycSubmissionAdminAlert(adminEmails, companyName).catch(() => {});
    }

    async applyKycFee(sessionId: string, userId: string): Promise<{ applied: boolean }> {
        const kyc = await this.prisma.dealerKyc.findFirst({
            where: { stripeCheckoutSessionId: sessionId } as any,
            include: { dealerProfile: { select: { userId: true } } },
        });
        if (!kyc) return { applied: false };
        if (kyc.dealerProfile.userId !== userId) throw new ForbiddenException('This KYC payment does not belong to you.');
        if ((kyc as any).stripeChargedAt) return { applied: true };
        const stripe = await this.getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid') return { applied: false };
        await this.markKycFeePaid(kyc.id, (session.payment_intent as string) ?? session.id);
        return { applied: true };
    }

    async applyAuctionFee(sessionId: string, userId: string): Promise<{ applied: boolean }> {
        const transaction = await this.prisma.transaction.findFirst({
            where: { stripePaymentId: sessionId, type: 'COMMISSION' as any },
        });
        if (!transaction) return { applied: false };
        if (transaction.userId !== userId) throw new ForbiddenException('This auction-fee payment does not belong to you.');

        const auction = await this.prisma.auction.findFirst({
            where: { listingId: transaction.listingId, status: 'ENDED', deletedAt: null },
        });
        if (!auction || auction.winnerId !== userId) throw new ForbiddenException('Only the winning dealer can apply this auction fee.');
        if (transaction.status === 'COMPLETED' && auction.buyerFeePaid) return { applied: true };

        const stripe = await this.getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid') return { applied: false };
        if (session.metadata?.userId && session.metadata.userId !== userId) {
            throw new ForbiddenException('Stripe payment owner mismatch.');
        }

        await this.prisma.$transaction([
            this.prisma.transaction.update({ where: { id: transaction.id }, data: { status: 'COMPLETED' } }),
            this.prisma.auction.update({
                where: { id: auction.id },
                data: { buyerFeePaid: true, buyerFeeTransactionId: transaction.id },
            }),
        ]);
        return { applied: true };
    }

    async applyHpiFee(sessionId: string, userId: string): Promise<{ applied: boolean }> {
        const transaction = await this.prisma.transaction.findFirst({ where: { stripePaymentId: sessionId, type: 'HPI_REPORT' as any } });
        if (!transaction) return { applied: false };
        if (transaction.userId !== userId) throw new ForbiddenException('This HPI payment does not belong to you.');
        if (transaction.status === 'COMPLETED' && transaction.listingId) {
            const existing = await this.prisma.hpiReport.findUnique({ where: { listingId: transaction.listingId } });
            if (existing) return { applied: true };
        }
        const stripe = await this.getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid') return { applied: false };
        await this.prisma.transaction.update({ where: { id: transaction.id }, data: { status: 'COMPLETED' } });
        const vrm = session.metadata?.vrm;
        if (!transaction.listingId || !vrm) return { applied: false };
        try {
            await this.hpiService.createPendingReport(transaction.listingId, vrm, transaction.id);
        } catch (err) {
            console.error('Failed to register HPI report request in applyHpiFee fallback:', err);
            return { applied: false };
        }
        return { applied: true };
    }

    async applyHpiEmailFee(sessionId: string, userId: string): Promise<{ applied: boolean }> {
        const transaction = await this.prisma.transaction.findFirst({ where: { stripePaymentId: sessionId, type: 'HPI_REPORT_EMAIL' as any } });
        if (!transaction) return { applied: false };
        if (transaction.userId !== userId) throw new ForbiddenException('This HPI email payment does not belong to you.');
        if (transaction.status === 'COMPLETED') {
            const already = await this.prisma.hpiReportEmailRequest.findFirst({ where: { transactionId: transaction.id } });
            if (already) return { applied: true };
        }
        const stripe = await this.getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid') return { applied: false };
        await this.prisma.transaction.update({ where: { id: transaction.id }, data: { status: 'COMPLETED' } });
        const buyerId = session.metadata?.userId;
        if (!transaction.listingId || !buyerId || buyerId !== userId) return { applied: false };
        try {
            await this.hpiService.requestEmailDelivery(transaction.listingId, buyerId, transaction.id);
        } catch (err) {
            console.error('Failed to register HPI report email delivery in applyHpiEmailFee fallback:', err);
            return { applied: false };
        }
        return { applied: true };
    }

    /**
     * Refund the £100 refundable portion of the £125 auction buyer fee.
     * The £25 platform fee remains non-refundable in all cases.
     *
     * IMPORTANT: proof rejection is not a failed sale. The admin proof-review
     * path intentionally calls this method without a failure reason; that call
     * is a no-op so the seller can resubmit proof without accidentally refunding
     * the buyer. Only an explicit failed/cancelled-sale action may pass
     * reason='FAILED_SALE'.
     *
     * The original £125 COMMISSION row remains COMPLETED. A separate negative
     * £100 REFUND ledger row preserves net CarMazium revenue of £25.
     */
    async issueRefundForAuction(auctionId: string, reason?: 'FAILED_SALE'): Promise<void> {
        if (reason !== 'FAILED_SALE') {
            this.logger.warn(`Ignored auction refund request for ${auctionId}: no explicit failed-sale reason supplied.`);
            return;
        }

        const auction = await this.prisma.auction.findUnique({ where: { id: auctionId } });
        if (!auction?.buyerFeeTransactionId || !auction.buyerFeePaid) return;
        if (auction.sellerBonusReleased) {
            throw new BadRequestException('Cannot refund the auction buyer fee after the seller bonus has been released.');
        }

        const transaction = await this.prisma.transaction.findUnique({ where: { id: auction.buyerFeeTransactionId } });
        if (!transaction?.stripePaymentId || transaction.type !== ('COMMISSION' as any)) return;

        const refundDescription = `£100 auction buyer-fee refund for auction ${auctionId}; original ${transaction.id}`;
        const existing = await this.prisma.transaction.findFirst({
            where: {
                listingId: transaction.listingId,
                userId: transaction.userId,
                type: 'REFUND' as any,
                description: refundDescription,
                status: 'COMPLETED',
            },
        });
        if (existing) return;

        const stripe = await this.getStripe();
        const session = await stripe.checkout.sessions.retrieve(transaction.stripePaymentId);
        const paymentIntentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
        if (!paymentIntentId) throw new BadRequestException('No Stripe payment intent found for the auction buyer fee.');

        const refund = await stripe.refunds.create(
            { payment_intent: paymentIntentId, amount: 10000 },
            { idempotencyKey: `auction-buyer-fee-refund-${transaction.id}` },
        );
        await this.prisma.transaction.create({
            data: {
                listingId: transaction.listingId,
                userId: transaction.userId,
                amount: -100,
                type: 'REFUND' as any,
                status: 'COMPLETED',
                stripePaymentId: refund.id,
                description: refundDescription,
            },
        });
    }

    async issueSellerPayout(stripeConnectAccountId: string, amountPence = 10000): Promise<string> {
        const stripe = await this.getStripe();
        const transfer = await stripe.transfers.create({ amount: amountPence, currency: 'gbp', destination: stripeConnectAccountId });
        return transfer.id;
    }
}
