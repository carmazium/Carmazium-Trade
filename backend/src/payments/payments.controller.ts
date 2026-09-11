import {
    BadRequestException,
    Body,
    Controller,
    Get,
    Headers,
    Param,
    Post,
    Req,
    UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StandardResponse } from '../listings/dto/response.dto';
import { CreateCheckoutSessionDto, CreatePaymentSheetDto } from './dto/create-payment-intent.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
    constructor(
        private readonly paymentsService: PaymentsService,
        private readonly prisma: PrismaService,
    ) {}

    private async assertSessionOwner(sessionId: string, userId: string, expectedType?: string) {
        const session = await this.paymentsService.getSessionStatus(sessionId);
        if (session.metadata?.userId !== userId) {
            throw new BadRequestException('This checkout session does not belong to your account');
        }
        if (expectedType && session.metadata?.type !== expectedType) {
            throw new BadRequestException('Checkout session type does not match this operation');
        }
        return session;
    }

    private async assertAuctionWinner(listingId: string, userId: string) {
        const auction = await this.prisma.auction.findFirst({
            where: { listingId, deletedAt: null },
            select: { winnerId: true, buyerFeePaid: true, status: true },
        });
        if (!auction || auction.winnerId !== userId) {
            throw new BadRequestException('Only the recorded auction winner can pay this buyer fee');
        }
        if (auction.status === 'CANCELLED') {
            throw new BadRequestException('This auction is cancelled');
        }
        if (auction.buyerFeePaid) {
            throw new BadRequestException('The auction buyer fee has already been paid');
        }
    }

    @Post('checkout')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Create Stripe Checkout for the £125 auction buyer fee' })
    async createCheckout(@Body() dto: CreateCheckoutSessionDto, @CurrentUser() user: any) {
        const type = dto.type ?? 'COMMISSION';
        if (type !== 'COMMISSION') throw new BadRequestException('CarMazium does not collect vehicle deposits or vehicle purchase funds');
        await this.assertAuctionWinner(dto.listingId, user.id);
        const result = await this.paymentsService.createCheckoutSession(dto.listingId, user.id, dto.amount, 'COMMISSION', dto.currency);
        return new StandardResponse(result);
    }

    @Post('intent')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Create Payment Sheet intent for a CarMazium platform fee/service' })
    async createPaymentSheet(@Body() dto: CreatePaymentSheetDto, @CurrentUser() user: any) {
        const type = dto.type ?? 'COMMISSION';
        if (type === 'COMMISSION') await this.assertAuctionWinner(dto.listingId, user.id);
        const result = await this.paymentsService.createPaymentSheet(dto.listingId, user.id, dto.amount, type, dto.currency, dto.badgeTier, dto.vrm);
        return new StandardResponse(result);
    }

    @Post('tradexchange-checkout')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Create Stripe Checkout for an accepted TradeXchange service quote' })
    async createTradeXchangeCheckout(@Body('jobId') jobId: string, @CurrentUser() user: any) {
        if (!jobId) throw new BadRequestException('jobId is required');
        return new StandardResponse(await this.paymentsService.createTradeXchangeCheckout(jobId, user.id));
    }

    @Post('hpi-checkout')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    async createHpiCheckout(@Body('vrm') vrm: string, @Body('listingId') listingId: string, @CurrentUser() user: any) {
        if (!listingId) throw new BadRequestException('listingId is required for HPI checkout');
        return new StandardResponse(await this.paymentsService.createHpiSession(vrm, user.id, listingId));
    }

    @Post('hpi-email-checkout')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    async createHpiEmailCheckout(@Body('listingId') listingId: string, @Body('returnPath') returnPath: string, @CurrentUser() user: any) {
        if (!listingId) throw new BadRequestException('listingId is required for HPI email checkout');
        return new StandardResponse(await this.paymentsService.createHpiEmailSession(listingId, user.id, returnPath));
    }

    @Post('listing-checkout')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    async createListingCheckout(@Body('badgeTier') badgeTier: 'BASIC' | 'STANDARD' | 'PREMIUM', @Body('listingId') listingId: string, @CurrentUser() user: any) {
        return new StandardResponse(await this.paymentsService.createListingSession(badgeTier, user.id, listingId));
    }

    @Get('session-status/:sessionId')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    async getSessionStatus(@Param('sessionId') sessionId: string, @CurrentUser() user: any) {
        const session = await this.assertSessionOwner(sessionId, user.id);
        return new StandardResponse(session);
    }

    @Post('apply-tradexchange-payment')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    async applyTradeXchangePayment(@Body('sessionId') sessionId: string, @CurrentUser() user: any) {
        if (!sessionId) throw new BadRequestException('sessionId is required');
        return new StandardResponse(await this.paymentsService.applyTradeXchangePayment(sessionId, user.id));
    }

    @Post('apply-auction-fee')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    async applyAuctionFee(@Body('sessionId') sessionId: string, @CurrentUser() user: any) {
        if (!sessionId) throw new BadRequestException('sessionId is required');
        const session = await this.assertSessionOwner(sessionId, user.id, 'COMMISSION');
        const listingId = session.metadata?.listingId;
        if (!listingId) throw new BadRequestException('Auction checkout is missing its listing reference');
        await this.assertAuctionWinner(listingId, user.id);
        return new StandardResponse(await this.paymentsService.applyAuctionFee(sessionId));
    }

    @Post('apply-kyc-fee')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    async applyKycFee(@Body('sessionId') sessionId: string, @CurrentUser() user: any) {
        if (!sessionId) throw new BadRequestException('sessionId is required');
        await this.assertSessionOwner(sessionId, user.id, 'KYC_VERIFICATION');
        return new StandardResponse(await this.paymentsService.applyKycFee(sessionId));
    }

    @Post('apply-hpi-fee')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    async applyHpiFee(@Body('sessionId') sessionId: string, @CurrentUser() user: any) {
        if (!sessionId) throw new BadRequestException('sessionId is required');
        await this.assertSessionOwner(sessionId, user.id, 'HPI_REPORT');
        return new StandardResponse(await this.paymentsService.applyHpiFee(sessionId));
    }

    @Post('apply-hpi-email-fee')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    async applyHpiEmailFee(@Body('sessionId') sessionId: string, @CurrentUser() user: any) {
        if (!sessionId) throw new BadRequestException('sessionId is required');
        await this.assertSessionOwner(sessionId, user.id, 'HPI_REPORT_EMAIL');
        return new StandardResponse(await this.paymentsService.applyHpiEmailFee(sessionId));
    }

    @Get('history')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    async getHistory(@CurrentUser() user: any) {
        return new StandardResponse(await this.paymentsService.getPaymentHistory(user.id));
    }

    @Post('webhook')
    @ApiOperation({ summary: 'Stripe Webhook Handler' })
    @ApiResponse({ status: 200, description: 'Webhook processed' })
    async handleWebhook(@Headers('stripe-signature') sig: string, @Req() req: any) {
        return this.paymentsService.handleWebhook(req.rawBody, sig);
    }
}
