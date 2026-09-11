import {
    Injectable,
    Logger,
    NotFoundException,
    ForbiddenException,
    BadRequestException,
    ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
    Prisma,
    ServiceType,
    ServiceJobStatus,
    ServiceQuoteStatus,
    ServicePaymentStatus,
    CapabilityStatus,
    UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';
import { PaymentsService } from '../payments/payments.service';
import { resolveFrontendUrl } from '../core/frontend-url';
import {
    CreateJobDto, JobFromPurchaseDto, CancelJobDto, UpsertQuoteDto,
    ApplyCapabilityDto, ReviewCapabilityDto, ResolveDisputeDto, JOB_SERVICE_TYPES,
} from './dto';

/** Days an OPEN job accepts quotes before it expires. */
const JOB_OPEN_DAYS = 7;
/** Hours after a contractor marks COMPLETED before the customer is assumed to agree. */
const AUTO_CONFIRM_HOURS = 48;

/**
 * What a job looks like to whoever is asking. The customer's identity and
 * street addresses are the "contact shared only with your pick" data — they go
 * to the customer, the accepted contractor and admins, and to nobody else.
 * Postcodes are NOT private: a contractor cannot quote a route without them.
 */
type Viewer = { userId: string; role: UserRole; contractorProfileId?: string | null };

const CUSTOMER_PUBLIC = { id: true, firstName: true } as const;
const CUSTOMER_PRIVATE = { id: true, firstName: true, lastName: true, email: true, phone: true } as const;
const CONTRACTOR_PUBLIC = {
    id: true, businessName: true, rating: true, totalReviews: true, serviceArea: true,
    user: { select: { firstName: true } },
} as const;
const CONTRACTOR_PRIVATE = {
    id: true, businessName: true, phone: true, rating: true, totalReviews: true, serviceArea: true,
    user: { select: { firstName: true, lastName: true, email: true, phone: true } },
} as const;

@Injectable()
export class ServicesService {
    private readonly logger = new Logger(ServicesService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly notifications: NotificationsService,
        private readonly email: EmailService,
        private readonly payments: PaymentsService,
        private readonly config: ConfigService,
    ) { }

    // ── Money ──────────────────────────────────────────────────────────────

    /** Platform fee as a fraction. Env-overridable; 9% is the agreed default. */
    private feeRate(): number {
        const raw = Number(this.config.get<string>('SERVICE_PLATFORM_FEE_RATE') ?? '0.09');
        if (!Number.isFinite(raw) || raw < 0 || raw >= 1) {
            this.logger.warn(`SERVICE_PLATFORM_FEE_RATE "${raw}" is not a fraction in [0,1) — using 0.09`);
            return 0.09;
        }
        return raw;
    }

    /**
     * Split a gross amount. Fee rounds to the nearest penny; the contractor
     * gets the exact remainder so the two always sum to the gross.
     */
    private split(grossPence: number) {
        const rate = this.feeRate();
        const platformFeePence = Math.round(grossPence * rate);
        return { rate, platformFeePence, contractorPence: grossPence - platformFeePence };
    }

    private frontendUrl(): string {
        return resolveFrontendUrl(this.config.get<string>('FRONTEND_URL'));
    }

    // ── Capabilities ───────────────────────────────────────────────────────

    /**
     * Apply to provide a service. Creates the ContractorProfile on first use —
     * nothing else in the codebase ever did, so this is where a CONTRACTOR
     * account becomes a real contractor.
     */
    async applyCapability(userId: string, dto: ApplyCapabilityDto) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
        if (user?.role !== UserRole.CONTRACTOR) {
            throw new ForbiddenException('Switch your account to a service provider before applying.');
        }

        const profile = await this.prisma.contractorProfile.upsert({
            where: { userId },
            create: {
                userId,
                businessName: dto.businessName?.trim() || null,
                phone: dto.phone?.trim() || null,
                serviceArea: dto.serviceArea?.trim() || null,
            },
            update: {
                ...(dto.businessName !== undefined && { businessName: dto.businessName.trim() || null }),
                ...(dto.phone !== undefined && { phone: dto.phone.trim() || null }),
                ...(dto.serviceArea !== undefined && { serviceArea: dto.serviceArea.trim() || null }),
            },
        });

        const existing = await this.prisma.contractorCapability.findUnique({
            where: { contractorId_serviceType: { contractorId: profile.id, serviceType: dto.serviceType } },
        });

        if (existing?.status === CapabilityStatus.APPROVED) {
            throw new ConflictException('You are already approved for this service.');
        }
        if (existing?.status === CapabilityStatus.PENDING) {
            return existing;
        }

        // REJECTED / SUSPENDED / new → (re)apply. A re-application after
        // rejection goes back into the queue with a fresh appliedAt.
        const capability = await this.prisma.contractorCapability.upsert({
            where: { contractorId_serviceType: { contractorId: profile.id, serviceType: dto.serviceType } },
            create: { contractorId: profile.id, serviceType: dto.serviceType },
            update: { status: CapabilityStatus.PENDING, appliedAt: new Date(), reviewedAt: null, reviewedById: null, reviewNote: null },
        });

        await this.notifyAdmins(
            'SERVICE_CAPABILITY_APPLIED',
            'New provider application',
            `${profile.businessName || 'A contractor'} applied to provide ${this.label(dto.serviceType)}.`,
            '/dashboard/admin/services',
        );

        return capability;
    }

    async myCapabilities(userId: string) {
        const profile = await this.prisma.contractorProfile.findUnique({
            where: { userId },
            include: { capabilities: { orderBy: { appliedAt: 'desc' } } },
        });
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { stripeConnectAccountId: true, stripeConnectOnboardingComplete: true },
        });
        return {
            profile: profile
                ? { id: profile.id, businessName: profile.businessName, phone: profile.phone, serviceArea: profile.serviceArea }
                : null,
            capabilities: profile?.capabilities ?? [],
            stripeConnect: {
                connected: !!user?.stripeConnectAccountId,
                complete: !!user?.stripeConnectOnboardingComplete,
            },
        };
    }

    async adminListCapabilities(status?: CapabilityStatus) {
        if (status && !Object.values(CapabilityStatus).includes(status)) {
            throw new BadRequestException(`Unknown status "${status}"`);
        }
        return this.prisma.contractorCapability.findMany({
            where: status ? { status } : {},
            orderBy: { appliedAt: 'asc' },
            include: {
                contractor: {
                    select: {
                        id: true, businessName: true, phone: true, serviceArea: true,
                        user: {
                            select: {
                                id: true, firstName: true, lastName: true, email: true,
                                stripeConnectAccountId: true, stripeConnectOnboardingComplete: true,
                            },
                        },
                    },
                },
                reviewedBy: { select: { firstName: true, lastName: true } },
            },
        });
    }

    async adminReviewCapability(adminId: string, id: string, dto: ReviewCapabilityDto) {
        const cap = await this.prisma.contractorCapability.findUnique({
            where: { id },
            include: { contractor: { include: { user: true } } },
        });
        if (!cap) throw new NotFoundException('Application not found');

        // Approval requires somewhere to send the money. Enforced here rather
        // than at payout time so a job can never finish with the contractor's
        // share stranded on the platform.
        if (dto.status === CapabilityStatus.APPROVED) {
            const u = cap.contractor.user;
            if (!u.stripeConnectAccountId || !u.stripeConnectOnboardingComplete) {
                throw new BadRequestException(
                    'This provider has not completed Stripe Connect onboarding. Approve once payouts are enabled.',
                );
            }
        }

        const updated = await this.prisma.contractorCapability.update({
            where: { id },
            data: { status: dto.status, reviewedAt: new Date(), reviewedById: adminId, reviewNote: dto.reviewNote ?? null },
        });

        const u = cap.contractor.user;
        const label = this.label(cap.serviceType);
        if (dto.status === CapabilityStatus.APPROVED) {
            await this.notify(u.id, 'SERVICE_CAPABILITY_APPROVED', `Approved for ${label}`,
                `You can now quote on ${label} jobs in the Trade Exchange.`, '/dashboard/service/jobs');
            this.sendEmail(u.email, u.firstName, `You're approved for ${label}`,
                `Your application to provide <strong>${label}</strong> has been approved. Open jobs are waiting in your provider dashboard.`,
                'See open jobs', '/dashboard/service/jobs');
        } else {
            const verb = dto.status === CapabilityStatus.SUSPENDED ? 'suspended' : 'not approved';
            await this.notify(u.id, 'SERVICE_CAPABILITY_REJECTED', `${label} application ${verb}`,
                dto.reviewNote || `Your ${label} application was ${verb}.`, '/dashboard/service/capabilities');
            this.sendEmail(u.email, u.firstName, `Your ${label} application was ${verb}`,
                `${dto.reviewNote ? `<p>${escapeHtml(dto.reviewNote)}</p>` : ''}<p>You can update your details and apply again from your provider dashboard.</p>`,
                'View application', '/dashboard/service/capabilities');
        }

        return updated;
    }

    // ── Jobs: customer ─────────────────────────────────────────────────────

    async createJob(customerId: string, dto: CreateJobDto) {
        if (!(JOB_SERVICE_TYPES as readonly ServiceType[]).includes(dto.serviceType)) {
            throw new BadRequestException(`${this.label(dto.serviceType)} is enquiry-based and does not take jobs yet.`);
        }
        if (dto.serviceType === ServiceType.DELIVERY) {
            if (!dto.pickupPostcode || !dto.deliveryPostcode) {
                throw new BadRequestException('Delivery jobs need a pickup and a delivery postcode.');
            }
        } else if (!dto.servicePostcode) {
            throw new BadRequestException('Inspection jobs need the postcode where the vehicle is.');
        }

        const job = await this.prisma.serviceJob.create({
            data: {
                customerId,
                serviceType: dto.serviceType,
                isRecovery: dto.serviceType === ServiceType.DELIVERY && !!dto.isRecovery,
                title: dto.title.trim(),
                description: dto.description?.trim() || null,
                pickupPostcode: normPostcode(dto.pickupPostcode),
                pickupAddress: dto.pickupAddress?.trim() || null,
                deliveryPostcode: normPostcode(dto.deliveryPostcode),
                deliveryAddress: dto.deliveryAddress?.trim() || null,
                servicePostcode: normPostcode(dto.servicePostcode),
                serviceAddress: dto.serviceAddress?.trim() || null,
                requestedFor: dto.requestedFor ? new Date(dto.requestedFor) : null,
                expiresAt: new Date(Date.now() + JOB_OPEN_DAYS * 86_400_000),
                vehicles: {
                    create: dto.vehicles.map((v) => ({
                        registration: v.registration?.toUpperCase().replace(/\s+/g, '') || null,
                        make: v.make?.trim() || null,
                        model: v.model?.trim() || null,
                        year: v.year ?? null,
                        notes: v.notes?.trim() || null,
                        listingId: v.listingId ?? null,
                    })),
                },
            },
            include: { vehicles: true },
        });

        this.logger.log(`Service job ${job.id} (${job.serviceType}) posted by ${customerId}`);
        return job;
    }

    /**
     * Pre-fill a DELIVERY job from a purchase: pickup is the seller's
     * postcode, the vehicle is the listing. The customer only supplies where
     * it is going.
     */
    async createJobFromPurchase(customerId: string, dto: JobFromPurchaseDto) {
        if (!dto.offerId && !dto.auctionId) {
            throw new BadRequestException('Provide an offerId or an auctionId.');
        }

        let listing: { id: string; title: string; seller: { postcode: string | null } | null } | null = null;
        let vehicle: { registration?: string | null; make: string; model: string; year: number } | null = null;

        if (dto.offerId) {
            const offer = await this.prisma.offer.findUnique({
                where: { id: dto.offerId },
                include: { listing: { include: { seller: { select: { postcode: true } }, vehicle: true } } },
            });
            if (!offer) throw new NotFoundException('Offer not found');
            if (offer.buyerId !== customerId) throw new ForbiddenException('Not your purchase');
            if (offer.status !== 'ACCEPTED') throw new BadRequestException('Only an accepted offer can be delivered.');
            listing = { id: offer.listing.id, title: offer.listing.title, seller: offer.listing.seller };
            vehicle = offer.listing.vehicle;
        } else {
            const auction = await this.prisma.auction.findUnique({
                where: { id: dto.auctionId! },
                include: { listing: { include: { seller: { select: { postcode: true } }, vehicle: true } } },
            });
            if (!auction) throw new NotFoundException('Auction not found');
            if (auction.winnerId !== customerId) throw new ForbiddenException('Not your purchase');
            listing = { id: auction.listing.id, title: auction.listing.title, seller: auction.listing.seller };
            vehicle = auction.listing.vehicle;
        }

        if (!listing?.seller?.postcode) {
            throw new BadRequestException('The seller has no postcode on file — post a delivery job manually with the pickup address.');
        }
        const src = listing;

        return this.prisma.serviceJob.create({
            data: {
                customerId,
                serviceType: ServiceType.DELIVERY,
                title: `Deliver ${src.title}`.slice(0, 120),
                pickupPostcode: normPostcode(src.seller!.postcode),
                deliveryPostcode: normPostcode(dto.deliveryPostcode),
                deliveryAddress: dto.deliveryAddress?.trim() || null,
                requestedFor: dto.requestedFor ? new Date(dto.requestedFor) : null,
                expiresAt: new Date(Date.now() + JOB_OPEN_DAYS * 86_400_000),
                sourceOfferId: dto.offerId ?? null,
                sourceAuctionId: dto.auctionId ?? null,
                vehicles: {
                    create: [{
                        registration: vehicle?.registration ?? null,
                        make: vehicle?.make ?? null,
                        model: vehicle?.model ?? null,
                        year: vehicle?.year ?? null,
                        listingId: src.id,
                    }],
                },
            },
            include: { vehicles: true },
        });
    }

    async myJobs(customerId: string) {
        return this.prisma.serviceJob.findMany({
            where: { customerId },
            orderBy: { createdAt: 'desc' },
            include: {
                vehicles: true,
                contractor: { select: CONTRACTOR_PUBLIC },
                _count: { select: { quotes: { where: { status: ServiceQuoteStatus.ACTIVE } } } },
            },
        });
    }

    async cancelJob(customerId: string, jobId: string, dto: CancelJobDto) {
        const job = await this.ownJob(customerId, jobId);
        if (job.status !== ServiceJobStatus.OPEN) {
            throw new BadRequestException(
                job.status === ServiceJobStatus.ACCEPTED
                    ? 'A quote has been accepted. Raise a dispute if you need to cancel.'
                    : 'This job can no longer be cancelled.',
            );
        }

        const quotes = await this.prisma.serviceQuote.findMany({
            where: { jobId, status: ServiceQuoteStatus.ACTIVE },
            include: { contractor: { include: { user: { select: { id: true } } } } },
        });

        await this.prisma.$transaction([
            this.prisma.serviceJob.update({
                where: { id: jobId },
                data: { status: ServiceJobStatus.CANCELLED, cancelledAt: new Date(), cancelReason: dto.reason?.trim() || null },
            }),
            this.prisma.serviceQuote.updateMany({
                where: { jobId, status: ServiceQuoteStatus.ACTIVE },
                data: { status: ServiceQuoteStatus.EXPIRED },
            }),
        ]);

        for (const q of quotes) {
            await this.notify(q.contractor.user.id, 'SERVICE_JOB_CANCELLED', 'Job cancelled',
                `"${job.title}" was cancelled by the customer.`, `/dashboard/service/jobs`);
        }
        return { success: true };
    }

    /**
     * Accept a quote. Freezes the fee split onto the job, declines every other
     * quote, and returns a Stripe Checkout URL for the gross. The job becomes
     * PAID when the webhook confirms the charge.
     */
    async acceptQuote(customerId: string, jobId: string, quoteId: string): Promise<{ checkoutUrl: string }> {
        const job = await this.ownJob(customerId, jobId, { quotes: true, payment: true, vehicles: true });

        // Re-entry: a customer who abandoned Checkout can come back for a
        // fresh session without the job being stuck in ACCEPTED forever.
        if (job.status === ServiceJobStatus.ACCEPTED && job.acceptedQuoteId === quoteId && job.payment) {
            const url = await this.freshCheckout(job.id, job.payment.id, job.payment.grossPence, job.title, customerId);
            return { checkoutUrl: url };
        }
        if (job.status !== ServiceJobStatus.OPEN) {
            throw new BadRequestException('This job is no longer open for acceptance.');
        }

        const quote = job.quotes.find((q) => q.id === quoteId);
        if (!quote || quote.status !== ServiceQuoteStatus.ACTIVE) {
            throw new BadRequestException('That quote is no longer available.');
        }
        if (quote.validUntil && quote.validUntil < new Date()) {
            throw new BadRequestException('That quote has expired. Ask the provider to re-quote.');
        }

        const { rate, platformFeePence, contractorPence } = this.split(quote.amountPence);

        const [, , payment] = await this.prisma.$transaction([
            this.prisma.serviceJob.update({
                where: { id: jobId },
                data: {
                    status: ServiceJobStatus.ACCEPTED,
                    acceptedQuoteId: quote.id,
                    contractorId: quote.contractorId,
                    agreedAmountPence: quote.amountPence,
                    platformFeeRate: new Prisma.Decimal(rate),
                    platformFeePence,
                    contractorAmountPence: contractorPence,
                    acceptedAt: new Date(),
                },
            }),
            this.prisma.serviceQuote.update({ where: { id: quote.id }, data: { status: ServiceQuoteStatus.ACCEPTED } }),
            this.prisma.servicePayment.create({
                data: {
                    jobId,
                    customerId,
                    contractorId: quote.contractorId,
                    grossPence: quote.amountPence,
                    platformFeeRate: new Prisma.Decimal(rate),
                    platformFeePence,
                    contractorPence,
                },
            }),
            this.prisma.serviceQuote.updateMany({
                where: { jobId, status: ServiceQuoteStatus.ACTIVE, id: { not: quote.id } },
                data: { status: ServiceQuoteStatus.DECLINED },
            }),
        ]);

        // Tell the losers. The winner hears once the money lands (webhook) —
        // "accepted but unpaid" is not something to celebrate yet.
        const declined = job.quotes.filter((q) => q.id !== quote.id && q.status === ServiceQuoteStatus.ACTIVE);
        for (const q of declined) {
            const c = await this.prisma.contractorProfile.findUnique({ where: { id: q.contractorId }, select: { userId: true } });
            if (c) await this.notify(c.userId, 'SERVICE_QUOTE_DECLINED', 'Quote not chosen',
                `The customer went with another provider for "${job.title}".`, '/dashboard/service/jobs');
        }

        const url = await this.freshCheckout(jobId, payment.id, quote.amountPence, job.title, customerId);
        return { checkoutUrl: url };
    }

    private async freshCheckout(jobId: string, paymentId: string, grossPence: number, title: string, userId: string) {
        const stripe = await this.payments.getStripeClient();
        const base = this.frontendUrl();
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: [{
                price_data: {
                    currency: 'gbp',
                    product_data: { name: title, description: 'Trade Exchange service — held by CarMazium until the job is confirmed complete.' },
                    unit_amount: grossPence,
                },
                quantity: 1,
            }],
            metadata: { type: 'SERVICE_JOB', jobId, paymentId, userId },
            success_url: `${base}/services/jobs/${jobId}?paid=1`,
            cancel_url: `${base}/services/jobs/${jobId}?paid=0`,
        });
        await this.prisma.servicePayment.update({
            where: { id: paymentId },
            data: { stripeCheckoutSessionId: session.id, status: ServicePaymentStatus.PENDING },
        });
        if (!session.url) throw new BadRequestException('Stripe did not return a checkout URL');
        return session.url;
    }

    /** Called by the Stripe webhook on checkout.session.completed with metadata.type = SERVICE_JOB. */
    async markPaid(jobId: string, paymentId: string, paymentIntentId: string | null) {
        const payment = await this.prisma.servicePayment.findUnique({ where: { id: paymentId }, include: { job: true } });
        if (!payment || payment.jobId !== jobId) {
            this.logger.error(`markPaid: payment ${paymentId} does not belong to job ${jobId}`);
            return;
        }
        if (payment.status === ServicePaymentStatus.PAID || payment.status === ServicePaymentStatus.RELEASED) {
            return; // webhook replay
        }

        await this.prisma.$transaction([
            this.prisma.servicePayment.update({
                where: { id: paymentId },
                data: { status: ServicePaymentStatus.PAID, stripePaymentIntentId: paymentIntentId, paidAt: new Date() },
            }),
            this.prisma.serviceJob.update({ where: { id: jobId }, data: { status: ServiceJobStatus.PAID } }),
        ]);

        const job = await this.prisma.serviceJob.findUnique({
            where: { id: jobId },
            include: { contractor: { include: { user: true } }, customer: true },
        });
        if (!job?.contractor) return;

        const c = job.contractor.user;
        await this.notify(c.id, 'SERVICE_JOB_PAID', 'You won the job',
            `"${job.title}" is paid and ready. Contact details are now unlocked.`, `/dashboard/service/jobs/${jobId}`);
        this.sendEmail(c.email, c.firstName, `You won: ${job.title}`,
            `<p>The customer accepted your quote of <strong>${gbp(payment.grossPence)}</strong> and has paid. You will receive <strong>${gbp(payment.contractorPence)}</strong> once the job is confirmed complete.</p><p>Their contact details are now visible on the job.</p>`,
            'Open the job', `/dashboard/service/jobs/${jobId}`);

        await this.notify(job.customerId, 'SERVICE_JOB_PAID', 'Payment received',
            `Your provider for "${job.title}" has been notified. Their contact details are on the job.`, `/services/jobs/${jobId}`);
        this.sendEmail(job.customer.email, job.customer.firstName, `Payment received for ${job.title}`,
            `<p>We've received <strong>${gbp(payment.grossPence)}</strong>. It stays with CarMazium until you confirm the job is done.</p><p>Your provider${job.contractor.businessName ? `, <strong>${escapeHtml(job.contractor.businessName)}</strong>,` : ''} has been notified.</p>`,
            'View the job', `/services/jobs/${jobId}`);
    }

    /** Customer confirms the contractor's completion → payout. */
    async confirmCompletion(customerId: string, jobId: string) {
        const job = await this.ownJob(customerId, jobId);
        if (job.status !== ServiceJobStatus.COMPLETED) {
            throw new BadRequestException('The provider has not marked this job complete yet.');
        }
        return this.release(jobId, 'customer confirmed');
    }

    /** Customer freezes a paid job for admin. */
    async openDispute(customerId: string, jobId: string, reason?: string) {
        const job = await this.ownJob(customerId, jobId);
        const disputable: ServiceJobStatus[] = [ServiceJobStatus.PAID, ServiceJobStatus.IN_PROGRESS, ServiceJobStatus.COMPLETED];
        if (!disputable.includes(job.status)) {
            throw new BadRequestException('Only a paid job can be disputed.');
        }
        await this.prisma.serviceJob.update({
            where: { id: jobId },
            data: { status: ServiceJobStatus.DISPUTED, cancelReason: reason?.trim() || null },
        });
        await this.notifyAdmins('SERVICE_JOB_DISPUTED', 'Service job disputed',
            `"${job.title}" was disputed by the customer.${reason ? ` Reason: ${reason}` : ''}`, `/dashboard/admin/services?tab=disputes`);
        return { success: true };
    }

    // ── Jobs: contractor ───────────────────────────────────────────────────

    async feed(contractorProfileId: string, approved: ServiceType[], serviceType?: ServiceType) {
        if (serviceType && !Object.values(ServiceType).includes(serviceType)) {
            throw new BadRequestException(`Unknown service type "${serviceType}"`);
        }
        const types = serviceType ? approved.filter((t) => t === serviceType) : approved;
        if (types.length === 0) return [];

        const jobs = await this.prisma.serviceJob.findMany({
            where: { status: ServiceJobStatus.OPEN, serviceType: { in: types }, expiresAt: { gt: new Date() } },
            orderBy: [{ isRecovery: 'desc' }, { createdAt: 'desc' }],
            include: {
                vehicles: true,
                customer: { select: CUSTOMER_PUBLIC },
                quotes: { where: { contractorId: contractorProfileId }, take: 1 },
                _count: { select: { quotes: { where: { status: ServiceQuoteStatus.ACTIVE } } } },
            },
        });
        return jobs.map((j) => this.redact(j, false));
    }

    async assigned(contractorProfileId: string) {
        return this.prisma.serviceJob.findMany({
            where: { contractorId: contractorProfileId },
            orderBy: { updatedAt: 'desc' },
            include: { vehicles: true, customer: { select: CUSTOMER_PRIVATE }, payment: true },
        });
    }

    async upsertQuote(contractorProfileId: string, approved: ServiceType[], userId: string, jobId: string, dto: UpsertQuoteDto) {
        const job = await this.prisma.serviceJob.findUnique({ where: { id: jobId }, include: { customer: true } });
        if (!job) throw new NotFoundException('Job not found');
        if (job.status !== ServiceJobStatus.OPEN || job.expiresAt < new Date()) {
            throw new BadRequestException('This job is no longer accepting quotes.');
        }
        if (!approved.includes(job.serviceType)) {
            throw new ForbiddenException(`You are not approved for ${this.label(job.serviceType)} jobs.`);
        }
        if (job.customerId === userId) throw new BadRequestException('You cannot quote on your own job.');

        const existing = await this.prisma.serviceQuote.findUnique({
            where: { jobId_contractorId: { jobId, contractorId: contractorProfileId } },
        });
        const isNew = !existing || existing.status === ServiceQuoteStatus.WITHDRAWN;

        const quote = await this.prisma.serviceQuote.upsert({
            where: { jobId_contractorId: { jobId, contractorId: contractorProfileId } },
            create: {
                jobId, contractorId: contractorProfileId, submittedById: userId,
                amountPence: dto.amountPence, message: dto.message?.trim() || null,
                validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
            },
            update: {
                amountPence: dto.amountPence, message: dto.message?.trim() || null,
                validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
                status: ServiceQuoteStatus.ACTIVE, submittedById: userId,
            },
        });

        const profile = await this.prisma.contractorProfile.findUnique({ where: { id: contractorProfileId }, select: { businessName: true } });
        const who = profile?.businessName || 'A provider';
        await this.notify(job.customerId, 'SERVICE_QUOTE_RECEIVED', isNew ? 'New quote' : 'Quote updated',
            `${who} quoted ${gbp(dto.amountPence)} for "${job.title}".`, `/services/jobs/${jobId}`);
        if (isNew) {
            this.sendEmail(job.customer.email, job.customer.firstName, `New quote: ${gbp(dto.amountPence)} for ${job.title}`,
                `<p><strong>${escapeHtml(who)}</strong> has quoted <strong>${gbp(dto.amountPence)}</strong>.</p>${dto.message ? `<p style="color:#94a3b8">"${escapeHtml(dto.message)}"</p>` : ''}`,
                'Compare quotes', `/services/jobs/${jobId}`);
        }
        return quote;
    }

    async withdrawQuote(contractorProfileId: string, jobId: string) {
        const q = await this.prisma.serviceQuote.findUnique({
            where: { jobId_contractorId: { jobId, contractorId: contractorProfileId } },
        });
        if (!q) throw new NotFoundException('No quote to withdraw');
        if (q.status !== ServiceQuoteStatus.ACTIVE) throw new BadRequestException('Only an active quote can be withdrawn.');
        await this.prisma.serviceQuote.update({ where: { id: q.id }, data: { status: ServiceQuoteStatus.WITHDRAWN } });
        return { success: true };
    }

    async startJob(contractorProfileId: string, jobId: string) {
        const job = await this.assignedJob(contractorProfileId, jobId);
        if (job.status !== ServiceJobStatus.PAID) throw new BadRequestException('The job must be paid before it starts.');
        await this.prisma.serviceJob.update({ where: { id: jobId }, data: { status: ServiceJobStatus.IN_PROGRESS, startedAt: new Date() } });
        await this.notify(job.customerId, 'SERVICE_JOB_STARTED', 'Job started',
            `Your provider has started "${job.title}".`, `/services/jobs/${jobId}`);
        return { success: true };
    }

    async completeJob(contractorProfileId: string, jobId: string) {
        const job = await this.assignedJob(contractorProfileId, jobId);
        if (job.status !== ServiceJobStatus.IN_PROGRESS && job.status !== ServiceJobStatus.PAID) {
            throw new BadRequestException('This job cannot be marked complete from its current state.');
        }
        await this.prisma.serviceJob.update({ where: { id: jobId }, data: { status: ServiceJobStatus.COMPLETED, completedAt: new Date() } });
        await this.notify(job.customerId, 'SERVICE_JOB_COMPLETED', 'Please confirm completion',
            `Your provider marked "${job.title}" complete. Confirm to release their payment — or it releases automatically in ${AUTO_CONFIRM_HOURS} hours.`,
            `/services/jobs/${jobId}`);
        this.sendEmail(job.customer.email, job.customer.firstName, `Is "${job.title}" done?`,
            `<p>Your provider has marked the job complete. If everything is in order, confirm it and their payment is released.</p><p>If you do nothing it releases automatically in ${AUTO_CONFIRM_HOURS} hours. If something is wrong, raise a dispute before then.</p>`,
            'Confirm completion', `/services/jobs/${jobId}`);
        return { success: true };
    }

    // ── Shared views ───────────────────────────────────────────────────────

    async contractorProfileIdFor(userId: string): Promise<string | null> {
        const p = await this.prisma.contractorProfile.findUnique({ where: { userId }, select: { id: true } });
        return p?.id ?? null;
    }

    async getJob(viewer: Viewer, jobId: string) {
        const job = await this.prisma.serviceJob.findUnique({
            where: { id: jobId },
            include: {
                vehicles: { include: { listing: { select: { id: true, slug: true, title: true } } } },
                customer: { select: CUSTOMER_PRIVATE },
                contractor: { select: CONTRACTOR_PRIVATE },
                quotes: {
                    orderBy: { amountPence: 'asc' },
                    include: { contractor: { select: CONTRACTOR_PUBLIC } },
                },
                payment: true,
            },
        });
        if (!job) throw new NotFoundException('Job not found');

        const isCustomer = job.customerId === viewer.userId;
        const isAdmin = viewer.role === UserRole.ADMIN;
        const isAccepted = !!viewer.contractorProfileId && job.contractorId === viewer.contractorProfileId;
        const hasQuoted = !!viewer.contractorProfileId && job.quotes.some((q) => q.contractorId === viewer.contractorProfileId);
        const isEligible = !!viewer.contractorProfileId && job.status === ServiceJobStatus.OPEN;

        if (!isCustomer && !isAdmin && !isAccepted && !hasQuoted && !isEligible) {
            throw new ForbiddenException('You do not have access to this job.');
        }

        const full = isCustomer || isAdmin || isAccepted;
        // Contractors see only their own quote; the customer and admin see all.
        const quotes = full && !isAccepted
            ? job.quotes
            : job.quotes.filter((q) => q.contractorId === viewer.contractorProfileId);

        return { ...this.redact({ ...job, quotes }, full), viewerRole: isCustomer ? 'customer' : isAccepted ? 'contractor' : isAdmin ? 'admin' : 'bidder' };
    }

    // ── Admin ──────────────────────────────────────────────────────────────

    async adminListJobs(status?: ServiceJobStatus) {
        if (status && !Object.values(ServiceJobStatus).includes(status)) {
            throw new BadRequestException(`Unknown status "${status}"`);
        }
        return this.prisma.serviceJob.findMany({
            where: status ? { status } : {},
            orderBy: { updatedAt: 'desc' },
            take: 200,
            include: {
                customer: { select: CUSTOMER_PRIVATE },
                contractor: { select: CONTRACTOR_PRIVATE },
                payment: true,
                _count: { select: { quotes: true, vehicles: true } },
            },
        });
    }

    async adminResolveDispute(adminId: string, jobId: string, dto: ResolveDisputeDto) {
        const job = await this.prisma.serviceJob.findUnique({ where: { id: jobId }, include: { payment: true } });
        if (!job) throw new NotFoundException('Job not found');
        if (job.status !== ServiceJobStatus.DISPUTED) throw new BadRequestException('Job is not disputed.');
        if (!job.payment || job.payment.status !== ServicePaymentStatus.PAID) {
            throw new BadRequestException('No held payment to resolve.');
        }

        if (dto.outcome === 'RELEASE') {
            return this.release(jobId, `admin ${adminId} resolved dispute in favour of the provider`);
        }

        // Refund the customer in full. The platform absorbs the Stripe fee on
        // a refund, which is the cost of having taken a job that went wrong.
        const stripe = await this.payments.getStripeClient();
        if (!job.payment.stripePaymentIntentId) throw new BadRequestException('No payment intent on record to refund.');
        const refund = await stripe.refunds.create({ payment_intent: job.payment.stripePaymentIntentId });

        await this.prisma.$transaction([
            this.prisma.servicePayment.update({ where: { id: job.payment.id }, data: { status: ServicePaymentStatus.REFUNDED, refundedAt: new Date() } }),
            this.prisma.serviceJob.update({ where: { id: jobId }, data: { status: ServiceJobStatus.CANCELLED, cancelledAt: new Date(), cancelReason: dto.note?.trim() || 'Refunded after dispute' } }),
        ]);
        this.logger.log(`Service job ${jobId} refunded (${refund.id}) by admin ${adminId}`);

        await this.notify(job.customerId, 'SERVICE_JOB_REFUNDED', 'Refund issued',
            `Your payment for "${job.title}" has been refunded.`, `/services/jobs/${jobId}`);
        const c = job.contractorId ? await this.prisma.contractorProfile.findUnique({ where: { id: job.contractorId }, select: { userId: true } }) : null;
        if (c) await this.notify(c.userId, 'SERVICE_JOB_REFUNDED', 'Dispute resolved',
            `"${job.title}" was refunded to the customer.${dto.note ? ` ${dto.note}` : ''}`, `/dashboard/service/jobs/${jobId}`);
        return { success: true, refundId: refund.id };
    }

    // ── Lifecycle (called by cron) ─────────────────────────────────────────

    async expireOpenJobs(): Promise<number> {
        const stale = await this.prisma.serviceJob.findMany({
            where: { status: ServiceJobStatus.OPEN, expiresAt: { lt: new Date() } },
            select: { id: true, title: true, customerId: true },
        });
        for (const j of stale) {
            await this.prisma.$transaction([
                this.prisma.serviceJob.update({ where: { id: j.id }, data: { status: ServiceJobStatus.EXPIRED } }),
                this.prisma.serviceQuote.updateMany({ where: { jobId: j.id, status: ServiceQuoteStatus.ACTIVE }, data: { status: ServiceQuoteStatus.EXPIRED } }),
            ]);
            await this.notify(j.customerId, 'SERVICE_JOB_EXPIRED', 'Job expired',
                `"${j.title}" closed after ${JOB_OPEN_DAYS} days without an accepted quote. You can post it again.`, `/services/jobs/${j.id}`);
        }
        return stale.length;
    }

    async autoConfirmCompleted(): Promise<number> {
        const cutoff = new Date(Date.now() - AUTO_CONFIRM_HOURS * 3_600_000);
        const due = await this.prisma.serviceJob.findMany({
            where: { status: ServiceJobStatus.COMPLETED, completedAt: { lt: cutoff } },
            select: { id: true },
        });
        for (const j of due) {
            try { await this.release(j.id, `auto-confirmed after ${AUTO_CONFIRM_HOURS}h`); }
            catch (e: any) { this.logger.error(`Auto-confirm failed for ${j.id}: ${e?.message}`); }
        }
        return due.length;
    }

    // ── Internals ──────────────────────────────────────────────────────────

    /**
     * Pay the contractor. Transfer first, then record — if the transfer
     * throws we have changed nothing and can retry; if the record fails after
     * a successful transfer the transfer id is in the logs to reconcile.
     */
    private async release(jobId: string, why: string) {
        const job = await this.prisma.serviceJob.findUnique({
            where: { id: jobId },
            include: { payment: true, contractor: { include: { user: true } }, customer: true },
        });
        if (!job?.payment || !job.contractor) throw new BadRequestException('Nothing to release.');
        if (job.payment.status !== ServicePaymentStatus.PAID) throw new BadRequestException('Payment is not in a releasable state.');

        const account = job.contractor.user.stripeConnectAccountId;
        if (!account) throw new BadRequestException('Provider has no Stripe Connect account.');

        const transferId = await this.payments.issueSellerPayout(account, job.payment.contractorPence);
        this.logger.log(`Service job ${jobId}: transferred ${job.payment.contractorPence}p to ${account} (${transferId}) — ${why}`);

        await this.prisma.$transaction([
            this.prisma.servicePayment.update({
                where: { id: job.payment.id },
                data: { status: ServicePaymentStatus.RELEASED, stripeTransferId: transferId, releasedAt: new Date() },
            }),
            this.prisma.serviceJob.update({
                where: { id: jobId },
                data: { status: ServiceJobStatus.RELEASED, confirmedAt: job.confirmedAt ?? new Date() },
            }),
        ]);

        const c = job.contractor.user;
        await this.notify(c.id, 'SERVICE_PAYOUT_RELEASED', 'Payment released',
            `${gbp(job.payment.contractorPence)} for "${job.title}" is on its way to your account.`, `/dashboard/service/jobs/${jobId}`);
        this.sendEmail(c.email, c.firstName, `${gbp(job.payment.contractorPence)} released for ${job.title}`,
            `<p>The job is confirmed complete and <strong>${gbp(job.payment.contractorPence)}</strong> has been transferred to your Stripe account.</p>`,
            'View the job', `/dashboard/service/jobs/${jobId}`);
        await this.notify(job.customerId, 'SERVICE_JOB_RELEASED', 'Job complete',
            `"${job.title}" is done and your provider has been paid. Thanks for using the Trade Exchange.`, `/services/jobs/${jobId}`);
        return { success: true, transferId };
    }

    private async ownJob(customerId: string, jobId: string, include?: Prisma.ServiceJobInclude) {
        const job = await this.prisma.serviceJob.findUnique({ where: { id: jobId }, include: include as any });
        if (!job) throw new NotFoundException('Job not found');
        if ((job as any).customerId !== customerId) throw new ForbiddenException('Not your job');
        return job as any;
    }

    private async assignedJob(contractorProfileId: string, jobId: string) {
        const job = await this.prisma.serviceJob.findUnique({ where: { id: jobId }, include: { customer: true } });
        if (!job) throw new NotFoundException('Job not found');
        if (job.contractorId !== contractorProfileId) throw new ForbiddenException('This job is not assigned to you.');
        return job;
    }

    /** Strip customer identity and street addresses unless the viewer is entitled to them. */
    private redact<T extends Record<string, any>>(job: T, full: boolean): T {
        if (full) return job;
        const { customer, ...rest } = job;
        return {
            ...rest,
            customer: customer ? { id: customer.id, firstName: customer.firstName } : null,
            pickupAddress: null,
            deliveryAddress: null,
            serviceAddress: null,
        } as unknown as T;
    }

    private label(t: ServiceType): string {
        return { DELIVERY: 'Delivery & Recovery', INSPECTION: 'Vehicle Inspections', FINANCE: 'Vehicle Finance', WARRANTY: 'Warranty' }[t];
    }

    private async notify(userId: string, type: string, title: string, message: string, link: string) {
        try {
            await this.notifications.create({ userId, type, title, message, link, entityType: 'SERVICE_JOB' } as any);
        } catch (e: any) {
            this.logger.warn(`Notification ${type} to ${userId} failed: ${e?.message}`);
        }
    }

    private async notifyAdmins(type: string, title: string, message: string, link: string) {
        const admins = await this.prisma.user.findMany({ where: { role: UserRole.ADMIN, deletedAt: null }, select: { id: true } });
        for (const a of admins) await this.notify(a.id, type, title, message, link);
    }

    /** Fire-and-forget branded email. Failures are logged by EmailService; a lost email must never fail the action. */
    private sendEmail(to: string, firstName: string | null, subject: string, bodyHtml: string, ctaLabel: string, ctaPath: string) {
        const name = firstName || 'there';
        const url = `${this.frontendUrl()}${ctaPath}`;
        this.email.sendBrandedEmail({
            to,
            subject,
            bodyHtml: `
                <h1 style="margin:0 0 12px;font-family:'Poppins','Segoe UI',sans-serif;font-size:24px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">${escapeHtml(subject)}</h1>
                <p style="margin:0 0 16px;color:#cbd5e1;font-size:15px;line-height:1.6;">Hi ${escapeHtml(name)},</p>
                <div style="color:#cbd5e1;font-size:15px;line-height:1.6;">${bodyHtml}</div>
                <div style="text-align:center;margin:28px 0 8px;">
                    <a href="${url}" style="background:#ed1c24;color:#fff;padding:13px 28px;border-radius:10px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block;">${escapeHtml(ctaLabel)}</a>
                </div>`,
        } as any).catch((e: any) => this.logger.warn(`Email "${subject}" to ${to} failed: ${e?.message}`));
    }
}

function normPostcode(pc?: string | null): string | null {
    if (!pc) return null;
    return pc.toUpperCase().replace(/\s+/g, ' ').trim() || null;
}

function gbp(pence: number): string {
    return `£${(pence / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(s: string): string {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}