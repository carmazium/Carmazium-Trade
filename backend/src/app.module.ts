import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ListingsModule } from './listings/listings.module';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { BidsModule } from './bids/bids.module';
import { WatchlistModule } from './watchlist/watchlist.module';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { ChatModule } from './chat/chat.module';
import { ScheduleModule } from '@nestjs/schedule';
import { TasksModule } from './tasks/tasks.module';
import { TransactionsModule } from './transactions/transactions.module';
import { AuctionsModule } from './auctions/auctions.module';
import { FinanceModule } from './finance/finance.module';
import { InsuranceModule } from './insurance/insurance.module';
import { AdminModule } from './admin/admin.module';
import { SellersModule } from './sellers/sellers.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PaymentsModule } from './payments/payments.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ThrottlerModule } from '@nestjs/throttler';
import { CsrfMiddleware } from './core/middleware/csrf.middleware';
import { HealthModule } from './health/health.module';
import { DvlaModule } from './dvla/dvla.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { FeaturedBoostModule } from './featured-boost/featured-boost.module';
import { OffersModule } from './offers/offers.module';
import { AiModule } from './ai/ai.module';
import { DealersModule } from './dealers/dealers.module';
import { EmailModule } from './email/email.module';
import { DamageAnalysisModule } from './damage/damage.module';
import { HpiModule } from './hpi/hpi.module';
import { DeliveryModule } from './delivery/delivery.module';
import { ServicesModule } from './services/services.module';
import { MarketingModule } from './marketing/marketing.module';
import { BlogModule } from './blog/blog.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    HealthModule,
    ScheduleModule.forRoot(),
    ListingsModule,
    SellersModule,
    AuctionsModule,
    FinanceModule,
    InsuranceModule,
    AdminModule,
    NotificationsModule,
    PaymentsModule,
    DashboardModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    BidsModule,
    WatchlistModule,
    ServiceRequestsModule,
    ChatModule,
    TasksModule,
    TransactionsModule,
    DvlaModule,
    AnalyticsModule,
    FeaturedBoostModule,
    OffersModule,
    AiModule,
    DealersModule,
    EmailModule,
    DamageAnalysisModule,
    HpiModule,
    DeliveryModule,
    ServicesModule,
    MarketingModule,
    BlogModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(CsrfMiddleware)
      .forRoutes('*');
  }
}




