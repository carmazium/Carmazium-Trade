import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Body,
    Param,
    Query,
    UseGuards,
    HttpCode,
    HttpStatus,
    BadRequestException,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiCookieAuth,
} from '@nestjs/swagger';
import { AuctionsService } from './auctions.service';
import { CreateAuctionDto } from './dto/create-auction.dto';
import { UpdateAuctionDto } from './dto/update-auction.dto';
import { UpdateAuctionDigestDto } from './dto/update-auction-digest.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { OptionalSessionAuthGuard } from '../auth/guards/optional-session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { VerifiedDealerGuard } from '../auth/guards/verified-dealer.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StandardResponse } from '../listings/dto/response.dto';

@ApiTags('Auctions')
@Controller('auctions')
export class AuctionsController {
    constructor(private readonly auctionsService: AuctionsService) { }

    // ── Trade Exchange browse routes (dealers and admins only) ────────────────
    //
    // These two used to be public, which is what let the frontend show guests
    // and retail buyers a browsable wall of auction stock. The Trade Exchange is
    // trade-only now: live trade bids are the dealers' cost base, and a retail
    // buyer who can read them can read what their next car cost the forecourt.
    //
    // Enforced here and not only in the UI — hiding a grid in React leaves the
    // JSON one curl away, so the browse listing itself has to require the role.
    // VerifiedDealerGuard, not RolesGuard: role DEALER is self-serve, so gating
    // on the role alone let anyone switch their own account over and read the
    // trade stock without ever passing KYC.
    //
    // Per-auction detail (@Get(':id')) deliberately stays on the optional guard:
    // a private seller has to be able to open their own car's auction room, and
    // that page applies its own seller-or-dealer rule.

    @Get('active')
    @UseGuards(SessionAuthGuard, VerifiedDealerGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Get all live (ACTIVE) auctions — dealers only' })
    @ApiResponse({ status: 200, description: 'List of active auctions' })
    @ApiResponse({ status: 403, description: 'Trade Exchange is restricted to dealer accounts' })
    async findAllActive() {
        const auctions = await this.auctionsService.findAllActive();
        return new StandardResponse(auctions);
    }

    @Get('scheduled')
    @UseGuards(SessionAuthGuard, VerifiedDealerGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Get all upcoming (SCHEDULED) auctions — dealers only' })
    @ApiResponse({ status: 200, description: 'List of scheduled auctions' })
    @ApiResponse({ status: 403, description: 'Trade Exchange is restricted to dealer accounts' })
    async findAllScheduled(
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        const result = await this.auctionsService.findAllScheduled(+page, +limit);
        return new StandardResponse(result);
    }

    // ── Authenticated Routes ──────────────────────────────────────────────────

    @Get('my/list')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: "Get the current user's auctions" })
    async findMyAuctions(
        @CurrentUser() user: any,
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        const result = await this.auctionsService.findMyAuctions(user.id, +page, +limit);
        return new StandardResponse(result);
    }

    @Get('my/won')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Get auctions the current user has WON as a bidder' })
    async findWonAuctions(
        @CurrentUser() user: any,
        @Query('page') page = '1',
        @Query('limit') limit = '20',
    ) {
        const result = await this.auctionsService.findWonAuctions(user.id, +page, +limit);
        return new StandardResponse(result);
    }

    @Get(':id')
    @UseGuards(OptionalSessionAuthGuard)
    @ApiOperation({ summary: 'Get full auction details by ID' })
    @ApiResponse({ status: 200, description: 'Auction details with bids and listing' })
    @ApiResponse({ status: 404, description: 'Auction not found' })
    async findOne(@Param('id') id: string, @CurrentUser() user: any) {
        const auction = await this.auctionsService.findOne(id, user?.id);
        return new StandardResponse(auction);
    }

    @Post()
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Create a new auction for a listing you own' })
    @ApiResponse({ status: 201, description: 'Auction created. endTime = startTime + 24 hours.' })
    @ApiResponse({ status: 400, description: 'Validation error or auction already exists' })
    @ApiResponse({ status: 403, description: 'You do not own this listing' })
    async create(@Body() createAuctionDto: CreateAuctionDto, @CurrentUser() user: any) {
        const auction = await this.auctionsService.create(createAuctionDto, user.id);
        return new StandardResponse(auction);
    }

    @Patch(':id')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Update a SCHEDULED auction (startTime, reserve, increments)' })
    @ApiResponse({ status: 400, description: 'Cannot update an ACTIVE or ENDED auction' })
    async update(
        @Param('id') id: string,
        @Body() updateAuctionDto: UpdateAuctionDto,
        @CurrentUser() user: any,
    ) {
        const auction = await this.auctionsService.update(id, updateAuctionDto, user.id);
        return new StandardResponse(auction);
    }

    @Patch(':id/digest')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Set custom tags/batch labels and a self-rating on your own auction listing' })
    @ApiResponse({ status: 400, description: 'Cannot edit the digest of an ended or cancelled auction' })
    @ApiResponse({ status: 403, description: 'You do not own this auction' })
    async updateDigest(
        @Param('id') id: string,
        @Body() dto: UpdateAuctionDigestDto,
        @CurrentUser() user: any,
    ) {
        const auction = await this.auctionsService.updateDigest(id, dto, user.id);
        return new StandardResponse(auction);
    }

    @Patch(':id/cancel')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Cancel a SCHEDULED auction' })
    async cancel(@Param('id') id: string, @CurrentUser() user: any) {
        const auction = await this.auctionsService.cancel(id, user.id);
        return new StandardResponse(auction);
    }

    @Delete(':id')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Soft-delete a SCHEDULED auction' })
    async remove(@Param('id') id: string, @CurrentUser() user: any) {
        const auction = await this.auctionsService.remove(id, user.id);
        return new StandardResponse(auction);
    }

    @Post(':id/close')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Close an ACTIVE auction early (seller only) — triggers normal end logic' })
    @ApiResponse({ status: 200, description: 'Auction closed — winner determined if reserve met' })
    @ApiResponse({ status: 400, description: 'Auction is not currently ACTIVE' })
    @ApiResponse({ status: 403, description: 'You do not own this auction' })
    async closeEarly(@Param('id') id: string, @CurrentUser() user: any) {
        await this.auctionsService.sellerClose(id, user.id);
        return new StandardResponse({ closed: true });
    }

    @Post(':id/accept-bid')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Accept a specific bid and end the auction immediately (seller only)' })
    @ApiResponse({ status: 200, description: 'Bid accepted — auction ended with that bidder as winner' })
    @ApiResponse({ status: 400, description: 'Auction is not ACTIVE or bidId missing' })
    @ApiResponse({ status: 403, description: 'You do not own this auction' })
    @ApiResponse({ status: 404, description: 'Bid not found in this auction' })
    async acceptBid(
        @Param('id') id: string,
        @Body('bidId') bidId: string,
        @CurrentUser() user: any,
    ) {
        if (!bidId) throw new BadRequestException('bidId is required');
        await this.auctionsService.acceptBid(id, bidId, user.id);
        return new StandardResponse({ accepted: true });
    }

    // ── Buy It Now Routes ────────────────────────────────────────────────────

    @Post(':id/bin-trigger')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Buyer triggers a Buy It Now request — enters BIN pending state (seller has 24h to respond)' })
    @ApiResponse({ status: 200, description: 'BIN request sent to seller' })
    @ApiResponse({ status: 400, description: 'Auction not ACTIVE, no BIN price set, or reserve already met' })
    async binTrigger(@Param('id') id: string, @CurrentUser() user: any) {
        await this.auctionsService.triggerBuyItNow(id, user.id);
        return new StandardResponse({ triggered: true });
    }

    @Post(':id/bin-confirm')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Seller confirms a pending Buy It Now request — ends auction with BIN buyer as winner' })
    @ApiResponse({ status: 200, description: 'Auction ended — BIN buyer declared winner' })
    @ApiResponse({ status: 400, description: 'No pending BIN request' })
    @ApiResponse({ status: 403, description: 'You do not own this auction' })
    async binConfirm(@Param('id') id: string, @CurrentUser() user: any) {
        await this.auctionsService.confirmBuyItNow(id, user.id);
        return new StandardResponse({ confirmed: true });
    }

    @Post(':id/bin-decline')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Seller declines a pending Buy It Now request — auction resumes normally' })
    @ApiResponse({ status: 200, description: 'BIN request declined — auction continues' })
    @ApiResponse({ status: 403, description: 'You do not own this auction' })
    async binDecline(@Param('id') id: string, @CurrentUser() user: any) {
        await this.auctionsService.declineBuyItNow(id, user.id);
        return new StandardResponse({ declined: true });
    }

    @Post(':id/handover-proof')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Submit handover proof for an ended auction (seller only)' })
    @ApiResponse({ status: 200, description: 'Proof submitted — £100 seller bonus pending admin verification' })
    @ApiResponse({ status: 400, description: 'Auction not ended, no winner, or proof already submitted' })
    @ApiResponse({ status: 403, description: 'You do not own this auction' })
    async submitHandoverProof(
        @Param('id') id: string,
        @Body('proofUrl') proofUrl: string,
        @CurrentUser() user: any,
    ) {
        if (!proofUrl) {
            throw new BadRequestException('proofUrl is required');
        }
        const result = await this.auctionsService.submitHandoverProof(id, user.id, proofUrl);
        return new StandardResponse(result);
    }
}
