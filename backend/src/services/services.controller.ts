import {
    Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards, Req, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiCookieAuth, ApiQuery } from '@nestjs/swagger';
import { ServiceType } from '@prisma/client';
import { SessionAuthGuard } from '../auth/guards/session-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StandardResponse } from '../listings/dto/response.dto';
import { ServicesService } from './services.service';
import { ContractorGuard } from './guards/contractor.guard';
import {
    CreateJobDto, JobFromPurchaseDto, CancelJobDto, UpsertQuoteDto, ApplyCapabilityDto,
} from './dto';

/**
 * Trade Exchange service marketplace.
 *
 * Route order matters: the static contractor routes (`jobs/feed`,
 * `jobs/assigned`, `jobs/my`) are declared before `jobs/:id` so Nest does not
 * read "feed" as an id.
 */
@ApiTags('Trade Exchange services')
@ApiCookieAuth()
@Controller('services')
@UseGuards(SessionAuthGuard)
export class ServicesController {
    constructor(private readonly services: ServicesService) { }

    // ── Contractor onboarding ──────────────────────────────────────────────

    @Post('capabilities')
    @ApiOperation({ summary: 'Apply to provide a service area (creates the contractor profile on first use)' })
    async apply(@CurrentUser() user: any, @Body() dto: ApplyCapabilityDto) {
        return new StandardResponse(await this.services.applyCapability(user.id, dto));
    }

    @Get('capabilities/my')
    @ApiOperation({ summary: 'My provider profile, applications and Stripe Connect state' })
    async myCapabilities(@CurrentUser() user: any) {
        return new StandardResponse(await this.services.myCapabilities(user.id));
    }

    // ── Customer ───────────────────────────────────────────────────────────

    @Post('jobs')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Post a job — any signed-in account' })
    async create(@CurrentUser() user: any, @Body() dto: CreateJobDto) {
        return new StandardResponse(await this.services.createJob(user.id, dto));
    }

    @Post('jobs/from-purchase')
    @HttpCode(HttpStatus.CREATED)
    @ApiOperation({ summary: 'Post a delivery job pre-filled from a won auction or accepted offer' })
    async fromPurchase(@CurrentUser() user: any, @Body() dto: JobFromPurchaseDto) {
        return new StandardResponse(await this.services.createJobFromPurchase(user.id, dto));
    }

    @Get('jobs/my')
    @ApiOperation({ summary: 'Jobs the caller posted' })
    async myJobs(@CurrentUser() user: any) {
        return new StandardResponse(await this.services.myJobs(user.id));
    }

    // ── Contractor ─────────────────────────────────────────────────────────

    @Get('jobs/feed')
    @UseGuards(ContractorGuard)
    @ApiQuery({ name: 'serviceType', enum: Object.values(ServiceType), required: false })
    @ApiOperation({ summary: 'Open jobs in approved service areas (customer identity redacted)' })
    // Typed as string, not ServiceType, on purpose. Prisma enums are const
    // objects, so a parameter annotated with one makes TS emit the object as
    // design-time metadata and Swagger walks its keys as a schema -- which
    // took production down on 2026-09-11. The service validates the value.
    async feed(@Req() req: any, @Query('serviceType') serviceType?: string) {
        return new StandardResponse(await this.services.feed(req.contractorProfileId, req.approvedServiceTypes, serviceType as ServiceType | undefined));
    }

    @Get('jobs/assigned')
    @UseGuards(ContractorGuard)
    @ApiOperation({ summary: 'Jobs where the caller quote was accepted' })
    async assigned(@Req() req: any) {
        return new StandardResponse(await this.services.assigned(req.contractorProfileId));
    }

    @Put('jobs/:id/quote')
    @UseGuards(ContractorGuard)
    @ApiOperation({ summary: 'Create or update a quote on a job' })
    async quote(@Req() req: any, @CurrentUser() user: any, @Param('id') id: string, @Body() dto: UpsertQuoteDto) {
        return new StandardResponse(
            await this.services.upsertQuote(req.contractorProfileId, req.approvedServiceTypes, user.id, id, dto),
        );
    }

    @Delete('jobs/:id/quote')
    @UseGuards(ContractorGuard)
    @ApiOperation({ summary: 'Withdraw a quote' })
    async withdraw(@Req() req: any, @Param('id') id: string) {
        return new StandardResponse(await this.services.withdrawQuote(req.contractorProfileId, id));
    }

    @Post('jobs/:id/start')
    @UseGuards(ContractorGuard)
    @ApiOperation({ summary: 'Mark a paid job as started' })
    async start(@Req() req: any, @Param('id') id: string) {
        return new StandardResponse(await this.services.startJob(req.contractorProfileId, id));
    }

    @Post('jobs/:id/complete')
    @UseGuards(ContractorGuard)
    @ApiOperation({ summary: 'Mark a job complete — the customer then confirms (or 48h auto)' })
    async complete(@Req() req: any, @Param('id') id: string) {
        return new StandardResponse(await this.services.completeJob(req.contractorProfileId, id));
    }

    // ── Shared / customer actions on a job ─────────────────────────────────

    @Get('jobs/:id')
    @ApiOperation({ summary: 'A job, shaped for whoever is asking' })
    async getOne(@CurrentUser() user: any, @Param('id') id: string) {
        // Looked up fresh rather than read off the session user: the session
        // caches the user object, and a contractor who applied after signing
        // in would otherwise be treated as having no profile until they
        // signed out and back in.
        const contractorProfileId = user.role === 'CONTRACTOR'
            ? (await this.services.contractorProfileIdFor(user.id))
            : null;
        return new StandardResponse(
            await this.services.getJob({ userId: user.id, role: user.role, contractorProfileId }, id),
        );
    }

    @Post('jobs/:id/cancel')
    @ApiOperation({ summary: 'Cancel an OPEN job' })
    async cancel(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CancelJobDto) {
        return new StandardResponse(await this.services.cancelJob(user.id, id, dto));
    }

    @Post('jobs/:id/quotes/:quoteId/accept')
    @ApiOperation({ summary: 'Accept a quote → Stripe Checkout URL' })
    async accept(@CurrentUser() user: any, @Param('id') id: string, @Param('quoteId') quoteId: string) {
        return new StandardResponse(await this.services.acceptQuote(user.id, id, quoteId));
    }

    @Post('jobs/:id/confirm')
    @ApiOperation({ summary: 'Confirm completion → releases the provider payout' })
    async confirm(@CurrentUser() user: any, @Param('id') id: string) {
        return new StandardResponse(await this.services.confirmCompletion(user.id, id));
    }

    @Post('jobs/:id/dispute')
    @ApiOperation({ summary: 'Freeze a paid job for admin review' })
    async dispute(@CurrentUser() user: any, @Param('id') id: string, @Body() dto: CancelJobDto) {
        return new StandardResponse(await this.services.openDispute(user.id, id, dto.reason));
    }
}
