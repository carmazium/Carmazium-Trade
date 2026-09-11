import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InsuranceQuoteStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInsuranceQuoteDto } from './dto/create-insurance-quote.dto';
import { UpdateInsuranceStatusDto } from './dto/update-insurance-status.dto';

@Injectable()
export class InsuranceService {
    constructor(private readonly prisma: PrismaService) { }

    async listProviders() {
        return this.prisma.partnerProfile.findMany({
            where: {
                partnerType: 'INSURANCE_PARTNER',
                isActive: true,
                deletedAt: null,
                insuranceUserId: { not: null },
            },
            select: { id: true, companyName: true },
            orderBy: { companyName: 'asc' },
        });
    }

    async create(userId: string, dto: CreateInsuranceQuoteDto) {
        const [listing, partner] = await Promise.all([
            this.prisma.listing.findUnique({
                where: { id: dto.listingId },
                select: { id: true, status: true, deletedAt: true },
            }),
            this.prisma.partnerProfile.findUnique({
                where: { id: dto.partnerId },
                select: { id: true, partnerType: true, isActive: true, deletedAt: true },
            }),
        ]);

        if (!listing || listing.deletedAt || listing.status !== 'ACTIVE') {
            throw new BadRequestException('Insurance quotes can only be requested for an active vehicle listing');
        }
        if (!partner || partner.deletedAt || !partner.isActive || partner.partnerType !== 'INSURANCE_PARTNER') {
            throw new BadRequestException('The selected insurance provider is not available');
        }

        const existing = await this.prisma.insuranceQuote.findFirst({
            where: {
                userId,
                listingId: dto.listingId,
                partnerId: dto.partnerId,
                deletedAt: null,
                status: { in: ['PENDING', 'QUOTED', 'ACCEPTED'] },
            },
            select: { id: true, status: true },
        });
        if (existing) {
            throw new BadRequestException(`You already have an active insurance request with this provider (${existing.status.toLowerCase()})`);
        }

        return this.prisma.insuranceQuote.create({
            data: {
                userId,
                listingId: dto.listingId,
                partnerId: dto.partnerId,
                driverAge: dto.driverAge,
                ncbYears: dto.ncbYears,
                hasConvictions: dto.hasConvictions,
            },
        });
    }

    async findMyQuotes(userId: string, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.prisma.insuranceQuote.findMany({
                where: { userId, deletedAt: null },
                select: {
                    id: true,
                    listingId: true,
                    userId: true,
                    partnerId: true,
                    coverageType: true,
                    quotedPrice: true,
                    status: true,
                    driverAge: true,
                    ncbYears: true,
                    hasConvictions: true,
                    expiryDate: true,
                    createdAt: true,
                    updatedAt: true,
                    partner: { select: { id: true, companyName: true } },
                    listing: { select: { id: true, title: true, make: true, model: true, year: true, price: true, slug: true, images: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.insuranceQuote.count({ where: { userId, deletedAt: null } }),
        ]);
        return { data, total };
    }

    async findByPartner(partnerId: string, page = 1, limit = 20) {
        const skip = (page - 1) * limit;
        const [data, total] = await Promise.all([
            this.prisma.insuranceQuote.findMany({
                where: { partnerId, deletedAt: null },
                include: {
                    user: { select: { id: true, firstName: true, lastName: true, email: true } },
                    listing: { select: { id: true, title: true, price: true, slug: true, images: true, make: true, model: true, year: true } },
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            this.prisma.insuranceQuote.count({ where: { partnerId, deletedAt: null } }),
        ]);
        return { data, total };
    }

    async updateStatus(quoteId: string, partnerProfileId: string, dto: UpdateInsuranceStatusDto) {
        const quote = await this.prisma.insuranceQuote.findUnique({ where: { id: quoteId } });
        if (!quote || quote.deletedAt) throw new NotFoundException('Quote not found');
        if (quote.partnerId !== partnerProfileId) throw new ForbiddenException('You do not have permission to update this quote');

        if (['ACCEPTED', 'EXPIRED', 'REJECTED'].includes(quote.status)) {
            throw new BadRequestException('This insurance quote is final and can no longer be changed');
        }
        if (dto.status === ('ACCEPTED' as InsuranceQuoteStatus) || dto.status === ('PENDING' as InsuranceQuoteStatus)) {
            throw new BadRequestException('Insurance partners cannot set this status directly');
        }

        const updateData: {
            status: InsuranceQuoteStatus;
            quotedPrice?: number;
            coverageType?: string;
            expiryDate?: Date;
        } = { status: dto.status };

        if (dto.status === 'QUOTED') {
            const coverageType = dto.coverageType?.trim();
            if (!dto.quotedPrice || !coverageType) {
                throw new BadRequestException('A positive quoted price and cover type are required when sending a quote');
            }
            updateData.quotedPrice = dto.quotedPrice;
            updateData.coverageType = coverageType;
            updateData.expiryDate = dto.expiryDate
                ? new Date(dto.expiryDate)
                : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }

        return this.prisma.insuranceQuote.update({ where: { id: quoteId }, data: updateData });
    }

    async acceptQuote(quoteId: string, userId: string) {
        const quote = await this.prisma.insuranceQuote.findUnique({ where: { id: quoteId } });
        if (!quote || quote.deletedAt) throw new NotFoundException('Quote not found');
        if (quote.userId !== userId) throw new ForbiddenException('You do not have permission to accept this quote');
        if (quote.status !== 'QUOTED') throw new BadRequestException('Only a quoted insurance request can be accepted');
        if (!quote.quotedPrice || !quote.coverageType) throw new BadRequestException('This quote is incomplete');
        if (quote.expiryDate && quote.expiryDate.getTime() <= Date.now()) {
            await this.prisma.insuranceQuote.update({ where: { id: quoteId }, data: { status: 'EXPIRED' } });
            throw new BadRequestException('This insurance quote has expired');
        }

        return this.prisma.insuranceQuote.update({
            where: { id: quoteId },
            data: { status: 'ACCEPTED' },
        });
    }

    async getPartnerProfileId(userId: string): Promise<string | null> {
        const profile = await this.prisma.partnerProfile.findFirst({
            where: {
                insuranceUserId: userId,
                partnerType: 'INSURANCE_PARTNER',
                isActive: true,
                deletedAt: null,
            },
            select: { id: true },
        });
        return profile?.id || null;
    }
}
