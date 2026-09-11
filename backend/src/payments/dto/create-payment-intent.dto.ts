import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, Length, Min, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCheckoutSessionDto {
    @ApiProperty({ description: 'Auction listing ID' })
    @IsString()
    listingId: string;

    @ApiProperty({ description: 'Client display amount. The server always derives the £125 auction buyer fee.', minimum: 1 })
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    amount: number;

    @ApiPropertyOptional({ description: 'This checkout endpoint is only for the auction buyer fee', default: 'COMMISSION' })
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

export { CreateCheckoutSessionDto as CreatePaymentIntentDto };

/** DTO for the native Payment Sheet flow. Vehicle sale funds never pass through CarMazium. */
export class CreatePaymentSheetDto {
    @ApiProperty({ description: 'Listing ID' })
    @IsString()
    listingId: string;

    @ApiProperty({ description: 'Client display amount in GBP. The backend derives authoritative platform/service amounts.', minimum: 1 })
    @IsNumber()
    @Min(1)
    @Type(() => Number)
    amount: number;

    @ApiPropertyOptional({ description: 'Allowed platform payment type', default: 'COMMISSION' })
    @IsOptional()
    @IsString()
    @IsIn(['COMMISSION', 'LISTING_FEE', 'HPI_REPORT'])
    type?: 'COMMISSION' | 'LISTING_FEE' | 'HPI_REPORT';

    @ApiPropertyOptional({ description: 'ISO 4217 currency code', default: 'gbp' })
    @IsOptional()
    @IsString()
    @Length(3, 3)
    currency?: string;

    @ApiPropertyOptional({
        description: 'Listing badge tier — required when type is LISTING_FEE',
    })
    @ValidateIf((o) => o.type === 'LISTING_FEE')
    @IsIn(['BASIC', 'STANDARD', 'PREMIUM'])
    badgeTier?: 'BASIC' | 'STANDARD' | 'PREMIUM';

    @ApiPropertyOptional({
        description: 'Vehicle registration mark — required when type is HPI_REPORT',
    })
    @ValidateIf((o) => o.type === 'HPI_REPORT')
    @IsString()
    vrm?: string;
}
