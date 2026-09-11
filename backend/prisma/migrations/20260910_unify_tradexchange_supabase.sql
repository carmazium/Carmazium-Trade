-- CarMazium unified TradeXchange/Supabase hardening
-- 2026-09-10
-- Additive/non-destructive. This migration completes the partially-applied
-- TradeXchange schema used by the current Next.js UI and provides compatibility
-- RPCs for the mature Lovable workflow without moving users to another project.

-- ---------------------------------------------------------------------------
-- 1. Complete existing TradeXchange rows with the fields used by the UI.
-- ---------------------------------------------------------------------------
ALTER TABLE public.tradexchange_jobs
    ADD COLUMN IF NOT EXISTS budget_pence integer,
    ADD COLUMN IF NOT EXISTS contact_phone text,
    ADD COLUMN IF NOT EXISTS contact_notes text,
    ADD COLUMN IF NOT EXISTS vehicle_label text;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'tradexchange_jobs_budget_pence_check'
          AND conrelid = 'public.tradexchange_jobs'::regclass
    ) THEN
        ALTER TABLE public.tradexchange_jobs
            ADD CONSTRAINT tradexchange_jobs_budget_pence_check
            CHECK (budget_pence IS NULL OR budget_pence > 0);
    END IF;
END $$;

ALTER TABLE public.tradexchange_offers
    ADD COLUMN IF NOT EXISTS available_from date;

-- ---------------------------------------------------------------------------
-- 2. Restore tables referenced by already-live SECURITY DEFINER functions.
--    Their absence currently makes valid calls fail at runtime.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tradexchange_job_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid NOT NULL REFERENCES public.tradexchange_jobs(id) ON DELETE CASCADE,
    actor_user_id text,
    actor_team_member_id uuid REFERENCES public.tradexchange_team_members(id) ON DELETE SET NULL,
    event_type text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tradexchange_job_events_job_idx
    ON public.tradexchange_job_events(job_id, created_at);

CREATE TABLE IF NOT EXISTS public.tradexchange_audit_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id text,
    dealer_profile_id text,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tradexchange_audit_log_entity_idx
    ON public.tradexchange_audit_log(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tradexchange_audit_log_actor_idx
    ON public.tradexchange_audit_log(actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.tradexchange_disputes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id uuid NOT NULL REFERENCES public.tradexchange_jobs(id) ON DELETE CASCADE,
    opened_by_user_id text NOT NULL,
    reason text NOT NULL,
    status text NOT NULL DEFAULT 'open'
        CHECK (status IN ('open','reviewing','resolved','closed')),
    resolution text,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tradexchange_disputes_one_active_per_job
    ON public.tradexchange_disputes(job_id)
    WHERE status IN ('open','reviewing');
CREATE INDEX IF NOT EXISTS tradexchange_disputes_job_idx
    ON public.tradexchange_disputes(job_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.tradexchange_finance_leads (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_user_id text NOT NULL,
    status text NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted','distributed','closed')),
    vehicle_registration text,
    vehicle_details jsonb NOT NULL DEFAULT '{}'::jsonb,
    enquiry_details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    contact_name text,
    contact_email text,
    contact_phone text,
    contact_consent_at timestamptz
);
CREATE INDEX IF NOT EXISTS tradexchange_finance_leads_customer_idx
    ON public.tradexchange_finance_leads(customer_user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3. RLS: new tables are private by default and scoped to the actual parties.
-- ---------------------------------------------------------------------------
ALTER TABLE public.tradexchange_job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tradexchange_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tradexchange_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tradexchange_finance_leads ENABLE ROW LEVEL SECURITY;
-- Backend-only tables were not directly exposed, but keep RLS on defensively.
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hpi_report_email_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tx_job_events_admin_select ON public.tradexchange_job_events;
CREATE POLICY tx_job_events_admin_select ON public.tradexchange_job_events
FOR SELECT TO authenticated USING (public.tradexchange_is_admin());
DROP POLICY IF EXISTS tx_job_events_customer_select ON public.tradexchange_job_events;
CREATE POLICY tx_job_events_customer_select ON public.tradexchange_job_events
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.tradexchange_jobs j
        WHERE j.id = job_id AND j.customer_user_id = (select auth.uid())::text
    )
);
DROP POLICY IF EXISTS tx_job_events_provider_select ON public.tradexchange_job_events;
CREATE POLICY tx_job_events_provider_select ON public.tradexchange_job_events
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1 FROM public.tradexchange_jobs j
        WHERE j.id = job_id
          AND j.provider_dealer_profile_id IS NOT NULL
          AND public.tradexchange_can_provide(j.provider_dealer_profile_id, j.service_type)
    )
);

DROP POLICY IF EXISTS tx_audit_admin_select ON public.tradexchange_audit_log;
CREATE POLICY tx_audit_admin_select ON public.tradexchange_audit_log
FOR SELECT TO authenticated USING (public.tradexchange_is_admin());

DROP POLICY IF EXISTS tx_disputes_admin_all ON public.tradexchange_disputes;
CREATE POLICY tx_disputes_admin_all ON public.tradexchange_disputes
FOR ALL TO authenticated USING (public.tradexchange_is_admin())
WITH CHECK (public.tradexchange_is_admin());
DROP POLICY IF EXISTS tx_disputes_party_select ON public.tradexchange_disputes;
CREATE POLICY tx_disputes_party_select ON public.tradexchange_disputes
FOR SELECT TO authenticated USING (
    opened_by_user_id = (select auth.uid())::text
    OR EXISTS (
        SELECT 1 FROM public.tradexchange_jobs j
        WHERE j.id = job_id
          AND (
            j.customer_user_id = (select auth.uid())::text
            OR (j.provider_dealer_profile_id IS NOT NULL
                AND public.tradexchange_can_provide(j.provider_dealer_profile_id, j.service_type))
          )
    )
);

DROP POLICY IF EXISTS tx_finance_customer_select ON public.tradexchange_finance_leads;
CREATE POLICY tx_finance_customer_select ON public.tradexchange_finance_leads
FOR SELECT TO authenticated USING (customer_user_id = (select auth.uid())::text);
DROP POLICY IF EXISTS tx_finance_customer_insert ON public.tradexchange_finance_leads;
CREATE POLICY tx_finance_customer_insert ON public.tradexchange_finance_leads
FOR INSERT TO authenticated WITH CHECK (customer_user_id = (select auth.uid())::text);
DROP POLICY IF EXISTS tx_finance_admin_all ON public.tradexchange_finance_leads;
CREATE POLICY tx_finance_admin_all ON public.tradexchange_finance_leads
FOR ALL TO authenticated USING (public.tradexchange_is_admin())
WITH CHECK (public.tradexchange_is_admin());
DROP POLICY IF EXISTS tx_finance_provider_select ON public.tradexchange_finance_leads;
CREATE POLICY tx_finance_provider_select ON public.tradexchange_finance_leads
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1
        FROM public.tradexchange_lead_recipients r
        WHERE r.lead_type = 'finance'
          AND r.lead_id = tradexchange_finance_leads.id
          AND public.tradexchange_can_access_lead(r.dealer_profile_id, 'finance', false)
    )
);

-- Correct the existing warranty policy: the previous policy compared the
-- recipient id to itself instead of correlating recipient.lead_id to this row.
DROP POLICY IF EXISTS tx_warranty_provider_select ON public.tradexchange_warranty_leads;
CREATE POLICY tx_warranty_provider_select ON public.tradexchange_warranty_leads
FOR SELECT TO authenticated USING (
    EXISTS (
        SELECT 1
        FROM public.tradexchange_lead_recipients r
        WHERE r.lead_type = 'warranty'
          AND r.lead_id = tradexchange_warranty_leads.id
          AND public.tradexchange_can_access_lead(r.dealer_profile_id, 'warranty', false)
    )
);

-- ---------------------------------------------------------------------------
-- 4. Lovable-compatible RPC façade over the production TradeXchange schema.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provider_job_feed(_category text DEFAULT NULL)
RETURNS TABLE(
    id uuid,
    category text,
    title text,
    description text,
    collection_location text,
    delivery_location text,
    preferred_date date,
    budget_pence integer,
    vehicle_label text,
    created_at timestamptz,
    offer_count integer,
    my_business_id text,
    my_offer_id uuid,
    my_offer_amount_pence integer,
    my_offer_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        j.id,
        CASE j.service_type
            WHEN 'delivery_recovery' THEN 'delivery'
            WHEN 'vehicle_inspection' THEN 'inspection'
        END AS category,
        j.title,
        j.description,
        CASE WHEN j.service_type = 'delivery_recovery' THEN j.pickup_postcode ELSE j.service_postcode END,
        CASE WHEN j.service_type = 'delivery_recovery' THEN j.delivery_postcode ELSE NULL END,
        j.requested_for::date,
        j.budget_pence,
        COALESCE(
            NULLIF(j.vehicle_label, ''),
            NULLIF(trim(concat_ws(' ', j.vehicle_year, j.vehicle_make, j.vehicle_model, j.vehicle_registration)), '')
        ),
        j.created_at,
        (SELECT count(*)::integer FROM public.tradexchange_offers all_o
         WHERE all_o.job_id = j.id AND all_o.status IN ('active','accepted')),
        ctx.dealer_profile_id,
        mine.id,
        mine.amount_pence,
        CASE mine.status WHEN 'active' THEN 'submitted' ELSE mine.status END
    FROM public.tradexchange_jobs j
    CROSS JOIN LATERAL (
        SELECT c.*
        FROM public.tradexchange_my_provider_contexts() c
        WHERE (j.service_type = 'delivery_recovery' AND c.can_delivery_view)
           OR (j.service_type = 'vehicle_inspection' AND c.can_inspection_view)
        ORDER BY c.is_owner DESC, c.dealer_profile_id
        LIMIT 1
    ) ctx
    LEFT JOIN public.tradexchange_offers mine
      ON mine.job_id = j.id AND mine.dealer_profile_id = ctx.dealer_profile_id
    WHERE j.status = 'open'
      AND j.customer_user_id <> (select auth.uid())::text
      AND (
        _category IS NULL OR _category = 'all'
        OR (_category = 'delivery' AND j.service_type = 'delivery_recovery')
        OR (_category = 'inspection' AND j.service_type = 'vehicle_inspection')
      )
      AND COALESCE(_category, 'all') NOT IN ('finance','warranty')
    ORDER BY j.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.submit_service_offer(
    _job_id uuid,
    _business_id text,
    _amount_pence integer,
    _message text DEFAULT NULL,
    _available_from date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_offer uuid;
BEGIN
    v_offer := public.tradexchange_submit_offer(_job_id, _business_id, _amount_pence, _message);
    UPDATE public.tradexchange_offers
       SET available_from = _available_from, updated_at = now()
     WHERE id = v_offer;
    RETURN v_offer;
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_service_offer(_offer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_offer public.tradexchange_offers%ROWTYPE;
    v_job public.tradexchange_jobs%ROWTYPE;
    v_can_offer boolean := false;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
    SELECT * INTO v_offer FROM public.tradexchange_offers WHERE id = _offer_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Offer not found'; END IF;
    SELECT * INTO v_job FROM public.tradexchange_jobs WHERE id = v_offer.job_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;

    v_can_offer := public.tradexchange_owns_dealer(v_offer.dealer_profile_id)
        OR EXISTS (
            SELECT 1
            FROM public.tradexchange_team_members tm
            JOIN public.tradexchange_team_permissions tp ON tp.team_member_id = tm.id
            WHERE tm.dealer_profile_id = v_offer.dealer_profile_id
              AND tm.user_id = (select auth.uid())::text
              AND tm.status = 'active'
              AND tp.permission = CASE v_job.service_type
                    WHEN 'delivery_recovery' THEN 'delivery_jobs'
                    WHEN 'vehicle_inspection' THEN 'inspection_jobs'
                    ELSE '__unsupported__'
                  END
              AND tp.can_offer = true
        );
    IF NOT v_can_offer THEN RAISE EXCEPTION 'You do not have permission to withdraw this offer'; END IF;
    IF v_offer.status <> 'active' THEN RAISE EXCEPTION 'Only an active offer can be withdrawn'; END IF;

    UPDATE public.tradexchange_offers
       SET status = 'withdrawn', updated_at = now()
     WHERE id = _offer_id;
    INSERT INTO public.tradexchange_job_events(job_id, actor_user_id, event_type, metadata)
    VALUES(v_offer.job_id, (select auth.uid())::text, 'offer_withdrawn', jsonb_build_object('offer_id', _offer_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.post_service_job(
    _category text,
    _title text,
    _description text,
    _collection_location text DEFAULT NULL,
    _delivery_location text DEFAULT NULL,
    _preferred_date date DEFAULT NULL,
    _budget_pence integer DEFAULT NULL,
    _contact_phone text DEFAULT NULL,
    _contact_notes text DEFAULT NULL,
    _vehicle_label text DEFAULT NULL,
    _poster_business_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_job uuid;
    v_service_type text;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
    IF _category NOT IN ('delivery','inspection') THEN
        RAISE EXCEPTION 'Delivery and inspection are job services; use the finance/warranty enquiry workflow for lead services';
    END IF;
    IF length(trim(COALESCE(_title,''))) < 3 THEN RAISE EXCEPTION 'Please add a job title'; END IF;
    IF length(trim(COALESCE(_description,''))) < 10 THEN RAISE EXCEPTION 'Please describe the work required'; END IF;
    IF _budget_pence IS NOT NULL AND _budget_pence <= 0 THEN RAISE EXCEPTION 'Budget must be greater than zero'; END IF;

    v_service_type := CASE _category WHEN 'delivery' THEN 'delivery_recovery' ELSE 'vehicle_inspection' END;

    INSERT INTO public.tradexchange_jobs(
        customer_user_id, service_type, status, title, description,
        pickup_postcode, delivery_postcode, service_postcode, requested_for,
        budget_pence, contact_phone, contact_notes, vehicle_label
    ) VALUES (
        (select auth.uid())::text, v_service_type, 'open', trim(_title), trim(_description),
        CASE WHEN v_service_type='delivery_recovery' THEN NULLIF(trim(_collection_location),'') END,
        CASE WHEN v_service_type='delivery_recovery' THEN NULLIF(trim(_delivery_location),'') END,
        CASE WHEN v_service_type='vehicle_inspection' THEN COALESCE(NULLIF(trim(_collection_location),''), NULLIF(trim(_delivery_location),'')) END,
        _preferred_date::timestamptz,
        _budget_pence, NULLIF(trim(_contact_phone),''), NULLIF(trim(_contact_notes),''), NULLIF(trim(_vehicle_label),'')
    ) RETURNING id INTO v_job;

    INSERT INTO public.tradexchange_job_events(job_id, actor_user_id, event_type, metadata)
    VALUES(v_job, (select auth.uid())::text, 'job_posted', jsonb_build_object('category', _category));
    RETURN v_job;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_service_job(_job_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_job public.tradexchange_jobs%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
    SELECT * INTO v_job FROM public.tradexchange_jobs WHERE id=_job_id FOR UPDATE;
    IF NOT FOUND OR v_job.customer_user_id <> (select auth.uid())::text THEN
        RAISE EXCEPTION 'Only the customer who posted this job can cancel it';
    END IF;
    IF v_job.status NOT IN ('draft','open','awaiting_payment') THEN
        RAISE EXCEPTION 'This job can no longer be cancelled here';
    END IF;
    IF EXISTS (SELECT 1 FROM public.tradexchange_transactions t WHERE t.job_id=_job_id AND t.payment_status='paid') THEN
        RAISE EXCEPTION 'A paid job must be refunded through the dispute/refund workflow';
    END IF;
    UPDATE public.tradexchange_jobs SET status='cancelled', updated_at=now() WHERE id=_job_id;
    UPDATE public.tradexchange_offers SET status='declined', updated_at=now()
      WHERE job_id=_job_id AND status='active';
    INSERT INTO public.tradexchange_job_events(job_id, actor_user_id, event_type, metadata)
    VALUES(_job_id, (select auth.uid())::text, 'job_cancelled', jsonb_build_object('reason', NULLIF(trim(_reason),'')));
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_service_offer(_offer_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.tradexchange_accept_offer(_offer_id); $$;

CREATE OR REPLACE FUNCTION public.service_job_offer_board(_job_id uuid)
RETURNS TABLE(
    offer_id uuid,
    business_id text,
    business_name text,
    business_slug text,
    verification_status text,
    amount_pence integer,
    message text,
    available_from date,
    status text,
    created_at timestamptz,
    rating numeric,
    review_count integer,
    badges text[],
    about text,
    public_website text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
    IF NOT public.tradexchange_is_admin()
       AND NOT EXISTS (SELECT 1 FROM public.tradexchange_jobs j WHERE j.id=_job_id AND j.customer_user_id=(select auth.uid())::text)
    THEN RAISE EXCEPTION 'Only the customer who posted this job can compare offers'; END IF;

    RETURN QUERY
    SELECT
        o.id, o.dealer_profile_id, d."companyName", NULL::text,
        CASE WHEN d."isVerified" THEN 'verified' ELSE 'pending' END,
        o.amount_pence, o.message, o.available_from,
        CASE o.status WHEN 'active' THEN 'submitted' ELSE o.status END,
        o.created_at,
        NULL::numeric, 0::integer, ARRAY[]::text[], d.description, d.website
    FROM public.tradexchange_offers o
    JOIN public.dealer_profiles d ON d.id=o.dealer_profile_id AND d."deletedAt" IS NULL
    WHERE o.job_id=_job_id
    ORDER BY CASE o.status WHEN 'active' THEN 0 WHEN 'accepted' THEN 1 ELSE 2 END, o.amount_pence, o.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.service_job_contact(_job_id uuid)
RETURNS TABLE(contact_name text, contact_phone text, contact_notes text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_job public.tradexchange_jobs%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
    SELECT * INTO v_job FROM public.tradexchange_jobs WHERE id=_job_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;

    IF v_job.customer_user_id <> (select auth.uid())::text
       AND NOT (
            v_job.provider_dealer_profile_id IS NOT NULL
            AND v_job.status IN ('booked','in_progress','provider_completed','completed','disputed')
            AND public.tradexchange_can_provide(v_job.provider_dealer_profile_id, v_job.service_type)
       )
       AND NOT public.tradexchange_is_admin()
    THEN RAISE EXCEPTION 'Contact details unlock only for the customer and the selected paid provider'; END IF;

    RETURN QUERY
    SELECT trim(concat_ws(' ', u."firstName", u."lastName")),
           COALESCE(v_job.contact_phone, u.phone),
           v_job.contact_notes
    FROM public.users u
    WHERE u.id=v_job.customer_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_service_job_completion(_job_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_status text;
BEGIN
    PERFORM public.tradexchange_update_job_progress(_job_id, 'customer_confirm');
    SELECT status INTO v_status FROM public.tradexchange_jobs WHERE id=_job_id;
    RETURN v_status;
END;
$$;

CREATE OR REPLACE FUNCTION public.report_service_job_issue(_job_id uuid, _kind text, _detail text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF _kind NOT IN ('no_show','failed','disputed') THEN RAISE EXCEPTION 'Invalid issue type'; END IF;
    -- All service failures enter the same pre-payout dispute hold. The kind is
    -- retained in the reason/audit trail instead of inventing an unsafe payout state.
    PERFORM public.tradexchange_open_dispute(
        _job_id,
        left(_kind || ': ' || COALESCE(NULLIF(trim(_detail),''), 'Service issue reported'), 2000)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.my_provider_summary()
RETURNS TABLE(
    business_id text,
    business_name text,
    category text,
    open_offers integer,
    won_jobs integer,
    completed_jobs integer,
    gross_pence bigint,
    fee_pence bigint,
    net_pence bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH contexts AS (
    SELECT c.dealer_profile_id, c.company_name,
           unnest(ARRAY[
             CASE WHEN c.can_delivery_view OR c.can_delivery_offer OR c.can_delivery_complete THEN 'delivery' END,
             CASE WHEN c.can_inspection_view OR c.can_inspection_offer OR c.can_inspection_complete THEN 'inspection' END
           ]) AS category
    FROM public.tradexchange_my_provider_contexts() c
), clean AS (
    SELECT DISTINCT dealer_profile_id, company_name, category FROM contexts WHERE category IS NOT NULL
)
SELECT
    c.dealer_profile_id,
    c.company_name,
    c.category,
    (SELECT count(*)::integer FROM public.tradexchange_offers o
      JOIN public.tradexchange_jobs j ON j.id=o.job_id
      WHERE o.dealer_profile_id=c.dealer_profile_id AND o.status='active'
        AND j.service_type=CASE c.category WHEN 'delivery' THEN 'delivery_recovery' ELSE 'vehicle_inspection' END),
    (SELECT count(*)::integer FROM public.tradexchange_jobs j
      WHERE j.provider_dealer_profile_id=c.dealer_profile_id
        AND j.service_type=CASE c.category WHEN 'delivery' THEN 'delivery_recovery' ELSE 'vehicle_inspection' END),
    (SELECT count(*)::integer FROM public.tradexchange_jobs j
      WHERE j.provider_dealer_profile_id=c.dealer_profile_id AND j.status='completed'
        AND j.service_type=CASE c.category WHEN 'delivery' THEN 'delivery_recovery' ELSE 'vehicle_inspection' END),
    COALESCE((SELECT sum(t.gross_amount_pence) FROM public.tradexchange_transactions t
      JOIN public.tradexchange_jobs j ON j.id=t.job_id
      WHERE t.provider_dealer_profile_id=c.dealer_profile_id AND j.status='completed'
        AND j.service_type=CASE c.category WHEN 'delivery' THEN 'delivery_recovery' ELSE 'vehicle_inspection' END),0)::bigint,
    COALESCE((SELECT sum(t.platform_fee_pence) FROM public.tradexchange_transactions t
      JOIN public.tradexchange_jobs j ON j.id=t.job_id
      WHERE t.provider_dealer_profile_id=c.dealer_profile_id AND j.status='completed'
        AND j.service_type=CASE c.category WHEN 'delivery' THEN 'delivery_recovery' ELSE 'vehicle_inspection' END),0)::bigint,
    COALESCE((SELECT sum(t.provider_amount_pence) FROM public.tradexchange_transactions t
      JOIN public.tradexchange_jobs j ON j.id=t.job_id
      WHERE t.provider_dealer_profile_id=c.dealer_profile_id AND j.status='completed'
        AND j.service_type=CASE c.category WHEN 'delivery' THEN 'delivery_recovery' ELSE 'vehicle_inspection' END),0)::bigint
FROM clean c;
$$;

-- ---------------------------------------------------------------------------
-- 5. Data API grants. RPCs are authenticated-only; helper RPCs are no longer
--    anonymously callable. RLS still scopes direct SELECTs.
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.tradexchange_job_events, public.tradexchange_disputes,
    public.tradexchange_finance_leads TO authenticated;
GRANT SELECT ON public.tradexchange_audit_log TO authenticated;

REVOKE ALL ON public.tradexchange_job_events, public.tradexchange_audit_log,
    public.tradexchange_disputes, public.tradexchange_finance_leads FROM anon;

REVOKE EXECUTE ON FUNCTION public.provider_job_feed(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_service_offer(uuid,text,integer,text,date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.withdraw_service_offer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.post_service_job(text,text,text,text,text,date,integer,text,text,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_service_job(uuid,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_service_offer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.service_job_offer_board(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.service_job_contact(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.confirm_service_job_completion(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.report_service_job_issue(uuid,text,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_provider_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provider_job_feed(text),
    public.submit_service_offer(uuid,text,integer,text,date),
    public.withdraw_service_offer(uuid),
    public.post_service_job(text,text,text,text,text,date,integer,text,text,text,text),
    public.cancel_service_job(uuid,text),
    public.accept_service_offer(uuid),
    public.service_job_offer_board(uuid),
    public.service_job_contact(uuid),
    public.confirm_service_job_completion(uuid),
    public.report_service_job_issue(uuid,text,text),
    public.my_provider_summary() TO authenticated;

-- Existing helper functions were accidentally callable by anonymous users.
-- Keep them executable for authenticated RLS evaluation, but remove public/anon.
REVOKE EXECUTE ON FUNCTION public.current_uid() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_user_role(public.user_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_dealer_profile_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.owns_listing(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_uid(), public.has_user_role(public.user_role),
    public.is_admin(), public.my_dealer_profile_ids(), public.owns_listing(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Low-risk indexes flagged by the Supabase performance advisor.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS analytics_events_userId_idx ON public.analytics_events("userId");
CREATE INDEX IF NOT EXISTS auctions_winnerId_idx ON public.auctions("winnerId");
CREATE INDEX IF NOT EXISTS chat_rooms_listingId_idx ON public.chat_rooms("listingId");
CREATE INDEX IF NOT EXISTS delivery_requests_offerId_idx ON public.delivery_requests("offerId");
CREATE INDEX IF NOT EXISTS hpi_reports_preparedById_idx ON public.hpi_reports("preparedById");
CREATE INDEX IF NOT EXISTS listings_linkedListingId_idx ON public.listings("linkedListingId");
