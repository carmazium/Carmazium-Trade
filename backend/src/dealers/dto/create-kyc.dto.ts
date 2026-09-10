import { IsString, IsOptional, IsNotEmpty, IsEnum } from 'class-validator';
import { BusinessType } from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateKycDto {
    @ApiPropertyOptional({
        enum: BusinessType,
        description: 'Defaults to PRIVATE_LIMITED so older clients that predate the toggle keep working',
    })
    @IsOptional()
    @IsEnum(BusinessType)
    businessType?: BusinessType;

    @ApiProperty({ description: 'Registered Company House name' })
    @IsString()
    @IsNotEmpty()
    companyHouseName: string;

    @ApiProperty({ description: 'Representative name' })
    @IsString()
    @IsNotEmpty()
    representativeName: string;

    @ApiProperty({ description: 'Representative position in the company' })
    @IsString()
    @IsNotEmpty()
    representativePosition: string;

    @ApiPropertyOptional({ description: 'VAT Number — limited companies only; sole traders have none' })
    @IsOptional()
    @IsString()
    vatNumber?: string;

    @ApiPropertyOptional({ description: 'URL to uploaded VAT certificate/proof image' })
    @IsOptional()
    @IsString()
    vatProof?: string;

    @ApiPropertyOptional({ description: 'Companies House number — limited companies only' })
    @IsOptional()
    @IsString()
    companyRegistrationNumber?: string;

    @ApiPropertyOptional({ description: 'URL to uploaded Company House registration certificate' })
    @IsOptional()
    @IsString()
    companyRegistrationProof?: string;

    @ApiPropertyOptional({ description: 'Person of Significant Control — a limited-company concept' })
    @IsOptional()
    @IsString()
    personOfSignificantControl?: string;

    @ApiProperty({ description: 'Director name' })
    @IsString()
    @IsNotEmpty()
    directorName: string;

    @ApiPropertyOptional({ description: 'URL to uploaded photo ID (driving licence or passport)' })
    @IsOptional()
    @IsString()
    directorIdProof?: string;

    @ApiPropertyOptional({ description: 'URL to uploaded proof of address — sole traders only' })
    @IsOptional()
    @IsString()
    proofOfAddress?: string;

    @ApiPropertyOptional({ description: 'Business Website — not every sole trader has one' })
    @IsOptional()
    @IsString()
    businessWebsite?: string;

    @ApiProperty({ description: 'Registered Business Address' })
    @IsString()
    @IsNotEmpty()
    businessRegisteredAddress: string;

    @ApiPropertyOptional({ description: 'Trading Address if different from registered address' })
    @IsOptional()
    @IsString()
    tradingAddress?: string;

    @ApiPropertyOptional({ description: 'Google Reviews link' })
    @IsOptional()
    @IsString()
    googleReviewsLink?: string;

    @ApiPropertyOptional({ description: 'Payment reference for £1 transfer confirmation (legacy — not required for Stripe-flow submissions)' })
    @IsOptional()
    @IsString()
    paymentReference?: string;

    @ApiPropertyOptional({ description: 'Supabase Storage URL of payment proof screenshot' })
    @IsOptional()
    @IsString()
    paymentScreenshot?: string;
}
