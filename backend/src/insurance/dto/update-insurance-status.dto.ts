import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { InsuranceQuoteStatus } from '@prisma/client';

const PartnerInsuranceStatusEnum = {
    QUOTED: 'QUOTED',
    EXPIRED: 'EXPIRED',
    REJECTED: 'REJECTED',
} as const;

export class UpdateInsuranceStatusDto {
    @ApiProperty({
        description: 'Partner-controlled quote status. Customers accept quotes through the dedicated accept endpoint.',
        enum: Object.values(PartnerInsuranceStatusEnum),
        example: PartnerInsuranceStatusEnum.QUOTED,
    })
    @IsNotEmpty()
    @IsEnum(PartnerInsuranceStatusEnum)
    status: InsuranceQuoteStatus;

    @ApiProperty({ description: 'Quoted annual premium in GBP. Required when status is QUOTED.', required: false, example: 649.99 })
    @IsOptional()
    @Type(() => Number)
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    quotedPrice?: number;

    @ApiProperty({ description: 'Cover type/summary. Required when status is QUOTED.', required: false, example: 'Comprehensive' })
    @IsOptional()
    @IsString()
    @MaxLength(120)
    coverageType?: string;

    @ApiProperty({ description: 'Optional quote expiry timestamp', required: false })
    @IsOptional()
    @IsDateString()
    expiryDate?: string;
}
