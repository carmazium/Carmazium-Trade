-- Legacy Trade Exchange reference cleanup — FAIL CLOSED.
--
-- IMPORTANT (verified 2026-09-11): the nine tables below currently contain
-- zero rows, BUT the production schema also has later Trade Exchange objects.
-- In particular, tradexchange_disputes and tradexchange_job_events have foreign
-- keys into tradexchange_jobs, and tradexchange_job_events also references
-- tradexchange_team_members. A blind DROP ... CASCADE would therefore strip
-- live schema relationships even though the nine target tables are empty.
--
-- This file is intentionally guarded. It will refuse to drop anything while:
--   1) any target table contains rows, OR
--   2) any foreign key from a non-target table still depends on a target table.
--
-- Do not weaken these guards. The old Trade Exchange runtime must be retired as
-- one coherent migration after all dependent tables/functions/policies have
-- been audited. The current Prisma service marketplace can coexist meanwhile.

DO $$
DECLARE
    nonempty_tables text;
    external_dependencies text;
BEGIN
    SELECT string_agg(table_name, ', ' ORDER BY table_name)
    INTO nonempty_tables
    FROM (
        SELECT 'tradexchange_jobs' AS table_name WHERE EXISTS (SELECT 1 FROM public.tradexchange_jobs LIMIT 1)
        UNION ALL SELECT 'tradexchange_offers' WHERE EXISTS (SELECT 1 FROM public.tradexchange_offers LIMIT 1)
        UNION ALL SELECT 'tradexchange_payments' WHERE EXISTS (SELECT 1 FROM public.tradexchange_payments LIMIT 1)
        UNION ALL SELECT 'tradexchange_transactions' WHERE EXISTS (SELECT 1 FROM public.tradexchange_transactions LIMIT 1)
        UNION ALL SELECT 'tradexchange_lead_recipients' WHERE EXISTS (SELECT 1 FROM public.tradexchange_lead_recipients LIMIT 1)
        UNION ALL SELECT 'tradexchange_provider_accounts' WHERE EXISTS (SELECT 1 FROM public.tradexchange_provider_accounts LIMIT 1)
        UNION ALL SELECT 'tradexchange_service_capabilities' WHERE EXISTS (SELECT 1 FROM public.tradexchange_service_capabilities LIMIT 1)
        UNION ALL SELECT 'tradexchange_team_members' WHERE EXISTS (SELECT 1 FROM public.tradexchange_team_members LIMIT 1)
        UNION ALL SELECT 'tradexchange_team_permissions' WHERE EXISTS (SELECT 1 FROM public.tradexchange_team_permissions LIMIT 1)
    ) s;

    IF nonempty_tables IS NOT NULL THEN
        RAISE EXCEPTION 'Legacy Trade Exchange cleanup aborted: non-empty target tables: %', nonempty_tables;
    END IF;

    WITH target_oids AS (
        SELECT c.oid
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relname IN (
              'tradexchange_jobs',
              'tradexchange_offers',
              'tradexchange_payments',
              'tradexchange_transactions',
              'tradexchange_lead_recipients',
              'tradexchange_provider_accounts',
              'tradexchange_service_capabilities',
              'tradexchange_team_members',
              'tradexchange_team_permissions'
          )
    ), target_names AS (
        SELECT unnest(ARRAY[
            'tradexchange_jobs',
            'tradexchange_offers',
            'tradexchange_payments',
            'tradexchange_transactions',
            'tradexchange_lead_recipients',
            'tradexchange_provider_accounts',
            'tradexchange_service_capabilities',
            'tradexchange_team_members',
            'tradexchange_team_permissions'
        ]) AS name
    )
    SELECT string_agg(
        format('%s -> %s (%s)', con.conrelid::regclass::text, con.confrelid::regclass::text, con.conname),
        ', ' ORDER BY con.conrelid::regclass::text, con.conname
    )
    INTO external_dependencies
    FROM pg_constraint con
    WHERE con.contype = 'f'
      AND con.confrelid IN (SELECT oid FROM target_oids)
      AND split_part(con.conrelid::regclass::text, '.', 2) NOT IN (SELECT name FROM target_names)
      AND con.conrelid::regclass::text NOT IN (SELECT name FROM target_names);

    IF external_dependencies IS NOT NULL THEN
        RAISE EXCEPTION 'Legacy Trade Exchange cleanup aborted: dependent foreign keys still exist: %', external_dependencies;
    END IF;
END $$;

-- These statements are reached only after both safety checks pass.
DROP TABLE IF EXISTS public.tradexchange_team_permissions;
DROP TABLE IF EXISTS public.tradexchange_team_members;
DROP TABLE IF EXISTS public.tradexchange_transactions;
DROP TABLE IF EXISTS public.tradexchange_payments;
DROP TABLE IF EXISTS public.tradexchange_offers;
DROP TABLE IF EXISTS public.tradexchange_lead_recipients;
DROP TABLE IF EXISTS public.tradexchange_service_capabilities;
DROP TABLE IF EXISTS public.tradexchange_provider_accounts;
DROP TABLE IF EXISTS public.tradexchange_jobs;
