import {
    Controller,
    Get,
    Post,
    Patch,
    Delete,
    Param,
    Query,
    Body,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiCookieAuth,
    ApiQuery,
    ApiParam,
    ApiResponse,
} from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { ReviewKycDto } from './dto/review-kyc.dto';
import { RejectListingDto } from './dto/reject-listing.dto';
import { AdminUpdateListingDto } from './dto/admin-update-listing.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import { StandardResponse, PaginatedResponse } from '../listings/dto/response.dto';

@ApiTags('Admin')
@Controller('admin')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
    constructor(private readonly adminService: AdminService) { }

    // ── Users ─────────────────────────────────────────────────────────────────

    @Get('users')
    @ApiOperation({ summary: 'List all users' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    @ApiQuery({ name: 'search', required: false, description: 'Filter by name or email' })
    async getAllUsers(
        @Query('page') page = 1,
        @Query('limit') limit = 20,
        @Query('search') search?: string,
    ): Promise<PaginatedResponse<any>> {
        const { data, total } = await this.adminService.getAllUsers(Number(page), Number(limit), search);
        return new PaginatedResponse(data, total, Number(page), Number(limit));
    }

    @Get('users/:id')
    @ApiOperation({ summary: 'Full user detail — dealer profile, KYC record with document URLs, seller profile, recent activity' })
    @ApiParam({ name: 'id', description: 'User UUID' })
    async getUserDetail(@Param('id') id: string): Promise<StandardResponse<any>> {
        const user = await this.adminService.getUserDetail(id);
        return new StandardResponse(user);
    }

    @Patch('users/:id/role')
    @ApiOperation({ summary: 'Update user role' })
    @ApiParam({ name: 'id', description: 'User UUID' })
    async updateUserRole(
        @Param('id') id: string,
        @Body('role') role: UserRole,
    ): Promise<StandardResponse<any>> {
        const user = await this.adminService.updateUserRole(id, role);
        return new StandardResponse(user);
    }

    @Patch('users/:id/verify')
    @ApiOperation({ summary: 'Verify user (email/dealer)' })
    @ApiParam({ name: 'id', description: 'User UUID' })
    async verifyUser(
        @Param('id') id: string,
        @Body('isVerified') isVerified: boolean,
    ): Promise<StandardResponse<any>> {
        const user = await this.adminService.verifyUser(id, isVerified);
        return new StandardResponse(user);
    }

    @Patch('users/:id/ban')
    @ApiOperation({ summary: 'Ban a user (soft delete)' })
    @ApiParam({ name: 'id', description: 'User UUID' })
    async banUser(@Param('id') id: string): Promise<StandardResponse<any>> {
        const user = await this.adminService.banUser(id);
        return new StandardResponse(user);
    }

    @Patch('users/:id/unban')
    @ApiOperation({ summary: 'Unban a user' })
    @ApiParam({ name: 'id', description: 'User UUID' })
    async unbanUser(@Param('id') id: string): Promise<StandardResponse<any>> {
        const user = await this.adminService.unbanUser(id);
        return new StandardResponse(user);
    }

    @Patch('users/:id/lock')
    @ApiOperation({ summary: 'Lock a user account for 24 hours' })
    @ApiParam({ name: 'id', description: 'User UUID' })
    async lockUser(@Param('id') id: string): Promise<StandardResponse<any>> {
        const user = await this.adminService.lockUser(id);
        return new StandardResponse(user);
    }

    @Patch('users/:id/unlock')
    @ApiOperation({ summary: 'Unlock a user account' })
    @ApiParam({ name: 'id', description: 'User UUID' })
    async unlockUser(@Param('id') id: string): Promise<StandardResponse<any>> {
        const user = await this.adminService.unlockUser(id);
        return new StandardResponse(user);
    }

    // ── Listings ──────────────────────────────────────────────────────────────

    @Get('listings')
    @ApiOperation({ summary: 'List all listings (including drafts/deleted)' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    async getAllListings(
        @Query('page') page = 1,
        @Query('limit') limit = 20,
        @Query('sellerRole') sellerRole?: string,
    ): Promise<PaginatedResponse<any>> {
        const { data, total } = await this.adminService.getAllListings(Number(page), Number(limit), sellerRole);
        return new PaginatedResponse(data, total, Number(page), Number(limit));
    }

    @Delete('listings/:id')
    @ApiOperation({ summary: 'Force delete a listing' })
    @ApiParam({ name: 'id', description: 'Listing UUID' })
    async deleteListing(@Param('id') id: string): Promise<StandardResponse<any>> {
        const listing = await this.adminService.deleteListing(id);
        return new StandardResponse(listing);
    }

    // ── Listing Review ───────────────────────────────────────────────────────

    @Get('listings/pending-review')
    @ApiOperation({ summary: 'Get all listings awaiting admin review (or previously rejected)' })
    async getPendingListingReviews(): Promise<StandardResponse<any>> {
        const list = await this.adminService.getPendingListingReviews();
        return new StandardResponse(list);
    }

    @Get('listings/:id')
    @ApiOperation({ summary: 'Get a single listing with full detail (any status), for the admin edit modal' })
    @ApiParam({ name: 'id', description: 'Listing UUID' })
    async getListingById(@Param('id') id: string): Promise<StandardResponse<any>> {
        const listing = await this.adminService.getListingById(id);
        return new StandardResponse(listing);
    }

    @Patch('listings/:id')
    @ApiOperation({ summary: "Edit a listing's own fields — any status except SOLD" })
    @ApiParam({ name: 'id', description: 'Listing UUID' })
    async updateListing(
        @Param('id') id: string,
        @Body() dto: AdminUpdateListingDto,
    ): Promise<StandardResponse<any>> {
        const listing = await this.adminService.updateListing(id, dto);
        return new StandardResponse(listing);
    }

    @Post('listings/:id/approve')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Approve a pending listing — it goes live immediately' })
    @ApiParam({ name: 'id', description: 'Listing UUID' })
    async approveListing(@Param('id') id: string): Promise<StandardResponse<any>> {
        const listing = await this.adminService.approveListing(id);
        return new StandardResponse(listing);
    }

    @Post('listings/:id/reject')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Reject a pending listing with a reason the seller must address' })
    @ApiParam({ name: 'id', description: 'Listing UUID' })
    async rejectListing(
        @Param('id') id: string,
        @Body() dto: RejectListingDto,
    ): Promise<StandardResponse<any>> {
        const listing = await this.adminService.rejectListing(id, dto);
        return new StandardResponse(listing);
    }

    // ── Auctions ──────────────────────────────────────────────────────────────

    @Get('auctions')
    @ApiOperation({ summary: 'List all auctions' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    async getAllAuctions(
        @Query('page') page = 1,
        @Query('limit') limit = 20,
    ): Promise<PaginatedResponse<any>> {
        const { data, total } = await this.adminService.getAllAuctions(Number(page), Number(limit));
        return new PaginatedResponse(data, total, Number(page), Number(limit));
    }

    @Get('dealers')
    @ApiOperation({ summary: 'List every dealer — for the auction "assign winner" dropdown' })
    async getAllDealers(): Promise<StandardResponse<any>> {
        const dealers = await this.adminService.getAllDealersForAssignment();
        return new StandardResponse(dealers);
    }

    @Post('auctions/:id/assign-winner')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Force-end a live auction, assigning a chosen dealer as winner' })
    @ApiParam({ name: 'id', description: 'Auction UUID' })
    async assignAuctionWinner(
        @Param('id') id: string,
        @Body('dealerId') dealerId: string,
    ): Promise<StandardResponse<any>> {
        await this.adminService.assignAuctionWinner(id, dealerId);
        return new StandardResponse({ success: true });
    }

    @Post('auctions/:id/refund-buyer-fee')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Cancel a failed auction sale and refund the full £125 buyer fee' })
    @ApiParam({ name: 'id', description: 'Auction UUID' })
    async refundAuctionBuyerFee(
        @Param('id') id: string,
        @Body('reason') reason?: string,
    ): Promise<StandardResponse<any>> {
        const result = await this.adminService.refundAuctionBuyerFee(id, reason);
        return new StandardResponse(result);
    }

    // ── Handovers ─────────────────────────────────────────────────────────────

    @Get('handovers/pending')
    @ApiOperation({ summary: 'Get auctions with pending handover proofs' })
    async getPendingHandovers(): Promise<StandardResponse<any>> {
        const data = await this.adminService.getPendingHandovers();
        return new StandardResponse(data);
    }

    @Post('handovers/:auctionId/approve')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Approve a handover proof and release seller bonus' })
    @ApiParam({ name: 'auctionId' })
    async approveHandover(@Param('auctionId') auctionId: string): Promise<StandardResponse<any>> {
        const result = await this.adminService.approveHandover(auctionId);
        return new StandardResponse(result);
    }

    @Post('handovers/:auctionId/deny')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Reject a handover proof and allow the seller to resubmit it' })
    @ApiParam({ name: 'auctionId' })
    async denyHandover(@Param('auctionId') auctionId: string): Promise<StandardResponse<any>> {
        const result = await this.adminService.denyHandover(auctionId);
        return new StandardResponse(result);
    }

    @Get('payouts/pending')
    @ApiOperation({ summary: 'Get approved handovers whose £100 seller bonus still hasn\'t been paid' })
    async getPendingPayouts(): Promise<StandardResponse<any>> {
        const data = await this.adminService.getPendingPayouts();
        return new StandardResponse(data);
    }

    @Post('payouts/:auctionId/retry')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Retry the Stripe transfer for an approved-but-unpaid handover' })
    @ApiParam({ name: 'auctionId' })
    async retryPayout(@Param('auctionId') auctionId: string): Promise<StandardResponse<any>> {
        const result = await this.adminService.retryPayout(auctionId);
        return new StandardResponse(result);
    }

    @Post('payouts/:auctionId/mark-paid')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Confirm the seller was paid manually (bank transfer outside Stripe)' })
    @ApiParam({ name: 'auctionId' })
    async markPayoutPaidManually(@Param('auctionId') auctionId: string): Promise<StandardResponse<any>> {
        const result = await this.adminService.markPayoutPaidManually(auctionId);
        return new StandardResponse(result);
    }

    // ── Transactions ──────────────────────────────────────────────────────────

    @Get('transactions')
    @ApiOperation({ summary: 'List all transactions' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    async getAllTransactions(
        @Query('page') page = 1,
        @Query('limit') limit = 20,
    ): Promise<PaginatedResponse<any>> {
        const { data, total } = await this.adminService.getAllTransactions(Number(page), Number(limit));
        return new PaginatedResponse(data, total, Number(page), Number(limit));
    }

    // ── Stats & Analytics ─────────────────────────────────────────────────────

    @Get('stats')
    @ApiOperation({ summary: 'Get platform stats' })
    async getPlatformStats(): Promise<StandardResponse<any>> {
        const stats = await this.adminService.getPlatformStats();
        return new StandardResponse(stats);
    }

    @Get('analytics')
    @ApiOperation({ summary: 'Get monthly analytics data (last 6 months)' })
    @ApiResponse({ status: 200, description: 'Monthly users, listings, and revenue data' })
    async getAnalytics(): Promise<StandardResponse<any>> {
        const data = await this.adminService.getAnalyticsData();
        return new StandardResponse(data);
    }

    // ── Dealer KYC Review ─────────────────────────────────────────────────────

    @Get('dealers/kyc-pending')
    @ApiOperation({ summary: 'Get list of all pending or rejected dealer KYC applications' })
    @ApiResponse({ status: 200, description: 'List of pending dealer KYC applications' })
    async getPendingKyc(): Promise<StandardResponse<any>> {
        const list = await this.adminService.getPendingKyc();
        return new StandardResponse(list);
    }

    @Get('dealers/kyc-archive')
    @ApiOperation({ summary: 'Every dealer KYC record regardless of status, with document URLs — approved ones drop out of kyc-pending permanently otherwise' })
    @ApiQuery({ name: 'page', required: false })
    @ApiQuery({ name: 'limit', required: false })
    async getAllDealersKycArchive(
        @Query('page') page = 1,
        @Query('limit') limit = 20,
    ): Promise<PaginatedResponse<any>> {
        const { data, total } = await this.adminService.getAllDealersKycArchive(Number(page), Number(limit));
        return new PaginatedResponse(data, total, Number(page), Number(limit));
    }

    @Patch('dealers/kyc/:id/review')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Submit field-by-field review decisions and notes for a dealer KYC application' })
    @ApiParam({ name: 'id', description: 'DealerKyc record UUID' })
    @ApiResponse({ status: 200, description: 'KYC review successfully processed' })
    async reviewKyc(
        @Param('id') id: string,
        @Body() dto: ReviewKycDto,
    ): Promise<StandardResponse<any>> {
        const kyc = await this.adminService.reviewKyc(id, dto);
        return new StandardResponse(kyc);
    }
}

