import { Body, Controller, Param, Post, UseGuards, BadRequestException, NotFoundException } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { StandardResponse } from '../listings/dto/response.dto';

@ApiTags('Admin')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/auction-refunds')
export class AuctionRefundsController {
    constructor(
        private readonly prisma: PrismaService,
        private readonly payments: PaymentsService,
    ) {}

    /**
     * Explicit failed-sale path for the refundable £100 portion of the £125
     * auction buyer fee. This is intentionally separate from handover-proof
     * rejection: unclear evidence means "resubmit proof", not "refund buyer".
     */
    @Post(':auctionId/failed-sale')
    @ApiOperation({ summary: 'Refund £100 after a qualifying auction sale fails/cancels; retain the £25 platform fee' })
    async refundFailedSale(
        @Param('auctionId') auctionId: string,
        @Body('reason') reason: string,
    ) {
        if (!reason?.trim() || reason.trim().length < 5) {
            throw new BadRequestException('A clear failed-sale reason is required.');
        }

        const auction = await this.prisma.auction.findUnique({
            where: { id: auctionId },
            include: {
                listing: { select: { id: true, title: true, sellerId: true } },
                winner: { select: { id: true } },
            },
        });
        if (!auction) throw new NotFoundException('Auction not found');
        if (auction.status !== 'ENDED' || !auction.winnerId) {
            throw new BadRequestException('Only a completed auction with a confirmed winner can use the failed-sale refund path.');
        }
        if (!auction.buyerFeePaid || !auction.buyerFeeTransactionId) {
            throw new BadRequestException('The auction buyer fee was not paid.');
        }
        if (auction.sellerBonusReleased) {
            throw new BadRequestException('The seller bonus has already been released; this sale cannot be refunded through the failed-sale path.');
        }

        await this.payments.issueRefundForAuction(auctionId, 'FAILED_SALE');

        // Keep the historical fact that the £125 fee was paid. The separate
        // REFUND transaction records the £100 returned and leaves net £25.
        await this.prisma.auction.update({
            where: { id: auctionId },
            data: {
                stripeRefundError: null,
                handoverProofUrl: null,
                handoverSubmittedAt: null,
            },
        });

        const refund = await this.prisma.transaction.findFirst({
            where: {
                listingId: auction.listingId,
                userId: auction.winnerId,
                type: 'REFUND',
                status: 'COMPLETED',
            },
            orderBy: { createdAt: 'desc' },
            select: { id: true, amount: true, stripePaymentId: true, createdAt: true },
        });

        return new StandardResponse({
            auctionId,
            reason: reason.trim(),
            refundedAmount: 100,
            nonRefundableAmount: 25,
            refund,
        });
    }
}
