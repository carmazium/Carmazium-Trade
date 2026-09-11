import { Body, Controller, Param, Post, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';
import { StandardResponse } from '../listings/dto/response.dto';

@ApiTags('Admin')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/auctions')
export class AuctionRefundsController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly payments: PaymentsService,
        private readonly notificationsService: NotificationsService,
        private readonly notificationsGateway: NotificationsGateway,
    ) {}

    /**
     * Explicit failed-sale path for the refundable £100 portion of the £125
     * auction buyer fee. This is intentionally separate from handover-proof
     * rejection: unclear evidence means "resubmit proof", not "refund buyer".
     *
     * Stripe is refunded first. The refund helper is idempotent, so if a later
     * database step fails an admin can safely retry this action without a
     * second £100 refund being created.
     */
    @Post(':auctionId/refund-failed-sale')
    @ApiOperation({ summary: 'Cancel a qualifying failed auction sale, refund £100, and retain the £25 platform fee' })
    async refundFailedSale(
        @Param('auctionId') auctionId: string,
        @Body('reason') reason: string,
    ) {
        const cleanReason = reason?.trim();
        if (!cleanReason || cleanReason.length < 5) {
            throw new BadRequestException('A clear failed-sale reason is required.');
        }

        const auction = await this.prisma.auction.findUnique({
            where: { id: auctionId },
            include: {
                listing: {
                    select: {
                        id: true,
                        title: true,
                        sellerId: true,
                        linkedListingId: true,
                        linkedListings: { select: { id: true } },
                    },
                },
                winner: { select: { id: true, firstName: true } },
            },
        });
        if (!auction) throw new NotFoundException('Auction not found');
        if (auction.status !== 'ENDED' || !auction.winnerId) {
            throw new BadRequestException('Only an ended auction with a confirmed winner can use the failed-sale refund path.');
        }
        if (!auction.buyerFeePaid || !auction.buyerFeeTransactionId) {
            throw new BadRequestException('The £125 auction buyer fee was not paid.');
        }
        if (auction.sellerBonusReleased || auction.stripePayoutTransferId || auction.manualPayoutConfirmedAt) {
            throw new BadRequestException('The seller incentive has already been released or paid; this sale cannot use the failed-sale refund path.');
        }

        const formerWinnerId = auction.winnerId;
        const sellerId = auction.listing.sellerId;

        // Refund exactly £100. PaymentsService keeps the original £125
        // COMMISSION row and creates a separate -£100 REFUND ledger entry.
        await this.payments.issueRefundForAuction(auctionId, 'FAILED_SALE');

        const sale = await this.prisma.sale.findUnique({
            where: { listingId: auction.listingId },
            select: { id: true },
        });
        const sellerProfile = sellerId
            ? await this.prisma.sellerProfile.findUnique({
                where: { userId: sellerId },
                select: { totalSales: true },
            })
            : null;

        // A dual-channel retail copy was automatically marked SOLD when the
        // auction completed. Keep every affected listing off-market as DRAFT
        // until the seller corrects the issue and deliberately relists it.
        const linkedIds = new Set<string>();
        if (auction.listing.linkedListingId) linkedIds.add(auction.listing.linkedListingId);
        for (const linked of auction.listing.linkedListings) linkedIds.add(linked.id);

        await this.prisma.$transaction(async (tx) => {
            await tx.auction.update({
                where: { id: auctionId },
                data: {
                    status: 'CANCELLED',
                    winnerId: null,
                    winningBidAmount: null,
                    wonAt: null,
                    buyerFeePaid: false,
                    handoverProofUrl: null,
                    handoverSubmittedAt: null,
                    sellerBonusReleasedAt: null,
                    stripeRefundError: null,
                    buyItNowPendingBuyerId: null,
                    buyItNowPendingAt: null,
                },
            });

            await tx.listing.update({
                where: { id: auction.listingId },
                data: { status: 'DRAFT' },
            });

            if (linkedIds.size > 0) {
                await tx.listing.updateMany({
                    where: { id: { in: Array.from(linkedIds) } },
                    data: { status: 'DRAFT' },
                });
            }

            if (sale) {
                await tx.sale.delete({ where: { id: sale.id } });
                if (sellerId && sellerProfile && sellerProfile.totalSales > 0) {
                    await tx.sellerProfile.update({
                        where: { userId: sellerId },
                        data: { totalSales: { decrement: 1 } },
                    });
                }
            }
        });

        const buyerNotification = await this.notificationsService.create({
            userId: formerWinnerId,
            type: 'AUCTION_FAILED_SALE_REFUND',
            title: 'Auction sale cancelled — £100 refunded',
            message: `The sale of "${auction.listing.title}" was cancelled. £100 of your £125 buyer fee has been refunded; the £25 platform fee is retained. Reason: ${cleanReason}`,
            entityType: 'AUCTION',
            entityId: auctionId,
            link: '/dashboard/dealer/auctions/won',
        }).catch(() => null);
        if (buyerNotification) this.notificationsGateway.sendNotification(formerWinnerId, buyerNotification);

        if (sellerId) {
            const sellerNotification = await this.notificationsService.create({
                userId: sellerId,
                type: 'AUCTION_FAILED_SALE',
                title: 'Auction sale cancelled',
                message: `The sale of "${auction.listing.title}" was cancelled. The buyer received the refundable £100 portion of the buyer fee. Your listing has been returned to draft so you can correct it and relist. Reason: ${cleanReason}`,
                entityType: 'AUCTION',
                entityId: auctionId,
                link: '/dashboard/seller/auctions',
            }).catch(() => null);
            if (sellerNotification) this.notificationsGateway.sendNotification(sellerId, sellerNotification);
        }

        const refund = await this.prisma.transaction.findFirst({
            where: {
                listingId: auction.listingId,
                userId: formerWinnerId,
                type: 'REFUND',
                status: 'COMPLETED',
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true, amount: true, stripePaymentId: true, createdAt: true },
        });

        return new StandardResponse({
            auctionId,
            reason: cleanReason,
            status: 'CANCELLED',
            listingStatus: 'DRAFT',
            refundedAmount: 100,
            nonRefundableAmount: 25,
            refund,
        });
    }
}
