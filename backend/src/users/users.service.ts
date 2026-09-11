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
import { isSelfServiceRole } from '../auth/self-service-role';
import { EmailService } from '../email/email.service';
import * as bcrypt from 'bcrypt';

const VERIFICATION_CODE_TTL_MS = 30 * 60 * 1000;
const MAX_VERIFICATION_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 12;
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
        return new Stripe(this.config.get<string>('STRIPE_SECRET_KEY')!, { apiVersion: '2026-02-25.clover' as any });
    }

    async findById(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');
        return user;
    }

    async findByEmail(email: string) {
        return this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    }

    async getProfile(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                dealerProfile: { include: { kyc: true } },
                contractorProfile: true,
                financePartnerProfile: true,
                insurancePartnerProfile: true,
                dealerStaffMemberships: {
                    where: { isActive: true },
                    include: { dealerProfile: { select: { id: true, companyName: true, isVerified: true, logo: true } } },
                },
            },
        });
        if (!user) throw new NotFoundException('User not found');
        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
    }

    async deleteAccount(userId: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');
        if (user.deletedAt) throw new BadRequestException('This account has already been deleted');

        const liveAuctionAsSeller = await this.prisma.listing.findFirst({
            where: { sellerId: userId, deletedAt: null, auction: { status: 'ACTIVE' } },
            select: { id: true },
        });
        if (liveAuctionAsSeller) {
            throw new BadRequestException('You have a live auction in progress. Please wait for it to end before deleting your account.');
        }
        const activeBid = await this.prisma.bid.findFirst({
            where: { bidderId: userId, deletedAt: null, listing: { auction: { status: 'ACTIVE' } } },
            select: { id: true },
        });
        if (activeBid) {
            throw new BadRequestException('You have an active bid on a live auction. Please wait for it to end before deleting your account.');
        }
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
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');
        if (data.phone !== undefined && data.phone !== null && data.phone.trim() !== '') assertValidPhone(data.phone);
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
                    preferences: { ...((user.preferences as Record<string, any>) ?? {}), ...data.preferences },
                }),
            },
            include: { dealerProfile: true, contractorProfile: true },
        });
        const { passwordHash: _, ...safeUser } = updated;
        return safeUser;
    }

    async requestRoleElevation(userId: string, newRole: UserRole) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');
        if (!isSelfServiceRole(newRole)) {
            this.logger.warn(`Blocked self-service role escalation: user ${userId} (${user.role}) requested ${newRole}`);
            throw new ForbiddenException('That account type has to be set up by our team. Contact support to request it.');
        }
        if (user.role === UserRole.ADMIN) throw new ForbiddenException('Admin accounts cannot change their own role.');
        const updated = await this.prisma.user.update({ where: { id: userId }, data: { role: newRole } });
        this.logger.log(`Role change: user ${userId} ${user.role} -> ${newRole}`);
        const { passwordHash: _, ...safeUser } = updated;
        return safeUser;
    }

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
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');
        if (data.phone !== undefined && data.phone !== null && data.phone.trim() !== '') assertValidPhone(data.phone);
        const existing = await this.prisma.dealerProfile.findUnique({ where: { userId: user.id } });
        if (existing) return this.prisma.dealerProfile.update({ where: { userId: user.id }, data });
        if (user.role !== UserRole.DEALER) {
            throw new BadRequestException('Only users with the DEALER role can have a dealer profile');
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

    async syncUser(data: {
        id: string;
        email: string;
        firstName?: string;
        lastName?: string;
        role?: unknown;
    }) {
        const email = data.email.toLowerCase().trim();
        const requestedRole = isSelfServiceRole(data.role) ? data.role : undefined;
        const userExists = await this.prisma.user.findUnique({ where: { email } });

        // Existing privileged accounts (ADMIN/partners) may never be demoted or
        // altered by the public sync path. Existing self-service accounts may
        // switch only among the same safe set. New accounts default to BUYER.
        const mayUpdateRole = !!requestedRole && (!userExists || isSelfServiceRole(userExists.role));
        const createRole = requestedRole ?? UserRole.BUYER;

        const user = await this.prisma.user.upsert({
            where: { email },
            update: {
                ...(data.firstName && { firstName: data.firstName }),
                ...(data.lastName && { lastName: data.lastName }),
                ...(mayUpdateRole && { role: requestedRole }),
            },
            create: {
                id: data.id,
                email,
                firstName: data.firstName,
                lastName: data.lastName,
                role: createRole,
                passwordHash: 'SUPABASE_EXTERNAL_AUTH',
            },
        });
        if (!userExists) this.emailService.sendWelcomeEmail(user.email, user.firstName || undefined, user.role).catch(console.error);
        return { user, isNewUser: !userExists };
    }

    async startAddressVerification(userId: string, address: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
        const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MS);
        await this.prisma.addressVerification.create({ data: { userId, address, codeHash, expiresAt } });
        await this.emailService.sendAddressVerificationCodeEmail(user.email, user.firstName || 'there', code, address);
        return { address, expiresAt, message: `We've emailed a 6-digit verification code to ${user.email}.` };
    }

    async confirmAddressVerification(userId: string, code: string) {
        const verification = await this.prisma.addressVerification.findFirst({
            where: { userId, consumedAt: null },
            orderBy: { createdAt: 'desc' },
        });
        if (!verification) throw new BadRequestException('No pending verification found. Please request a new code.');
        if (verification.expiresAt < new Date()) throw new BadRequestException('This code has expired. Please request a new one.');
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
            this.prisma.addressVerification.update({ where: { id: verification.id }, data: { consumedAt: now } }),
            this.prisma.user.update({
                where: { id: userId },
                data: { isAddressVerified: true, addressVerifiedAt: now, location: verification.address },
            }),
        ]);
        return { verified: true, address: verification.address, verifiedAt: now };
    }

    async createConnectOnboardingLink(userId: string, returnUrl: string, refreshUrl: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, email: true, stripeConnectAccountId: true },
        });
        if (!user) throw new NotFoundException('User not found');
        const stripe = await this.getStripe();
        let accountId = user.stripeConnectAccountId;
        if (!accountId) {
            const account = await stripe.accounts.create({
                type: 'express',
                country: 'GB',
                email: user.email,
                capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
            });
            accountId = account.id;
            await this.prisma.user.update({ where: { id: userId }, data: { stripeConnectAccountId: accountId } });
        }
        const link = await stripe.accountLinks.create({
            account: accountId,
            return_url: returnUrl,
            refresh_url: refreshUrl,
            type: 'account_onboarding',
        });
        return { url: link.url };
    }

    async getConnectStatus(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { stripeConnectAccountId: true, stripeConnectOnboardingComplete: true },
        });
        if (!user) throw new NotFoundException('User not found');
        if (!user.stripeConnectAccountId) return { connected: false, onboardingComplete: false };
        const stripe = await this.getStripe();
        const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
        const complete = !!(
            account.details_submitted && account.charges_enabled && account.payouts_enabled &&
            (!account.requirements?.currently_due || account.requirements.currently_due.length === 0)
        );
        if (complete && !user.stripeConnectOnboardingComplete) {
            await this.prisma.user.update({ where: { id: userId }, data: { stripeConnectOnboardingComplete: true } });
        } else if (!complete && user.stripeConnectOnboardingComplete) {
            await this.prisma.user.update({ where: { id: userId }, data: { stripeConnectOnboardingComplete: false } });
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
