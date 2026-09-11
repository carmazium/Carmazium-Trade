import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

interface ReadyTradeTransfer {
    id: string;
    job_id: string;
    provider_amount_pence: number;
    destination: string;
}

@Injectable()
export class TradeXchangePayoutService {
    private readonly logger = new Logger(TradeXchangePayoutService.name);
    private running = false;

    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
    ) {}

    /**
     * Customer confirmation only marks a service transaction as `ready`.
     * This worker is the sole automatic path that releases the provider share.
     * It claims each row before calling Stripe and uses a stable idempotency key,
     * so overlapping cron ticks/restarts cannot create duplicate transfers.
     */
    @Cron('* * * * *')
    async processReadyTransfers(): Promise<void> {
        if (this.running) return;

        const secretKey = this.config.get<string>('STRIPE_SECRET_KEY') ?? '';
        if (!secretKey) return;
        if (secretKey.startsWith('sk_test_')) {
            // Never auto-transfer service money while the server is deliberately
            // using Stripe test mode. Rows remain `ready` for a live-mode run.
            return;
        }

        this.running = true;
        try {
            const candidates = await this.prisma.$queryRaw<ReadyTradeTransfer[]>`
                SELECT
                    t.id,
                    t.job_id,
                    t.provider_amount_pence,
                    COALESCE(t.provider_stripe_account_id, a.stripe_connect_account_id) AS destination
                FROM public.tradexchange_transactions t
                LEFT JOIN public.tradexchange_provider_accounts a
                  ON a.dealer_profile_id = t.provider_dealer_profile_id
                WHERE t.payment_status = 'paid'
                  AND t.completion_status = 'completed'
                  AND t.transfer_status IN ('ready', 'failed')
                  AND t.provider_amount_pence > 0
                  AND COALESCE(t.provider_stripe_account_id, a.stripe_connect_account_id) IS NOT NULL
                  AND COALESCE(a.stripe_connect_payouts_enabled, false) = true
                  AND COALESCE(a.stripe_details_submitted, false) = true
                ORDER BY t.completed_at ASC NULLS LAST, t.created_at ASC
                LIMIT 20
            `;

            if (!candidates.length) return;

            const Stripe = (await import('stripe')).default;
            const stripe = new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });

            for (const candidate of candidates) {
                const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>`
                    UPDATE public.tradexchange_transactions
                       SET transfer_status = 'processing', updated_at = now()
                     WHERE id = ${candidate.id}::uuid
                       AND payment_status = 'paid'
                       AND completion_status = 'completed'
                       AND transfer_status IN ('ready', 'failed')
                    RETURNING id
                `;
                if (!claimed.length) continue;

                try {
                    const transfer = await stripe.transfers.create(
                        {
                            amount: candidate.provider_amount_pence,
                            currency: 'gbp',
                            destination: candidate.destination,
                            metadata: {
                                type: 'TRADEXCHANGE_PROVIDER_PAYOUT',
                                transactionId: candidate.id,
                                jobId: candidate.job_id,
                            },
                        },
                        { idempotencyKey: `tradexchange-transfer:${candidate.id}` },
                    );

                    await this.prisma.$executeRaw`
                        UPDATE public.tradexchange_transactions
                           SET provider_transfer_id = ${transfer.id},
                               provider_stripe_account_id = ${candidate.destination},
                               transfer_status = 'transferred',
                               transferred_at = now(),
                               updated_at = now()
                         WHERE id = ${candidate.id}::uuid
                           AND transfer_status = 'processing'
                    `;
                } catch (error) {
                    await this.prisma.$executeRaw`
                        UPDATE public.tradexchange_transactions
                           SET transfer_status = 'failed', updated_at = now()
                         WHERE id = ${candidate.id}::uuid
                           AND transfer_status = 'processing'
                    `;
                    this.logger.error(
                        `TradeXchange provider transfer failed for transaction ${candidate.id}: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }
        } finally {
            this.running = false;
        }
    }
}
