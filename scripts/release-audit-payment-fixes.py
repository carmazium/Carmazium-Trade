#!/usr/bin/env python3
from pathlib import Path
import re
import sys

path = Path('backend/src/payments/payments.service.ts')
text = path.read_text(encoding='utf-8')


def sub_once(pattern: str, replacement: str, label: str, flags=0):
    global text
    new_text, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    text = new_text


# Remove the obsolete vehicle-deposit notification implementation entirely.
sub_once(
    r"\n    /\*\*\n     \* Notify a seller that a buyer has paid the £500 refundable deposit on.*?\n    }\n\n    // Prices in GBP",
    "\n\n    // Prices in GBP",
    'remove legacy deposit notifier',
    re.S,
)
sub_once(
    r"\n    // £500 refundable deposit.*?\n    private readonly DEPOSIT_AMOUNT = 500;",
    "",
    'remove legacy deposit amount',
    re.S,
)

# Add service-level winner validation, auction-fee settlement and legacy refund helpers.
sub_once(
    r"    private readonly AUCTION_BUYER_FEE = 125;\n\n    async createCheckoutSession\(",
    """    private readonly AUCTION_BUYER_FEE = 125;\n\n    private async assertAuctionWinnerForPayment(listingId: string, userId: string) {\n        const auction = await this.prisma.auction.findFirst({\n            where: { listingId, deletedAt: null },\n            orderBy: { createdAt: 'desc' },\n            select: { id: true, status: true, winnerId: true, buyerFeePaid: true, buyerFeeTransactionId: true },\n        });\n        if (!auction || auction.status !== 'ENDED' || auction.winnerId !== userId) {\n            throw new BadRequestException('Only the recorded winner of an ended auction can pay this buyer fee');\n        }\n        if (auction.buyerFeePaid) {\n            throw new BadRequestException('The auction buyer fee has already been paid');\n        }\n        return auction;\n    }\n\n    private async markAuctionBuyerFeePaid(\n        transactionId: string,\n        listingId: string,\n        userId: string,\n        stripePaymentId: string,\n    ) {\n        const transaction = await this.prisma.transaction.findUnique({\n            where: { id: transactionId },\n            select: { id: true, type: true, userId: true, listingId: true, status: true },\n        });\n        if (!transaction || transaction.type !== ('COMMISSION' as any) || transaction.userId !== userId || transaction.listingId !== listingId) {\n            throw new BadRequestException('Auction fee transaction does not match the winner, listing, and payment type');\n        }\n\n        const auction = await this.prisma.auction.findFirst({\n            where: { listingId, deletedAt: null },\n            orderBy: { createdAt: 'desc' },\n            select: { id: true, status: true, winnerId: true, buyerFeePaid: true, buyerFeeTransactionId: true },\n        });\n        if (!auction || auction.status !== 'ENDED' || auction.winnerId !== userId) {\n            throw new BadRequestException('Auction winner/state changed before the buyer fee was settled');\n        }\n        if (auction.buyerFeePaid) {\n            if (auction.buyerFeeTransactionId === transactionId) return true;\n            throw new BadRequestException('A different transaction has already settled this auction buyer fee');\n        }\n\n        await this.prisma.$transaction([\n            this.prisma.transaction.update({\n                where: { id: transactionId },\n                data: { status: 'COMPLETED', stripePaymentId },\n            }),\n            this.prisma.auction.update({\n                where: { id: auction.id },\n                data: { buyerFeePaid: true, buyerFeeTransactionId: transactionId },\n            }),\n        ]);\n        return true;\n    }\n\n    private async refundLegacyVehiclePayment(\n        stripe: any,\n        paymentIntentRef: any,\n        transactionId?: string,\n        source: string = 'legacy_vehicle_payment',\n    ) {\n        const paymentIntentId = typeof paymentIntentRef === 'string' ? paymentIntentRef : paymentIntentRef?.id;\n        if (paymentIntentId) {\n            try {\n                await stripe.refunds.create(\n                    { payment_intent: paymentIntentId, metadata: { source } },\n                    { idempotencyKey: `carmazium-legacy-refund:${paymentIntentId}` },\n                );\n            } catch (error: any) {\n                const message = String(error?.message ?? error);\n                if (!message.toLowerCase().includes('already been refunded')) throw error;\n            }\n        }\n        if (transactionId) {\n            await this.prisma.transaction.updateMany({\n                where: { id: transactionId },\n                data: { status: 'REFUNDED' },\n            });\n        }\n    }\n\n    async createCheckoutSession(""",
    'insert payment safety helpers',
)

# Replace web vehicle checkout with a commission-only, winner-only implementation.
sub_once(
    r"    async createCheckoutSession\(.*?\n    }\n\n    /\*\*\n     \* Create a Stripe Checkout Session for an HPI Report\.",
    """    async createCheckoutSession(\n        listingId: string,\n        userId: string,\n        clientAmount: number,\n        type: 'COMMISSION' = 'COMMISSION',\n        currency = 'gbp',\n    ) {\n        if (type !== 'COMMISSION') {\n            throw new BadRequestException('CarMazium does not collect vehicle deposits or vehicle purchase funds');\n        }\n\n        const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });\n        if (!listing || listing.deletedAt) throw new NotFoundException(`Listing \\"${listingId}\\" not found`);\n        await this.assertAuctionWinnerForPayment(listingId, userId);\n\n        const amount = this.AUCTION_BUYER_FEE;\n        if (Math.abs(amount - clientAmount) > 0.01) {\n            console.warn(`[PaymentsService.createCheckoutSession] ignoring client amount ${clientAmount}; charging server-defined £${amount} auction buyer fee for listing=${listingId} user=${userId}.`);\n        }\n\n        const stripe = await this.getStripe();\n        const existing = await this.prisma.transaction.findFirst({\n            where: { listingId, userId, type: 'COMMISSION' as any, status: 'PENDING' },\n            orderBy: { createdAt: 'desc' },\n        });\n        if (existing?.stripePaymentId?.startsWith('cs_')) {\n            try {\n                const previous = await stripe.checkout.sessions.retrieve(existing.stripePaymentId);\n                if (previous.status === 'open' && previous.url) {\n                    return { url: previous.url, sessionId: previous.id, transactionId: existing.id };\n                }\n                if (previous.status === 'complete' && previous.payment_status === 'paid') {\n                    await this.markAuctionBuyerFeePaid(existing.id, listingId, userId, previous.payment_intent as string ?? previous.id);\n                    throw new BadRequestException('The auction buyer fee has already been paid');\n                }\n            } catch (error) {\n                if (error instanceof BadRequestException) throw error;\n            }\n        }\n\n        const transaction = existing ?? await this.prisma.transaction.create({\n            data: {\n                listingId,\n                userId,\n                amount,\n                type: 'COMMISSION' as any,\n                status: 'PENDING',\n                description: `£${amount} CarMazium auction buyer fee — ${listing.title}`,\n            },\n        });\n\n        const baseUrl = resolveFrontendUrl(this.config.get<string>('FRONTEND_URL') || this.config.get<string>('NEXT_PUBLIC_BASE_URL'));\n        const session = await stripe.checkout.sessions.create({\n            payment_method_types: ['card'],\n            mode: 'payment',\n            line_items: [{\n                price_data: {\n                    currency,\n                    product_data: {\n                        name: 'Auction Buyer Fee — CarMazium',\n                        description: `£${amount} CarMazium auction buyer fee · seller incentive is funded separately by CarMazium`,\n                    },\n                    unit_amount: amount * 100,\n                },\n                quantity: 1,\n            }],\n            metadata: {\n                transactionId: transaction.id,\n                listingId,\n                userId,\n                type: 'COMMISSION',\n            },\n            success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,\n            cancel_url: `${baseUrl}/checkout/cancel?listing_id=${listingId}&type=COMMISSION`,\n        });\n\n        await this.prisma.transaction.update({\n            where: { id: transaction.id },\n            data: { stripePaymentId: session.id },\n        });\n\n        return { url: session.url, sessionId: session.id, transactionId: transaction.id };\n    }\n\n    /**\n     * Create a Stripe Checkout Session for an HPI Report.""",
    'replace vehicle checkout',
    re.S,
)

# Payment Sheet: platform fees/services only, default commission, winner check for commission.
sub_once(
    r"type: 'DEPOSIT' \| 'FULL_PAYMENT' \| 'COMMISSION' \| 'LISTING_FEE' \| 'HPI_REPORT' = 'FULL_PAYMENT'",
    "type: 'COMMISSION' | 'LISTING_FEE' | 'HPI_REPORT' = 'COMMISSION'",
    'restrict payment sheet signature',
)
sub_once(
    r"(        if \(!listing \|\| listing\.deletedAt\) \{\n            throw new NotFoundException\(`Listing \\\"\$\{listingId\}\\\" not found`\);\n        \}\n)\n        const user = await this\.prisma\.user\.findUnique",
    r"\1\n        if (!['COMMISSION', 'LISTING_FEE', 'HPI_REPORT'].includes(type)) {\n            throw new BadRequestException('CarMazium does not collect vehicle deposits or vehicle purchase funds');\n        }\n        if (type === 'COMMISSION') await this.assertAuctionWinnerForPayment(listingId, userId);\n\n        const user = await this.prisma.user.findUnique",
    'insert payment sheet runtime guard',
)
sub_once(
    r"        let amount: number;\n        switch \(type\) \{.*?\n        \}\n\n        if \(Math\.abs\(amount - clientAmount\)",
    """        let amount: number;\n        switch (type) {\n            case 'LISTING_FEE':\n                if (!badgeTier || !(badgeTier in this.LISTING_FEES)) {\n                    throw new BadRequestException('badgeTier is required and must be BASIC, STANDARD, or PREMIUM for a LISTING_FEE payment.');\n                }\n                amount = this.LISTING_FEES[badgeTier];\n                break;\n            case 'HPI_REPORT':\n                if (!vrm) throw new BadRequestException('vrm is required for a HPI_REPORT payment.');\n                amount = this.HPI_REPORT_PRICE;\n                break;\n            case 'COMMISSION':\n                amount = this.AUCTION_BUYER_FEE;\n                break;\n            default:\n                throw new BadRequestException('Unsupported platform payment type');\n        }\n\n        if (Math.abs(amount - clientAmount)""",
    'replace payment sheet amount switch',
    re.S,
)
sub_once(
    r"        const descriptionMap: Record<string, string> = \{\n            DEPOSIT:.*?\n            HPI_REPORT: `Comprehensive HPI Report for \$\{vrm\}`,\n        \};",
    """        const descriptionMap: Record<string, string> = {\n            COMMISSION: `£${this.AUCTION_BUYER_FEE} CarMazium auction buyer fee — ${listing.title}`,\n            LISTING_FEE: `${badgeTier ?? ''} Listing Fee — ${listing.title}`.trim(),\n            HPI_REPORT: `Comprehensive HPI Report for ${vrm}`,\n        };""",
    'remove legacy payment sheet descriptions',
    re.S,
)

# Checkout-session webhook: isolate TradeXchange, refund stale vehicle-payment sessions,
# and settle commission through winner-aware helper before the generic ledger path.
sub_once(
    r"(                if \(type === 'TRADEXCHANGE_SERVICE'\) \{\n                    await this\.settleTradeXchangeSession\(session\);\n                    break;\n                \}\n)",
    r"\1\n                if (type === 'DEPOSIT' || type === 'FULL_PAYMENT') {\n                    await this.refundLegacyVehiclePayment(stripe, session.payment_intent, transactionId, `legacy_${type.toLowerCase()}_checkout`);\n                    break;\n                }\n\n                if (type === 'COMMISSION') {\n                    const winnerId = session.metadata?.userId;\n                    if (!transactionId || !listingId || !winnerId) {\n                        await this.refundLegacyVehiclePayment(stripe, session.payment_intent, transactionId, 'invalid_auction_fee_metadata');\n                        break;\n                    }\n                    try {\n                        await this.markAuctionBuyerFeePaid(transactionId, listingId, winnerId, (session.payment_intent as string) ?? session.id);\n                    } catch (error) {\n                        await this.refundLegacyVehiclePayment(stripe, session.payment_intent, transactionId, 'invalid_auction_fee_state');\n                        console.error('Auction buyer fee was refunded because the winner/state no longer matched:', error);\n                    }\n                    break;\n                }\n",
    'harden checkout webhook prelude',
)
for label, pattern in [
    ('remove checkout deposit block', r"\n                if \(type === 'DEPOSIT'\) \{.*?\n                \}"),
    ('remove checkout full payment block', r"\n                if \(type === 'FULL_PAYMENT'\) \{.*?\n                \}"),
    ('remove checkout commission block', r"\n                // Auction buyer fee paid — mark auction and record transaction ID\n                if \(type === 'COMMISSION'\) \{.*?\n                \}"),
]:
    sub_once(pattern, '', label, re.S)

# PaymentIntent webhook: TradeXchange IDs belong to a separate ledger; stale vehicle
# intents are refunded; commission is winner-aware before generic transaction update.
sub_once(
    r"                const \{ transactionId, listingId, type, badgeTier, vrm \} = pi\.metadata \?\? \{\};\n",
    """                const { transactionId, listingId, userId, type, badgeTier, vrm } = pi.metadata ?? {};\n\n                if (type === 'TRADEXCHANGE_SERVICE') break;\n                if (type === 'DEPOSIT' || type === 'FULL_PAYMENT') {\n                    await this.refundLegacyVehiclePayment(stripe, pi.id, transactionId, `legacy_${type.toLowerCase()}_intent`);\n                    break;\n                }\n                if (type === 'COMMISSION') {\n                    if (!transactionId || !listingId || !userId) {\n                        await this.refundLegacyVehiclePayment(stripe, pi.id, transactionId, 'invalid_auction_fee_intent_metadata');\n                        break;\n                    }\n                    try {\n                        await this.markAuctionBuyerFeePaid(transactionId, listingId, userId, pi.id);\n                    } catch (error) {\n                        await this.refundLegacyVehiclePayment(stripe, pi.id, transactionId, 'invalid_auction_fee_intent_state');\n                        console.error('Auction buyer fee intent was refunded because the winner/state no longer matched:', error);\n                    }\n                    break;\n                }\n""",
    'harden payment intent webhook prelude',
)
for label, pattern in [
    ('remove intent deposit block', r"\n                if \(type === 'DEPOSIT' && listingId\) \{.*?\n                \}"),
    ('remove intent full payment block', r"\n                if \(type === 'FULL_PAYMENT' && listingId\) \{.*?\n                \}"),
    ('remove intent commission block', r"\n                if \(type === 'COMMISSION' && listingId\) \{.*?\n                \}"),
]:
    sub_once(pattern, '', label, re.S)

# Expired TradeXchange checkout sessions must not be looked up in the vehicle-payment ledger.
sub_once(
    r"            case 'checkout\.session\.expired': \{.*?\n                break;\n            \}",
    """            case 'checkout.session.expired': {\n                const session = event.data.object;\n                const { transactionId, type } = session.metadata ?? {};\n                if (!transactionId) break;\n\n                if (type === 'TRADEXCHANGE_SERVICE') {\n                    await this.prisma.$executeRaw(Prisma.sql`\n                        UPDATE public.tradexchange_transactions\n                        SET stripe_checkout_session_id = NULL, updated_at = now()\n                        WHERE id = ${transactionId}::uuid\n                          AND stripe_checkout_session_id = ${session.id}\n                          AND payment_status = 'pending'\n                    `);\n                    break;\n                }\n\n                await this.prisma.transaction.updateMany({\n                    where: { id: transactionId, stripePaymentId: session.id, status: 'PENDING' },\n                    data: { status: 'FAILED' },\n                });\n                break;\n            }""",
    'replace expired checkout handler',
    re.S,
)

# Success-page recovery uses the same winner-aware settlement logic as webhooks.
sub_once(
    r"    async applyAuctionFee\(sessionId: string\): Promise<\{ applied: boolean \}> \{.*?\n    \}\n\n    /\*\*\n     \* Webhook fallback for the HPI report fee",
    """    async applyAuctionFee(sessionId: string): Promise<{ applied: boolean }> {\n        const stripe = await this.getStripe();\n        const session = await stripe.checkout.sessions.retrieve(sessionId);\n        if (session.payment_status !== 'paid') return { applied: false };\n\n        const { transactionId, listingId, userId, type } = session.metadata ?? {};\n        if (type !== 'COMMISSION' || !transactionId || !listingId || !userId) {\n            throw new BadRequestException('Auction fee checkout metadata is incomplete or invalid');\n        }\n        const transaction = await this.prisma.transaction.findFirst({\n            where: { id: transactionId, stripePaymentId: sessionId, type: 'COMMISSION' as any },\n        });\n        if (!transaction) return { applied: false };\n\n        await this.markAuctionBuyerFeePaid(transaction.id, listingId, userId, (session.payment_intent as string) ?? session.id);\n        return { applied: true };\n    }\n\n    /**\n     * Webhook fallback for the HPI report fee""",
    'replace applyAuctionFee',
    re.S,
)

# Guard against accidental reintroduction of executable vehicle-money paths.
for forbidden in ["type === 'DEPOSIT'", "type === 'FULL_PAYMENT'", "case 'DEPOSIT':", "case 'FULL_PAYMENT':"]:
    if forbidden in text:
        raise SystemExit(f'forbidden legacy vehicle-payment branch remains: {forbidden}')

path.write_text(text, encoding='utf-8')
print('release audit payment fixes applied successfully')
