import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AuctionsService } from '../auctions/auctions.service';
import { AuctionGateway } from '../auctions/auction.gateway';
import { NotificationsGateway } from '../notifications/notifications.gateway';

@Injectable()
export class AuctionLifecycleService {
    private readonly logger = new Logger(AuctionLifecycleService.name);
    // Track which auctions have already received a 5-min warning this cycle
    private readonly warnedAuctions = new Set<string>();

    constructor(
        private readonly prisma: PrismaService,
        private readonly auctionsService: AuctionsService,
        private readonly auctionGateway: AuctionGateway,
        private readonly notificationsGateway: NotificationsGateway,
    ) { }

    @Cron('* * * * *') // every minute
    async handleAuctionLifecycle(): Promise<void> {
        const now = new Date();

        await Promise.all([
            this.activateScheduledAuctions(now),
            this.sendEndingSoonWarnings(now),
            this.closeExpiredAuctions(now),
        ]);
    }

    private async activateScheduledAuctions(now: Date): Promise<void> {
        // The parent listing must have cleared admin review (ACTIVE) before its
        // auction is allowed to go live — otherwise an auction whose listing is
        // still PENDING_REVIEW (or was REJECTED) would go live to bidders with
        // zero admin ever having approved it. Auctions past their startTime just
        // sit SCHEDULED until the listing is approved; approveListing() flips the
        // listing to ACTIVE and this cron picks the auction up on its next run.
        const toActivate = await this.prisma.auction.findMany({
            where: {
                status: 'SCHEDULED',
                startTime: { lte: now },
                deletedAt: null,
                listing: { status: 'ACTIVE' },
            },
        });

        for (const auction of toActivate) {
            // If admin/HPI review held the auction past its requested start, begin
            // a fresh full 24-hour window now rather than shortening the sale.
            const actualStart = now > auction.startTime ? now : auction.startTime;
            const actualEnd = new Date(actualStart.getTime() + 24 * 60 * 60 * 1000);
            await this.prisma.auction.update({
                where: { id: auction.id },
                data: { status: 'ACTIVE', startTime: actualStart, endTime: actualEnd },
            });
            this.auctionGateway.broadcastAuctionStart(auction.id);
            this.logger.log(`Activated auction ${auction.id}`);
        }
    }

    private async sendEndingSoonWarnings(now: Date): Promise<void> {
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

        const endingSoon = await this.prisma.auction.findMany({
            where: {
                status: 'ACTIVE',
                endTime: { gt: now, lte: fiveMinutesFromNow },
                deletedAt: null,
            },
            include: {
                listing: {
                    include: {
                        bids: {
                            select: { bidderId: true },
                            distinct: ['bidderId'],
                            where: { deletedAt: null },
                        },
                    },
                },
            },
        });

        for (const auction of endingSoon) {
            if (this.warnedAuctions.has(auction.id)) continue;

            for (const { bidderId } of auction.listing.bids) {
                this.notificationsGateway.sendNotification(bidderId, {
                    type: 'AUCTION_ENDING',
                    title: 'Auction ending soon!',
                    message: `An auction you bid on ends in under 5 minutes.`,
                    entityType: 'AUCTION',
                    entityId: auction.id,
                    link: `/auctions/live/${auction.id}`,
                });
            }

            this.warnedAuctions.add(auction.id);
            this.logger.log(`Sent ending-soon warnings for auction ${auction.id}`);
        }

        // Clean up warned set for auctions that have already ended
        for (const auctionId of this.warnedAuctions) {
            const stillActive = endingSoon.find(a => a.id === auctionId);
            if (!stillActive) this.warnedAuctions.delete(auctionId);
        }
    }

    private async closeExpiredAuctions(now: Date): Promise<void> {
        const toClose = await this.prisma.auction.findMany({
            where: {
                status: 'ACTIVE',
                endTime: { lte: now },
                deletedAt: null,
            },
        });

        for (const auction of toClose) {
            try {
                await this.auctionsService.closeAuction(auction.id);
                this.logger.log(`Closed auction ${auction.id}`);
            } catch (err) {
                this.logger.error(`Failed to close auction ${auction.id}: ${err}`);
            }
        }
    }
}
