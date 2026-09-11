import {
    Body,
    Controller,
    ForbiddenException,
    Get,
    HttpCode,
    HttpStatus,
    Param,
    Patch,
    Post,
    Query,
    UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InsuranceQuote } from '@prisma/client';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaginatedResponse, StandardResponse } from '../listings/dto/response.dto';
import { CreateInsuranceQuoteDto } from './dto/create-insurance-quote.dto';
import { UpdateInsuranceStatusDto } from './dto/update-insurance-status.dto';
import { InsuranceService } from './insurance.service';

@ApiTags('Insurance')
@Controller('insurance')
@ApiCookieAuth()
@UseGuards(SessionAuthGuard)
export class InsuranceController {
    constructor(private readonly insuranceService: InsuranceService) { }

    @Get('providers')
    @ApiOperation({ summary: 'List active insurance providers available for quote requests' })
    async listProviders(): Promise<StandardResponse<Array<{ id: string; companyName: string }>>> {
        return new StandardResponse(await this.insuranceService.listProviders());
    }

    @Post('quote')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Request insurance quote' })
    @ApiResponse({ status: 201, description: 'Quote requested' })
    async create(
        @Body() dto: CreateInsuranceQuoteDto,
        @CurrentUser() user: any,
    ): Promise<StandardResponse<InsuranceQuote>> {
        const quote = await this.insuranceService.create(user.id, dto);
        return new StandardResponse(quote);
    }

    @Get('my')
    @ApiOperation({ summary: 'Get my insurance quotes' })
    async findMyQuotes(
        @CurrentUser() user: any,
        @Query('page') page = 1,
        @Query('limit') limit = 20,
    ): Promise<PaginatedResponse<any>> {
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const { data, total } = await this.insuranceService.findMyQuotes(user.id, pageNumber, limitNumber);
        return new PaginatedResponse(data, total, pageNumber, limitNumber);
    }

    @Post(':id/accept')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Accept one of my quoted insurance requests' })
    @ApiParam({ name: 'id', description: 'Insurance quote UUID' })
    async acceptQuote(
        @Param('id') id: string,
        @CurrentUser() user: any,
    ): Promise<StandardResponse<InsuranceQuote>> {
        const quote = await this.insuranceService.acceptQuote(id, user.id);
        return new StandardResponse(quote);
    }

    @Get('partner')
    @ApiOperation({ summary: 'Get partner quotes (insurance partner only)' })
    async findPartnerQuotes(
        @CurrentUser() user: any,
        @Query('page') page = 1,
        @Query('limit') limit = 20,
    ): Promise<PaginatedResponse<any>> {
        const pageNumber = Number(page);
        const limitNumber = Number(limit);
        const partnerId = await this.insuranceService.getPartnerProfileId(user.id);
        if (!partnerId) return new PaginatedResponse([], 0, pageNumber, limitNumber);

        const { data, total } = await this.insuranceService.findByPartner(partnerId, pageNumber, limitNumber);
        return new PaginatedResponse(data, total, pageNumber, limitNumber);
    }

    @Patch(':id/status')
    @ApiOperation({ summary: 'Update quote status (insurance partner only)' })
    @ApiParam({ name: 'id', description: 'Quote UUID' })
    async updateStatus(
        @Param('id') id: string,
        @Body() dto: UpdateInsuranceStatusDto,
        @CurrentUser() user: any,
    ): Promise<StandardResponse<InsuranceQuote>> {
        const partnerId = await this.insuranceService.getPartnerProfileId(user.id);
        if (!partnerId) throw new ForbiddenException('User is not an insurance partner');

        const quote = await this.insuranceService.updateStatus(id, partnerId, dto);
        return new StandardResponse(quote);
    }
}
