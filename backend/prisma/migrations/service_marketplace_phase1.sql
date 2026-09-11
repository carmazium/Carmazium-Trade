-- Trade Exchange service marketplace — Phase 1.
-- Contractor trading name and contact number, shown on quotes / revealed on
-- acceptance. Additive; both nullable.
--   psql "$DIRECT_URL" -f prisma/migrations/service_marketplace_phase1.sql
ALTER TABLE contractor_profiles
    ADD COLUMN IF NOT EXISTS "businessName" TEXT,
    ADD COLUMN IF NOT EXISTS "phone" TEXT;
