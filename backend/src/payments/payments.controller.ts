import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Headers,
    Req,
    UseGuards,
    BadRequestException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiCookieAuth,
} from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StandardResponse } from '../listings/dto/response.dto';
import { CreateCheckoutSessionDto, CreatePaymentSheetDto } from './dto/create-payment-intent.dto';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) {}

    @Post('checkout')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Create a Stripe Checkout Session for CarMazium platform fees' })
    @ApiResponse({ status: 201, description: 'Checkout session created — returns redirect URL' })
    async createCheckout(@Body() dto: CreateCheckoutSessionDto, @CurrentUser() user: any) {
        const result = await this.paymentsService.createCheckoutSession(
            dto.listingId,
            user.id,
            dto.amount,
            dto.type,
            dto.currency,
        );
        return new StandardResponse(result);
    }

    @Post('intent')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Create Payment Sheet intent for CarMazium platform fees/services' })
    @ApiResponse({ status: 201, description: 'Returns clientSecret, ephemeralKey, customerId, publishableKey' })
    async createPaymentSheet(@Body() dto: CreatePaymentSheetDto, @CurrentUser() user: any) {
        const result = await this.paymentsService.createPaymentSheet(
            dto.listingId,
            user.id,
            dto.amount,
            dto.type,
            dto.currency,
            dto.badgeTier,
            dto.vrm,
        );
        return new StandardResponse(result);
    }

    @Post('hpi-checkout')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Create a Stripe Checkout Session for HPI Report' })
    async createHpiCheckout(
        @Body('vrm') vrm: string,
        @Body('listingId') listingId: string,
        @CurrentUser() user: any,
    ) {
        if (!listingId) throw new BadRequestException('listingId is required for HPI checkout');
        return new StandardResponse(await this.paymentsService.createHpiSession(vrm, user.id, listingId));
    }

    @Post('hpi-email-checkout')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: "Create a Stripe Checkout Session for a buyer's emailed HPI report copy" })
    async createHpiEmailCheckout(
        @Body('listingId') listingId: string,
        @Body('returnPath') returnPath: string,
        @CurrentUser() user: any,
    ) {
        if (!listingId) throw new BadRequestException('listingId is required for HPI email checkout');
        return new StandardResponse(await this.paymentsService.createHpiEmailSession(listingId, user.id, returnPath));
    }

    @Post('listing-checkout')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Create a Stripe Checkout Session for Listing Fee' })
    async createListingCheckout(
        @Body('badgeTier') badgeTier: 'BASIC' | 'STANDARD' | 'PREMIUM',
        @Body('listingId') listingId: string,
        @CurrentUser() user: any,
    ) {
        return new StandardResponse(await this.paymentsService.createListingSession(badgeTier, user.id, listingId));
    }

    @Get('session-status/:sessionId')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Get own Stripe Checkout Session status' })
    async getSessionStatus(@Param('sessionId') sessionId: string, @CurrentUser() user: any) {
        return new StandardResponse(await this.paymentsService.getSessionStatus(sessionId, user.id));
    }

    @Post('apply-auction-fee')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Webhook fallback: apply own auction buyer fee if webhook was delayed' })
    async applyAuctionFee(@Body('sessionId') sessionId: string, @CurrentUser() user: any) {
        if (!sessionId) throw new BadRequestException('sessionId is required');
        return new StandardResponse(await this.paymentsService.applyAuctionFee(sessionId, user.id));
    }

    @Post('apply-kyc-fee')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Webhook fallback: apply own dealer KYC £1 fee if webhook was delayed' })
    async applyKycFee(@Body('sessionId') sessionId: string, @CurrentUser() user: any) {
        if (!sessionId) throw new BadRequestException('sessionId is required');
        return new StandardResponse(await this.paymentsService.applyKycFee(sessionId, user.id));
    }

    @Post('apply-hpi-fee')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Webhook fallback: apply own HPI fee if webhook was delayed' })
    async applyHpiFee(@Body('sessionId') sessionId: string, @CurrentUser() user: any) {
        if (!sessionId) throw new BadRequestException('sessionId is required');
        return new StandardResponse(await this.paymentsService.applyHpiFee(sessionId, user.id));
    }

    @Post('apply-hpi-email-fee')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: "Webhook fallback: register the buyer's own emailed HPI report request" })
    async applyHpiEmailFee(@Body('sessionId') sessionId: string, @CurrentUser() user: any) {
        if (!sessionId) throw new BadRequestException('sessionId is required');
        return new StandardResponse(await this.paymentsService.applyHpiEmailFee(sessionId, user.id));
    }

    @Get('history')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Get payment history' })
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
