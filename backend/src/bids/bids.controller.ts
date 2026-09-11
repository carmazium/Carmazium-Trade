import {
    Controller,
    Get,
    Post,
    Patch,
    Body,
    Param,
    Query,
    UseGuards,
    HttpCode,
    HttpStatus,
} from '@nestjs/common';
import {
    ApiTags,
    ApiOperation,
    ApiResponse,
    ApiCookieAuth,
    ApiQuery,
    ApiBearerAuth,
} from '@nestjs/swagger';
import { BidsService } from './bids.service';
import { CreateBidDto } from './dto/create-bid.dto';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { VerifiedDealerGuard } from '../auth/guards/verified-dealer.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StandardResponse, PaginatedResponse } from '../listings/dto/response.dto';

@ApiTags('Bids')
@Controller('bids')
export class BidsController {
    constructor(private readonly bidsService: BidsService) { }

    @Post()
    @UseGuards(SessionAuthGuard, VerifiedDealerGuard)
    @ApiCookieAuth()
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Place a bid on an auction listing (verified dealers only)' })
    @ApiResponse({ status: 201, description: 'Bid placed successfully' })
    @ApiResponse({ status: 400, description: 'Invalid bid or listing not an auction' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    async create(
        @CurrentUser() user: any,
        @Body() createBidDto: CreateBidDto,
    ) {
        const bid = await this.bidsService.create(user.id, createBidDto);
        return new StandardResponse(bid);
    }

    @Get('my')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Get my bids' })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    async findMyBids(
        @CurrentUser() user: any,
        @Query('page') page?: string,
        @Query('limit') limit?: string,
    ) {
        const pageNum = parseInt(page || '1');
        const limitNum = parseInt(limit || '20');
        const { data, total } = await this.bidsService.findMyBids(user.id, pageNum, limitNum);
        return new PaginatedResponse(data, total, pageNum, limitNum);
    }

    @Get('stats')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Get buyer dashboard statistics' })
    async getBuyerStats(@CurrentUser() user: any) {
        const stats = await this.bidsService.getBuyerStats(user.id);
        return new StandardResponse(stats);
    }

    /**
     * Bid history is trade-sensitive information. A retail visitor must never
     * be able to learn dealer cost prices or bidder identities by calling this
     * endpoint directly. VerifiedDealerGuard also lets ADMIN through.
     */
    @Get('listing/:listingId')
    @UseGuards(SessionAuthGuard, VerifiedDealerGuard)
    @ApiCookieAuth()
    @ApiOperation({ summary: 'Get all bids for a listing (verified dealers/admin only)' })
    async findByListing(@Param('listingId') listingId: string) {
        const bids = await this.bidsService.findByListing(listingId);
        return new StandardResponse(bids);
    }

    @Patch(':id/cancel')
    @UseGuards(SessionAuthGuard)
    @ApiCookieAuth()
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Cancel a bid within the 24-hour cancellation window' })
    @ApiResponse({ status: 200, description: 'Bid cancelled successfully' })
    @ApiResponse({ status: 400, description: 'Cancel window expired, bid already cancelled, or auction not active' })
    @ApiResponse({ status: 401, description: 'Unauthorized' })
    @ApiResponse({ status: 403, description: 'Not your bid' })
    async cancelBid(@Param('id') id: string, @CurrentUser() user: any) {
        await this.bidsService.cancelBid(id, user.id);
        return new StandardResponse({ message: 'Bid cancelled successfully' });
    }
}
