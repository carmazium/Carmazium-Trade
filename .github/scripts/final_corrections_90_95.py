from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text(encoding='utf-8-sig')
    if old not in text:
        raise SystemExit(f'Expected text not found in {path}: {old!r}')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')

# A relisted vehicle reuses the same Auction row. Stripe idempotency therefore
# has to be keyed to this specific £125 fee transaction, not the Auction UUID,
# otherwise a later genuine failed sale on the same relisted auction could be
# mistaken for the first refund.
replace_once(
    'backend/src/payments/payments.service.ts',
    "            { idempotencyKey: `auction-buyer-fee-refund-${auctionId}` },",
    "            { idempotencyKey: `auction-buyer-fee-refund-${transaction.id}` },",
)
replace_once(
    'backend/src/payments/payments.service.spec.ts',
    "            { idempotencyKey: 'auction-buyer-fee-refund-auction-1' },",
    "            { idempotencyKey: 'auction-buyer-fee-refund-txn-fee' },",
)

# Production sessions must never fall back to the checked-in development
# secret. Fail startup instead so a deployment cannot silently issue forgeable
# session cookies because one environment variable was omitted.
replace_once(
    'backend/src/main.ts',
    "  if (isProduction && !process.env.SESSION_SECRET) {\n    console.warn('SESSION_SECRET is not set in production — session cookies may be insecure');\n  }",
    "  if (isProduction && !process.env.SESSION_SECRET) {\n    throw new Error('SESSION_SECRET must be set in production; refusing to start with the development fallback.');\n  }\n  const sessionSecret = process.env.SESSION_SECRET || 'dev-secret-change-in-production';",
)
replace_once(
    'backend/src/main.ts',
    "      secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',",
    "      secret: sessionSecret,",
)

print('Final 90-95 correctness patch applied')
