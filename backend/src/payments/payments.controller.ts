import {
    Controller,
    Get,
    Post,
    Body,
    Param,
    Headers,
    Req,
    UseGuards,
    RawBody,
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
    @ApiOperation({ summary: 'Create a Stripe Checkout Session' })
    @ApiResponse({ status: 201, description: 'Checkout session created — returns redirect URL' })
    async createCheckout(
        @Body() dto: CreateCheckoutSessionDto,
        @CurrentUser() user: any,
    ) {
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
    @ApiOperation({ summary: 'Create Payment Sheet intent (React Native native SDK)' })
    @ApiResponse({ status: 201, description: 'Returns clientSecret, ephemeralKey, customerId, publishableKey' })
    async createPaymentSheet(
        @Body() dto: CreatePaymentSheetDto,
        @CurrentUser() user: any,
    ) {
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

    @Post('tradexchange-checkout')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Create Stripe Checkout for an accepted TradeXchange service quote' })
    async createTradeXchangeCheckout(
        @Body('jobId') jobId: string,
        @CurrentUser() user: any,
    ) {
        if (!jobId) throw new BadRequestException('jobId is required');
        const result = await this.paymentsService.createTradeXchangeCheckout(jobId, user.id);
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
        if (!listingId) {
            throw new BadRequestException('listingId is required for HPI checkout');
        }
        const result = await this.paymentsService.createHpiSession(vrm, user.id, listingId);
        return new StandardResponse(result);
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
        if (!listingId) {
            throw new BadRequestException('listingId is required for HPI email checkout');
        }
        const result = await this.paymentsService.createHpiEmailSession(listingId, user.id, returnPath);
        return new StandardResponse(result);
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
        const result = await this.paymentsService.createListingSession(badgeTier, user.id, listingId);
        return new StandardResponse(result);
    }

    @Get('session-status/:sessionId')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Get Stripe Checkout Session status' })
    async getSessionStatus(@Param('sessionId') sessionId: string) {
        const status = await this.paymentsService.getSessionStatus(sessionId);
        return new StandardResponse(status);
    }

    @Post('apply-tradexchange-payment')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Webhook fallback: reconcile a TradeXchange service payment with Stripe' })
    async applyTradeXchangePayment(
        @Body('sessionId') sessionId: string,
        @CurrentUser() user: any,
    ) {
        if (!sessionId) throw new BadRequestException('sessionId is required');
        const result = await this.paymentsService.applyTradeXchangePayment(sessionId, user.id);
        return new StandardResponse(result);
    }

    @Post('apply-auction-fee')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Webhook fallback: apply auction buyer fee if webhook was delayed' })
    async applyAuctionFee(@Body('sessionId') sessionId: string) {
        if (!sessionId) throw new BadRequestException('sessionId is required');
        const result = await this.paymentsService.applyAuctionFee(sessionId);
        return new StandardResponse(result);
    }

    @Post('apply-kyc-fee')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Webhook fallback: apply dealer KYC £1 fee if webhook was delayed' })
    async applyKycFee(@Body('sessionId') sessionId: string) {
        if (!sessionId) throw new BadRequestException('sessionId is required');
        const result = await this.paymentsService.applyKycFee(sessionId);
        return new StandardResponse(result);
    }

    @Post('apply-hpi-fee')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Webhook fallback: generate the HPI report if the webhook was delayed' })
    async applyHpiFee(@Body('sessionId') sessionId: string) {
        if (!sessionId) throw new BadRequestException('sessionId is required');
        const result = await this.paymentsService.applyHpiFee(sessionId);
        return new StandardResponse(result);
    }

    @Post('apply-hpi-email-fee')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: "Webhook fallback: register the buyer's emailed HPI report request if the webhook was delayed" })
    async applyHpiEmailFee(@Body('sessionId') sessionId: string) {
        if (!sessionId) throw new BadRequestException('sessionId is required');
        const result = await this.paymentsService.applyHpiEmailFee(sessionId);
        return new StandardResponse(result);
    }

    @Get('history')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Get payment history' })
    async getHistory(@CurrentUser() user: any) {
        const history = await this.paymentsService.getPaymentHistory(user.id);
        return new StandardResponse(history);
    }

    @Post('webhook')
    @ApiOperation({ summary: 'Stripe Webhook Handler' })
    @ApiResponse({ status: 200, description: 'Webhook processed' })
    async handleWebhook(
        @Headers('stripe-signature') sig: string,
        @Req() req: any,
    ) {
        // rawBody is attached by the raw-body middleware in main.ts
        const rawBody = req.rawBody;
        return this.paymentsService.handleWebhook(rawBody, sig);
    }
}
