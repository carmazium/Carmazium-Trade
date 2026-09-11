import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { HpiService } from '../hpi/hpi.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { EmailService } from '../email/email.service';
import { resolveFrontendUrl } from '../core/frontend-url';
import { Prisma } from '@prisma/client';

@Injectable()
export class PaymentsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly hpiService: HpiService,
        private readonly notificationsService: NotificationsService,
        private readonly notificationsGateway: NotificationsGateway,
        private readonly emailService: EmailService,
    ) {}

    /** Ensure a paid classified listing enters the same mandatory HPI queue as a free auction listing. */
    private async queueMandatoryHpiReview(listingId: string) {
        const listing = await this.prisma.listing.findUnique({
            where: { id: listingId },
            select: { vrm: true },
        });
        if (!listing) return;
        await this.hpiService.createPendingReport(listingId, listing.vrm ?? '');
    }

    /**
     * Notify a seller in-app that their listing fee payment went through and the
     * listing is now awaiting admin review. Best-effort — must never block the
     * webhook handler that triggered it.
     */
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
            if (notification) {
                this.notificationsGateway.sendNotification(listing.sellerId, notification);
            }
        } catch {
            // best-effort only
        }
    }

    /**
     * Notify a seller that a buyer has paid the £500 refundable deposit on
     * their listing. This used to be entirely missing — a completed DEPOSIT
     * payment only updated the Transaction row, with no reaction anywhere
     * else, so the seller had no way of knowing anyone had paid a deposit.
     */
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
                message: `${buyerName} has paid a £500 refundable deposit to secure "${listing.title}". Get in touch with them to arrange next steps.`,
                link: '/dashboard/seller/listings',
                entityType: 'Listing',
                entityId: listing.id,
            }).catch(() => null);
            if (notification) {
                this.notificationsGateway.sendNotification(listing.sellerId, notification);
            }
        } catch {
            // best-effort only
        }
    }

    // Prices in GBP
    private readonly HPI_REPORT_PRICE = 9.99;
    private readonly LISTING_FEES = {
        BASIC: 1.00,  // £1 one-off
        STANDARD: 10.00,
        PREMIUM: 25.00,
    };
    private readonly BOOST_PRICE = 25.00;
    // £500 refundable deposit — matches the web checkout page's DEPOSIT_AMOUNT
    // constant (src/app/checkout/page.tsx). Not listing-dependent.
    private readonly DEPOSIT_AMOUNT = 500;

    /**
     * Lazily create a Stripe SDK instance.
     */
    private async getStripe() {
        const Stripe = (await import('stripe')).default;
        return new Stripe(this.config.get<string>('STRIPE_SECRET_KEY')!, {
            apiVersion: '2026-02-25.clover',
        });
    }

    /**
     * True when the configured secret key is a test-mode key.
     * Used to skip actions that can't work in sandbox (e.g. transfers to live-mode
     * Connect accounts) without needing a separate feature flag — automatically
     * flips back off when the live key is restored.
     */
    isStripeInTestMode(): boolean {
        const key = this.config.get<string>('STRIPE_SECRET_KEY') ?? '';
        return key.startsWith('sk_test_');
    }

    /**
     * Create a Stripe Checkout Session for a vehicle purchase or deposit.
     */
    private readonly AUCTION_BUYER_FEE = 125;

    async createCheckoutSession(
        listingId: string,
        userId: string,
        clientAmount: number,
        type: 'DEPOSIT' | 'FULL_PAYMENT' | 'COMMISSION' = 'FULL_PAYMENT',
        currency = 'gbp',
    ) {
        const listing = await this.prisma.listing.findUnique({
            where: { id: listingId },
        });

        if (!listing || listing.deletedAt) {
            throw new NotFoundException(`Listing "${listingId}" not found`);
        }

        // Re-derive the real charge amount server-side instead of trusting the
        // client-supplied `clientAmount` — same fix as createPaymentSheet (F2);
        // see that method's comment for the full rationale. `clientAmount` is
        // kept only as a mismatch-detection log, never used for the actual charge.
        let amount: number;
        switch (type) {
            case 'FULL_PAYMENT':
                amount = Number(listing.price);
                break;
            case 'COMMISSION':
                amount = this.AUCTION_BUYER_FEE;
                break;
            case 'DEPOSIT':
            default:
                amount = this.DEPOSIT_AMOUNT;
                break;
        }

        if (Math.abs(amount - clientAmount) > 0.01) {
            console.warn(
                `[PaymentsService.createCheckoutSession] client-supplied amount (${clientAmount}) did not match server-derived amount (${amount}) for type=${type} listing=${listingId} user=${userId} — using the server-derived amount.`,
            );
        }

        const stripe = await this.getStripe();
        const baseUrl = resolveFrontendUrl(this.config.get<string>('FRONTEND_URL') || this.config.get<string>('NEXT_PUBLIC_BASE_URL'));

        const descriptionMap: Record<string, string> = {
            DEPOSIT: `Refundable deposit for ${listing.title}`,
            FULL_PAYMENT: `Full payment for ${listing.title}`,
            COMMISSION: `£${this.AUCTION_BUYER_FEE} CarMazium auction buyer fee — ${listing.title}`,
        };

        const transaction = await this.prisma.transaction.create({
            data: {
                listingId,
                userId,
                amount,
                type: type as any,
                status: 'PENDING',
                description: descriptionMap[type] ?? `Payment for ${listing.title}`,
            },
        });

        const productNameMap: Record<string, string> = {
            DEPOSIT: listing.title,
            FULL_PAYMENT: listing.title,
            COMMISSION: 'Auction Buyer Fee — Carmazium',
        };

        const productDescMap: Record<string, string> = {
            DEPOSIT: 'Refundable deposit — secures your vehicle',
            FULL_PAYMENT: `Full payment for ${listing.make || ''} ${listing.model || ''} ${listing.year || ''}`.trim(),
            COMMISSION: `£${this.AUCTION_BUYER_FEE} CarMazium auction buyer fee · seller incentive is funded separately by CarMazium`,
        };

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: [
                {
                    price_data: {
                        currency,
                        product_data: {
                            name: productNameMap[type] ?? listing.title,
                            description: productDescMap[type],
                            ...(type !== 'COMMISSION' && listing.images?.[0] && !listing.images[0].includes('example.com')
                                ? { images: [listing.images[0]] }
                                : {}),
                        },
                        unit_amount: Math.round(amount * 100),
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                transactionId: transaction.id,
                listingId,
                userId,
                type,
            },
            success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/checkout/cancel?listing_id=${listingId}&type=${type}`,
        });

        // Store Stripe session ID for reconciliation
        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { stripePaymentId: session.id },
        });

        return {
            url: session.url,
            sessionId: session.id,
            transactionId: transaction.id,
        };
    }

    /**
     * Create a Stripe Checkout Session for an HPI Report.
     */
    async createHpiSession(vrm: string, userId: string, listingId: string) {
        const stripe = await this.getStripe();
        const baseUrl = resolveFrontendUrl(this.config.get<string>('FRONTEND_URL'));

        // Create a pending transaction record
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
            line_items: [
                {
                    price_data: {
                        currency: 'gbp',
                        product_data: {
                            name: 'Comprehensive HPI Report',
                            description: `Full history check for vehicle ${vrm}`,
                        },
                        unit_amount: Math.round(this.HPI_REPORT_PRICE * 100),
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                transactionId: transaction.id,
                userId,
                vrm,
                listingId,
                type: 'HPI_REPORT',
            },
            success_url: `${baseUrl}/sell?hpi_success=true&vrm=${vrm}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/sell?hpi_cancel=true`,
        });

        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { stripePaymentId: session.id },
        });

        return { url: session.url };
    }

    /**
     * Create a Stripe Checkout Session for a buyer paying to have an HPI
     * report emailed to them personally. Distinct from createHpiSession
     * above (the seller's request-a-report payment) — same £9.99 price,
     * different metadata type, different return destination.
     *
     * returnPath comes from the frontend (whichever page the buyer was on —
     * buy-cars, live auction, or won auction) rather than a fixed URL like
     * the seller flow uses, since this action is available from three
     * different pages. Restricted to known-safe internal paths so it can't
     * be used as an open redirect.
     */
    async createHpiEmailSession(listingId: string, userId: string, returnPath: string) {
        const stripe = await this.getStripe();
        const baseUrl = resolveFrontendUrl(this.config.get<string>('FRONTEND_URL'));

        if (!/^\/(buy-cars|auctions)\//.test(returnPath)) {
            throw new BadRequestException('Invalid return path');
        }

        const listing = await this.prisma.listing.findUnique({
            where: { id: listingId },
            select: { vrm: true },
        });
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
            line_items: [
                {
                    price_data: {
                        currency: 'gbp',
                        product_data: {
                            name: 'Vehicle History Report — Emailed Copy',
                            description: 'Get this vehicle’s history report sent to your email as a PDF',
                        },
                        unit_amount: Math.round(this.HPI_REPORT_PRICE * 100),
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                transactionId: transaction.id,
                userId,
                listingId,
                type: 'HPI_REPORT_EMAIL',
            },
            success_url: `${baseUrl}${returnPath}?hpi_email_success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}${returnPath}?hpi_email_cancel=true`,
        });

        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { stripePaymentId: session.id },
        });

        return { url: session.url };
    }

    /**
     * Create a Stripe Checkout Session for a Listing Badge Fee.
     */
    async createListingSession(badgeTier: 'BASIC' | 'STANDARD' | 'PREMIUM', userId: string, listingId: string) {
        // Admins never pay a listing fee (see ListingsService.publishListing).
        // In the normal flow they never reach here, because publishListing
        // returns pendingReview and the wizard skips checkout — but refusing
        // here too means a stale client, a direct API call, or a future caller
        // can't accidentally charge an admin.
        const actor = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });
        if (actor?.role === 'ADMIN') {
            throw new BadRequestException(
                'Admin listings are free — no listing fee is charged. Submit the listing directly.',
            );
        }

        const stripe = await this.getStripe();
        const baseUrl = resolveFrontendUrl(this.config.get<string>('FRONTEND_URL'));
        const amount = this.LISTING_FEES[badgeTier];

        // Create a pending transaction record
        const transaction = await this.prisma.transaction.create({
            data: {
                userId,
                listingId,
                amount,
                type: 'LISTING_FEE' as any,
                status: 'PENDING',
                description: `${badgeTier} Listing Fee`,
            },
        });

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: [
                {
                    price_data: {
                        currency: 'gbp',
                        product_data: {
                            name: `CarMazium ${badgeTier} Listing`,
                            description: `Professional listing fee for your vehicle`,
                        },
                        unit_amount: Math.round(amount * 100),
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                transactionId: transaction.id,
                userId,
                listingId,
                badgeTier,
                type: 'LISTING_FEE',
            },
            success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/dashboard/user?tab=inventory`,
        });

        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { stripePaymentId: session.id },
        });

        return { url: session.url };
    }
    /**
     * Create a Stripe PaymentIntent + EphemeralKey for the React Native Payment Sheet.
     * Returns clientSecret, ephemeralKey, customerId, and a transactionId for tracking.
     */
    async createPaymentSheet(
        listingId: string,
        userId: string,
        clientAmount: number,
        type: 'DEPOSIT' | 'FULL_PAYMENT' | 'COMMISSION' | 'LISTING_FEE' | 'HPI_REPORT' = 'FULL_PAYMENT',
        currency = 'gbp',
        badgeTier?: 'BASIC' | 'STANDARD' | 'PREMIUM',
        vrm?: string,
    ) {
        const listing = await this.prisma.listing.findUnique({
            where: { id: listingId },
        });
        if (!listing || listing.deletedAt) {
            throw new NotFoundException(`Listing "${listingId}" not found`);
        }

        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        // Re-derive the real charge amount server-side instead of trusting the
        // client-supplied `clientAmount` — without this, a modified client could
        // request a Payment Sheet for an arbitrary (e.g. £1) amount against a real
        // listing/auction and only ever be charged that. `clientAmount` is kept
        // only as a mismatch-detection log, never used to set the actual charge.
        let amount: number;
        switch (type) {
            case 'FULL_PAYMENT':
                amount = Number(listing.price);
                break;
            case 'LISTING_FEE':
                if (!badgeTier || !(badgeTier in this.LISTING_FEES)) {
                    throw new BadRequestException('badgeTier is required and must be BASIC, STANDARD, or PREMIUM for a LISTING_FEE payment.');
                }
                amount = this.LISTING_FEES[badgeTier];
                break;
            case 'COMMISSION':
                amount = this.AUCTION_BUYER_FEE;
                break;
            case 'HPI_REPORT':
                if (!vrm) {
                    throw new BadRequestException('vrm is required for a HPI_REPORT payment.');
                }
                amount = this.HPI_REPORT_PRICE;
                break;
            case 'DEPOSIT':
            default:
                amount = this.DEPOSIT_AMOUNT;
                break;
        }

        if (Math.abs(amount - clientAmount) > 0.01) {
            console.warn(
                `[PaymentsService.createPaymentSheet] client-supplied amount (${clientAmount}) did not match server-derived amount (${amount}) for type=${type} badgeTier=${badgeTier ?? 'n/a'} listing=${listingId} user=${userId} — using the server-derived amount.`,
            );
        }

        const stripe = await this.getStripe();

        // Get or create Stripe Customer for this user
        let customerId = user.stripeCustomerId ?? null;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
                metadata: { userId },
            });
            customerId = customer.id;
            await this.prisma.user.update({
                where: { id: userId },
                data: { stripeCustomerId: customerId },
            });
        }

        // Create Ephemeral Key (required for Payment Sheet saved cards)
        const ephemeralKey = await stripe.ephemeralKeys.create(
            { customer: customerId },
            { apiVersion: '2026-02-25.clover' },
        );

        const descriptionMap: Record<string, string> = {
            DEPOSIT: `Refundable deposit for ${listing.title}`,
            FULL_PAYMENT: `Full payment for ${listing.title}`,
            COMMISSION: `Auction buyer fee — ${listing.title}`,
            LISTING_FEE: `${badgeTier ?? ''} Listing Fee — ${listing.title}`.trim(),
            HPI_REPORT: `Comprehensive HPI Report for ${vrm}`,
        };

        // Create a pending transaction record first (we'll store the PI id after)
        const transaction = await this.prisma.transaction.create({
            data: {
                listingId,
                userId,
                amount,
                type: type as any,
                status: 'PENDING',
                description: descriptionMap[type] ?? `Payment for ${listing.title}`,
            },
        });

        // Create Payment Intent
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
                // Only present for LISTING_FEE — the payment_intent.succeeded webhook
                // handler needs this to know which tier to activate the listing at.
                ...(badgeTier ? { badgeTier } : {}),
                // Only present for HPI_REPORT — the webhook needs this to know
                // which VRM to run the check against.
                ...(vrm ? { vrm } : {}),
            },
        });

        // Store Payment Intent ID for reconciliation
        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { stripePaymentId: paymentIntent.id },
        });

        return {
            clientSecret: paymentIntent.client_secret,
            ephemeralKey: ephemeralKey.secret,
            customerId,
            transactionId: transaction.id,
            publishableKey: this.config.get<string>('STRIPE_PUBLISHABLE_KEY') ?? '',
        };
    }

    async getSessionStatus(sessionId: string) {
        const stripe = await this.getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        return {
            status: session.status,
            paymentStatus: session.payment_status,
            customerEmail: session.customer_details?.email ?? null,
            metadata: session.metadata,
            amountTotal: session.amount_total,
            currency: session.currency,
        };
    }

    /**
     * Get payment history for a user.
     */
    async getPaymentHistory(userId: string) {
        return this.prisma.transaction.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            include: {
                listing: {
                    select: {
                        id: true,
                        title: true,
                        slug: true,
                        images: true,
                        make: true,
                        model: true,
                        year: true,
                    },
                },
            },
        });
    }

    /**
     * Create Stripe Checkout for a locked TradeXchange transaction. The quote
     * amount and 9% fee were calculated by the database when the customer
     * accepted the offer, so no monetary value is accepted from the browser.
     */
    async createTradeXchangeCheckout(jobId: string, userId: string) {
        if (!jobId) throw new BadRequestException('jobId is required');

        const rows = await this.prisma.$queryRaw<Array<{
            id: string;
            job_id: string;
            customer_user_id: string;
            gross_amount_pence: number;
            payment_status: string;
            stripe_checkout_session_id: string | null;
            title: string;
        }>>(Prisma.sql`
            SELECT t.id, t.job_id, t.customer_user_id, t.gross_amount_pence,
                   t.payment_status, t.stripe_checkout_session_id, j.title
            FROM public.tradexchange_transactions t
            JOIN public.tradexchange_jobs j ON j.id = t.job_id
            WHERE t.job_id = ${jobId}::uuid
              AND t.customer_user_id = ${userId}
            LIMIT 1
        `);
        const transaction = rows[0];
        if (!transaction) {
            throw new NotFoundException('No accepted TradeXchange quote was found for this job');
        }
        if (transaction.payment_status === 'paid') {
            throw new BadRequestException('This TradeXchange service has already been paid');
        }

        const stripe = await this.getStripe();
        if (transaction.stripe_checkout_session_id) {
            try {
                const existing = await stripe.checkout.sessions.retrieve(transaction.stripe_checkout_session_id);
                if (existing.status === 'open' && existing.url) {
                    return { url: existing.url, sessionId: existing.id, transactionId: transaction.id };
                }
                if (existing.status === 'complete' && existing.payment_status === 'paid') {
                    await this.settleTradeXchangeSession(existing);
                    throw new BadRequestException('This TradeXchange service has already been paid');
                }
            } catch (err: any) {
                if (err instanceof BadRequestException) throw err;
                // Expired/deleted Stripe sessions are replaced below.
            }
        }

        const baseUrl = resolveFrontendUrl(this.config.get<string>('FRONTEND_URL') || this.config.get<string>('NEXT_PUBLIC_BASE_URL'));
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    unit_amount: transaction.gross_amount_pence,
                    product_data: {
                        name: 'CarMazium TradeXchange service',
                        description: transaction.title,
                    },
                },
                quantity: 1,
            }],
            ...(user?.email ? { customer_email: user.email } : {}),
            client_reference_id: transaction.id,
            metadata: {
                type: 'TRADEXCHANGE_SERVICE',
                transactionId: transaction.id,
                jobId: transaction.job_id,
                userId: transaction.customer_user_id,
            },
            payment_intent_data: {
                metadata: {
                    type: 'TRADEXCHANGE_SERVICE',
                    transactionId: transaction.id,
                    jobId: transaction.job_id,
                },
            },
            success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/services?tab=jobs&payment=cancelled`,
        }, { idempotencyKey: `tradexchange-${transaction.id}-${transaction.stripe_checkout_session_id || 'initial'}` });

        await this.prisma.$executeRaw(Prisma.sql`
            UPDATE public.tradexchange_transactions
            SET stripe_checkout_session_id = ${session.id}, updated_at = now()
            WHERE id = ${transaction.id}::uuid AND payment_status = 'pending'
        `);

        return { url: session.url, sessionId: session.id, transactionId: transaction.id };
    }

    /** Stripe-verified TradeXchange settlement. Safe to call repeatedly. */
    private async settleTradeXchangeSession(session: any) {
        const metadata = session.metadata ?? {};
        const transactionId = metadata.transactionId;
        const jobId = metadata.jobId;
        const customerUserId = metadata.userId;
        if (!transactionId || !jobId || !customerUserId) {
            throw new BadRequestException('TradeXchange checkout metadata is incomplete');
        }
        if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
            return false;
        }
        const amountTotal = Number(session.amount_total ?? 0);
        const currency = String(session.currency ?? '').toUpperCase();
        const paymentIntentId = typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent?.id ?? null;

        const result = await this.prisma.$queryRaw<Array<{ settled: boolean }>>(Prisma.sql`
            SELECT public.tradexchange_settle_checkout(
                ${transactionId}::uuid,
                ${session.id},
                ${jobId}::uuid,
                ${customerUserId},
                ${currency},
                ${amountTotal},
                ${paymentIntentId}
            ) AS settled
        `);
        return result[0]?.settled ?? false;
    }

    /**
     * Webhook-delay fallback for the authenticated customer. Stripe is queried
     * directly, so a browser redirect alone can never mark a service as paid.
     */
    async applyTradeXchangePayment(sessionId: string, userId: string) {
        const stripe = await this.getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        const metadata = session.metadata ?? {};
        if (metadata.type !== 'TRADEXCHANGE_SERVICE' || metadata.userId !== userId) {
            throw new BadRequestException('This checkout session is not your TradeXchange payment');
        }
        if (session.payment_status !== 'paid' && session.payment_status !== 'no_payment_required') {
            return { applied: false, paymentStatus: session.payment_status };
        }
        const applied = await this.settleTradeXchangeSession(session);
        return { applied, paymentStatus: session.payment_status };
    }

    /**
     * Handle Stripe webhook events with signature verification.
     */
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
                const { transactionId, listingId, type, boostId, kycId } = session.metadata ?? {};

                // TradeXchange transactions live in their own ledger, not the
                // vehicle-payment Transaction table below. Settle and stop here.
                if (type === 'TRADEXCHANGE_SERVICE') {
                    await this.settleTradeXchangeSession(session);
                    break;
                }

                // 0. Handle Dealer KYC £1 verification fee
                if (type === 'KYC_VERIFICATION' && kycId) {
                    await this.markKycFeePaid(kycId, session.payment_intent ?? session.id);
                }

                // 1. Handle Featured Boost (from FeaturedBoostService)
                if (boostId) {
                    await this.prisma.$transaction([
                        this.prisma.featuredBoost.update({
                            where: { id: boostId },
                            data: {
                                isActive: true,
                                stripePaymentId: session.payment_intent ?? session.id,
                            },
                        }),
                        this.prisma.listing.update({
                            where: { id: listingId },
                            data: {
                                isFeatured: true,
                                featuredUntil: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
                            },
                        }),
                    ]);
                }

                // 2. Handle Transaction Record
                if (transactionId) {
                    await this.prisma.transaction.update({
                        where: { id: transactionId },
                        data: {
                            status: 'COMPLETED',
                            stripePaymentId: session.payment_intent ?? session.id,
                        },
                    });
                }

                // 3. Handle Specific Types
                if (type === 'DEPOSIT') {
                    // Previously a no-op beyond marking the Transaction COMPLETED above —
                    // the seller was never told a buyer had paid a deposit on their listing.
                    this.notifyDepositPaid(listingId, session.metadata?.userId).catch(() => {});
                }

                if (type === 'FULL_PAYMENT') {
                    const buyerId: string | undefined = session.metadata?.userId;
                    const listing = await this.prisma.listing.findUnique({
                        where: { id: listingId },
                        select: { sellerId: true, price: true },
                    });
                    await this.prisma.$transaction(async (tx) => {
                        await tx.listing.update({
                            where: { id: listingId },
                            data: { status: 'SOLD' },
                        });
                        // Create Sale record so earnings dashboard reflects this purchase
                        const alreadyRecorded = await tx.sale.findFirst({ where: { listingId } });
                        if (!alreadyRecorded && listing?.sellerId) {
                            await tx.sale.create({
                                data: {
                                    listingId,
                                    sellerId: listing.sellerId,
                                    buyerId: buyerId ?? null,
                                    soldPrice: listing.price ?? 0,
                                },
                            });
                        }
                    });
                }

                if (type === 'LISTING_FEE') {
                    const badgeTier = session.metadata.badgeTier;

                    // Payment doesn't publish the listing — it moves to PENDING_REVIEW
                    // and only goes live once an admin approves it. isFeatured/
                    // featuredUntil (for PREMIUM) are set at approval time instead, so
                    // sellers don't lose boost days while sitting in the review queue.
                    await this.prisma.listing.update({
                        where: { id: listingId },
                        data: {
                            status: 'PENDING_REVIEW',
                            badgeTier,
                            rejectionReason: null,
                        },
                    });
                    await this.queueMandatoryHpiReview(listingId);
                    this.notifyListingSubmittedForReview(listingId).catch(() => { });
                }

                if (type === 'HPI_REPORT') {
                    const { vrm } = session.metadata;
                    // Reports are prepared by an admin, so payment only registers
                    // the request — it no longer produces the report itself.
                    this.hpiService.createPendingReport(listingId, vrm, transactionId).catch(err => {
                        console.error('Failed to register HPI report request after payment:', err);
                    });
                }

                if (type === 'HPI_REPORT_EMAIL') {
                    const buyerId: string | undefined = session.metadata?.userId;
                    if (buyerId) {
                        // Delivers immediately if the report's already done, or
                        // queues delivery for when an admin finishes it.
                        this.hpiService.requestEmailDelivery(listingId, buyerId, transactionId).catch(err => {
                            console.error('Failed to register HPI report email delivery after payment:', err);
                        });
                    }
                }

                // Auction buyer fee paid — mark auction and record transaction ID
                if (type === 'COMMISSION') {
                    const auction = await this.prisma.auction.findFirst({
                        where: { listingId, status: 'ENDED', deletedAt: null },
                    });
                    if (auction) {
                        await this.prisma.auction.update({
                            where: { id: auction.id },
                            data: {
                                buyerFeePaid: true,
                                buyerFeeTransactionId: transactionId,
                            },
                        });
                    }
                }
                break;
            }

            // ── Payment Sheet (native SDK) ──────────────────────────
            case 'payment_intent.succeeded': {
                const pi = event.data.object;
                const { transactionId, listingId, type, badgeTier, vrm } = pi.metadata ?? {};

                if (transactionId) {
                    await this.prisma.transaction.update({
                        where: { id: transactionId },
                        data: {
                            status: 'COMPLETED',
                            stripePaymentId: pi.id,
                        },
                    });
                }

                if (type === 'LISTING_FEE' && listingId) {
                    // Same review gate as the web checkout.session.completed path above.
                    await this.prisma.listing.update({
                        where: { id: listingId },
                        data: {
                            status: 'PENDING_REVIEW',
                            badgeTier,
                            rejectionReason: null,
                        },
                    });
                    await this.queueMandatoryHpiReview(listingId);
                    this.notifyListingSubmittedForReview(listingId).catch(() => { });
                }

                if (type === 'DEPOSIT' && listingId) {
                    this.notifyDepositPaid(listingId, pi.metadata?.userId).catch(() => {});
                }

                if (type === 'FULL_PAYMENT' && listingId) {
                    const buyerId: string | undefined = pi.metadata?.userId;
                    const listing = await this.prisma.listing.findUnique({
                        where: { id: listingId },
                        select: { sellerId: true, price: true },
                    });
                    await this.prisma.$transaction(async (tx) => {
                        await tx.listing.update({
                            where: { id: listingId },
                            data: { status: 'SOLD' },
                        });
                        const alreadyRecorded = await tx.sale.findFirst({ where: { listingId } });
                        if (!alreadyRecorded && listing?.sellerId) {
                            await tx.sale.create({
                                data: {
                                    listingId,
                                    sellerId: listing.sellerId,
                                    buyerId: buyerId ?? null,
                                    soldPrice: listing.price ?? 0,
                                },
                            });
                        }
                    });
                }

                if (type === 'COMMISSION' && listingId) {
                    const auction = await this.prisma.auction.findFirst({
                        where: { listingId, status: 'ENDED', deletedAt: null },
                    });
                    if (auction) {
                        await this.prisma.auction.update({
                            where: { id: auction.id },
                            data: {
                                buyerFeePaid: true,
                                buyerFeeTransactionId: transactionId,
                            },
                        });
                    }
                }

                if (type === 'HPI_REPORT' && listingId) {
                    this.hpiService.createPendingReport(listingId, vrm, transactionId).catch(err => {
                        console.error('Failed to register HPI report request after Payment Sheet payment:', err);
                    });
                }

                if (type === 'HPI_REPORT_EMAIL' && listingId) {
                    const buyerId: string | undefined = pi.metadata?.userId;
                    if (buyerId) {
                        this.hpiService.requestEmailDelivery(listingId, buyerId, transactionId).catch(err => {
                            console.error('Failed to register HPI report email delivery after Payment Sheet payment:', err);
                        });
                    }
                }
                break;
            }

            case 'checkout.session.expired': {
                const session = event.data.object;
                const { transactionId } = session.metadata ?? {};
                if (transactionId) {
                    await this.prisma.transaction.update({
                        where: { id: transactionId },
                        data: { status: 'FAILED' },
                    });
                }
                break;
            }

            // Mark seller's Connect onboarding complete as soon as Stripe confirms it.
            // This fires when the seller finishes Stripe's hosted onboarding flow,
            // covering the case where they close the tab before our return_url fires.
            case 'account.updated': {
                const account = event.data.object as any;
                const isComplete = !!(
                    account.details_submitted &&
                    account.charges_enabled &&
                    account.payouts_enabled &&
                    (!account.requirements?.currently_due || account.requirements.currently_due.length === 0)
                );
                // Update in both directions — Stripe can re-add requirements after the fact
                await this.prisma.user.updateMany({
                    where: { stripeConnectAccountId: account.id },
                    data: { stripeConnectOnboardingComplete: isComplete },
                });
                break;
            }
        }

        return { received: true };
    }

    /**
     * Mark a dealer's £1 KYC verification fee as paid and notify admins.
     * Called from the webhook (primary path) and applyKycFee (fallback path) — both
     * routes converge here so the side effects only ever fire once per dealer.
     */
    private async markKycFeePaid(kycId: string, stripePaymentId: string) {
        const kyc = await this.prisma.dealerKyc.findUnique({
            where: { id: kycId },
            include: { dealerProfile: true },
        });
        if (!kyc || (kyc as any).stripeChargedAt) return; // already healed or unknown record

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

        // Combined "submitted + fee paid" alert — this is the first point where the
        // submission is actually actionable for admin review.
        const admins = await this.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true, email: true } });
        await Promise.all(
            admins.map((admin) =>
                this.notificationsService.create({
                    userId: admin.id,
                    type: 'SYSTEM',
                    title: 'Dealer KYC Submitted — £1 Verification Paid',
                    message: `${companyName} has paid the £1 KYC verification fee and is ready for review.`,
                    data: { kycId, stripePaymentId, companyName },
                    link: '/admin/kyc',
                }).catch(() => {}),
            ),
        );
        const adminEmails = admins.map((a) => a.email).filter(Boolean);
        if (adminEmails.length > 0) {
            await this.emailService.sendKycSubmissionAdminAlert(adminEmails, companyName).catch(() => {});
        }
    }

    /**
     * Webhook fallback for the £1 dealer KYC verification fee.
     * Called from the success page in case the webhook was delayed or missed.
     */
    async applyKycFee(sessionId: string): Promise<{ applied: boolean }> {
        const kyc = await this.prisma.dealerKyc.findFirst({
            where: { stripeCheckoutSessionId: sessionId } as any,
        });
        if (!kyc) return { applied: false };
        if ((kyc as any).stripeChargedAt) return { applied: true };

        const stripe = await this.getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid') return { applied: false };

        await this.markKycFeePaid(kyc.id, (session.payment_intent as string) ?? session.id);
        return { applied: true };
    }

    /**
     * Webhook fallback for the auction buyer fee (£125 COMMISSION).
     * Called from the success page in case the webhook was delayed or missed.
     * Verifies the Stripe session and marks buyerFeePaid if confirmed paid.
     */
    async applyAuctionFee(sessionId: string): Promise<{ applied: boolean }> {
        const transaction = await this.prisma.transaction.findFirst({
            where: { stripePaymentId: sessionId, type: 'COMMISSION' as any },
        });
        if (!transaction) return { applied: false };
        if (transaction.status === 'COMPLETED') return { applied: true };

        const stripe = await this.getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid') return { applied: false };

        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { status: 'COMPLETED' },
        });

        const listingId = session.metadata?.listingId;
        if (listingId) {
            const auction = await this.prisma.auction.findFirst({
                where: { listingId, status: 'ENDED', deletedAt: null },
            });
            if (auction && !auction.buyerFeePaid) {
                await this.prisma.auction.update({
                    where: { id: auction.id },
                    data: { buyerFeePaid: true, buyerFeeTransactionId: transaction.id },
                });
            }
        }
        return { applied: true };
    }

    /**
     * Webhook fallback for the HPI report fee (£9.99).
     * Called from the /sell page in case the webhook was delayed or missed —
     * without this, ListingWizard.tsx only ever trusted the bare `hpi_success`
     * URL flag with no server-side confirmation, so a delayed/dropped webhook
     * meant the customer paid but the report was never actually generated.
     */
    async applyHpiFee(sessionId: string): Promise<{ applied: boolean }> {
        const transaction = await this.prisma.transaction.findFirst({
            where: { stripePaymentId: sessionId, type: 'HPI_REPORT' as any },
        });
        if (!transaction) return { applied: false };

        // Already completed with a report on file — nothing left to do.
        if (transaction.status === 'COMPLETED' && transaction.listingId) {
            const existing = await this.prisma.hpiReport.findUnique({ where: { listingId: transaction.listingId } });
            if (existing) return { applied: true };
        }

        const stripe = await this.getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid') return { applied: false };

        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { status: 'COMPLETED' },
        });

        const vrm = session.metadata?.vrm;
        if (!transaction.listingId || !vrm) return { applied: false };

        try {
            // Idempotent — safe even if the webhook already registered this request.
            await this.hpiService.createPendingReport(transaction.listingId, vrm, transaction.id);
        } catch (err) {
            console.error('Failed to register HPI report request in applyHpiFee fallback:', err);
            return { applied: false };
        }
        return { applied: true };
    }

    /**
     * Webhook fallback for a buyer's "email me this report" fee — same
     * reasoning as applyHpiFee above, mirrored for the buyer-side flow.
     */
    async applyHpiEmailFee(sessionId: string): Promise<{ applied: boolean }> {
        const transaction = await this.prisma.transaction.findFirst({
            where: { stripePaymentId: sessionId, type: 'HPI_REPORT_EMAIL' as any },
        });
        if (!transaction) return { applied: false };

        if (transaction.status === 'COMPLETED') {
            // Already registered — requestEmailDelivery is itself idempotent
            // on transactionId, but skip the Stripe round-trip when we can.
            const already = await this.prisma.hpiReportEmailRequest.findFirst({ where: { transactionId: transaction.id } });
            if (already) return { applied: true };
        }

        const stripe = await this.getStripe();
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid') return { applied: false };

        await this.prisma.transaction.update({
            where: { id: transaction.id },
            data: { status: 'COMPLETED' },
        });

        const buyerId = session.metadata?.userId;
        if (!transaction.listingId || !buyerId) return { applied: false };

        try {
            await this.hpiService.requestEmailDelivery(transaction.listingId, buyerId, transaction.id);
        } catch (err) {
            console.error('Failed to register HPI report email delivery in applyHpiEmailFee fallback:', err);
            return { applied: false };
        }
        return { applied: true };
    }

    /**
     * Refund the full £125 auction buyer fee when an auction sale is formally
     * cancelled (for example after a verified undisclosed-fault dispute).
     * Handover-proof rejection is a separate review action and does not refund.
     */
    async issueRefundForAuction(auctionId: string): Promise<void> {
        const auction = await this.prisma.auction.findUnique({ where: { id: auctionId } });
        if (!auction?.buyerFeeTransactionId) return;

        const transaction = await this.prisma.transaction.findUnique({
            where: { id: auction.buyerFeeTransactionId },
        });
        if (!transaction?.stripePaymentId) return;
        if (transaction.status === ('REFUNDED' as any)) return;

        const stripe = await this.getStripe();

        // Checkout and native Payment Sheet persist different Stripe object IDs.
        // Resolve both current pi_ references and legacy cs_ session references.
        let paymentIntentId: string | null = null;
        if (transaction.stripePaymentId.startsWith('pi_')) {
            paymentIntentId = transaction.stripePaymentId;
        } else if (transaction.stripePaymentId.startsWith('cs_')) {
            const session = await stripe.checkout.sessions.retrieve(transaction.stripePaymentId);
            paymentIntentId = typeof session.payment_intent === 'string'
                ? session.payment_intent
                : session.payment_intent?.id ?? null;
        }

        if (!paymentIntentId) {
            throw new BadRequestException('Unable to resolve the Stripe PaymentIntent for this auction buyer fee.');
        }

        await stripe.refunds.create({
            payment_intent: paymentIntentId,
            amount: this.AUCTION_BUYER_FEE * 100, // full £125 fee in pence
        }, {
            // Protect against a retry after Stripe succeeds but before our DB status update.
            idempotencyKey: `auction-buyer-fee-refund:${auctionId}`,
        });

        await this.prisma.transaction.update({
            where: { id: auction.buyerFeeTransactionId },
            data: { status: 'REFUNDED' as any },
        });
    }

    /**
     * Transfer the seller payout (£100) to their connected Stripe Express account.
     * Called by AdminService after superadmin approves handover proof.
     */
    async issueSellerPayout(stripeConnectAccountId: string, amountPence = 10000): Promise<string> {
        const stripe = await this.getStripe();
        const transfer = await stripe.transfers.create({
            amount: amountPence,
            currency: 'gbp',
            destination: stripeConnectAccountId,
        });
        return transfer.id;
    }
}
