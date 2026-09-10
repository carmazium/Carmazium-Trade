import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';

/** How long a report may sit unprepared before staff get chased about it. */
const OVERDUE_AFTER_DAYS = 3;
/** Minimum gap between two nudges about the same report. */
const REMINDER_COOLDOWN_DAYS = 3;

/**
 * Chases admins about HPI reports that are still outstanding.
 *
 * Every listing waits for its mandatory report before publication. This digest
 * prevents a stale HPI queue from silently blocking sellers for days, and also
 * highlights any buyers waiting for separately purchased emailed copies.
 *
 * Idempotency: `reminderSentAt` on the report is stamped once the digest is
 * sent, and a report has to have been quiet for REMINDER_COOLDOWN_DAYS before
 * it can appear in another one — so a long-running backlog is chased
 * periodically rather than every single run.
 */
@Injectable()
export class HpiPendingReminderService {
    private readonly logger = new Logger(HpiPendingReminderService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly emailService: EmailService,
        private readonly notifications: NotificationsService,
    ) { }

    @Cron('0 9 * * *') // once a day at 09:00
    async chaseOutstandingReports(): Promise<void> {
        const now = Date.now();
        const overdueBefore = new Date(now - OVERDUE_AFTER_DAYS * 24 * 60 * 60 * 1000);
        const cooldownBefore = new Date(now - REMINDER_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);

        const overdue = await this.prisma.hpiReport.findMany({
            where: {
                status: 'PENDING',
                purchasedAt: { lte: overdueBefore },
                OR: [{ reminderSentAt: null }, { reminderSentAt: { lte: cooldownBefore } }],
                // A deleted listing owes nobody a report.
                listing: { deletedAt: null },
            },
            orderBy: { purchasedAt: 'asc' },
            include: {
                listing: { select: { title: true } },
                _count: { select: { emailRequests: { where: { status: 'PENDING' } } } },
            },
        });

        if (overdue.length === 0) return;

        const admins = await this.prisma.user.findMany({
            where: { role: 'ADMIN', deletedAt: null },
            select: { id: true, email: true },
        });
        if (admins.length === 0) {
            this.logger.warn(`${overdue.length} HPI report(s) overdue but no admin accounts to notify`);
            return;
        }

        const rows = overdue.map(r => ({
            vehicleTitle: r.listing?.title || r.vrm,
            vrm: r.vrm,
            daysWaiting: Math.floor((now - new Date(r.purchasedAt).getTime()) / (24 * 60 * 60 * 1000)),
            waitingBuyers: r._count.emailRequests,
        }));

        for (const admin of admins) {
            const notification = await this.notifications.create({
                userId: admin.id,
                type: 'HPI_REPORTS_OVERDUE',
                title: `${overdue.length} HPI report${overdue.length === 1 ? '' : 's'} outstanding`,
                message: `${overdue.length} mandatory vehicle-history review${overdue.length === 1 ? ' has' : 's have'} been waiting ${OVERDUE_AFTER_DAYS}+ days.`,
                link: '/dashboard/admin/hpi',
            }).catch(() => null);
            if (!notification) {
                this.logger.error(`Failed to create overdue-HPI notification for admin ${admin.id}`);
            }

            if (admin.email) {
                await this.emailService
                    .sendHpiPendingReminder({ toEmail: admin.email, reports: rows })
                    .catch(err => this.logger.error(`Failed to email HPI reminder to ${admin.email}: ${err.message}`));
            }
        }

        // Stamped after the send loop, so a total failure to notify leaves the
        // reports eligible for the next run rather than silently muting them.
        await this.prisma.hpiReport.updateMany({
            where: { id: { in: overdue.map(r => r.id) } },
            data: { reminderSentAt: new Date() },
        });

        this.logger.log(`Chased ${admins.length} admin(s) about ${overdue.length} outstanding HPI report(s)`);
    }
}
