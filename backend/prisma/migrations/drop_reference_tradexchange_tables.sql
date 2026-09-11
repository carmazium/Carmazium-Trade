-- Removes the nine AI-drafted tradexchange_* reference tables.
--
-- These were created directly in Supabase as a REFERENCE for how the Trade
-- Exchange services should look, not as a system. They were confirmed empty
-- on 2026-09-11, they have no Prisma models, no code reads them, and the real
-- design now lives in service_marketplace_phase0.sql under Prisma's control.
--
-- CASCADE is required because the RLS policies on tradexchange_offers,
-- tradexchange_payments and tradexchange_transactions depend on
-- tradexchange_jobs — the same dependency that stopped the 2026-09-10 deploy
-- from dropping them by accident.
--
-- Run the check first. If ANY count is non-zero, STOP and do not run the drop.
--
--   SELECT 'jobs' t, count(*) FROM tradexchange_jobs
--   UNION ALL SELECT 'offers', count(*) FROM tradexchange_offers
--   UNION ALL SELECT 'payments', count(*) FROM tradexchange_payments
--   UNION ALL SELECT 'transactions', count(*) FROM tradexchange_transactions
--   UNION ALL SELECT 'lead_recipients', count(*) FROM tradexchange_lead_recipients
--   UNION ALL SELECT 'provider_accounts', count(*) FROM tradexchange_provider_accounts
--   UNION ALL SELECT 'service_capabilities', count(*) FROM tradexchange_service_capabilities
--   UNION ALL SELECT 'team_members', count(*) FROM tradexchange_team_members
--   UNION ALL SELECT 'team_permissions', count(*) FROM tradexchange_team_permissions;
--
-- Then:
--   psql "$DIRECT_URL" -f prisma/migrations/drop_reference_tradexchange_tables.sql

DROP TABLE IF EXISTS tradexchange_team_permissions CASCADE;
DROP TABLE IF EXISTS tradexchange_team_members CASCADE;
DROP TABLE IF EXISTS tradexchange_transactions CASCADE;
DROP TABLE IF EXISTS tradexchange_payments CASCADE;
DROP TABLE IF EXISTS tradexchange_offers CASCADE;
DROP TABLE IF EXISTS tradexchange_lead_recipients CASCADE;
DROP TABLE IF EXISTS tradexchange_service_capabilities CASCADE;
DROP TABLE IF EXISTS tradexchange_provider_accounts CASCADE;
DROP TABLE IF EXISTS tradexchange_jobs CASCADE;
