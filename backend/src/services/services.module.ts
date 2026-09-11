import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { EmailModule } from '../email/email.module';
import { PaymentsModule } from '../payments/payments.module';
import { ServicesService } from './services.service';
import { ServicesController } from './services.controller';
import { AdminServicesController } from './admin-services.controller';
import { ServicesLifecycleService } from './services-lifecycle.service';
import { ContractorGuard } from './guards/contractor.guard';

/**
 * Trade Exchange service marketplace. Depends on PaymentsModule for the Stripe
 * client and the Connect transfer; PaymentsModule reaches back for markPaid via
 * ModuleRef so the import graph stays one-directional.
 */
@Module({
    imports: [PrismaModule, ConfigModule, AuthModule, NotificationsModule, EmailModule, PaymentsModule],
    controllers: [ServicesController, AdminServicesController],
    providers: [ServicesService, ServicesLifecycleService, ContractorGuard],
    exports: [ServicesService],
})
export class ServicesModule { }
