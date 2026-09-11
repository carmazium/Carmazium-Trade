import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ListingsService } from './listings.service';
import { ListingsController } from './listings.controller';
import { ListingPrivacyInterceptor } from './listing-privacy.interceptor';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { SellersModule } from '../sellers/sellers.module';
import { ScraperModule } from '../scraper/scraper.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, AuthModule, SellersModule, ConfigModule, ScraperModule, NotificationsModule],
  controllers: [ListingsController],
  providers: [
    ListingsService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ListingPrivacyInterceptor,
    },
  ],
  exports: [ListingsService],
})
export class ListingsModule { }
