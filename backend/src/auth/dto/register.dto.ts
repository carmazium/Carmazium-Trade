import { IsEmail, IsString, MinLength, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SELF_SERVICE_ROLES } from '../self-service-role';


export class RegisterDto {
    @ApiProperty({ example: 'john@example.com', description: 'User email address' })
    @IsEmail()
    email: string;

    @ApiProperty({ example: 'SecurePass123', description: 'Password (min 8 characters)' })
    @IsString()
    @MinLength(8)
    password: string;

    @ApiPropertyOptional({ example: 'John' })
    @IsOptional()
    @IsString()
    firstName?: string;

    @ApiPropertyOptional({ example: 'Doe' })
    @IsOptional()
    @IsString()
    lastName?: string;

    @ApiPropertyOptional({ example: '+44 7911 123456' })
    @IsOptional()
    @IsString()
    phone?: string;

    @ApiPropertyOptional({ enum: SELF_SERVICE_ROLES, default: UserRole.BUYER })
    @IsOptional()
    @IsIn([...SELF_SERVICE_ROLES])
    role?: UserRole;
}
