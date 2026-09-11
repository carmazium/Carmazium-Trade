import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import * as nodemailer from 'nodemailer';
import { resolveFrontendUrl } from '../core/frontend-url';

/** Which service actually puts the mail on the wire. */
type Provider = 'gmail' | 'resend';

/** One outbound email, in provider-neutral terms. */
interface Message {
    to: string[];
    subject: string;
    html: string;
    replyTo?: string;
    attachments?: { filename: string; content: Buffer }[];
}

@Injectable()
export class EmailService {
    private readonly logger = new Logger(EmailService.name);

    private readonly resend: Resend | null;
    private readonly transporter: nodemailer.Transporter | null;

    /** Tried first. */
    private readonly primary: Provider;
    /** Tried only when the primary fails, and only if it is configured. */
    private readonly fallback: Provider | null;

    private readonly fromAddress: string;
    private readonly frontendUrl: string;
    private readonly logoUrl: string;

    /**
     * Two providers, one active.
     *
     * Gmail SMTP is the default because Resend's quota is what pushed us off it;
     * set EMAIL_PROVIDER=resend to go back without touching code. Whichever is
     * not primary becomes the fallback, so a send refused by one (a quota, a
     * blip) is retried on the other instead of being logged and dropped — which
     * is what used to happen to password resets and KYC decisions.
     */
    constructor() {
        const resendKey = process.env.RESEND_API_KEY;
        const gmailUser = process.env.EMAIL_USER;
        const gmailPass = process.env.EMAIL_APP_PASSWORD;

        this.resend = resendKey ? new Resend(resendKey) : null;

        this.transporter = gmailUser && gmailPass
            ? nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: gmailUser,
                    // Historically pasted from Google with spaces in it.
                    pass: gmailPass.trim(),
                },
                // Gmail throttles hard on parallel connections; a pool keeps a
                // burst of auction notifications from tripping it.
                pool: true,
                maxConnections: 3,
                maxMessages: 50,
            })
            : null;

        const requested = (process.env.EMAIL_PROVIDER || 'gmail').toLowerCase();
        this.primary = requested === 'resend' ? 'resend' : 'gmail';
        this.fallback = this.primary === 'gmail'
            ? (this.resend ? 'resend' : null)
            : (this.transporter ? 'gmail' : null);

        this.fromAddress = process.env.EMAIL_FROM || 'CarMazium <noreply@carmazium.com>';
        this.frontendUrl = resolveFrontendUrl(process.env.FRONTEND_URL);
        this.logoUrl = `${this.frontendUrl}/assets/images/logo.png`;

        this.warnOnMisconfiguration(gmailUser);
    }

    /**
     * Shout at startup about the things that make mail silently disappear,
     * rather than letting them show up as "why didn't the customer get it?".
     */
    private warnOnMisconfiguration(gmailUser?: string) {
        if (this.primary === 'gmail' && !this.transporter) {
            this.logger.error(
                'EMAIL_PROVIDER is gmail but EMAIL_USER / EMAIL_APP_PASSWORD are not set — no mail will send.',
            );
        }
        if (this.primary === 'resend' && !this.resend) {
            this.logger.error('EMAIL_PROVIDER is resend but RESEND_API_KEY is not set — no mail will send.');
        }
        if (!this.fallback) {
            this.logger.warn(
                `Email provider "${this.primary}" has no fallback configured — a refused send is a lost email.`,
            );
        }

        if (this.primary === 'gmail' && gmailUser) {
            const fromDomain = this.fromAddress.match(/@([^>\s]+)/)?.[1]?.toLowerCase();
            const userDomain = gmailUser.split('@')[1]?.toLowerCase();
            if (fromDomain && userDomain && fromDomain !== userDomain) {
                this.logger.warn(
                    `EMAIL_FROM (${fromDomain}) does not match EMAIL_USER (${userDomain}). ` +
                    'Gmail will only honour this From if it is a verified send-as alias on that account; ' +
                    'otherwise mail is rewritten or spam-filtered. Verify the alias in Gmail settings.',
                );
            }
        }
    }

    private async dispatch(message: Message): Promise<{ id: string } | null> {
        const order: Provider[] = this.fallback ? [this.primary, this.fallback] : [this.primary];

        for (const provider of order) {
            try {
                const id = provider === 'gmail'
                    ? await this.sendViaGmail(message)
                    : await this.sendViaResend(message);

                if (id) {
                    const note = provider === this.primary ? '' : ` (fallback after ${this.primary} failed)`;
                    this.logger.log(`Email "${message.subject}" sent via ${provider}${note} (id: ${id})`);
                    return { id };
                }
            } catch (error: any) {
                this.logger.error(
                    `Email "${message.subject}" failed via ${provider}: ${error?.message || error}`,
                );
            }
        }

        this.logger.error(
            `Email "${message.subject}" to ${message.to.join(', ')} was NOT sent — every provider failed.`,
        );
        return null;
    }

    private async sendViaGmail(message: Message): Promise<string | null> {
        if (!this.transporter) throw new Error('Gmail transport not configured');

        const info = await this.transporter.sendMail({
            from: this.fromAddress,
            to: message.to,
            subject: message.subject,
            html: message.html,
            replyTo: message.replyTo,
            attachments: message.attachments,
        });
        return info?.messageId || null;
    }

    private async sendViaResend(message: Message): Promise<string | null> {
        if (!this.resend) throw new Error('Resend not configured');

        const { data, error } = await this.resend.emails.send({
            from: this.fromAddress,
            to: message.to,
            subject: message.subject,
            html: message.html,
            replyTo: message.replyTo,
            attachments: message.attachments,
        });

        if (error) throw new Error(error.message);
        return data?.id || null;
    }

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
        <div style="text-align: center; padding: 32px 0 24px;">
            <a href="${this.frontendUrl}" target="_blank" style="text-decoration: none;">
                <img src="${this.logoUrl}" alt="CarMazium" width="180" height="45" style="display: inline-block; max-width: 180px; height: auto;" />
            </a>
        </div>
        <div style="background: linear-gradient(145deg, #1e293b 0%, #0f172a 100%); border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; overflow: hidden; box-shadow: 0 25px 50px rgba(0,0,0,0.5);">
            <div style="height: 4px; background: linear-gradient(90deg, #ed1c24, #ff4d4d, #ed1c24);"></div>
            <div style="padding: 48px 40px 40px;">
                ${bodyHtml}
            </div>
        </div>
        <div style="text-align: center; padding: 32px 20px 16px;">
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

    async sendWelcomeEmail(toEmail: string, firstName?: string, role: string = 'BUYER') {
        const name = firstName || 'there';
        const roleConfigs: Record<string, { greeting: string; tagline: string; features: string[] }> = {
            DEALER: { greeting: `Welcome aboard, ${name}!`, tagline: 'Your dealership command centre is ready.', features: ['Manage your full vehicle inventory from one dashboard','Receive and respond to buyer leads & offers in real-time','Track performance analytics, revenue trends & conversion metrics','Configure your dealership profile to maximise buyer reach'] },
            SELLER: { greeting: `Hey ${name}, welcome!`, tagline: 'You\'re all set to list and sell vehicles.', features: ['Create professional listings with AI-powered descriptions','Receive offers and counter-offers directly on your dashboard','Track listing views, engagement, and buyer interest','Secure transactions with verified KYC protection'] },
            BUYER: { greeting: `Hey ${name}, welcome!`, tagline: 'Start exploring thousands of verified vehicles.', features: ['Search and filter from a curated marketplace of quality vehicles','Make offers and negotiate prices directly with sellers','Get instant vehicle history and HPI checks','Save favourites and receive price-drop alerts'] },
            FINANCE_PARTNER: { greeting: `Welcome, ${name}!`, tagline: 'Your finance partner dashboard is live.', features: ['Manage vehicle finance applications from your dashboard','Connect directly with buyers looking for financing','Track application progress and conversion rates','Configure your offerings and approval criteria'] },
            INSURANCE_PARTNER: { greeting: `Welcome, ${name}!`, tagline: 'Your insurance partner portal is ready.', features: ['Manage insurance quote requests from your dashboard','Connect with buyers seeking vehicle insurance','Track quote-to-policy conversion metrics','Configure coverage tiers and pricing rules'] },
        };
        const config = roleConfigs[role] || roleConfigs.BUYER;
        const featureListHtml = config.features.map((f) => `<tr><td width="28" valign="top" style="padding: 6px 0;"><div style="width: 20px; height: 20px; background: rgba(237,28,36,0.1); border: 1px solid rgba(237,28,36,0.2); border-radius: 6px; text-align: center; line-height: 20px; font-size: 11px; color: #ed1c24;">✓</div></td><td style="padding: 6px 0 6px 12px; color: #cbd5e1; font-size: 14px; line-height: 1.5;">${f}</td></tr>`).join('');
        const bodyHtml = `<h1 style="margin: 0 0 8px; font-size: 28px; font-weight: 800; color: #ffffff;">${config.greeting}</h1><p style="margin: 0 0 32px; font-size: 15px; color: #94a3b8;">${config.tagline}</p><div style="height: 1px; background: rgba(255,255,255,0.08); margin: 0 0 28px;"></div><p style="margin: 0 0 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; color: #64748b;">What you can do</p><table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom: 32px;">${featureListHtml}</table><div style="text-align: center; margin: 36px 0 24px;"><a href="${this.frontendUrl}/dashboard" target="_blank" style="display:inline-block;padding:16px 48px;background:#ed1c24;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">Go to Dashboard →</a></div>`;
        await this.dispatch({ to: [toEmail], subject: `Welcome to CarMazium, ${name}! 🚗`, html: this.wrapInBrandTemplate(bodyHtml) });
    }

    async sendBrandedEmail(options: { to: string | string[]; subject: string; bodyHtml: string; replyTo?: string; attachments?: { filename: string; content: Buffer }[]; }) {
        return this.dispatch({ to: Array.isArray(options.to) ? options.to : [options.to], subject: options.subject, html: this.wrapInBrandTemplate(options.bodyHtml), replyTo: options.replyTo, attachments: options.attachments });
    }

    async sendEmail(options: { to: string | string[]; subject: string; html: string; replyTo?: string; attachments?: { filename: string; content: Buffer }[]; }) {
        return this.dispatch({ to: Array.isArray(options.to) ? options.to : [options.to], subject: options.subject, html: options.html, replyTo: options.replyTo, attachments: options.attachments });
    }

    async sendStaffInviteEmail(toEmail: string, dealerName: string, role: string, inviteToken: string) {
        const inviteUrl = `${this.frontendUrl}/auth/accept-invite?token=${inviteToken}`;
        const roleLabel = role === 'ADMIN' ? 'Admin' : role === 'FINANCE_MANAGER' ? 'Finance Manager' : 'Sales Agent';
        const bodyHtml = `<h1 style="color:#fff;">You've been invited! 🎉</h1><p style="color:#94a3b8;"><strong style="color:#fff;">${dealerName}</strong> has invited you to join their dealership on CarMazium as a <strong style="color:#ed1c24;">${roleLabel}</strong>.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${inviteUrl}" style="display:inline-block;padding:16px 48px;background:#ed1c24;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">Accept Invitation →</a></div>`;
        return this.sendBrandedEmail({ to: toEmail, subject: `You've been invited to join ${dealerName} on CarMazium`, bodyHtml });
    }

    async sendStaffAddedEmail(toEmail: string, recipientName: string, dealerName: string, role: string) {
        const roleLabel = role === 'ADMIN' ? 'Admin' : role === 'FINANCE_MANAGER' ? 'Finance Manager' : 'Sales Agent';
        return this.sendBrandedEmail({ to: toEmail, subject: `You've been added to ${dealerName} on CarMazium`, bodyHtml: `<h1 style="color:#fff;">You've been added to a dealership! 🎉</h1><p style="color:#94a3b8;">Hi <strong style="color:#fff;">${recipientName || 'there'}</strong>, <strong style="color:#fff;">${dealerName}</strong> has added you as <strong style="color:#ed1c24;">${roleLabel}</strong>.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/dashboard/dealer" style="display:inline-block;padding:16px 48px;background:#ed1c24;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">Go to Dealer Dashboard →</a></div>` });
    }

    async sendKycSubmissionAdminAlert(adminEmails: string[], dealerName: string) {
        return this.sendBrandedEmail({ to: adminEmails, subject: `Action Required: New KYC Submission from ${dealerName} 🛡️`, bodyHtml: `<h1 style="color:#fff;">New Dealer KYC Submission 🛡️</h1><p style="color:#cbd5e1;">A new dealer profile, <strong>${dealerName}</strong>, has submitted business verification documents.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/dashboard/admin/dealer-verification" style="display:inline-block;padding:16px 48px;background:#ed1c24;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">Review KYC Submission</a></div>` });
    }

    async sendKycApprovedDealerAlert(dealerEmail: string, dealerName: string) {
        return this.sendBrandedEmail({ to: dealerEmail, subject: 'Congratulations! Your CarMazium Dealer Profile is Approved 🎉', bodyHtml: `<h1 style="color:#fff;">KYC Verification Approved! 🎉</h1><p style="color:#cbd5e1;">Dear <strong>${dealerName}</strong>, your dealer verification is approved.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/dashboard/dealer" style="display:inline-block;padding:16px 48px;background:#16a34a;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">Access Dealer Dashboard</a></div>` });
    }

    async sendOfferReceivedEmail(sellerEmail: string, sellerName: string, vehicleTitle: string, offerAmount: number) { return this.sendBrandedEmail({ to:sellerEmail, subject:`New offer on "${vehicleTitle}" — CarMazium`, bodyHtml:`<h1 style="color:#fff;">New Offer Received</h1><p style="color:#94a3b8;">Hi <strong style="color:#fff;">${sellerName}</strong>, a buyer offered <strong style="color:#ed1c24;">£${offerAmount.toLocaleString('en-GB')}</strong> on ${vehicleTitle}.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/dashboard/seller/offers" style="display:inline-block;padding:16px 48px;background:#ed1c24;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">Review Offer →</a></div>` }); }
    async sendOfferAcceptedEmail(buyerEmail: string, buyerName: string, vehicleTitle: string, offerAmount: number, listingSlug: string) { return this.sendBrandedEmail({ to:buyerEmail, subject:`Offer accepted on "${vehicleTitle}" — CarMazium 🎉`, bodyHtml:`<h1 style="color:#fff;">Your Offer Was Accepted! 🎉</h1><p style="color:#94a3b8;">Congratulations <strong style="color:#fff;">${buyerName}</strong> — £${offerAmount.toLocaleString('en-GB')} was accepted.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/buy-cars/${listingSlug}" style="display:inline-block;padding:16px 48px;background:#16a34a;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">View Listing →</a></div>` }); }
    async sendOfferRejectedEmail(buyerEmail: string, buyerName: string, vehicleTitle: string, offerAmount: number, listingSlug: string) { return this.sendBrandedEmail({ to:buyerEmail, subject:`Offer update on "${vehicleTitle}" — CarMazium`, bodyHtml:`<h1 style="color:#fff;">Offer Update</h1><p style="color:#94a3b8;">Hi <strong style="color:#fff;">${buyerName}</strong>, your £${offerAmount.toLocaleString('en-GB')} offer was declined.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/buy-cars/${listingSlug}" style="display:inline-block;padding:16px 48px;background:#ed1c24;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">View Listing →</a></div>` }); }
    async sendOfferCounteredEmail(buyerEmail: string, buyerName: string, vehicleTitle: string, originalAmount: number, counterAmount: number, listingSlug: string) { return this.sendBrandedEmail({ to:buyerEmail, subject:`Counter offer on "${vehicleTitle}" — CarMazium 🔄`, bodyHtml:`<h1 style="color:#fff;">Counter Offer Received 🔄</h1><p style="color:#94a3b8;">Hi ${buyerName}, the seller countered £${originalAmount.toLocaleString('en-GB')} with <strong style="color:#60a5fa;">£${counterAmount.toLocaleString('en-GB')}</strong>.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/dashboard/buyer/offers" style="display:inline-block;padding:16px 48px;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">Respond to Counter →</a></div>` }); }
    async sendCounterAcceptedEmail(sellerEmail: string, sellerName: string, vehicleTitle: string, counterAmount: number) { return this.sendBrandedEmail({ to:sellerEmail, subject:`Counter offer accepted on "${vehicleTitle}" — CarMazium 💰`, bodyHtml:`<h1 style="color:#fff;">Counter Offer Accepted! 💰</h1><p style="color:#94a3b8;">Great news ${sellerName} — the buyer accepted £${counterAmount.toLocaleString('en-GB')}.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/dashboard/seller/offers" style="display:inline-block;padding:16px 48px;background:#16a34a;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">Go to Offers →</a></div>` }); }

    async sendAuctionWonEmail(buyerEmail: string, buyerName: string, vehicleTitle: string, winningAmount: number, auctionId: string) { return this.sendBrandedEmail({ to:buyerEmail, subject:`You won the auction for "${vehicleTitle}" — CarMazium`, bodyHtml:`<h1 style="color:#fff;">You Won the Auction</h1><p style="color:#94a3b8;">Congratulations ${buyerName}. Winning bid: £${winningAmount.toLocaleString('en-GB')}.</p><p style="color:#cbd5e1;">Pay the £125 Auction Buyer Fee within 72 hours to unlock the Seller's protected contact details and Auction chat. £100 is refundable only if the genuine qualifying sale fails or is cancelled; the £25 platform fee is non-refundable, subject to statutory rights.</p><p style="color:#cbd5e1;">After the fee is confirmed, arrange inspection and collection. If you proceed, pay the Vehicle Purchase Price directly to the Seller — CarMazium does not receive the Vehicle sale funds.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/dashboard/dealer/auctions/won" style="display:inline-block;padding:16px 48px;background:#ed1c24;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">Complete Buyer Fee →</a></div>` }); }
    async sendAuctionEndedSellerEmail(sellerEmail: string, sellerName: string, vehicleTitle: string, winningAmount: number, auctionId: string) { return this.sendBrandedEmail({ to:sellerEmail, subject:`Auction ended — "${vehicleTitle}" has a winning dealer — CarMazium`, bodyHtml:`<h1 style="color:#fff;">Your Auction Has Ended</h1><p style="color:#94a3b8;">Hi ${sellerName}, the winning bid is £${winningAmount.toLocaleString('en-GB')}.</p><p style="color:#cbd5e1;">The winning Dealer must first pay the £125 Auction Buyer Fee. Your protected contact details and Auction chat remain locked until that fee is confirmed.</p><p style="color:#cbd5e1;">Once contact is unlocked, arrange inspection and collection. The Dealer pays the Vehicle Purchase Price directly to you after inspection/agreement; CarMazium does not receive those Vehicle sale funds.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/dashboard/seller/auctions" style="display:inline-block;padding:16px 48px;background:#ed1c24;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">View My Auctions →</a></div>` }); }
    async sendAuctionReserveNotMetEmail(sellerEmail: string, sellerName: string, vehicleTitle: string, auctionId: string) { return this.sendBrandedEmail({ to:sellerEmail, subject:`Auction ended — reserve not met for "${vehicleTitle}" — CarMazium`, bodyHtml:`<h1 style="color:#fff;">Auction Ended — Reserve Not Met</h1><p style="color:#94a3b8;">Hi ${sellerName}, the reserve for ${vehicleTitle} was not reached.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/dashboard/seller/auctions" style="display:inline-block;padding:16px 48px;background:#ed1c24;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">Re-auction Vehicle →</a></div>` }); }

    async sendHandoverApprovedEmail(sellerEmail: string, sellerName: string, vehicleTitle: string) { return this.sendBrandedEmail({ to:sellerEmail, subject:'Handover verified — £100 bonus released — CarMazium ✅', bodyHtml:`<h1 style="color:#fff;">Handover Proof Verified ✅</h1><p style="color:#94a3b8;">Hi ${sellerName}, proof for ${vehicleTitle} was approved.</p><p style="font-size:18px;font-weight:800;color:#4ade80;">£100 Seller Bonus Released</p>` }); }
    async sendHandoverDeniedEmail(sellerEmail: string, sellerName: string, vehicleTitle: string) { return this.sendBrandedEmail({ to:sellerEmail, subject:`Action required: resubmit handover proof for "${vehicleTitle}" — CarMazium`, bodyHtml:`<h1 style="color:#fff;">Handover Proof Needs Attention ⚠️</h1><p style="color:#94a3b8;">Hi ${sellerName}, please upload clearer proof for ${vehicleTitle}.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/dashboard/seller/auctions" style="display:inline-block;padding:16px 48px;background:#ed1c24;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">Resubmit Proof →</a></div>` }); }

    async sendKycRejectedDealerAlert(dealerEmail: string, dealerName: string, rejectedFields: { field: string; note: string }[]) { const fieldListHtml = rejectedFields.map(f=>`<li><strong>${f.field}</strong>: ${f.note || 'No reason provided.'}</li>`).join(''); return this.sendBrandedEmail({ to:dealerEmail, subject:'Action Required: Update your CarMazium Dealer Documents ⚠️', bodyHtml:`<h1 style="color:#fff;">KYC Verification Update ⚠️</h1><p style="color:#94a3b8;">Dear ${dealerName}, please update:</p><ul style="color:#cbd5e1;">${fieldListHtml}</ul>` }); }
    async sendListingApprovedAlert(sellerEmail: string, sellerName: string, listingTitle: string, listingSlug: string) { return this.sendBrandedEmail({ to:sellerEmail, subject:`Your listing "${listingTitle}" is now live — CarMazium 🎉`, bodyHtml:`<h1 style="color:#fff;">Your Listing is Live! 🎉</h1><p style="color:#94a3b8;">Hi ${sellerName}, ${listingTitle} is live.</p><div style="text-align:center;margin:36px 0 24px;"><a href="${this.frontendUrl}/buy-cars/${listingSlug}" style="display:inline-block;padding:16px 48px;background:#16a34a;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">View Live Listing →</a></div>` }); }

    async sendHpiReportEmail(options: { toEmail:string; vehicleTitle:string; vrm:string; isClear:boolean; listingSlug:string; pdfBuffer:Buffer; }) { const {toEmail,vehicleTitle,vrm,isClear,listingSlug,pdfBuffer}=options; return this.sendBrandedEmail({ to:toEmail, subject:`Your CarMazium Vehicle History Report — ${vehicleTitle} (${vrm})`, bodyHtml:`<h1 style="color:#fff;">Your Vehicle History Report</h1><p style="color:#cbd5e1;">Attached is the report for ${vehicleTitle} (${vrm}). ${isClear ? 'All checks passed.' : 'One or more checks were not passed.'}</p><div style="text-align:center;margin:32px 0 24px;"><a href="${this.frontendUrl}/buy-cars/${listingSlug}" style="display:inline-block;padding:16px 48px;background:#ed1c24;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">View Listing →</a></div>`, attachments:[{filename:`CarMazium_Vehicle_History_Report_${vrm.replace(/[^A-Za-z0-9]/g,'')}.pdf`,content:pdfBuffer}] }); }
    async sendHpiReportReadyAlert(options:{toEmail:string;firstName:string;vehicleTitle:string;listingSlug:string;}) { const {toEmail,firstName,vehicleTitle,listingSlug}=options; return this.sendBrandedEmail({to:toEmail,subject:`Your vehicle history report is ready — ${vehicleTitle}`,bodyHtml:`<h1 style="color:#fff;">Your Vehicle History Report Is Ready</h1><p style="color:#cbd5e1;">Hi ${firstName}, the report for ${vehicleTitle} is ready.</p><div style="text-align:center;margin:32px 0 24px;"><a href="${this.frontendUrl}/buy-cars/${listingSlug}" style="display:inline-block;padding:16px 48px;background:#ed1c24;color:#fff;text-decoration:none;font-weight:800;border-radius:12px;">View Report →</a></div>`}); }
    async sendHpiPendingReminder(options:{toEmail:string;reports:{vehicleTitle:string;vrm:string;daysWaiting:number;waitingBuyers:number;}[];}) { const {toEmail,reports}=options; return this.sendBrandedEmail({to:toEmail,subject:`${reports.length} HPI report${reports.length===1?'':'s'} awaiting preparation — CarMazium`,bodyHtml:`<h1 style="color:#fff;">${reports.length} HPI report${reports.length===1?'':'s'} still outstanding</h1><p style="color:#cbd5e1;">${reports.map(r=>`${r.vehicleTitle} (${r.vrm}) — ${r.daysWaiting} day(s)`).join('<br/>')}</p>`}); }
    async sendListingRejectedAlert(sellerEmail:string,sellerName:string,listingTitle:string,reason:string) { return this.sendBrandedEmail({to:sellerEmail,subject:`Action needed: your listing "${listingTitle}" wasn't approved — CarMazium ⚠️`,bodyHtml:`<h1 style="color:#fff;">Your Listing Needs Attention ⚠️</h1><p style="color:#cbd5e1;">Hi ${sellerName}, ${listingTitle} was not approved. Reason: ${reason}</p>`}); }
    async sendAddressVerificationCodeEmail(toEmail:string,name:string,code:string,address:string) { return this.sendBrandedEmail({to:toEmail,subject:`${code} is your CarMazium verification code`,bodyHtml:`<h1 style="color:#fff;">Your verification code</h1><p style="font-size:36px;font-weight:800;color:#ed1c24;">${code}</p><p style="color:#cbd5e1;">Address: ${address}</p><p style="color:#64748b;">Hi ${name}, this code expires in 30 minutes.</p>`}); }
}
