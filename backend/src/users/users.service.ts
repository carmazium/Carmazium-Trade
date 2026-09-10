import {
    Injectable,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';

const VERIFICATION_CODE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_VERIFICATION_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 12;

// Loose UK phone format: +44 or 0 prefix, 10-11 digits total, spaces/dashes allowed
const UK_PHONE_REGEX = /^(?:\+44|0)\d{9,10}$/;

function assertValidPhone(phone: string) {
    const stripped = phone.replace(/[\s-]/g, '');
    if (!UK_PHONE_REGEX.test(stripped)) {
        throw new BadRequestException('Please enter a valid UK phone number (e.g. 07123 456789 or +44 7123 456789).');
    }
}

@Injectable()
export class UsersService {
    private readonly logger = new Logger(UsersService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly emailService: EmailService,
        private readonly config: ConfigService,
    ) { }

    private async getStripe() {
        const Stripe = (await import('stripe')).default;
        return new Stripe(this.config.get<string>('STRIPE_SECRET_KEY')!, {
            apiVersion: '2026-02-25.clover' as any,
        });
    }

    /**
     * Find a user by their primary ID (UUID).
     */
    async findById(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        return user;
    }

    /**
     * Find a user by email address.
     * Used internally by AuthService during login.
     */
    async findByEmail(email: string) {
        return this.prisma.user.findUnique({
            where: { email: email.toLowerCase().trim() },
        });
    }

    /**
     * Get user profile with role-specific profile data included.
     */
    async getProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                dealerProfile: {
                    include: {
                        kyc: true
                    }
                },
                contractorProfile: true,
                financePartnerProfile: true,
                insurancePartnerProfile: true,
                dealerStaffMemberships: {
                    where: { isActive: true },
                    include: {
                        dealerProfile: {
                            select: { id: true, companyName: true, isVerified: true, logo: true },
                        },
                    },
                },
            },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        // Strip password hash from response
        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
    }

    /**
     * Soft-delete the current user's account — never a hard delete, since
     * Listing/Bid/Transaction all cascade off User at the DB level and a
     * real delete would wipe out other people's transaction/auction history
     * along with it. Anonymizes PII and withdraws listings that haven't
     * resulted in a live commitment; leaves historical bids/transactions/
     * chat rooms untouched since they're tied to other parties too.
     */
    async deleteAccount(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');
        if (user.deletedAt) throw new BadRequestException('This account has already been deleted');

        // Don't let a seller delete out from under an auction that's actively
        // receiving bids right now — that's unfair to bidders and could be
        // used to dodge losing.
        const liveAuctionAsSeller = await this.prisma.listing.findFirst({
            where: { sellerId: userId, deletedAt: null, auction: { status: 'ACTIVE' } },
            select: { id: true },
        });
        if (liveAuctionAsSeller) {
            throw new BadRequestException(
                'You have a live auction in progress. Please wait for it to end before deleting your account.',
            );
        }

        // Same reasoning for a buyer who's actively bidding right now.
        const activeBid = await this.prisma.bid.findFirst({
            where: { bidderId: userId, deletedAt: null, listing: { auction: { status: 'ACTIVE' } } },
            select: { id: true },
        });
        if (activeBid) {
            throw new BadRequestException(
                'You have an active bid on a live auction. Please wait for it to end before deleting your account.',
            );
        }

        // Withdraw listings that never reached a live commitment. Ended/sold
        // listings are already inert and stay as historical record.
        await this.prisma.listing.updateMany({
            where: { sellerId: userId, deletedAt: null, status: { in: ['DRAFT', 'PENDING_REVIEW', 'ACTIVE'] } },
            data: { status: 'WITHDRAWN' },
        });

        await this.prisma.user.update({
            where: { id: userId },
            data: {
                deletedAt: new Date(),
                email: `deleted-${userId}@deleted.carmazium.com`,
                passwordHash: 'ACCOUNT_DELETED',
                firstName: 'Deleted',
                lastName: 'User',
                phone: null,
                profileImage: null,
                bankAccountName: null,
                bankSortCode: null,
                bankAccountNumber: null,
            },
        });

        return { success: true };
    }

    /**
     * Update basic profile fields for the authenticated user.
     */
    async updateProfile(
        userId: string,
        data: {
            firstName?: string;
            lastName?: string;
            phone?: string;
            profileImage?: string;
            notifyOnSale?: boolean;
            showPublicProfile?: boolean;
            location?: string;
            postcode?: string;
            preferences?: Record<string, any>;
        },
    ) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (data.phone !== undefined && data.phone !== null && data.phone.trim() !== '') {
            assertValidPhone(data.phone);
        }

        const updated = await this.prisma.user.update({
            where: { id: userId },
            data: {
                ...(data.firstName !== undefined && { firstName: data.firstName }),
                ...(data.lastName !== undefined && { lastName: data.lastName }),
                ...(data.phone !== undefined && { phone: data.phone }),
                ...(data.profileImage !== undefined && { profileImage: data.profileImage }),
                ...(data.notifyOnSale !== undefined && { notifyOnSale: data.notifyOnSale }),
                ...(data.showPublicProfile !== undefined && { showPublicProfile: data.showPublicProfile }),
                ...(data.location !== undefined && { location: data.location }),
                ...(data.postcode !== undefined && { postcode: data.postcode }),
                ...(data.preferences !== undefined && {
                    preferences: {
                        ...((user.preferences as Record<string, any>) ?? {}),
                        ...data.preferences,
                    },
                }),
            },
            include: {
                dealerProfile: true,
                contractorProfile: true,
            },
        });

        const { passwordHash: _, ...safeUser } = updated;
        return safeUser;
    }

    /**
     * Roles a signed-in user may move themselves into, unassisted.
     *
     * Everything absent from this list is privileged and must be granted by an
     * admin, never by the account itself:
     *   ADMIN                       — full platform control
     *   CONTRACTOR                  — service-provider dashboard and job feed
     *   FINANCE_PARTNER / INSURANCE_PARTNER — partner dashboards and lead access
     *
     * DEALER is self-serve on purpose: it only unlocks the dealer dashboard in
     * limited mode, and everything that matters behind it (bidding, payouts)
     * additionally requires an approved KYC review.
     */
    private static readonly SELF_SERVICE_ROLES: readonly UserRole[] = [
        UserRole.BUYER,
        UserRole.SELLER,
        UserRole.DEALER,
    ];

    /**
     * Switch the caller's own account between self-service roles.
     *
     * This used to write whatever role it was handed, straight to the database,
     * for any authenticated caller — so any signed-in buyer could POST
     * `{ newRole: 'ADMIN' }` and take over the platform. The allowlist below is
     * the fix; do not replace it with a denylist, because a new privileged role
     * added to the enum would then be self-grantable by default.
     */
    async requestRoleElevation(userId: string, newRole: UserRole) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (!UsersService.SELF_SERVICE_ROLES.includes(newRole)) {
            // Deliberately vague to the caller, loud in the logs: probing this
            // endpoint for privileged roles is not something a real user does.
            this.logger.warn(
                `Blocked self-service role escalation: user ${userId} (${user.role}) requested ${newRole}`,
            );
            throw new ForbiddenException(
                'That account type has to be set up by our team. Contact support to request it.',
            );
        }

        // An admin must not be able to drop their own privileges through the
        // self-service door — a hijacked admin session could use it to hide the
        // takeover, and a real admin has no reason to demote themselves here.
        if (user.role === UserRole.ADMIN) {
            throw new ForbiddenException('Admin accounts cannot change their own role.');
        }

        const updated = await this.prisma.user.update({
            where: { id: userId },
            data: { role: newRole },
        });

        this.logger.log(`Role change: user ${userId} ${user.role} -> ${newRole}`);

        const { passwordHash: _, ...safeUser } = updated;
        return safeUser;
    }

    /**
     * Create or update a Dealer profile for the authenticated user.
     */
    async updateDealerProfile(
        userId: string,
        data: {
            companyName?: string;
            vatNumber?: string;
            registrationNumber?: string;
            businessAddress?: string;
            phone?: string;
            website?: string;
            description?: string;
            logo?: string;
        },
    ) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new NotFoundException('User not found');
        }

        if (data.phone !== undefined && data.phone !== null && data.phone.trim() !== '') {
            assertValidPhone(data.phone);
        }

        // On create, companyName is required — fall back to a placeholder so the
        // upsert doesn't fail when a dealer saves partial info before KYC.
        const existing = await this.prisma.dealerProfile.findUnique({ where: { userId: user.id } });

        if (existing) {
            // Allow update if a profile already exists (handles OAuth role-sync edge cases)
            return this.prisma.dealerProfile.update({
                where: { userId: user.id },
                data,
            });
        }

        // Enforce DEALER role only when creating a new dealer profile
        if (user.role !== UserRole.DEALER) {
            throw new BadRequestException(
                'Only users with the DEALER role can have a dealer profile',
            );
        }

        return this.prisma.dealerProfile.create({
            data: {
                userId: user.id,
                companyName: data.companyName || `${user.firstName || 'Dealer'}'s Dealership`,
                vatNumber: data.vatNumber || `PENDING-${user.id.slice(0, 8)}`,
                registrationNumber: data.registrationNumber,
                businessAddress: data.businessAddress,
                phone: data.phone,
                website: data.website,
                description: data.description,
                logo: data.logo,
            },
        });
    }

    /**
     * Sync user from Supabase (Legacy Frontend Support).
     * Creates a user record if it doesn't exist.
     * Accepts id or supabaseAuthId; optionally persists role.
     */
    async syncUser(data: {
        id?: string;
        supabaseAuthId?: string;
        email: string;
        firstName?: string;
        lastName?: string;
        role?: UserRole;
    }) {
        const email = data.email.toLowerCase().trim();
        const userId = data.id ?? data.supabaseAuthId;
        const role = data.role && Object.values(UserRole).includes(data.role) ? data.role : undefined;

        // Check if user already exists
        const userExists = await this.prisma.user.findUnique({
            where: { email },
        });

        const user = await this.prisma.user.upsert({
            where: { email },
            update: {
                // Only overwrite existing name if we have a non-empty value coming in
                ...(data.firstName && { firstName: data.firstName }),
                ...(data.lastName && { lastName: data.lastName }),
                ...(role !== undefined && { role }),
            },
            create: {
                ...(userId && { id: userId }),
                email,
                firstName: data.firstName,
                lastName: data.lastName,
                ...(role !== undefined && { role }),
                passwordHash: 'SUPABASE_EXTERNAL_AUTH', // Placeholder since auth is external
            },
        });

        // Fire and forget welcome email if it's a completely new user
        if (!userExists) {
            this.emailService.sendWelcomeEmail(user.email, user.firstName || undefined, user.role).catch(console.error);
        }

        // `isNewUser` is the authoritative "a brand-new account was just
        // created" signal — it can only ever be true once per account, on the
        // request that actually inserted the row. The frontend uses it to fire
        // the Google Ads "Completed Seller Registration" conversion, which must
        // never fire on a login, a dashboard refresh, or a return visit.
        // Deriving newness client-side (e.g. from how recent user.created_at
        // looks) would be a guess; this is a fact.
        return { user, isNewUser: !userExists };
    }

    /**
     * Start address verification: generates a one-time code, stores its hash,
     * and emails it to the user's account email address.
     */
    async startAddressVerification(userId: string, address: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) {
            throw new NotFoundException('User not found');
        }

        const code = String(Math.floor(100000 + Math.random() * 900000));
        const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
        const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);

        await this.prisma.addressVerification.create({
            data: { userId, address, codeHash, expiresAt },
        });

        const name = user.firstName || 'there';
        await this.emailService.sendAddressVerificationCodeEmail(user.email, name, code, address);

        return { address, expiresAt, message: `We've emailed a 6-digit verification code to ${user.email}.` };
    }

    /**
     * Confirm address verification using the most recent unconsumed code for the user.
     */
    async confirmAddressVerification(userId: string, code: string) {
        const verification = await this.prisma.addressVerification.findFirst({
            where: { userId, consumedAt: null },
            orderBy: { createdAt: 'desc' },
        });

        if (!verification) {
            throw new BadRequestException('No pending verification found. Please request a new code.');
        }

        if (verification.expiresAt < new Date()) {
            throw new BadRequestException('This code has expired. Please request a new one.');
        }

        if (verification.attempts >= MAX_VERIFICATION_ATTEMPTS) {
            throw new BadRequestException('Too many incorrect attempts. Please request a new code.');
        }

        const isMatch = await bcrypt.compare(code, verification.codeHash);
        if (!isMatch) {
            await this.prisma.addressVerification.update({
                where: { id: verification.id },
                data: { attempts: { increment: 1 } },
            });
            throw new BadRequestException('Incorrect code. Please try again.');
        }

        const now = new Date();
        await this.prisma.$transaction([
            this.prisma.addressVerification.update({
                where: { id: verification.id },
                data: { consumedAt: now },
            }),
            this.prisma.user.update({
                where: { id: userId },
                data: { isAddressVerified: true, addressVerifiedAt: now, location: verification.address },
            }),
        ]);

        return { verified: true, address: verification.address, verifiedAt: now };
    }

    /**
     * Create (or retrieve) a Stripe Express account for the user and return
     * a one-time onboarding link.
     */
    async createConnectOnboardingLink(userId: string, returnUrl: string, refreshUrl: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, stripeConnectAccountId: true },
        });
        if (!user) throw new NotFoundException('User not found');

        const stripe = await this.getStripe();

        // Create Express account on first call; reuse on subsequent calls
        let accountId = user.stripeConnectAccountId;
        if (!accountId) {
            const account = await stripe.accounts.create({
                type: 'express',
                country: 'GB',
                email: user.email,
                capabilities: {
                    card_payments: { requested: true },
                    transfers: { requested: true },
                },
            });
            accountId = account.id;
            await this.prisma.user.update({
                where: { id: userId },
                data: { stripeConnectAccountId: accountId },
            });
        }

        const link = await stripe.accountLinks.create({
            account: accountId,
            return_url: returnUrl,
            refresh_url: refreshUrl,
            type: 'account_onboarding',
        });

        return { url: link.url };
    }

    /**
     * Check whether the user's Stripe Connect account has completed onboarding.
     */
    async getConnectStatus(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { stripeConnectAccountId: true, stripeConnectOnboardingComplete: true },
        });
        if (!user) throw new NotFoundException('User not found');

        if (!user.stripeConnectAccountId) {
            return { connected: false, onboardingComplete: false };
        }

        const stripe = await this.getStripe();
        const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
        // details_submitted is the authoritative flag — it becomes true only after
        // the seller actually completes Stripe's onboarding wizard. charges_enabled
        // and payouts_enabled can be true in test mode immediately after account
        // creation, before the seller has submitted anything.
        const complete = !!(
            account.details_submitted &&
            account.charges_enabled &&
            account.payouts_enabled &&
            (!account.requirements?.currently_due || account.requirements.currently_due.length === 0)
        );

        // Persist completion state so other services can check without hitting Stripe
        if (complete && !user.stripeConnectOnboardingComplete) {
            await this.prisma.user.update({
                where: { id: userId },
                data: { stripeConnectOnboardingComplete: true },
            });
        } else if (!complete && user.stripeConnectOnboardingComplete) {
            // Requirements were added back (e.g. Stripe requested more info) — mark incomplete
            await this.prisma.user.update({
                where: { id: userId },
                data: { stripeConnectOnboardingComplete: false },
            });
        }

        return {
            connected: true,
            onboardingComplete: complete,
            accountId: user.stripeConnectAccountId,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            detailsSubmitted: account.details_submitted,
        };
    }

    async updateBankDetails(
        userId: string,
        dto: {
            bankAccountName?: string;
            bankSortCode?: string;
            bankAccountNumber?: string;
            payoutPreference?: string;
        },
    ) {
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
        if (!user) throw new NotFoundException('User not found');

        return this.prisma.user.update({
            where: { id: userId },
            data: {
                ...(dto.bankAccountName !== undefined && { bankAccountName: dto.bankAccountName }),
                ...(dto.bankSortCode !== undefined && { bankSortCode: dto.bankSortCode }),
                ...(dto.bankAccountNumber !== undefined && { bankAccountNumber: dto.bankAccountNumber }),
                ...(dto.payoutPreference !== undefined && { payoutPreference: dto.payoutPreference }),
            },
            select: {
                bankAccountName: true,
                bankSortCode: true,
                bankAccountNumber: true,
                payoutPreference: true,
            },
        });
    }
}
