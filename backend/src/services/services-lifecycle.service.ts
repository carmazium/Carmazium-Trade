import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ServicesService } from './services.service';

/**
 * Time-driven transitions for service jobs. Same shape as DeliveryExpiryService.
 *
 * Hourly rather than daily: the 48-hour auto-confirm is a promise to
 * contractors about when they get paid, and "sometime tomorrow at 3am" does
 * not honour a 48-hour promise.
 */
@Injectable()
export class ServicesLifecycleService {
    private readonly logger = new Logger(ServicesLifecycleService.name);

    constructor(private readonly services: ServicesService) { }

    @Cron('7 * * * *')
    async tick(): Promise<void> {
        try {
            const expired = await this.services.expireOpenJobs();
            const released = await this.services.autoConfirmCompleted();
            if (expired || released) {
                this.logger.log(`Service jobs: expired ${expired}, auto-confirmed ${released}`);
            }
        } catch (e: any) {
            this.logger.error(`Lifecycle tick failed: ${e?.message}`);
        }
    }
}
