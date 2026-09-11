import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';
import { AuctionRefundsController } from './auction-refunds.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentsModule } from '../payments/payments.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SellersModule } from '../sellers/sellers.module';
import { AuctionsModule } from '../auctions/auctions.module';

@Module({
    imports: [PrismaModule, AuthModule, ConfigModule, PaymentsModule, EmailModule, NotificationsModule, SellersModule, AuctionsModule],
    controllers: [AdminController, AuctionRefundsController],
    providers: [AdminService],
    exports: [AdminService],
})
export class AdminModule { }
