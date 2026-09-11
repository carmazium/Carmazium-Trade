import {
    BadRequestException,
    CanActivate,
    ExecutionContext,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Protects the existing legacy AdminService.approveHandover method with the
 * business invariants that must be true before a £100 seller incentive can be
 * released. Registered globally, but it is a no-op for every route except the
 * one handover-approval endpoint.
 */
@Injectable()
export class HandoverApprovalInvariantGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const req = context.switchToHttp().getRequest<any>();
        const path = String(req.originalUrl || req.url || '').split('?')[0];
        const match = path.match(/^\/admin\/handovers\/([^/]+)\/approve$/);

        if (req.method !== 'POST' || !match) return true;

        const auctionId = decodeURIComponent(match[1]);
        const auction = await this.prisma.auction.findUnique({
            where: { id: auctionId },
            select: {
                status: true,
                winnerId: true,
                buyerFeePaid: true,
                handoverProofUrl: true,
                handoverSubmittedAt: true,
                sellerBonusReleased: true,
            },
        });

        if (!auction) throw new NotFoundException('Auction not found');
        if (auction.sellerBonusReleased) return true; // existing idempotent path
        if (auction.status !== 'ENDED' || !auction.winnerId) {
            throw new BadRequestException('A handover can only be approved after the auction has ended with a confirmed winner.');
        }
        if (!auction.buyerFeePaid) {
            throw new BadRequestException('The winning dealer must pay the £125 auction buyer fee before the seller incentive can be approved.');
        }
        if (!auction.handoverProofUrl || !auction.handoverSubmittedAt) {
            throw new BadRequestException('No handover proof has been submitted for this auction.');
        }

        return true;
    }
}
