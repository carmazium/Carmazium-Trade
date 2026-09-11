import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { resolveFrontendUrl } from '../core/frontend-url';

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);
    private resend: Resend;
    private readonly fromAddress: string;
    private readonly frontendUrl: string;
    private readonly logoUrl: string;

    constructor() {
        const apiKey = process.env.RESEND_API_KEY;

        if (!apiKey) {
            this.logger.warn('RESEND_API_KEY not found in environment variables. Email Service will fail.');
        }

        this.resend = new Resend(apiKey || '');
        this.fromAddress = process.env.EMAIL_FROM || 'CarMazium <noreply@carmazium.com>';
        this.frontendUrl = resolveFrontendUrl(process.env.FRONTEND_URL);
        this.logoUrl = `${this.frontendUrl}/assets/images/logo.png`;
    }

    // ─── Brand Template Shell ────────────────────────────────────────

    /**
     * Wraps email body content inside a branded CarMazium layout
     * with logo header, brand colors, and footer.
     */
    private wrapInBrandTemplate(bodyHtml: string): string {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CarMazium</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0f172a; font-family: 'Montserrat', 'Segoe UI', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    <div style="max-width: 640px; margin: 0 auto; padding: 40px 20px;">

        <!-- Header with Logo -->
        <div style="text-align: center; padding: 32px 0 24px;">
            <a href="${this.frontendUrl}" target="_blank" style="text-decoration: none;">
                <img src="${this.logoUrl}" alt="CarMazium" width="180" height="45" style="display: inline-block; max-width: 180px; height: auto;" />
            </a>
        </div>

        <!-- Main Card -->
        <div style="background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%); border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; overflow: hidden; box-shadow: 0 25px 50px rgba(0,0,0,0.5);">

            <!-- Red Accent Strip -->
            <div style="height: 4px; background: linear-gradient(90deg, #ed1c24, #ff4d4d, #ed1c24);"></div>

            <!-- Body Content -->
            <div style="padding: 48px 40px 40px;">
                ${bodyHtml}
            </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; padding: 32px 20px 16px;">
            <!-- Social / Quick Links -->
            <div style="margin-bottom: 20px;">
                <a href="${this.frontendUrl}/search" style="display: inline-block; margin: 0 10px; color: #94a3b8; text-decoration: none; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">Browse Cars</a>
                <span style="color: #334155;">•</span>
                <a href="${this.frontendUrl}/sell" style="display: inline-block; margin: 0 10px; color: #94a3b8; text-decoration: none; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">Sell Yours</a>
                <span style="color: #334155;">•</span>
                <a href="${this.frontendUrl}/pricing" style="display: inline-block; margin: 0 10px; color: #94a3b8; text-decoration: none; font-size: 12px; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase;">Pricing</a>
            </div>

            <p style="font-size: 11px; color: #475569; margin: 0 0 8px; line-height: 1.5;">
                &copy; ${new Date().getFullYear()} CarMazium Ltd. All rights reserved.
            </p>
            <p style="font-size: 10px; color: #334155; margin: 0;">
                The premier platform to buy, sell, and auction vehicles.
            </p>
        </div>
    </div>
</body>
</html>`;
    }

    // ─── Welcome Email ──────────────────────────────────────────────

    /**
     * Sends an onboarding welcome email asynchronously based on user role.
     */
    async sendWelcomeEmail(toEmail: string, firstName?: string, role: string = 'BUYER') {
        const name = firstName || 'there';

        const roleConfigs: Record<string, { greeting: string; tagline: string; features: string[] }> = {
            DEALER: {
                greeting: `Welcome aboard, ${name}!`,
                tagline: 'Your dealership command centre is ready.',
                features: [
                    'Manage your full vehicle inventory from one dashboard',
                    'Receive and respond to buyer leads & offers in real-time',
                    'Track performance analytics, revenue trends & conversion metrics',
                    'Configure your dealership profile to maximise buyer reach',
                ],
            },
            SELLER: {
                greeting: `Hey ${name}, welcome!`,
                tagline: 'You\'re all set to list and sell vehicles.',
                features: [
                    'Create professional listings with AI-powered descriptions',
                    'Receive offers and counter-offers directly on your dashboard',
                    'Track listing views, engagement, and buyer interest',
                    'Secure transactions with verified KYC protection',
                ],
            },
            BUYER: {
                greeting: `Hey ${name}, welcome!`,
                tagline: 'Start exploring thousands of verified vehicles.',
                features: [
                    'Search and filter from a curated marketplace of quality vehicles',
                    'Make offers and negotiate prices directly with sellers',
                    'Get instant vehicle history and HPI checks',
                    'Save favourites and receive price-drop alerts',
                ],
            },
            FINANCE_PARTNER: {
                greeting: `Welcome, ${name}!`,
                tagline: 'Your finance partner dashboard is live.',
                features: [
                    'Manage vehicle finance applications from your dashboard',
                    'Connect directly with buyers looking for financing',
                    'Track application progress and conversion rates',
                    'Configure your offerings and approval criteria',
                ],
            },
            INSURANCE_PARTNER: {
                greeting: `Welcome, ${name}!`,
                tagline: 'Your insurance partner portal is ready.',
                features: [
                    'Manage insurance quote requests from your dashboard',
                    'Connect with buyers seeking vehicle insurance',
                    'Track quote-to-policy conversion metrics',
                    'Configure coverage tiers and pricing rules',
                ],
            },
        };

        const config = roleConfigs[role] || roleConfigs.BUYER;

        const featureListHtml = config.features
            .map(
                (f) => `
                <tr>
                    <td width="28" valign="top" style="padding: 6px 0;">
                        <div style="width: 20px; height: 20px; background: rgba(237,28,36,0.1); border: 1px solid rgba(237,28,36,0.2); border-radius: 6px; text-align: center; line-height: 20px; font-size: 11px; color: #ed1c24;">✓</div>
                    </td>
                    <td style="padding: 6px 0 6px 12px; color: #cbd5e1; font-size: 14px; line-height: 1.5;">${f}</td>
                </tr>`,
            )
            .join('');

        const bodyHtml = `
            <!-- Greeting -->
            <h1 style="margin: 0 0 8px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                ${config.greeting}
            </h1>
            <p style="margin: 0 0 32px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                ${config.tagline}
            </p>

            <!-- Divider -->
            <div style="height: 1px; background: linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent); margin: 0 0 28px;"></div>

            <!-- What's included -->
            <p style="margin: 0 0 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; color: #64748b;">
                What you can do
            </p>
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px;">
                ${featureListHtml}
            </table>

            <!-- CTA Button -->
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/dashboard" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #ed1c24, #c41920); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(237,28,36,0.35);">
                    Go to Dashboard →
                </a>
            </div>

            <!-- Support note -->
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 20px; text-align: center; margin-top: 20px;">
                <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.5;">
                    Need help getting started? Simply reply to this email — our team is here for you.
                </p>
            </div>
        `;

        try {
            const { data, error } = await this.resend.emails.send({
                from: this.fromAddress,
                to: [toEmail],
                subject: `Welcome to CarMazium, ${name}! 🚗`,
                html: this.wrapInBrandTemplate(bodyHtml),
            });

            if (error) {
                this.logger.error(`Failed to send welcome email to ${toEmail}. Error: ${error.message}`);
                return;
            }

            this.logger.log(`Welcome email sent to ${toEmail} (id: ${data?.id})`);
        } catch (error: any) {
            this.logger.error(`Failed to send welcome email to ${toEmail}. Error: ${error.message}`);
        }
    }

    // ─── Generic Sender ─────────────────────────────────────────────

    /**
     * Send a branded transactional email with custom body content.
     * The body HTML is automatically wrapped in the CarMazium brand template.
     */
    async sendBrandedEmail(options: {
        to: string | string[];
        subject: string;
        bodyHtml: string;
        replyTo?: string;
        attachments?: { filename: string; content: Buffer }[];
    }) {
        try {
            const { data, error } = await this.resend.emails.send({
                from: this.fromAddress,
                to: Array.isArray(options.to) ? options.to : [options.to],
                subject: options.subject,
                html: this.wrapInBrandTemplate(options.bodyHtml),
                replyTo: options.replyTo,
                attachments: options.attachments,
            });

            if (error) {
                this.logger.error(`Failed to send branded email. Error: ${error.message}`);
                return null;
            }

            this.logger.log(`Branded email sent (id: ${data?.id})`);
            return data;
        } catch (error: any) {
            this.logger.error(`Failed to send branded email. Error: ${error.message}`);
            return null;
        }
    }

    /**
     * Send a raw email without the brand template wrapper.
     * Use this for system/transactional emails that don't need branding.
     */
    async sendEmail(options: {
        to: string | string[];
        subject: string;
        html: string;
        replyTo?: string;
        attachments?: { filename: string; content: Buffer }[];
    }) {
        try {
            const { data, error } = await this.resend.emails.send({
                from: this.fromAddress,
                to: Array.isArray(options.to) ? options.to : [options.to],
                subject: options.subject,
                html: options.html,
                replyTo: options.replyTo,
                attachments: options.attachments,
            });

            if (error) {
                this.logger.error(`Failed to send email. Error: ${error.message}`);
                return null;
            }

            this.logger.log(`Email sent (id: ${data?.id})`);
            return data;
        } catch (error: any) {
            this.logger.error(`Failed to send email. Error: ${error.message}`);
            return null;
        }
    }

    async sendStaffInviteEmail(
        toEmail: string,
        dealerName: string,
        role: string,
        inviteToken: string,
    ) {
        const inviteUrl = `${this.frontendUrl}/auth/accept-invite?token=${inviteToken}`;
        const roleLabel = role === 'ADMIN' ? 'Admin' : role === 'FINANCE_MANAGER' ? 'Finance Manager' : 'Sales Agent';

        const bodyHtml = `
            <h1 style="margin: 0 0 8px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                You've been invited! 🎉
            </h1>
            <p style="margin: 0 0 28px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                <strong style="color: #ffffff;">${dealerName}</strong> has invited you to join their dealership on CarMazium as a <strong style="color: #ed1c24;">${roleLabel}</strong>.
            </p>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 24px; margin-bottom: 32px;">
                <p style="margin: 0 0 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Your Role</p>
                <p style="margin: 0; font-size: 18px; font-weight: 800; color: #ffffff;">${roleLabel}</p>
                <p style="margin: 6px 0 0; font-size: 12px; color: #64748b;">at ${dealerName}</p>
            </div>
            <p style="margin: 0 0 24px; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                Click the button below to accept this invitation. The link expires in 7 days.
                If you don't have an account yet, you'll be prompted to create one first.
            </p>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${inviteUrl}" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #ed1c24, #c41920); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(237,28,36,0.35);">
                    Accept Invitation →
                </a>
            </div>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 16px; margin-top: 20px;">
                <p style="margin: 0 0 6px; font-size: 12px; color: #64748b; line-height: 1.5;">
                    Using the CarMazium app? Open <strong style="color: #94a3b8;">Settings → Have a dealer team invite?</strong> and paste this code:
                </p>
                <p style="margin: 0; font-size: 13px; color: #ffffff; font-family: monospace; word-break: break-all;">${inviteToken}</p>
            </div>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 16px; text-align: center; margin-top: 12px;">
                <p style="margin: 0; font-size: 12px; color: #475569; line-height: 1.5;">
                    If you weren't expecting this invitation, you can safely ignore this email.
                </p>
            </div>
        `;

        return this.sendBrandedEmail({
            to: toEmail,
            subject: `You've been invited to join ${dealerName} on CarMazium`,
            bodyHtml,
        });
    }

    async sendStaffAddedEmail(toEmail: string, recipientName: string, dealerName: string, role: string) {
        const roleLabel = role === 'ADMIN' ? 'Admin' : role === 'FINANCE_MANAGER' ? 'Finance Manager' : 'Sales Agent';
        const bodyHtml = `
            <h1 style="margin: 0 0 8px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                You've been added to a dealership! 🎉
            </h1>
            <p style="margin: 0 0 28px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                Hi <strong style="color: #ffffff;">${recipientName || 'there'}</strong>, <strong style="color: #ffffff;">${dealerName}</strong> has added you to their dealership team on CarMazium as a <strong style="color: #ed1c24;">${roleLabel}</strong>.
            </p>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 24px; margin-bottom: 32px;">
                <p style="margin: 0 0 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Your Role</p>
                <p style="margin: 0; font-size: 18px; font-weight: 800; color: #ffffff;">${roleLabel}</p>
                <p style="margin: 6px 0 0; font-size: 12px; color: #64748b;">at ${dealerName}</p>
            </div>
            <p style="margin: 0 0 24px; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                You now have access to the dealer dashboard. Log in to get started.
            </p>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/dashboard/dealer" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #ed1c24, #c41920); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(237,28,36,0.35);">
                    Go to Dealer Dashboard →
                </a>
            </div>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 16px; text-align: center; margin-top: 20px;">
                <p style="margin: 0; font-size: 12px; color: #475569; line-height: 1.5;">
                    If you weren't expecting this, please contact us at Help@carmazium.com.
                </p>
            </div>
        `;
        return this.sendBrandedEmail({
            to: toEmail,
            subject: `You've been added to ${dealerName} on CarMazium`,
            bodyHtml,
        });
    }

    async sendKycSubmissionAdminAlert(adminEmails: string[], dealerName: string) {
        const bodyHtml = `
            <h1 style="margin: 0 0 16px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                New Dealer KYC Submission 🛡️
            </h1>
            <p style="margin: 0 0 24px; font-size: 15px; color: #cbd5e1; line-height: 1.6;">
                A new dealer profile, <strong>${dealerName}</strong>, has submitted their business verification documents for review.
            </p>
            <p style="margin: 0 0 32px; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                Please log in to your Superadmin Dashboard and navigate to the Dealer KYC section to inspect their submitted files and approve or reject them field-by-field.
            </p>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/dashboard/admin/dealer-verification" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #ed1c24, #c41920); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(237,28,36,0.35);">
                    Review KYC Submission
                </a>
            </div>
        `;
        return this.sendBrandedEmail({
            to: adminEmails,
            subject: `Action Required: New KYC Submission from ${dealerName} 🛡️`,
            bodyHtml,
        });
    }

    async sendKycApprovedDealerAlert(dealerEmail: string, dealerName: string) {
        const bodyHtml = `
            <h1 style="margin: 0 0 16px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                KYC Verification Approved! 🎉
            </h1>
            <p style="margin: 0 0 24px; font-size: 15px; color: #cbd5e1; line-height: 1.6;">
                Dear <strong>${dealerName}</strong>, we are thrilled to inform you that your dealership business verification (KYC) has been fully approved by our administration!
            </p>
            <p style="margin: 0 0 32px; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                All your submitted business documents have been verified. Your dealer dashboard is now fully unlocked and ready to use. You can list cars, run auctions, and manage leads!
            </p>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/dashboard/dealer" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #4ade80, #16a34a); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(74,222,128,0.35);">
                    Access Dealer Dashboard
                </a>
            </div>
        `;
        return this.sendBrandedEmail({
            to: dealerEmail,
            subject: 'Congratulations! Your CarMazium Dealer Profile is Approved 🎉',
            bodyHtml,
        });
    }

    // ─── Offer Emails ────────────────────────────────────────────────

    async sendOfferReceivedEmail(sellerEmail: string, sellerName: string, vehicleTitle: string, offerAmount: number) {
        const bodyHtml = `
            <h1 style="margin: 0 0 8px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                New Offer Received
            </h1>
            <p style="margin: 0 0 28px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                Hi <strong style="color: #ffffff;">${sellerName}</strong>, a buyer has submitted an offer on one of your listings.
            </p>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 24px; margin-bottom: 32px;">
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Vehicle</p>
                <p style="margin: 0 0 20px; font-size: 16px; font-weight: 700; color: #ffffff;">${vehicleTitle}</p>
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Offer Amount</p>
                <p style="margin: 0; font-size: 28px; font-weight: 800; color: #ed1c24;">£${offerAmount.toLocaleString('en-GB')}</p>
            </div>
            <p style="margin: 0 0 28px; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                Log in to your dashboard to accept, reject, or counter this offer.
            </p>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/dashboard/seller/offers" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #ed1c24, #c41920); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(237,28,36,0.35);">
                    Review Offer →
                </a>
            </div>
        `;
        return this.sendBrandedEmail({ to: sellerEmail, subject: `New offer on "${vehicleTitle}" — CarMazium`, bodyHtml });
    }

    async sendOfferAcceptedEmail(buyerEmail: string, buyerName: string, vehicleTitle: string, offerAmount: number, listingSlug: string) {
        const bodyHtml = `
            <h1 style="margin: 0 0 8px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                Your Offer Was Accepted! 🎉
            </h1>
            <p style="margin: 0 0 28px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                Congratulations <strong style="color: #ffffff;">${buyerName}</strong>! The seller has accepted your offer.
            </p>
            <div style="background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.15); border-radius: 14px; padding: 24px; margin-bottom: 32px;">
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Vehicle</p>
                <p style="margin: 0 0 20px; font-size: 16px; font-weight: 700; color: #ffffff;">${vehicleTitle}</p>
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Accepted Offer</p>
                <p style="margin: 0; font-size: 28px; font-weight: 800; color: #4ade80;">£${offerAmount.toLocaleString('en-GB')}</p>
            </div>
            <p style="margin: 0 0 28px; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                Use the messaging feature on your dashboard to contact the seller and arrange the next steps.
            </p>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/buy-cars/${listingSlug}" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #4ade80, #16a34a); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(74,222,128,0.3);">
                    View Listing →
                </a>
            </div>
        `;
        return this.sendBrandedEmail({ to: buyerEmail, subject: `Offer accepted on "${vehicleTitle}" — CarMazium 🎉`, bodyHtml });
    }

    async sendOfferRejectedEmail(buyerEmail: string, buyerName: string, vehicleTitle: string, offerAmount: number, listingSlug: string) {
        const bodyHtml = `
            <h1 style="margin: 0 0 8px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                Offer Update
            </h1>
            <p style="margin: 0 0 28px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                Hi <strong style="color: #ffffff;">${buyerName}</strong>, unfortunately the seller has declined your offer.
            </p>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 24px; margin-bottom: 32px;">
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Vehicle</p>
                <p style="margin: 0 0 20px; font-size: 16px; font-weight: 700; color: #ffffff;">${vehicleTitle}</p>
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Your Offer</p>
                <p style="margin: 0; font-size: 24px; font-weight: 800; color: #94a3b8; text-decoration: line-through;">£${offerAmount.toLocaleString('en-GB')}</p>
            </div>
            <p style="margin: 0 0 28px; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                Don't give up — you can visit the listing to make a new offer.
            </p>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/buy-cars/${listingSlug}" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #ed1c24, #c41920); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(237,28,36,0.35);">
                    View Listing →
                </a>
            </div>
        `;
        return this.sendBrandedEmail({ to: buyerEmail, subject: `Offer update on "${vehicleTitle}" — CarMazium`, bodyHtml });
    }

    async sendOfferCounteredEmail(buyerEmail: string, buyerName: string, vehicleTitle: string, originalAmount: number, counterAmount: number, listingSlug: string) {
        const bodyHtml = `
            <h1 style="margin: 0 0 8px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                Counter Offer Received 🔄
            </h1>
            <p style="margin: 0 0 28px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                Hi <strong style="color: #ffffff;">${buyerName}</strong>, the seller has responded to your offer with a counter proposal.
            </p>
            <div style="background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.15); border-radius: 14px; padding: 24px; margin-bottom: 32px;">
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Vehicle</p>
                <p style="margin: 0 0 20px; font-size: 16px; font-weight: 700; color: #ffffff;">${vehicleTitle}</p>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                    <tr>
                        <td style="padding-right: 16px;">
                            <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Your Offer</p>
                            <p style="margin: 0; font-size: 22px; font-weight: 800; color: #94a3b8;">£${originalAmount.toLocaleString('en-GB')}</p>
                        </td>
                        <td style="padding: 0 16px; color: #475569; font-size: 20px; font-weight: 800;">→</td>
                        <td>
                            <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Counter Offer</p>
                            <p style="margin: 0; font-size: 22px; font-weight: 800; color: #60a5fa;">£${counterAmount.toLocaleString('en-GB')}</p>
                        </td>
                    </tr>
                </table>
            </div>
            <p style="margin: 0 0 28px; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                Log in to your dashboard to accept or decline the counter offer.
            </p>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/dashboard/buyer/offers" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(59,130,246,0.3);">
                    Respond to Counter →
                </a>
            </div>
        `;
        return this.sendBrandedEmail({ to: buyerEmail, subject: `Counter offer on "${vehicleTitle}" — CarMazium 🔄`, bodyHtml });
    }

    async sendCounterAcceptedEmail(sellerEmail: string, sellerName: string, vehicleTitle: string, counterAmount: number) {
        const bodyHtml = `
            <h1 style="margin: 0 0 8px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                Counter Offer Accepted! 💰
            </h1>
            <p style="margin: 0 0 28px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                Great news <strong style="color: #ffffff;">${sellerName}</strong>! The buyer has accepted your counter offer.
            </p>
            <div style="background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.15); border-radius: 14px; padding: 24px; margin-bottom: 32px;">
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Vehicle</p>
                <p style="margin: 0 0 20px; font-size: 16px; font-weight: 700; color: #ffffff;">${vehicleTitle}</p>
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Agreed Price</p>
                <p style="margin: 0; font-size: 28px; font-weight: 800; color: #4ade80;">£${counterAmount.toLocaleString('en-GB')}</p>
            </div>
            <p style="margin: 0 0 28px; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                Contact the buyer via the messaging feature to arrange the handover. Once the sale is finalised, mark the listing as Sold from your offers dashboard.
            </p>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/dashboard/seller/offers" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #4ade80, #16a34a); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(74,222,128,0.3);">
                    Go to Offers →
                </a>
            </div>
        `;
        return this.sendBrandedEmail({ to: sellerEmail, subject: `Counter offer accepted on "${vehicleTitle}" — CarMazium 💰`, bodyHtml });
    }

    // ─── Auction Emails ──────────────────────────────────────────────

    async sendAuctionWonEmail(buyerEmail: string, buyerName: string, vehicleTitle: string, winningAmount: number, auctionId: string) {
        const bodyHtml = `
            <h1 style="margin: 0 0 8px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                You Won the Auction! 🏆
            </h1>
            <p style="margin: 0 0 28px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                Congratulations <strong style="color: #ffffff;">${buyerName}</strong>! Your bid was the highest and you have won the auction.
            </p>
            <div style="background: rgba(237,28,36,0.06); border: 1px solid rgba(237,28,36,0.2); border-radius: 14px; padding: 24px; margin-bottom: 32px;">
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Vehicle Won</p>
                <p style="margin: 0 0 20px; font-size: 16px; font-weight: 700; color: #ffffff;">${vehicleTitle}</p>
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Winning Bid</p>
                <p style="margin: 0; font-size: 28px; font-weight: 800; color: #ed1c24;">£${winningAmount.toLocaleString('en-GB')}</p>
            </div>
            <p style="margin: 0 0 28px; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                Contact the seller through the auction page to arrange collection or delivery. A chat room has been automatically created for you.
            </p>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/auctions/live/${auctionId}" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #ed1c24, #c41920); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(237,28,36,0.35);">
                    View Auction →
                </a>
            </div>
        `;
        return this.sendBrandedEmail({ to: buyerEmail, subject: `You won the auction for "${vehicleTitle}" — CarMazium 🏆`, bodyHtml });
    }

    async sendAuctionEndedSellerEmail(sellerEmail: string, sellerName: string, vehicleTitle: string, winningAmount: number, auctionId: string) {
        const bodyHtml = `
            <h1 style="margin: 0 0 8px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                Your Auction Has Ended
            </h1>
            <p style="margin: 0 0 28px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                Hi <strong style="color: #ffffff;">${sellerName}</strong>, your auction has successfully ended with a winning bid.
            </p>
            <div style="background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.15); border-radius: 14px; padding: 24px; margin-bottom: 32px;">
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Vehicle Sold</p>
                <p style="margin: 0 0 20px; font-size: 16px; font-weight: 700; color: #ffffff;">${vehicleTitle}</p>
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Winning Bid</p>
                <p style="margin: 0; font-size: 28px; font-weight: 800; color: #4ade80;">£${winningAmount.toLocaleString('en-GB')}</p>
            </div>
            <p style="margin: 0 0 28px; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                A chat room has been created so you can coordinate handover with the buyer. Once the vehicle has been handed over, submit your proof via your auction dashboard to release your £100 seller bonus.
            </p>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/dashboard/seller/auctions" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #ed1c24, #c41920); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(237,28,36,0.35);">
                    View My Auctions →
                </a>
            </div>
        `;
        return this.sendBrandedEmail({ to: sellerEmail, subject: `Auction ended — "${vehicleTitle}" sold for £${winningAmount.toLocaleString('en-GB')} — CarMazium`, bodyHtml });
    }

    async sendAuctionReserveNotMetEmail(sellerEmail: string, sellerName: string, vehicleTitle: string, auctionId: string) {
        const bodyHtml = `
            <h1 style="margin: 0 0 8px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                Auction Ended — Reserve Not Met
            </h1>
            <p style="margin: 0 0 28px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                Hi <strong style="color: #ffffff;">${sellerName}</strong>, your auction for <strong style="color: #ffffff;">${vehicleTitle}</strong> has ended, but the reserve price was not reached.
            </p>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 20px; margin-bottom: 32px;">
                <p style="margin: 0; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                    You can relist the vehicle with a lower reserve price, or create a new classified listing to attract direct offers.
                </p>
            </div>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/dashboard/seller/auctions" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #ed1c24, #c41920); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(237,28,36,0.35);">
                    Re-auction Vehicle →
                </a>
            </div>
        `;
        return this.sendBrandedEmail({ to: sellerEmail, subject: `Auction ended — reserve not met for "${vehicleTitle}" — CarMazium`, bodyHtml });
    }

    // ─── Handover Emails ─────────────────────────────────────────────

    async sendHandoverApprovedEmail(sellerEmail: string, sellerName: string, vehicleTitle: string) {
        const bodyHtml = `
            <h1 style="margin: 0 0 8px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                Handover Proof Verified ✅
            </h1>
            <p style="margin: 0 0 28px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                Hi <strong style="color: #ffffff;">${sellerName}</strong>, great news! Your handover proof for the auction of <strong style="color: #ffffff;">${vehicleTitle}</strong> has been reviewed and approved by our team.
            </p>
            <div style="background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.15); border-radius: 14px; padding: 20px; margin-bottom: 32px; text-align: center;">
                <p style="margin: 0 0 8px; font-size: 36px;">🎉</p>
                <p style="margin: 0; font-size: 18px; font-weight: 800; color: #4ade80;">£100 Seller Bonus Released</p>
                <p style="margin: 8px 0 0; font-size: 13px; color: #64748b;">Your bonus has been released to your account.</p>
            </div>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/dashboard/seller/auctions" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #4ade80, #16a34a); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(74,222,128,0.3);">
                    View My Auctions →
                </a>
            </div>
        `;
        return this.sendBrandedEmail({ to: sellerEmail, subject: `Handover verified — £100 bonus released — CarMazium ✅`, bodyHtml });
    }

    async sendHandoverDeniedEmail(sellerEmail: string, sellerName: string, vehicleTitle: string) {
        const bodyHtml = `
            <h1 style="margin: 0 0 8px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                Handover Proof Needs Attention ⚠️
            </h1>
            <p style="margin: 0 0 28px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                Hi <strong style="color: #ffffff;">${sellerName}</strong>, unfortunately the handover proof you submitted for <strong style="color: #ffffff;">${vehicleTitle}</strong> could not be approved.
            </p>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 20px; margin-bottom: 32px;">
                <p style="margin: 0; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                    Please upload a clearer or more appropriate document — such as a signed handover form, V5C transfer confirmation, or photographic proof — to receive your £100 seller bonus.
                </p>
            </div>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/dashboard/seller/auctions" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #ed1c24, #c41920); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(237,28,36,0.35);">
                    Resubmit Proof →
                </a>
            </div>
        `;
        return this.sendBrandedEmail({ to: sellerEmail, subject: `Action required: resubmit handover proof for "${vehicleTitle}" — CarMazium`, bodyHtml });
    }

    async sendKycRejectedDealerAlert(dealerEmail: string, dealerName: string, rejectedFields: { field: string; note: string }[]) {
        const fieldListHtml = rejectedFields
            .map(
                (f) => `
                <li style="margin-bottom: 12px; color: #fda4af; font-size: 14px; line-height: 1.5;">
                    <strong style="color: #ffffff;">${f.field.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}:</strong> 
                    <span style="display: block; font-style: italic; color: #cbd5e1; margin-top: 4px; padding-left: 12px; border-left: 2px solid #f43f5e;">"${f.note || 'No reason provided.'}"</span>
                </li>`,
            )
            .join('');

        const bodyHtml = `
            <h1 style="margin: 0 0 16px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                KYC Verification Update ⚠️
            </h1>
            <p style="margin: 0 0 24px; font-size: 15px; color: #cbd5e1; line-height: 1.6;">
                Dear <strong>${dealerName}</strong>, some of the business verification documents you provided could not be approved by our administration.
            </p>
            <p style="margin: 0 0 16px; font-size: 14px; color: #94a3b8; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em;">
                Please review the feedback and re-upload the following details:
            </p>
            <ul style="margin: 0 0 32px; padding-left: 20px;">
                ${fieldListHtml}
            </ul>
            <p style="margin: 0 0 32px; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                Note that your previously approved documents are locked and saved; you only need to re-submit these specific items.
            </p>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/dashboard/dealer" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #ed1c24, #c41920); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(237,28,36,0.35);">
                    Update Documents
                </a>
            </div>
        `;
        return this.sendBrandedEmail({
            to: dealerEmail,
            subject: 'Action Required: Update your CarMazium Dealer Documents ⚠️',
            bodyHtml,
        });
    }

    // ─── Listing Review Emails ───────────────────────────────────────

    async sendListingApprovedAlert(sellerEmail: string, sellerName: string, listingTitle: string, listingSlug: string) {
        const bodyHtml = `
            <h1 style="margin: 0 0 16px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                Your Listing is Live! 🎉
            </h1>
            <p style="margin: 0 0 24px; font-size: 15px; color: #cbd5e1; line-height: 1.6;">
                Hi <strong>${sellerName}</strong>, good news — our team has reviewed and approved your listing. It's now visible to buyers on CarMazium.
            </p>
            <div style="background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.15); border-radius: 14px; padding: 24px; margin-bottom: 32px;">
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Vehicle</p>
                <p style="margin: 0; font-size: 16px; font-weight: 700; color: #ffffff;">${listingTitle}</p>
            </div>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/buy-cars/${listingSlug}" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #4ade80, #16a34a); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(74,222,128,0.35);">
                    View Live Listing →
                </a>
            </div>
        `;
        return this.sendBrandedEmail({
            to: sellerEmail,
            subject: `Your listing "${listingTitle}" is now live — CarMazium 🎉`,
            bodyHtml,
        });
    }

    /**
     * Delivers a buyer's paid HPI report as a PDF attachment. Same disclosure
     * language as printed on the PDF itself and shown in-app, so a buyer
     * reading only the email isn't given a different impression than the
     * document they paid for.
     */
    async sendHpiReportEmail(options: {
        toEmail: string;
        vehicleTitle: string;
        vrm: string;
        isClear: boolean;
        listingSlug: string;
        pdfBuffer: Buffer;
    }) {
        const { toEmail, vehicleTitle, vrm, isClear, listingSlug, pdfBuffer } = options;

        const bodyHtml = `
            <h1 style="margin: 0 0 16px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                Your Vehicle History Report
            </h1>
            <p style="margin: 0 0 24px; font-size: 15px; color: #cbd5e1; line-height: 1.6;">
                Attached is the vehicle history report you requested — a PDF, ready to save or print.
            </p>
            <div style="background: ${isClear ? 'rgba(74,222,128,0.06)' : 'rgba(251,191,36,0.06)'}; border: 1px solid ${isClear ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.2)'}; border-radius: 14px; padding: 24px; margin-bottom: 24px;">
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Vehicle</p>
                <p style="margin: 0 0 14px; font-size: 16px; font-weight: 700; color: #ffffff;">${vehicleTitle} &middot; ${vrm}</p>
                <p style="margin: 0; font-size: 14px; font-weight: 800; color: ${isClear ? '#4ade80' : '#fbbf24'};">
                    ${isClear ? 'All checks passed' : 'One or more checks not passed — see attached report for detail'}
                </p>
            </div>
            <div style="text-align: center; margin: 32px 0 24px;">
                <a href="${this.frontendUrl}/buy-cars/${listingSlug}" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #ed1c24, #ff4d4d); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(237,28,36,0.3);">
                    View Listing →
                </a>
            </div>
            <p style="margin: 0; font-size: 11px; color: #64748b; line-height: 1.6;">
                This report presents information from a supplied third-party vehicle check. CarMazium did not originate
                or independently verify the underlying data, which remains authoritative. Vehicle-history databases can
                update after a delay — verify the vehicle, V5C and MOT history before completing any purchase.
            </p>
        `;

        return this.sendBrandedEmail({
            to: toEmail,
            subject: `Your CarMazium Vehicle History Report — ${vehicleTitle} (${vrm})`,
            bodyHtml,
            attachments: [{ filename: `CarMazium_Vehicle_History_Report_${vrm.replace(/[^A-Za-z0-9]/g, '')}.pdf`, content: pdfBuffer }],
        });
    }

    /**
     * Tells a seller the report they paid for has finally been attached.
     *
     * Only matters because a listing now publishes without waiting for its
     * report — the seller may have been live for days showing "report being
     * prepared", so this closes that loop rather than leaving them to
     * re-check the page.
     */
    async sendHpiReportReadyAlert(options: {
        toEmail: string;
        firstName: string;
        vehicleTitle: string;
        listingSlug: string;
    }) {
        const { toEmail, firstName, vehicleTitle, listingSlug } = options;

        const bodyHtml = `
            <h1 style="margin: 0 0 16px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                Your Vehicle History Report Is Ready
            </h1>
            <p style="margin: 0 0 24px; font-size: 15px; color: #cbd5e1; line-height: 1.6;">
                Hi <strong style="color: #ffffff;">${firstName}</strong> — the vehicle history report you requested has been
                prepared by our team and is now attached to your listing. Buyers viewing the vehicle can see it straight away.
            </p>
            <div style="background: rgba(74,222,128,0.06); border: 1px solid rgba(74,222,128,0.15); border-radius: 14px; padding: 24px; margin-bottom: 24px;">
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Vehicle</p>
                <p style="margin: 0; font-size: 16px; font-weight: 700; color: #ffffff;">${vehicleTitle}</p>
            </div>
            <div style="text-align: center; margin: 32px 0 24px;">
                <a href="${this.frontendUrl}/buy-cars/${listingSlug}" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #ed1c24, #ff4d4d); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(237,28,36,0.3);">
                    View Report →
                </a>
            </div>
            <p style="margin: 0; font-size: 11px; color: #64748b; line-height: 1.6;">
                This report presents information from a supplied third-party vehicle check. CarMazium did not originate
                or independently verify the underlying data, which remains authoritative.
            </p>
        `;

        return this.sendBrandedEmail({
            to: toEmail,
            subject: `Your vehicle history report is ready — ${vehicleTitle}`,
            bodyHtml,
        });
    }

    /**
     * Nudges staff about reports still outstanding. Sent as one digest rather
     * than one mail per report so a backlog reads as a backlog — and because
     * a per-report mail would arrive again every run for the same stale rows.
     */
    async sendHpiPendingReminder(options: {
        toEmail: string;
        reports: { vehicleTitle: string; vrm: string; daysWaiting: number; waitingBuyers: number }[];
    }) {
        const { toEmail, reports } = options;

        const rows = reports.map(r => `
            <tr>
                <td style="padding: 12px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">
                    <p style="margin: 0 0 2px; font-size: 14px; font-weight: 700; color: #ffffff;">${r.vehicleTitle}</p>
                    <p style="margin: 0; font-size: 12px; color: #64748b;">
                        ${r.vrm} &middot; waiting ${r.daysWaiting} day${r.daysWaiting === 1 ? '' : 's'}${r.waitingBuyers > 0
                            ? ` &middot; <span style="color: #fbbf24;">${r.waitingBuyers} paid buyer${r.waitingBuyers === 1 ? '' : 's'} waiting</span>`
                            : ''}
                    </p>
                </td>
            </tr>
        `).join('');

        const bodyHtml = `
            <h1 style="margin: 0 0 16px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                ${reports.length} HPI report${reports.length === 1 ? '' : 's'} still outstanding
            </h1>
            <p style="margin: 0 0 24px; font-size: 15px; color: #cbd5e1; line-height: 1.6;">
                These listings are waiting for their mandatory vehicle-history review before they can go live. Paid buyer email copies, if any, are shown alongside them.
            </p>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">${rows}</table>
            <div style="text-align: center; margin: 32px 0 24px;">
                <a href="${this.frontendUrl}/dashboard/admin/hpi" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #ed1c24, #ff4d4d); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(237,28,36,0.3);">
                    Open HPI Queue →
                </a>
            </div>
        `;

        return this.sendBrandedEmail({
            to: toEmail,
            subject: `${reports.length} HPI report${reports.length === 1 ? '' : 's'} awaiting preparation — CarMazium`,
            bodyHtml,
        });
    }

    async sendListingRejectedAlert(sellerEmail: string, sellerName: string, listingTitle: string, reason: string) {
        const bodyHtml = `
            <h1 style="margin: 0 0 16px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                Your Listing Needs Attention ⚠️
            </h1>
            <p style="margin: 0 0 24px; font-size: 15px; color: #cbd5e1; line-height: 1.6;">
                Hi <strong>${sellerName}</strong>, our team reviewed your listing and it wasn't approved as submitted. Here's why:
            </p>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 24px; margin-bottom: 24px;">
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Vehicle</p>
                <p style="margin: 0 0 20px; font-size: 16px; font-weight: 700; color: #ffffff;">${listingTitle}</p>
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Reason</p>
                <p style="margin: 0; font-size: 14px; font-style: italic; color: #fda4af; line-height: 1.5; padding-left: 12px; border-left: 2px solid #f43f5e;">"${reason}"</p>
            </div>
            <p style="margin: 0 0 28px; font-size: 14px; color: #94a3b8; line-height: 1.6;">
                Log in to your dashboard, update the listing to address this feedback, and resubmit — no need to pay the listing fee again.
            </p>
            <div style="text-align: center; margin: 36px 0 24px;">
                <a href="${this.frontendUrl}/dashboard/seller/listings" target="_blank"
                   style="display: inline-block; padding: 16px 48px; background: linear-gradient(135deg, #ed1c24, #c41920); color: #ffffff; text-decoration: none; font-weight: 800; font-size: 14px; letter-spacing: 0.06em; text-transform: uppercase; border-radius: 12px; box-shadow: 0 8px 25px rgba(237,28,36,0.35);">
                    Update Listing
                </a>
            </div>
        `;
        return this.sendBrandedEmail({
            to: sellerEmail,
            subject: `Action needed: your listing "${listingTitle}" wasn't approved — CarMazium ⚠️`,
            bodyHtml,
        });
    }

    async sendAddressVerificationCodeEmail(toEmail: string, name: string, code: string, address: string) {
        const bodyHtml = `
            <h1 style="margin: 0 0 8px; font-family: 'Poppins', 'Segoe UI', sans-serif; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">
                Your verification code
            </h1>
            <p style="margin: 0 0 28px; font-size: 15px; color: #94a3b8; line-height: 1.6;">
                Hi <strong style="color: #ffffff;">${name}</strong>, use the code below to confirm the address on your CarMazium account and unlock Trader Verification.
            </p>
            <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 24px; margin-bottom: 24px; text-align: center;">
                <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Verification code</p>
                <p style="margin: 0; font-size: 36px; font-weight: 800; letter-spacing: 0.3em; color: #ed1c24;">${code}</p>
            </div>
            <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #64748b;">Address being verified</p>
            <p style="margin: 0 0 28px; font-size: 14px; color: #cbd5e1;">${address}</p>
            <p style="margin: 0; font-size: 13px; color: #64748b; line-height: 1.6;">
                This code expires in 30 minutes. If you didn't request this, you can safely ignore this email.
            </p>
        `;
        return this.sendBrandedEmail({
            to: toEmail,
            subject: `${code} is your CarMazium verification code`,
            bodyHtml,
        });
    }
}

