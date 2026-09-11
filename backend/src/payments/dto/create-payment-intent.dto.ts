import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, Min, IsOptional, IsString, Length, IsIn, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCheckoutSessionDto {
    @ApiProperty({ description: 'Listing ID associated with the auction buyer fee' })
    @IsString()
    listingId: string;

    @ApiProperty({
        description: 'Client display amount in GBP. The server derives the authoritative auction buyer fee and does not trust this value.',
        minimum: 1,
    })
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    amount: number;

    @ApiPropertyOptional({ description: 'Checkout payment type', default: 'COMMISSION', enum: ['COMMISSION'] })
    @IsOptional()
    @IsString()
    @IsIn(['COMMISSION'])
    type?: 'COMMISSION';

    @ApiPropertyOptional({ description: 'ISO 4217 currency code', default: 'gbp' })
    @IsOptional()
    @IsString()
    @Length(3, 3)
    currency?: string;
}

// Keep backward-compatible export name
export { CreateCheckoutSessionDto as CreatePaymentIntentDto };

/** DTO for native Payment Sheet flows used for CarMazium platform fees only. */
export class CreatePaymentSheetDto {
    @ApiProperty({ description: 'Listing ID' })
    @IsString()
    listingId: string;

    @ApiProperty({
        description: 'Client display amount in GBP. Authoritative platform fees are derived server-side.',
        minimum: 1,
    })
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    amount: number;

    @ApiPropertyOptional({
        description: 'Platform payment type',
        default: 'COMMISSION',
        enum: ['COMMISSION', 'LISTING_FEE', 'HPI_REPORT', 'HPI_REPORT_EMAIL'],
    })
    @IsOptional()
    @IsString()
    @IsIn(['COMMISSION', 'LISTING_FEE', 'HPI_REPORT', 'HPI_REPORT_EMAIL'])
    type?: 'COMMISSION' | 'LISTING_FEE' | 'HPI_REPORT' | 'HPI_REPORT_EMAIL';

    @ApiPropertyOptional({ description: 'ISO 4217 currency code', default: 'gbp' })
    @IsOptional()
    @IsString()
    @Length(3, 3)
    currency?: string;

    @ApiPropertyOptional({
        description: 'Listing badge tier — required when type is LISTING_FEE so the webhook knows which tier to activate the listing at',
    })
    @ValidateIf((o) => o.type === 'LISTING_FEE')
    @IsIn(['BASIC', 'STANDARD', 'PREMIUM'])
    badgeTier?: 'BASIC' | 'STANDARD' | 'PREMIUM';

    @ApiPropertyOptional({
        description: 'Vehicle registration mark — required when type is HPI_REPORT so the webhook knows which VRM to run the check against',
    })
    @ValidateIf((o) => o.type === 'HPI_REPORT')
    @IsString()
    vrm?: string;
}
