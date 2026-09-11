import { Module } from '@nestjs/common';
import { ImageCleanupService } from './image-cleanup.service';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigModule } from '@nestjs/config';
import { FeaturedBoostModule } from '../featured-boost/featured-boost.module';
import { FeaturedBoostExpiryService } from './featured-boost-expiry.service';
import { AuctionLifecycleService } from './auction-lifecycle.service';
import { AuctionsModule } from '../auctions/auctions.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { DeliveryExpiryService } from '../delivery/delivery-expiry.service';
import { EmailModule } from '../email/email.module';
import { DbBackupService } from './db-backup.service';
import { WatchlistReminderService } from './watchlist-reminder.service';
import { UnpaidAuctionFeeExpiryService } from './unpaid-auction-fee-expiry.service';
import { HpiPendingReminderService } from './hpi-pending-reminder.service';
import { TradeXchangePayoutService } from './tradexchange-payout.service';

@Module({
    imports: [
        PrismaModule,
        ConfigModule,
        FeaturedBoostModule,
        AuctionsModule,
        NotificationsModule,
        DeliveryModule,
        EmailModule,
    ],
    providers: [
        ImageCleanupService,
        FeaturedBoostExpiryService,
        AuctionLifecycleService,
        DeliveryExpiryService,
        DbBackupService,
        WatchlistReminderService,
        UnpaidAuctionFeeExpiryService,
        HpiPendingReminderService,
        TradeXchangePayoutService,
    ],
})
export class TasksModule { }
