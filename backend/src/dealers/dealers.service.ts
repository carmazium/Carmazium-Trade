import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { subDays } from 'date-fns';
import { EmailService } from '../email/email.service';
import { CreateKycDto } from './dto/create-kyc.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { resolveFrontendUrl } from '../core/frontend-url';

@Injectable()
export class DealersService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly emailService: EmailService,
        private readonly notificationsService: NotificationsService,
        private readonly config: ConfigService,
    ) {}

    // ─── Stripe helper ───────────────────────────────────────────────

    private async getStripe() {
        // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
        const StripeModule = require('stripe');
        // Handle both CommonJS default export and jest mock shapes
        const StripeConstructor = StripeModule.default ?? StripeModule;
        return new StripeConstructor(this.config.get<string>('STRIPE_SECRET_KEY')!, {
            apiVersion: '2026-02-25.clover',
        });
    }

    // ─── Profile helpers ────────────────────────────────────────────

    /** Get the DealerProfile for a user (owner or staff), or throw */
    async getDealerProfile(userId: string) {
        // 1. Check if user is the primary owner
        let profile = await this.prisma.dealerProfile.findUnique({
            where: { userId },
            include: { staff: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, profileImage: true } } } } },
        });

        // 2. If not owner, check if they are a staff member
        if (!profile) {
            const staffRecord = await this.prisma.dealerStaff.findFirst({
                where: { userId, isActive: true },
                include: { dealerProfile: { include: { staff: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true, profileImage: true } } } } } } },
            });
            if (staffRecord) {
                profile = staffRecord.dealerProfile as any;
            }
        }

        if (!profile) throw new NotFoundException('Dealer profile not found');
        return profile;
    }

    /** Get the KYC record for a dealer — auto-creates profile for new DEALER registrations */
    async getKyc(userId: string) {
        let profileResult = await this.prisma.dealerProfile.findUnique({
            where: { userId },
            include: { kyc: true },
        });

        if (!profileResult) {
            // Auto-create a blank profile so new dealers don't hit 404.
            // Use a unique placeholder vatNumber (prefixed with userId) to avoid
            // the @unique constraint violation that causes a 500 when vatNumber is ''.
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (!user || user.role !== 'DEALER') {
                throw new NotFoundException('Dealer profile not found');
            }
            profileResult = await this.prisma.dealerProfile.upsert({
                where: { userId },
                create: {
                    userId,
                    companyName: user.firstName
                        ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}'s Dealership`
                        : 'My Dealership',
                    // Unique placeholder — dealer will set real VAT number in their KYC form
                    vatNumber: `PENDING-${userId.substring(0, 8)}`,
                    isVerified: false,
                },
                update: {},
                include: { kyc: true },
            });
        }

        // At this point profileResult is guaranteed non-null (we either found or created it)
        const resolvedProfile = profileResult!;
        return resolvedProfile.kyc;
    }

    /** Submit/Update the KYC record for a dealer — auto-creates profile for new DEALER registrations */
    async submitKyc(userId: string, dto: CreateKycDto) {
        let profileResult = await this.prisma.dealerProfile.findUnique({
            where: { userId },
            include: { kyc: true, user: true },
        });

        if (!profileResult) {
            // Auto-create a blank profile using upsert to handle race conditions.
            // Use a unique placeholder vatNumber to avoid the @unique constraint
            // violation that crashes the endpoint with a 500 when vatNumber is ''.
            const user = await this.prisma.user.findUnique({ where: { id: userId } });
            if (!user || user.role !== 'DEALER') {
                throw new NotFoundException('Dealer profile not found');
            }
            profileResult = await this.prisma.dealerProfile.upsert({
                where: { userId },
                create: {
                    userId,
                    companyName: user.firstName
                        ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}'s Dealership`
                        : 'My Dealership',
                    // Unique placeholder — dealer will set real VAT number in their KYC form
                    vatNumber: `PENDING-${userId.substring(0, 8)}`,
                    isVerified: false,
                },
                update: {},
                include: { kyc: true, user: true },
            });
        }

        // At this point profileResult is guaranteed non-null
        const profile = profileResult!;

        // £1 verification fee is now collected via a hosted Stripe Checkout redirect
        // (see createKycCheckoutSession) and confirmed asynchronously by the webhook —
        // submitKyc only persists the dealer's form fields, it never touches payment state.
        const alreadyStripeVerified = (profile.kyc as any)?.stripeChargedAt != null;

        const fieldsList = [
            'businessType',
            'companyHouseName',
            'representativeName',
            'representativePosition',
            'vatNumber',
            'vatProof',
            'companyRegistrationNumber',
            'companyRegistrationProof',
            'personOfSignificantControl',
            'directorName',
            'directorIdProof',
            'proofOfAddress',
            'businessWebsite',
            'businessRegisteredAddress',
            'tradingAddress',
            'googleReviewsLink',
            'paymentReference',
            'paymentScreenshot',
        ];

        // Fields that are required (non-nullable) in the DealerKyc schema.
        // We must never write null to these — fall back to existing DB value instead.
        // NOTE: paymentReference is now String? (nullable) — removed from required set
        // so Stripe-flow submissions that omit it don't crash.
        // Non-nullable in the DealerKyc schema — never write null to these, fall
        // back to the existing DB value (or '') instead.
        //
        // vatNumber, companyRegistrationNumber, personOfSignificantControl and
        // businessWebsite stay in this set even though sole traders leave them
        // blank: the columns are still NOT NULL, so a sole trader's submission
        // writes '' rather than null. Which of them are actually *demanded* is
        // decided by businessType, in the client form and in admin review — not
        // by nullability here.
        const requiredFields = new Set([
            'companyHouseName',
            'representativeName',
            'representativePosition',
            'vatNumber',
            'companyRegistrationNumber',
            'personOfSignificantControl',
            'directorName',
            'businessWebsite',
            'businessRegisteredAddress',
        ]);

        // businessType is an enum column with a default — '' is not a legal
        // value for it, so it must never fall into the ''-fallback path above.
        const businessType = dto.businessType ?? 'PRIVATE_LIMITED';

        let documentStatuses: Record<string, any> = {};
        const updatedFields: Record<string, any> = {};

        if (profile.kyc) {
            // ─── Existing KYC record — resubmission after review ───────────
            const existingStatuses = (profile.kyc.documentStatuses as Record<string, any>) || {};

            for (const field of fieldsList) {
                const existingFieldStatus = existingStatuses[field]?.status;
                const existingValue = (profile.kyc as any)[field];
                const incomingValue = (dto as any)[field];

                if (existingFieldStatus === 'APPROVED') {
                    // Lock: always use the already-approved DB value
                    updatedFields[field] = existingValue;
                    documentStatuses[field] = existingStatuses[field];
                } else {
                    // Update with incoming value.
                    // For required (non-nullable) fields, fall back to the existing DB
                    // value if the DTO provides null/undefined to prevent Prisma crashes.
                    const value = field === 'businessType'
                        ? businessType
                        : (incomingValue !== null && incomingValue !== undefined)
                            ? incomingValue
                            : (requiredFields.has(field) ? (existingValue ?? '') : null);

                    updatedFields[field] = value;
                    documentStatuses[field] = { status: 'PENDING', note: '' };
                }
            }

            // Auto-approve payment fields if the £1 fee was already verified in a prior cycle
            if (alreadyStripeVerified) {
                documentStatuses['paymentReference'] = { status: 'APPROVED', note: 'Stripe verified' };
                documentStatuses['paymentScreenshot'] = { status: 'APPROVED', note: 'Stripe verified' };
            }

            const updatedKyc = await this.prisma.dealerKyc.update({
                where: { id: profile.kyc.id },
                data: {
                    ...updatedFields,
                    status: 'PENDING',
                    documentStatuses,
                    submittedAt: new Date(),
                } as any,
            });

            // Sync KYC fields back into DealerProfile so Settings page is pre-filled
            await this.syncProfileFromKyc(profile.id, updatedFields);

            // Only alert admins now if the fee is already paid — otherwise the dealer is about
            // to be redirected to Stripe Checkout, and the webhook fires this notification once
            // payment actually clears (reviewing an unpaid submission isn't actionable).
            if (alreadyStripeVerified) {
                await this.notifyAdminsOfKycSubmission(profile.companyName);
            }
            return updatedKyc;

        } else {
            // ─── First KYC submission ────────────────────────────────────────
            for (const field of fieldsList) {
                const incomingValue = (dto as any)[field];
                // For required fields default to '' rather than null to prevent DB errors
                updatedFields[field] = field === 'businessType'
                    ? businessType
                    : (incomingValue !== null && incomingValue !== undefined)
                        ? incomingValue
                        : (requiredFields.has(field) ? '' : null);

                documentStatuses[field] = { status: 'PENDING', note: '' };
            }

            const newKyc = await this.prisma.dealerKyc.create({
                data: {
                    ...updatedFields,
                    dealerProfileId: profile.id,
                    status: 'PENDING',
                    documentStatuses,
                    submittedAt: new Date(),
                } as any,
            });

            // Sync KYC fields back into DealerProfile so Settings page is pre-filled
            await this.syncProfileFromKyc(profile.id, updatedFields);

            // A brand-new KYC record can never be alreadyStripeVerified — the £1 fee is paid
            // via the Stripe Checkout redirect that follows; the webhook notifies admins then.
            return newKyc;
        }
    }

    /** Create a Stripe Checkout Session for the £1 KYC verification fee (hosted, redirect-based) */
    async createKycCheckoutSession(userId: string): Promise<{ url?: string; alreadyPaid: boolean; chargedAt?: Date }> {
        const profileResult = await this.prisma.dealerProfile.findUnique({
            where: { userId },
            include: { kyc: true },
        });
        const kyc = profileResult?.kyc as any;

        if (!kyc) {
            // Dealer must submit their KYC form fields (POST /dealers/kyc) before a
            // checkout session can be created — there's no record to attach the fee to yet.
            throw new BadRequestException('Please submit your KYC details before paying the verification fee.');
        }

        // Already paid — return early, no new charge
        if (kyc.stripeChargedAt) {
            return { alreadyPaid: true, chargedAt: kyc.stripeChargedAt };
        }

        const stripe = await this.getStripe();

        // Existing open session — reuse it instead of creating a duplicate
        if (kyc.stripeCheckoutSessionId) {
            try {
                const existing = await stripe.checkout.sessions.retrieve(kyc.stripeCheckoutSessionId);
                if (existing.status === 'open' && existing.url) {
                    return { url: existing.url, alreadyPaid: false };
                }
                if (existing.payment_status === 'paid') {
                    // Edge case: Stripe confirmed payment but our webhook hasn't landed yet
                    // (or failed). Heal the record now so we never create a duplicate session
                    // and charge the dealer a second £1.
                    const healedAt = new Date();
                    const existingStatuses = (kyc.documentStatuses as Record<string, any>) || {};
                    await this.prisma.dealerKyc.update({
                        where: { id: kyc.id },
                        data: {
                            stripeChargedAt: healedAt,
                            stripePaymentIntentId: (existing.payment_intent as string) ?? existing.id,
                            documentStatuses: {
                                ...existingStatuses,
                                paymentReference: { status: 'APPROVED', note: 'Stripe verified' },
                                paymentScreenshot: { status: 'APPROVED', note: 'Stripe verified' },
                            },
                        } as any,
                    });
                    return { alreadyPaid: true, chargedAt: healedAt };
                }
                // Expired / completed-unpaid — fall through to create a new session
            } catch { /* Stripe API error — fall through to create new */ }
        }

        const baseUrl = resolveFrontendUrl(this.config.get<string>('FRONTEND_URL'));

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: [
                {
                    price_data: {
                        currency: 'gbp',
                        product_data: {
                            name: 'Dealer KYC Verification Fee',
                            description: 'Non-refundable £1 identity verification charge — covers the cost of your KYC review.',
                        },
                        unit_amount: 100,
                    },
                    quantity: 1,
                },
            ],
            metadata: {
                type: 'KYC_VERIFICATION',
                kycId: kyc.id,
                dealerProfileId: profileResult?.id ?? '',
                userId,
            },
            success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${baseUrl}/dashboard/dealer?kyc=cancelled`,
        });

        await this.prisma.dealerKyc.update({
            where: { id: kyc.id },
            data: { stripeCheckoutSessionId: session.id } as any,
        });

        return { url: session.url ?? undefined, alreadyPaid: false };
    }

    /** Fire-and-forget: email + in-app notification for an existing user added directly as staff */
    private sendStaffAddedNotifications(
        user: { id: string; email: string; firstName?: string | null; lastName?: string | null },
        dealerName: string,
        role: string,
    ) {
        const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'there';
        this.emailService
            .sendStaffAddedEmail(user.email, name, dealerName, role)
            .catch(() => {});
        this.notificationsService
            .create({
                userId: user.id,
                title: 'You\'ve been added to a dealership',
                message: `${dealerName} has added you to their team. You now have access to the dealer dashboard.`,
                type: 'TEAM_INVITE',
                data: { dealerName },
                link: '/dashboard/dealer',
            })
            .catch(() => {});
    }

    /** Sync the relevant KYC fields into DealerProfile so the Settings page is pre-filled */
    private async syncProfileFromKyc(profileId: string, kycFields: Record<string, any>) {
        const updates: Record<string, any> = {};

        if (kycFields.companyHouseName) updates.companyName = kycFields.companyHouseName;
        if (kycFields.companyRegistrationNumber) updates.registrationNumber = kycFields.companyRegistrationNumber;
        if (kycFields.businessRegisteredAddress) updates.businessAddress = kycFields.businessRegisteredAddress;
        if (kycFields.businessWebsite) updates.website = kycFields.businessWebsite;

        // vatNumber has a @unique constraint — only update if non-empty and different from placeholder
        if (kycFields.vatNumber && !kycFields.vatNumber.startsWith('PENDING-')) {
            updates.vatNumber = kycFields.vatNumber;
        }

        if (Object.keys(updates).length === 0) return;

        try {
            await this.prisma.dealerProfile.update({ where: { id: profileId }, data: updates });
        } catch {
            // If the vatNumber conflicts with another profile (duplicate), retry without it
            if (updates.vatNumber) {
                delete updates.vatNumber;
                if (Object.keys(updates).length > 0) {
                    await this.prisma.dealerProfile.update({ where: { id: profileId }, data: updates }).catch(() => {});
                }
            }
        }
    }

    private async notifyAdminsOfKycSubmission(companyName: string) {
        try {
            const admins = await this.prisma.user.findMany({
                where: { role: 'ADMIN' },
                select: { email: true },
            });
            const adminEmails = admins.map((a) => a.email).filter(Boolean);
            if (adminEmails.length > 0) {
                await this.emailService.sendKycSubmissionAdminAlert(adminEmails, companyName);
            }
        } catch (err) {
            console.error('Failed to send admin KYC submission alert email:', err);
        }
    }

    /** Fire in-app notification to all admins when a £1 KYC verification charge is confirmed */
    private async notifyAdminsOfKycPayment(companyName: string, piId: string) {
        const admins = await this.prisma.user.findMany({
            where: { role: 'ADMIN' },
            select: { id: true },
        });
        await Promise.all(
            admins.map((admin) =>
                this.notificationsService.create({
                    userId: admin.id,
                    type: 'SYSTEM',
                    title: 'KYC £1 Verification Payment Received',
                    message: `${companyName} has completed the £1 KYC verification charge (PI: ${piId}).`,
                    data: { piId, companyName },
                    link: '/admin/kyc',
                }).catch(() => {}),
            ),
        );
    }

    // ─── Dashboard KPIs ─────────────────────────────────────────────

    async getStats(userId: string) {
        const profile = await this.getDealerProfile(userId);

        // The dealership owner's userId is the canonical sellerId for all listings/sales
        // belonging to this dealership. Staff members must aggregate against the owner's
        // ID, not their own, otherwise dealer revenue would always read as zero for staff.
        const ownerUserId = (profile as any).userId ?? userId;

        const [activeListings, totalViews, soldListings, activeLeads, totalLeads, recentLeads, totalRevenue] = await Promise.all([
            this.prisma.listing.count({ where: { sellerId: ownerUserId, status: 'ACTIVE', deletedAt: null } }),
            this.prisma.listing.aggregate({ where: { sellerId: ownerUserId, deletedAt: null }, _sum: { viewCount: true } }),
            this.prisma.listing.count({ where: { sellerId: ownerUserId, status: 'SOLD', deletedAt: null } }),
            this.prisma.lead.count({ where: { dealerProfileId: profile.id, status: { notIn: ['WON', 'LOST'] } } }),
            this.prisma.lead.count({ where: { dealerProfileId: profile.id } }),
            this.prisma.lead.findMany({
                where: { dealerProfileId: profile.id },
                orderBy: { createdAt: 'desc' },
                take: 5,
                include: {
                    listing: { select: { title: true, slug: true } },
                    assignedTo: { select: { firstName: true, lastName: true } },
                },
            }),
            // Total dealership revenue sourced from Sale.soldPrice — same source-of-truth
            // used by /listings/earnings and /dashboard/unified, so the three KPIs match.
            this.prisma.sale.aggregate({
                where: { sellerId: ownerUserId },
                _sum: { soldPrice: true },
            }),
        ]);

        return {
            companyName: profile.companyName,
            isVerified: profile.isVerified,
            activeListings,
            totalViews: totalViews._sum.viewCount || 0,
            soldListings,
            activeLeads,
            totalLeads,
            totalRevenue: Number(totalRevenue._sum.soldPrice || 0),
            recentLeads,
            staffCount: profile.staff.length,
        };
    }

    // ─── Analytics ──────────────────────────────────────────────────

    private buildDateFilter(range: string, from?: string, to?: string): { gte: Date; lte?: Date } {
        const now = new Date();
        if (range === '7d') return { gte: subDays(now, 7) };
        if (range === '90d') return { gte: subDays(now, 90) };
        if (range === 'custom' && from && to) return { gte: new Date(from), lte: new Date(to) };
        return { gte: subDays(now, 30) }; // default 30d
    }

    private getPreviousPeriodFilter(range: string, from?: string, to?: string): { gte: Date; lte: Date } {
        const now = new Date();
        if (range === '7d') return { gte: subDays(now, 14), lte: subDays(now, 7) };
        if (range === '90d') return { gte: subDays(now, 180), lte: subDays(now, 90) };
        if (range === 'custom' && from && to) {
            const start = new Date(from);
            const end = new Date(to);
            const span = end.getTime() - start.getTime();
            return { gte: new Date(start.getTime() - span), lte: start };
        }
        return { gte: subDays(now, 60), lte: subDays(now, 30) }; // default prev 30d
    }

    private calcTrend(current: number, previous: number): number {
        if (previous === 0) return current > 0 ? 100 : 0;
        return Math.round(((current - previous) / previous) * 1000) / 10;
    }

    async getAnalytics(userId: string, range = '30d', from?: string, to?: string) {
        const profile = await this.getDealerProfile(userId);
        const ownerUserId = (profile as any).userId ?? userId;

        const dateFilter = this.buildDateFilter(range, from, to);
        const prevFilter = this.getPreviousPeriodFilter(range, from, to);

        // ─── Current Period KPIs ─────────────────────────────────────

        const [
            currentRevenue,
            currentUnitsSold,
            currentOfferTotal,
            currentOfferAccepted,
            currentLeadTotal,
            currentLeadWon,
            currentAvgViews,
            // Previous period for trend comparison
            prevRevenue,
            prevUnitsSold,
            prevOfferTotal,
            prevOfferAccepted,
            prevLeadTotal,
            prevLeadWon,
            prevAvgViews,
        ] = await Promise.all([
            // Current period
            this.prisma.sale.aggregate({
                where: { sellerId: ownerUserId, createdAt: dateFilter },
                _sum: { soldPrice: true },
            }),
            this.prisma.sale.count({
                where: { sellerId: ownerUserId, createdAt: dateFilter },
            }),
            this.prisma.offer.count({
                where: { listing: { sellerId: ownerUserId }, createdAt: dateFilter },
            }),
            this.prisma.offer.count({
                where: { listing: { sellerId: ownerUserId }, status: 'ACCEPTED', createdAt: dateFilter },
            }),
            this.prisma.lead.count({
                where: { dealerProfileId: profile.id, createdAt: dateFilter },
            }),
            this.prisma.lead.count({
                where: { dealerProfileId: profile.id, status: 'WON', createdAt: dateFilter },
            }),
            this.prisma.listing.aggregate({
                where: { sellerId: ownerUserId, deletedAt: null, createdAt: dateFilter },
                _avg: { viewCount: true },
            }),
            // Previous period (for trend %)
            this.prisma.sale.aggregate({
                where: { sellerId: ownerUserId, createdAt: prevFilter },
                _sum: { soldPrice: true },
            }),
            this.prisma.sale.count({
                where: { sellerId: ownerUserId, createdAt: prevFilter },
            }),
            this.prisma.offer.count({
                where: { listing: { sellerId: ownerUserId }, createdAt: prevFilter },
            }),
            this.prisma.offer.count({
                where: { listing: { sellerId: ownerUserId }, status: 'ACCEPTED', createdAt: prevFilter },
            }),
            this.prisma.lead.count({
                where: { dealerProfileId: profile.id, createdAt: prevFilter },
            }),
            this.prisma.lead.count({
                where: { dealerProfileId: profile.id, status: 'WON', createdAt: prevFilter },
            }),
            this.prisma.listing.aggregate({
                where: { sellerId: ownerUserId, deletedAt: null, createdAt: prevFilter },
                _avg: { viewCount: true },
            }),
        ]);

        const totalRev = Number(currentRevenue._sum.soldPrice || 0);
        const prevTotalRev = Number(prevRevenue._sum.soldPrice || 0);
        const offerConvRate = currentOfferTotal > 0 ? Math.round((currentOfferAccepted / currentOfferTotal) * 1000) / 10 : 0;
        const prevOfferConvRate = prevOfferTotal > 0 ? Math.round((prevOfferAccepted / prevOfferTotal) * 1000) / 10 : 0;
        const leadConvRate = currentLeadTotal > 0 ? Math.round((currentLeadWon / currentLeadTotal) * 1000) / 10 : 0;
        const prevLeadConvRate = prevLeadTotal > 0 ? Math.round((prevLeadWon / prevLeadTotal) * 1000) / 10 : 0;
        const avgViews = Math.round(currentAvgViews._avg.viewCount || 0);
        const prevAvgViewsVal = Math.round(prevAvgViews._avg.viewCount || 0);

        // ─── Revenue Trend (by month, last 12 months max) ───────────

        const revenueTrendRaw = await this.prisma.$queryRawUnsafe<Array<{ month: string; revenue: string; units: string }>>(
            `SELECT 
                TO_CHAR(s."createdAt", 'YYYY-MM') AS month,
                SUM(s."soldPrice")::TEXT AS revenue,
                COUNT(*)::TEXT AS units
             FROM sales s
             WHERE s."sellerId" = $1
               AND s."createdAt" >= $2
             GROUP BY TO_CHAR(s."createdAt", 'YYYY-MM')
             ORDER BY month ASC`,
            ownerUserId,
            subDays(new Date(), 365),
        );

        const revenueTrend = revenueTrendRaw.map(r => ({
            month: r.month,
            revenue: Number(r.revenue || 0),
            unitsSold: Number(r.units || 0),
        }));

        // ─── Lead Funnel ─────────────────────────────────────────────

        const leadsByStatus = await this.prisma.lead.groupBy({
            by: ['status'],
            where: { dealerProfileId: profile.id },
            _count: true,
        });

        const leadFunnel: Record<string, number> = {
            NEW: 0, CONTACTED: 0, QUALIFIED: 0, NEGOTIATING: 0, WON: 0, LOST: 0,
        };
        leadsByStatus.forEach(l => { leadFunnel[l.status] = l._count; });

        // ─── Offer Breakdown ─────────────────────────────────────────

        const offersByStatus = await this.prisma.offer.groupBy({
            by: ['status'],
            where: { listing: { sellerId: ownerUserId } },
            _count: true,
        });

        const offerBreakdown: Record<string, number> = {
            PENDING: 0, ACCEPTED: 0, REJECTED: 0, COUNTERED: 0, WITHDRAWN: 0,
        };
        offersByStatus.forEach(o => { offerBreakdown[o.status] = o._count; });

        // Average accepted offer amount
        const avgAccepted = await this.prisma.offer.aggregate({
            where: { listing: { sellerId: ownerUserId }, status: 'ACCEPTED' },
            _avg: { amount: true },
        });

        // Average response time (hours between offer creation and update for non-pending)
        const avgResponseRaw = await this.prisma.$queryRawUnsafe<Array<{ avg_hours: string }>>(
            `SELECT AVG(EXTRACT(EPOCH FROM (o."updatedAt" - o."createdAt")) / 3600)::TEXT AS avg_hours
             FROM offers o
             JOIN listings l ON o."listingId" = l.id
             WHERE l."sellerId" = $1
               AND o.status != 'PENDING'`,
            ownerUserId,
        );

        // ─── Inventory Health ────────────────────────────────────────

        const listingsByStatus = await this.prisma.listing.groupBy({
            by: ['status'],
            where: { sellerId: ownerUserId, deletedAt: null },
            _count: true,
        });

        const inventoryHealth: Record<string, number> = {
            DRAFT: 0, ACTIVE: 0, OFFER_ACCEPTED: 0, SOLD: 0, WITHDRAWN: 0,
        };
        listingsByStatus.forEach(l => { inventoryHealth[l.status] = l._count; });

        // Average listing age + stale count (active listings > 60 days)
        const agingRaw = await this.prisma.$queryRawUnsafe<Array<{ avg_days: string; stale_count: string }>>(
            `SELECT 
                AVG(EXTRACT(EPOCH FROM (NOW() - l."createdAt")) / 86400)::TEXT AS avg_days,
                COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (NOW() - l."createdAt")) / 86400 > 60)::TEXT AS stale_count
             FROM listings l
             WHERE l."sellerId" = $1
               AND l."deletedAt" IS NULL
               AND l.status = 'ACTIVE'`,
            ownerUserId,
        );

        // Aging buckets for active listings
        const agingBucketsRaw = await this.prisma.$queryRawUnsafe<Array<{ bucket: string; count: string }>>(
            `SELECT 
                CASE 
                    WHEN EXTRACT(EPOCH FROM (NOW() - l."createdAt")) / 86400 <= 7 THEN '0-7d'
                    WHEN EXTRACT(EPOCH FROM (NOW() - l."createdAt")) / 86400 <= 30 THEN '8-30d'
                    WHEN EXTRACT(EPOCH FROM (NOW() - l."createdAt")) / 86400 <= 60 THEN '31-60d'
                    ELSE '60d+'
                END AS bucket,
                COUNT(*)::TEXT AS count
             FROM listings l
             WHERE l."sellerId" = $1
               AND l."deletedAt" IS NULL
               AND l.status = 'ACTIVE'
             GROUP BY bucket
             ORDER BY MIN(EXTRACT(EPOCH FROM (NOW() - l."createdAt")) / 86400) ASC`,
            ownerUserId,
        );

        const agingBuckets: Record<string, number> = { '0-7d': 0, '8-30d': 0, '31-60d': 0, '60d+': 0 };
        agingBucketsRaw.forEach(b => { agingBuckets[b.bucket] = Number(b.count); });

        // ─── Top Performing Vehicles ─────────────────────────────────

        const topVehiclesRaw = await this.prisma.listing.findMany({
            where: { sellerId: ownerUserId, deletedAt: null },
            orderBy: { viewCount: 'desc' },
            take: 10,
            select: {
                id: true,
                title: true,
                images: true,
                viewCount: true,
                price: true,
                status: true,
                createdAt: true,
                _count: { select: { offers: true } },
            },
        });

        const topVehicles = topVehiclesRaw.map(v => ({
            id: v.id,
            title: v.title,
            image: v.images?.[0] || null,
            views: v.viewCount,
            offerCount: v._count.offers,
            price: Number(v.price),
            status: v.status,
            daysListed: Math.floor((Date.now() - new Date(v.createdAt).getTime()) / 86400000),
        }));

        // ─── Avg Days to Sell ────────────────────────────────────────

        const [avgDaysRaw, prevAvgDaysRaw] = await Promise.all([
            this.prisma.$queryRawUnsafe<Array<{ avg_days: string }>>(
                `SELECT AVG(EXTRACT(EPOCH FROM (s."createdAt" - l."createdAt")) / 86400)::TEXT AS avg_days
                 FROM sales s
                 JOIN listings l ON s."listingId" = l.id
                 WHERE s."sellerId" = $1
                   AND s."createdAt" >= $2`,
                ownerUserId,
                dateFilter.gte,
            ),
            this.prisma.$queryRawUnsafe<Array<{ avg_days: string }>>(
                `SELECT AVG(EXTRACT(EPOCH FROM (s."createdAt" - l."createdAt")) / 86400)::TEXT AS avg_days
                 FROM sales s
                 JOIN listings l ON s."listingId" = l.id
                 WHERE s."sellerId" = $1
                   AND s."createdAt" >= $2
                   AND s."createdAt" < $3`,
                ownerUserId,
                prevFilter.gte,
                prevFilter.lte,
            ),
        ]);

        const avgDaysToSell = Math.round(Number(avgDaysRaw?.[0]?.avg_days || 0));
        const prevAvgDaysToSell = Math.round(Number(prevAvgDaysRaw?.[0]?.avg_days || 0));

        // ─── New KPIs ─────────────────────────────────────────────────

        const [
            avgSoldPriceRaw,
            stockValueRaw,
            marginVsListedRaw,
            topSellingModelsRaw,
            fastMoversRaw,
            slowMoversRaw,
            leadSourceRaw,
            salespersonRaw,
            salesByTypeRaw,
            customersByAreaRaw,
        ] = await Promise.all([
            // Avg sold price in period
            this.prisma.sale.aggregate({
                where: { sellerId: ownerUserId, createdAt: dateFilter },
                _avg: { soldPrice: true },
            }),
            // Stock value: sum of all active listing prices
            this.prisma.listing.aggregate({
                where: { sellerId: ownerUserId, status: 'ACTIVE', deletedAt: null },
                _sum: { price: true },
            }),
            // Margin vs listed: avg % diff between sold price and original list price
            this.prisma.$queryRawUnsafe<Array<{ avg_margin: string }>>(
                `SELECT AVG((s."soldPrice" - l.price) / NULLIF(l.price, 0) * 100)::TEXT AS avg_margin
                 FROM sales s
                 JOIN listings l ON s."listingId" = l.id
                 WHERE s."sellerId" = $1
                   AND s."createdAt" >= $2`,
                ownerUserId,
                dateFilter.gte,
            ),
            // Top selling models by units sold
            this.prisma.$queryRawUnsafe<Array<{ make: string; model: string; units: string; revenue: string; avg_price: string }>>(
                `SELECT l.make, l.model,
                        COUNT(*)::TEXT AS units,
                        SUM(s."soldPrice")::TEXT AS revenue,
                        AVG(s."soldPrice")::TEXT AS avg_price
                 FROM sales s
                 JOIN listings l ON s."listingId" = l.id
                 WHERE s."sellerId" = $1
                   AND s."createdAt" >= $2
                   AND l.make IS NOT NULL
                 GROUP BY l.make, l.model
                 ORDER BY COUNT(*) DESC
                 LIMIT 10`,
                ownerUserId,
                dateFilter.gte,
            ),
            // Fast movers: sold vehicles grouped by model, ordered by avg days to sell ASC
            this.prisma.$queryRawUnsafe<Array<{ make: string; model: string; units: string; avg_days: string }>>(
                `SELECT l.make, l.model,
                        COUNT(*)::TEXT AS units,
                        AVG(EXTRACT(EPOCH FROM (s."createdAt" - l."createdAt")) / 86400)::TEXT AS avg_days
                 FROM sales s
                 JOIN listings l ON s."listingId" = l.id
                 WHERE s."sellerId" = $1
                   AND s."createdAt" >= $2
                   AND l.make IS NOT NULL
                 GROUP BY l.make, l.model
                 HAVING COUNT(*) >= 1
                 ORDER BY AVG(EXTRACT(EPOCH FROM (s."createdAt" - l."createdAt")) / 86400) ASC
                 LIMIT 10`,
                ownerUserId,
                dateFilter.gte,
            ),
            // Slow movers: active listings grouped by model, ordered by avg days in stock DESC
            this.prisma.$queryRawUnsafe<Array<{ make: string; model: string; count: string; avg_days: string }>>(
                `SELECT l.make, l.model,
                        COUNT(*)::TEXT AS count,
                        AVG(EXTRACT(EPOCH FROM (NOW() - l."createdAt")) / 86400)::TEXT AS avg_days
                 FROM listings l
                 WHERE l."sellerId" = $1
                   AND l."deletedAt" IS NULL
                   AND l.status = 'ACTIVE'
                   AND l.make IS NOT NULL
                 GROUP BY l.make, l.model
                 ORDER BY AVG(EXTRACT(EPOCH FROM (NOW() - l."createdAt")) / 86400) DESC
                 LIMIT 10`,
                ownerUserId,
            ),
            // Lead source breakdown
            this.prisma.$queryRawUnsafe<Array<{ source: string; count: string }>>(
                `SELECT COALESCE(NULLIF(source, ''), 'unknown') AS source, COUNT(*)::TEXT AS count
                 FROM leads
                 WHERE "dealerProfileId" = $1
                 GROUP BY COALESCE(NULLIF(source, ''), 'unknown')
                 ORDER BY COUNT(*) DESC`,
                profile.id,
            ),
            // Salesperson performance
            this.prisma.$queryRawUnsafe<Array<{ name: string; total: string; won: string; active: string }>>(
                `SELECT TRIM(u."firstName" || ' ' || COALESCE(u."lastName", '')) AS name,
                        COUNT(*)::TEXT AS total,
                        COUNT(*) FILTER (WHERE l.status = 'WON')::TEXT AS won,
                        COUNT(*) FILTER (WHERE l.status NOT IN ('WON', 'LOST'))::TEXT AS active
                 FROM leads l
                 JOIN users u ON l."assignedToId" = u.id
                 WHERE l."dealerProfileId" = $1
                 GROUP BY u.id, u."firstName", u."lastName"
                 ORDER BY COUNT(*) FILTER (WHERE l.status = 'WON') DESC`,
                profile.id,
            ),
            // Sales by listing type (AUCTION vs CLASSIFIED)
            this.prisma.$queryRawUnsafe<Array<{ type: string; units: string; revenue: string }>>(
                `SELECT l.type, COUNT(*)::TEXT AS units, SUM(s."soldPrice")::TEXT AS revenue
                 FROM sales s
                 JOIN listings l ON s."listingId" = l.id
                 WHERE s."sellerId" = $1
                   AND s."createdAt" >= $2
                 GROUP BY l.type`,
                ownerUserId,
                dateFilter.gte,
            ),
            // Customers by area (UK postcode)
            this.prisma.$queryRawUnsafe<Array<{ postcode: string; count: string; revenue: string }>>(
                `SELECT "buyerPostcode" AS postcode,
                        COUNT(*)::TEXT AS count,
                        SUM("soldPrice")::TEXT AS revenue
                 FROM sales
                 WHERE "sellerId" = $1
                   AND "buyerPostcode" IS NOT NULL
                   AND "createdAt" >= $2
                 GROUP BY "buyerPostcode"
                 ORDER BY COUNT(*) DESC
                 LIMIT 15`,
                ownerUserId,
                dateFilter.gte,
            ),
        ]);

        const avgSoldPrice = Math.round(Number(avgSoldPriceRaw._avg.soldPrice || 0));
        const stockValue = Math.round(Number(stockValueRaw._sum.price || 0));
        const marginVsListed = Math.round(Number(marginVsListedRaw?.[0]?.avg_margin || 0) * 10) / 10;

        const topSellingModels = topSellingModelsRaw.map(r => ({
            make: r.make, model: r.model,
            units: Number(r.units), revenue: Math.round(Number(r.revenue)),
            avgPrice: Math.round(Number(r.avg_price)),
        }));

        const fastMovers = fastMoversRaw.map(r => ({
            make: r.make, model: r.model,
            units: Number(r.units), avgDays: Math.round(Number(r.avg_days)),
        }));

        const slowMovers = slowMoversRaw.map(r => ({
            make: r.make, model: r.model,
            count: Number(r.count), avgDays: Math.round(Number(r.avg_days)),
        }));

        const leadSourceBreakdown = leadSourceRaw.map(r => ({
            source: r.source, count: Number(r.count),
        }));

        const salespersonPerformance = salespersonRaw.map(r => ({
            name: r.name, total: Number(r.total), won: Number(r.won), active: Number(r.active),
            conversionRate: Number(r.total) > 0 ? Math.round((Number(r.won) / Number(r.total)) * 1000) / 10 : 0,
        }));

        const salesByType: Record<string, { units: number; revenue: number }> = {
            AUCTION: { units: 0, revenue: 0 },
            CLASSIFIED: { units: 0, revenue: 0 },
        };
        salesByTypeRaw.forEach(r => {
            salesByType[r.type] = { units: Number(r.units), revenue: Math.round(Number(r.revenue)) };
        });

        const customersByArea = customersByAreaRaw.map(r => ({
            postcode: r.postcode, count: Number(r.count), revenue: Math.round(Number(r.revenue)),
        }));

        return {
            kpis: {
                totalRevenue: totalRev,
                totalRevenueTrend: this.calcTrend(totalRev, prevTotalRev),
                totalUnitsSold: currentUnitsSold,
                totalUnitsSoldTrend: this.calcTrend(currentUnitsSold, prevUnitsSold),
                avgDaysToSell,
                avgDaysToSellTrend: this.calcTrend(prevAvgDaysToSell, avgDaysToSell),
                offerConversionRate: offerConvRate,
                offerConversionRateTrend: this.calcTrend(offerConvRate, prevOfferConvRate),
                leadConversionRate: leadConvRate,
                leadConversionRateTrend: this.calcTrend(leadConvRate, prevLeadConvRate),
                avgViewsPerListing: avgViews,
                avgViewsPerListingTrend: this.calcTrend(avgViews, prevAvgViewsVal),
                avgSoldPrice,
                stockValue,
                marginVsListed,
            },
            revenueTrend,
            leadFunnel,
            offerBreakdown: {
                ...offerBreakdown,
                avgAcceptedAmount: Number(avgAccepted._avg.amount || 0),
                avgTimeToRespond: Math.round(Number(avgResponseRaw?.[0]?.avg_hours || 0) * 10) / 10,
            },
            inventoryHealth: {
                ...inventoryHealth,
                avgAge: Math.round(Number(agingRaw?.[0]?.avg_days || 0)),
                staleCount: Number(agingRaw?.[0]?.stale_count || 0),
                agingBuckets,
            },
            topVehicles,
            topSellingModels,
            fastMovers,
            slowMovers,
            leadSourceBreakdown,
            salespersonPerformance,
            salesByType,
            customersByArea,
        };
    }

    // ─── Leads (CRM) ───────────────────────────────────────────────

    async getLeads(userId: string, status?: string, page = 1, limit = 20) {
        const profile = await this.getDealerProfile(userId);

        const where: any = { dealerProfileId: profile.id };
        if (status) where.status = status;

        const [data, total] = await Promise.all([
            this.prisma.lead.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip: (page - 1) * limit,
                take: limit,
                include: {
                    listing: { select: { id: true, title: true, slug: true, images: true, price: true } },
                    assignedTo: { select: { id: true, firstName: true, lastName: true, email: true } },
                },
            }),
            this.prisma.lead.count({ where }),
        ]);

        return { data, total };
    }

    async createLead(userId: string, dto: CreateLeadDto) {
        const profile = await this.getDealerProfile(userId);

        return this.prisma.lead.create({
            data: {
                dealerProfileId: profile.id,
                buyerName: dto.buyerName,
                buyerEmail: dto.buyerEmail,
                buyerPhone: dto.buyerPhone,
                listingId: dto.listingId,
                assignedToId: dto.assignedToId,
                source: dto.source,
                notes: dto.notes,
            },
            include: {
                listing: { select: { id: true, title: true } },
                assignedTo: { select: { id: true, firstName: true, lastName: true } },
            },
        });
    }

    async updateLead(userId: string, leadId: string, dto: UpdateLeadDto) {
        const profile = await this.getDealerProfile(userId);

        const lead = await this.prisma.lead.findFirst({
            where: { id: leadId, dealerProfileId: profile.id },
        });
        if (!lead) throw new NotFoundException('Lead not found');

        return this.prisma.lead.update({
            where: { id: leadId },
            data: {
                ...(dto.status && { status: dto.status as any }),
                ...(dto.assignedToId !== undefined && { assignedToId: dto.assignedToId }),
                ...(dto.notes !== undefined && { notes: dto.notes }),
            },
            include: {
                listing: { select: { id: true, title: true } },
                assignedTo: { select: { id: true, firstName: true, lastName: true } },
            },
        });
    }

    // ─── Staff (RBAC) ───────────────────────────────────────────────

    async getStaff(userId: string) {
        const profile = await this.getDealerProfile(userId);
        
        const [activeStaff, pendingInvites] = await Promise.all([
            this.prisma.dealerStaff.findMany({
                where: { dealerProfileId: profile.id, isActive: true },
                include: {
                    user: { select: { id: true, firstName: true, lastName: true, email: true, profileImage: true } },
                },
                orderBy: { createdAt: 'asc' },
            }),
            this.prisma.dealerInvite.findMany({
                where: { dealerProfileId: profile.id },
                orderBy: { createdAt: 'desc' },
            }),
        ]);

        return {
            active: activeStaff,
            pending: pendingInvites.map(i => ({
                id: i.id,
                email: i.email,
                role: i.role,
                status: 'PENDING',
                createdAt: i.createdAt,
            })),
        };
    }

    async inviteStaff(userId: string, dto: InviteStaffDto) {
        const profile = await this.getDealerProfile(userId);
        const email = dto.email.toLowerCase().trim();

        // 1. If user exists, add them directly as active staff
        const targetUser = await this.prisma.user.findUnique({ where: { email } });
        if (targetUser) {
            const existing = await this.prisma.dealerStaff.findUnique({
                where: { userId_dealerProfileId: { userId: targetUser.id, dealerProfileId: profile.id } },
            });
            if (existing) {
                if (existing.isActive) throw new BadRequestException('User is already a staff member of this dealership');
                // Reactivate previously deactivated staff + re-elevate role
                const [reactivated] = await this.prisma.$transaction([
                    this.prisma.dealerStaff.update({
                        where: { id: existing.id },
                        data: { isActive: true, role: dto.role as any },
                        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
                    }),
                    this.prisma.user.update({ where: { id: targetUser.id }, data: { role: 'DEALER' } }),
                ]);
                this.sendStaffAddedNotifications(targetUser, profile.companyName, dto.role);
                return reactivated;
            }

            const [staff] = await this.prisma.$transaction([
                this.prisma.dealerStaff.create({
                    data: {
                        userId: targetUser.id,
                        dealerProfileId: profile.id,
                        role: dto.role as any,
                    },
                    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
                }),
                this.prisma.user.update({ where: { id: targetUser.id }, data: { role: 'DEALER' } }),
            ]);

            this.sendStaffAddedNotifications(targetUser, profile.companyName, dto.role);
            return staff;
        }

        // 2. If user doesn't exist, create a pending invitation with a secure token
        const existingInvite = await this.prisma.dealerInvite.findUnique({
            where: { email_dealerProfileId: { email, dealerProfileId: profile.id } },
        });
        if (existingInvite) throw new BadRequestException('An invitation has already been sent to this email');

        const token = randomBytes(32).toString('hex');

        const invite = await this.prisma.dealerInvite.create({
            data: {
                email,
                dealerProfileId: profile.id,
                role: dto.role as any,
                token,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            },
        });

        // Send the invitation email
        await this.emailService.sendStaffInviteEmail(
            email,
            profile.companyName,
            dto.role,
            token,
        ).catch(() => {}); // fire-and-forget

        return invite;
    }

    async acceptInvite(token: string, userId: string) {
        const invite = await this.prisma.dealerInvite.findUnique({ where: { token } });

        if (!invite) throw new NotFoundException('Invitation not found or already used.');
        if (invite.expiresAt < new Date()) throw new BadRequestException('This invitation has expired.');

        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found.');

        // Check the email matches (prevent token theft by logged-in users with different emails)
        if (user.email.toLowerCase() !== invite.email.toLowerCase()) {
            throw new ForbiddenException(
                'This invitation was sent to a different email address. Please log in with the invited email.',
            );
        }

        // Prevent duplicate staff membership
        const existing = await this.prisma.dealerStaff.findUnique({
            where: { userId_dealerProfileId: { userId, dealerProfileId: invite.dealerProfileId } },
        });

        if (existing) {
            if (existing.isActive) {
                // Already a member — clean up stale invite and return success
                await this.prisma.dealerInvite.delete({ where: { token } });
                return { message: 'You are already a staff member of this dealership.' };
            }
            // Reactivate
            await this.prisma.dealerStaff.update({
                where: { id: existing.id },
                data: { isActive: true, role: invite.role },
            });
        } else {
            await this.prisma.dealerStaff.create({
                data: {
                    userId,
                    dealerProfileId: invite.dealerProfileId,
                    role: invite.role,
                },
            });
        }

        // Elevate user role to DEALER so they can access the dealer dashboard
        await this.prisma.user.update({ where: { id: userId }, data: { role: 'DEALER' } });

        // Delete the invite so it can't be reused
        await this.prisma.dealerInvite.delete({ where: { token } });

        const dealerProfile = await this.prisma.dealerProfile.findUnique({
            where: { id: invite.dealerProfileId },
            select: { companyName: true },
        });

        return { message: `You have successfully joined ${dealerProfile?.companyName ?? 'the dealership'}.` };
    }

    async removeStaff(userId: string, staffId: string) {
        const profile = await this.getDealerProfile(userId);

        const staff = await this.prisma.dealerStaff.findFirst({
            where: { id: staffId, dealerProfileId: profile.id },
        });
        if (!staff) throw new NotFoundException('Staff member not found');

        // Prevent removing yourself if you're the only admin
        if (staff.userId === userId) {
            const adminCount = await this.prisma.dealerStaff.count({
                where: { dealerProfileId: profile.id, role: 'ADMIN', isActive: true },
            });
            if (adminCount <= 1) throw new ForbiddenException('Cannot remove the last admin');
        }

        await this.prisma.dealerStaff.update({
            where: { id: staffId },
            data: { isActive: false },
        });

        // Demote role back to SELLER if this was their last active position
        const otherActive = await this.prisma.dealerStaff.count({
            where: { userId: staff.userId, isActive: true },
        });
        if (otherActive === 0) {
            await this.prisma.user.update({ where: { id: staff.userId }, data: { role: 'SELLER' } });
        }

        return { success: true };
    }

    // ─── Purchases ────────────────────────────────────────────────────

    async getDealerPurchases(userId: string, page = 1, limit = 20) {
        const skip = (page - 1) * limit;

        const [sales, total] = await Promise.all([
            this.prisma.sale.findMany({
                where: { buyerId: userId },
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
                            mileage: true,
                            color: true,
                            engineSize: true,
                        },
                    },
                    seller: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            phone: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.sale.count({ where: { buyerId: userId } }),
        ]);

        const data = sales.map((sale) => {
            const l = sale.listing;
            const subtitle = [
                l?.engineSize ? `${(l.engineSize / 1000).toFixed(1)}L` : null,
                l?.mileage != null ? `${l.mileage.toLocaleString()} mi` : null,
                l?.color ?? null,
            ].filter(Boolean).join(' • ');

            return {
                id: sale.id,
                listingId: sale.listingId,
                vehicleTitle: l?.title ?? `${l?.make ?? ''} ${l?.model ?? ''} ${l?.year ?? ''}`.trim(),
                vehicleSubtitle: subtitle || undefined,
                imageUrl: l?.images?.[0] ?? undefined,
                purchasePrice: Number(sale.soldPrice),
                purchaseDate: sale.createdAt.toISOString(),
                sellerName: sale.seller
                    ? `${sale.seller.firstName ?? ''} ${sale.seller.lastName ?? ''}`.trim() || sale.seller.email
                    : undefined,
                sellerEmail: sale.seller?.email ?? undefined,
                sellerPhone: sale.seller?.phone ?? undefined,
                status: sale.purchaseStatus,
            };
        });

        return { data, total };
    }
}
