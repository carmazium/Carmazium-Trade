-- Sole-proprietorship support for dealer KYC.
--
-- Adds the business type and the sole-trader-only proof-of-address document.
-- Both are additive: the enum default backfills every existing row as
-- PRIVATE_LIMITED, which is what they all are, and proof_of_address is
-- nullable, so nothing existing needs a value.
--
-- Apply with:  psql "$DIRECT_URL" -f prisma/migrations/dealer_kyc_business_type.sql
-- (or `npx prisma db push`, which reaches the same state from schema.prisma)

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'business_type') THEN
        CREATE TYPE business_type AS ENUM ('PRIVATE_LIMITED', 'SOLE_PROPRIETORSHIP');
    END IF;
END
$$;

ALTER TABLE dealer_kycs
    ADD COLUMN IF NOT EXISTS "businessType" business_type NOT NULL DEFAULT 'PRIVATE_LIMITED',
    ADD COLUMN IF NOT EXISTS "proofOfAddress" TEXT;
