import {
    Injectable,
    ConflictException,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const BCRYPT_ROUNDS = 12;



@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    private supabase: SupabaseClient;

    private async processPendingInvitations(user: any) {
        try {
            const invites = await this.prisma.dealerInvite.findMany({
                where: { email: user.email.toLowerCase().trim() }
            });

            if (invites.length > 0) {
                await Promise.all(invites.map(invite => 
                    this.prisma.dealerStaff.create({
                        data: {
                            userId: user.id,
                            dealerProfileId: invite.dealerProfileId,
                            role: invite.role,
                        }
                    })
                ));

                await this.prisma.dealerInvite.deleteMany({
                    where: { email: user.email.toLowerCase().trim() }
                });

                this.logger.log(`Auto-processed ${invites.length} dealership invitations for ${user.email}`);
            }
        } catch (err: any) {
            this.logger.error(`Failed to process invitations for ${user.email}: ${err.message}`);
        }
    }

    constructor(
        private readonly prisma: PrismaService,
        private readonly emailService: EmailService,
    ) {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        // Validate the URL before passing to createClient — an invalid/empty
        // string causes @supabase/supabase-js to throw at construction time
        // and crash the whole NestJS process on startup.
        let validatedUrl = 'https://placeholder.supabase.co';
        if (supabaseUrl) {
            try {
                new URL(supabaseUrl);
                validatedUrl = supabaseUrl;
            } catch {
                this.logger.error(
                    `SUPABASE_URL "${supabaseUrl}" is malformed — falling back to placeholder. ` +
                    'Copy backend/.env.example → backend/.env and fill in the correct value.',
                );
            }
        } else {
            this.logger.warn('SUPABASE_URL not set — Supabase token verification will fail. See backend/.env.example.');
        }

        this.supabase = createClient(validatedUrl, supabaseKey || 'placeholder-key');
    }

    async register(dto: RegisterDto) {
        // Check for existing user
        const existing = await this.prisma.user.findUnique({
            where: { email: dto.email.toLowerCase().trim() },
        });

        if (existing) {
            throw new ConflictException('An account with this email already exists');
        }

        // Hash the password
        const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

        // Create the user
        const user = await this.prisma.user.create({
            data: {
                email: dto.email.toLowerCase().trim(),
                passwordHash,
                firstName: dto.firstName,
                lastName: dto.lastName,
                phone: dto.phone,
                role: dto.role || UserRole.BUYER,
            },
        });

        // Process any pending dealership invitations
        await this.processPendingInvitations(user);

        // Return user without password hash
        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
    }

    /**
     * Validate login credentials.
     * Returns the user if email + password match, otherwise throws.
     */
    async login(dto: LoginDto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email.toLowerCase().trim() },
        });

        if (!user || !user.passwordHash) {
            throw new UnauthorizedException('Invalid email or password');
        }

        // Check if account is locked
        if (user.lockoutUntil && user.lockoutUntil > new Date()) {
            const minutesLeft = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 60000);
            throw new UnauthorizedException(`Account locked. Try again in ${minutesLeft} minutes.`);
        }

        const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);

        if (!passwordValid) {
            // Increment failed attempts
            const attempts = user.loginAttempts + 1;
            const lockoutUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

            await this.prisma.user.update({
                where: { id: user.id },
                data: {
                    loginAttempts: attempts,
                    lockoutUntil,
                },
            });

            throw new UnauthorizedException('Invalid email or password');
        }

        // Reset attempts on successful login
        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                loginAttempts: 0,
                lockoutUntil: null,
            },
        });

        // Return user without password hash
        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
    }

    /**
     * Reset/Change user password
     */
    async resetPassword(userId: string, dto: any) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        // If user is authenticated via Supabase external auth, they should reset password via Supabase
        if (user.passwordHash === 'SUPABASE_EXTERNAL_AUTH') {
            throw new ConflictException('Please reset your password via your external authentication provider');
        }

        // Verify old password
        const oldPasswordValid = await bcrypt.compare(dto.oldPassword, user.passwordHash || '');
        if (!oldPasswordValid) {
            throw new UnauthorizedException('Current password is incorrect');
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

        // Update user
        await this.prisma.user.update({
            where: { id: userId },
            data: {
                passwordHash: newPasswordHash,
            },
        });

        return { success: true, message: 'Password reset successfully' };
    }


    /**
     * Retrieve a user by ID for session hydration.
     * Called by session middleware to populate req.user on each request.
     */
    async validateSession(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            include: {
                dealerProfile: true,
                contractorProfile: true,
                financePartnerProfile: true,
                insurancePartnerProfile: true,
            },
        });

        if (!user || user.deletedAt) {
            return null;
        }

        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
    }

    /**
     * Verify a Supabase access token and return the local DB user.
     * Used by the auth bridge to create backend sessions from Supabase JWTs.
     */
    async verifySupabaseToken(token: string) {
        if (!token?.trim()) {
            this.logger.warn('verifySupabaseToken: empty token');
            return null;
        }
        try {
            this.logger.log(`Verifying Supabase token...`);
            const { data, error } = await this.supabase.auth.getUser(token);

            if (error || !data.user) {
                this.logger.warn(
                    `Supabase getUser failed: ${error?.message || 'No user returned'}`
                );
                return null;
            }

            const email = data.user.email;
            if (!email) {
                this.logger.warn('Supabase user has no email');
                return null;
            }

            const emailNorm = email.toLowerCase().trim();

            // Look up the local user by Supabase ID first (exact match), then fall
            // back to email. Using two separate findUnique calls avoids the
            // findFirst + OR pattern which can return the wrong row when both
            // conditions match different users (non-deterministic DB ordering).
            let localUser = await this.prisma.user.findUnique({
                where: { id: data.user.id },
                include: {
                    dealerProfile: true,
                    contractorProfile: true,
                    financePartnerProfile: true,
                    insurancePartnerProfile: true,
                },
            });

            if (!localUser) {
                localUser = await this.prisma.user.findUnique({
                    where: { email: emailNorm },
                    include: {
                        dealerProfile: true,
                        contractorProfile: true,
                        financePartnerProfile: true,
                        insurancePartnerProfile: true,
                    },
                });
            }

            const isEmailConfirmed = !!data.user.email_confirmed_at;

            if (localUser && isEmailConfirmed && !localUser.isEmailVerified) {
                try {
                    localUser = await this.prisma.user.update({
                        where: { id: localUser.id },
                        data: { isEmailVerified: true },
                        include: {
                            dealerProfile: true,
                            contractorProfile: true,
                            financePartnerProfile: true,
                            insurancePartnerProfile: true,
                        },
                    });
                    this.logger.log(`Marked email as verified for ${emailNorm}`);
                } catch (e: any) {
                    this.logger.error(`Failed to update email verification for ${emailNorm}: ${e?.message}`);
                }
            }

            // Auto-sync: if valid Supabase user but no local user, create one
            if (!localUser) {
                try {
                    const meta = (data.user.user_metadata || {}) as Record<string, string>;
                    // Only treat role as explicitly set when it's actually in Supabase metadata.
                    // For OAuth providers (Google, etc.) meta.role is undefined — we must NOT
                    // overwrite a role that /users/sync already set correctly (e.g. DEALER).
                    const metaRole =
                        meta?.role && Object.values(UserRole).includes(meta.role as UserRole)
                            ? (meta.role as UserRole)
                            : undefined;
                    const createRole = metaRole ?? UserRole.BUYER;
                    // Resolve name across our signup metadata AND Google/Apple OAuth keys
                    const fullNameFallback = (meta.full_name || meta.name || '').trim();
                    const resolvedFirst =
                        meta.first_name ?? meta.firstName ?? meta.given_name ??
                        (fullNameFallback ? fullNameFallback.split(' ')[0] : undefined) ?? null;
                    const resolvedLast =
                        meta.last_name ?? meta.lastName ?? meta.family_name ??
                        (fullNameFallback.includes(' ') ? fullNameFallback.split(' ').slice(1).join(' ') : undefined) ?? null;
                    localUser = await this.prisma.user.upsert({
                            where: { email: emailNorm },
                            update: {
                                // NEVER update `id` — overwriting the PK would orphan all
                                // existing listings, sales, and offers for this user.
                                // Only overwrite name if we have a value (don't blank out existing names).
                                // Only overwrite role if explicitly present in Supabase metadata —
                                // avoids stomping over a role set by /users/sync for OAuth users.
                                ...(resolvedFirst && { firstName: resolvedFirst }),
                                ...(resolvedLast && { lastName: resolvedLast }),
                                ...(metaRole && { role: metaRole }),
                            },
                            create: {
                                id: data.user.id,
                                email: emailNorm,
                                firstName: resolvedFirst,
                                lastName: resolvedLast,
                                role: createRole,
                                passwordHash: 'SUPABASE_EXTERNAL_AUTH',
                                isEmailVerified: isEmailConfirmed,
                            },
                            include: {
                                dealerProfile: true,
                                contractorProfile: true,
                                financePartnerProfile: true,
                                insurancePartnerProfile: true,
                            },
                        });
                    this.logger.log(`Auto-synced new user from Supabase: ${email} (${data.user.id})`);
                    
                    // Process any pending dealership invitations
                    await this.processPendingInvitations(localUser);
                } catch (syncErr: any) {
                    this.logger.error(
                        `Auto-sync failed for ${email}: ${syncErr?.message || syncErr}`,
                        syncErr?.stack,
                    );
                    return null;
                }
            }

            if (localUser.deletedAt) {
                this.logger.warn(`User ${email} is marked as deleted`);
                return null;
            }

            const { passwordHash: _, ...safeUser } = localUser;
            return safeUser;
        } catch (err: any) {
            this.logger.error(`Supabase token verification error: ${err?.message}`, err?.stack);
            return null;
        }
    }

    /**
     * Generate a Supabase verification link via admin API and deliver it
     * through Resend so new users reliably receive their confirmation email.
     *
     * Uses type: 'magiclink' rather than 'signup' — 'signup' is for creating a
     * brand-new user in this same call and requires a `password` field (see
     * GenerateSignupLinkParams), but by the time this runs the user already
     * exists (created client-side via supabase.auth.signUp() on the signup
     * form) and is just pending confirmation. Calling generateLink with
     * type: 'signup' and no password never actually generated a usable link,
     * which is why verification emails were silently never sent. A magic
     * link for an existing unconfirmed user confirms their email as a
     * side effect of being verified, same as a signup link would.
     */
    async sendVerificationEmail(email: string, redirectTo: string): Promise<void> {
        const { data, error } = await this.supabase.auth.admin.generateLink({
            type: 'magiclink',
            email,
            options: { redirectTo },
        });

        if (error || !data?.properties?.action_link) {
            this.logger.error(`Failed to generate verification link for ${email}: ${error?.message}`);
            throw new Error(error?.message || 'Failed to generate verification link');
        }

        const verificationUrl = data.properties.action_link;
        const firstName = data.user?.user_metadata?.first_name || data.user?.user_metadata?.firstName;
        const name = firstName || email.split('@')[0];

        const sent = await this.emailService.sendBrandedEmail({
            to: email,
            subject: `${name}, please verify your CarMazium email`,
            bodyHtml: `
                <!-- Icon -->
                <div style="text-align: center; margin-bottom: 28px;">
                    <div style="display: inline-block; width: 64px; height: 64px; background: rgba(237,28,36,0.1); border: 1px solid rgba(237,28,36,0.25); border-radius: 50%;">
                        <div style="line-height: 64px; font-size: 28px;">✉️</div>
                    </div>
                </div>

                <!-- Heading -->
                <h1 style="margin: 0 0 8px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em; text-align: center;">
                    Confirm your email
                </h1>
                <p style="margin: 0 0 32px; font-size: 15px; color: #94a3b8; line-height: 1.6; text-align: center;">
                    Hi <strong style="color: #ffffff;">${name}</strong> — one quick step to activate your account.
                </p>

                <!-- Divider -->
                <div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent); margin: 0 0 32px;"></div>

                <!-- What happens next -->
                <p style="margin: 0 0 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b;">
                    What you get after verifying
                </p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 36px;">
                    <tr>
                        <td width="28" valign="top" style="padding: 6px 0;">
                            <div style="width: 20px; height: 20px; background: rgba(237,28,36,0.1); border: 1px solid rgba(237,28,36,0.2); border-radius: 6px; text-align: center; line-height: 20px; font-size: 11px; color: #ed1c24;">✓</div>
                        </td>
                        <td style="padding: 6px 0 6px 12px; color: #cbd5e1; font-size: 14px; line-height: 1.5;">Full access to buy, sell, and auction vehicles</td>
                    </tr>
                    <tr>
                        <td width="28" valign="top" style="padding: 6px 0;">
                            <div style="width: 20px; height: 20px; background: rgba(237,28,36,0.1); border: 1px solid rgba(237,28,36,0.2); border-radius: 6px; text-align: center; line-height: 20px; font-size: 11px; color: #ed1c24;">✓</div>
                        </td>
                        <td style="padding: 6px 0 6px 12px; color: #cbd5e1; font-size: 14px; line-height: 1.5;">Instant HPI checks and vehicle history reports</td>
                    </tr>
                    <tr>
                        <td width="28" valign="top" style="padding: 6px 0;">
                            <div style="width: 20px; height: 20px; background: rgba(237,28,36,0.1); border: 1px solid rgba(237,28,36,0.2); border-radius: 6px; text-align: center; line-height: 20px; font-size: 11px; color: #ed1c24;">✓</div>
                        </td>
                        <td style="padding: 6px 0 6px 12px; color: #cbd5e1; font-size: 14px; line-height: 1.5;">Real-time messaging with buyers and sellers</td>
                    </tr>
                </table>

                <!-- CTA -->
                <div style="text-align: center; margin: 0 0 28px;">
                    <a href="${verificationUrl}" target="_blank"
                       style="display: inline-block; padding: 18px 56px; background: linear-gradient(135deg, #ed1c24, #c41920); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 15px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(237,28,36,0.4);">
                        Verify My Email →
                    </a>
                </div>

                <!-- Fallback link -->
                <p style="margin: 0 0 8px; font-size: 12px; color: #475569; text-align: center; line-height: 1.6;">
                    Button not working? Copy and paste this link into your browser:
                </p>
                <p style="margin: 0 0 28px; font-size: 11px; color: #3b82f6; text-align: center; word-break: break-all; line-height: 1.6;">
                    ${verificationUrl}
                </p>

                <!-- Security note -->
                <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 16px; text-align: center;">
                    <p style="margin: 0; font-size: 12px; color: #475569; line-height: 1.6;">
                        This link expires in <strong style="color: #64748b;">24 hours</strong>. If you didn't create a CarMazium account, you can safely ignore this email.
                    </p>
                </div>
            `,
        });

        // sendBrandedEmail() swallows provider failures and returns null rather
        // than throwing (see EmailService). Logging success unconditionally is
        // exactly how an invalid RESEND_API_KEY went unnoticed in production:
        // the logs read "Verification email sent via Resend" on the very line
        // after "Failed to send branded email. Error: API key is invalid", so
        // nothing looked wrong while no user received a confirmation email.
        //
        // Throw instead. The signup form calls this fire-and-forget and the user
        // still reaches onboarding, so failing loudly costs nothing and puts a
        // real error in the logs and on the endpoint.
        if (!sent) {
            this.logger.error(
                `Verification email FAILED for ${email} — the email provider rejected the send (see the EmailService error logged above).`,
            );
            throw new Error('Failed to send verification email');
        }

        this.logger.log(`Verification email sent via Resend to ${email}`);
    }
}
