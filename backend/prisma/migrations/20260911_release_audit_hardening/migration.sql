-- CarMazium release-audit hardening.
-- Mirrors the protections already applied to the production `mazium` project.

GRANT SELECT ON TABLE public.tradexchange_jobs TO authenticated;
GRANT SELECT ON TABLE public.tradexchange_offers TO authenticated;
REVOKE SELECT ON TABLE public.tradexchange_jobs FROM anon;
REVOKE SELECT ON TABLE public.tradexchange_offers FROM anon;

CREATE INDEX IF NOT EXISTS tradexchange_job_events_actor_team_member_idx
  ON public.tradexchange_job_events(actor_team_member_id);

CREATE OR REPLACE FUNCTION public.admin_trade_provider_capabilities()
RETURNS TABLE(dealer_profile_id text, company_name text, service_type text, is_enabled boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.tradexchange_is_admin() THEN RAISE EXCEPTION 'Admin access required'; END IF;
  RETURN QUERY
  SELECT d.id,d."companyName",c.service_type,c.is_enabled
  FROM public.dealer_profiles d
  LEFT JOIN public.tradexchange_service_capabilities c ON c.dealer_profile_id=d.id
  WHERE d."deletedAt" IS NULL AND d."isVerified"=true
  ORDER BY d."companyName",c.service_type;
END;
$$;

CREATE OR REPLACE FUNCTION public.provider_lead_feed(_type text DEFAULT NULL::text)
RETURNS TABLE(recipient_id uuid, lead_id uuid, business_id text, type text, status text, assigned_at timestamptz, vehicle_registration text, vehicle_details jsonb, enquiry_details jsonb, contact_name text, contact_email text, contact_phone text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.id, r.lead_id, r.dealer_profile_id, r.lead_type, r.status, r.assigned_at,
         COALESCE(f.vehicle_registration,w.vehicle_registration),
         COALESCE(f.vehicle_details,w.vehicle_details,'{}'::jsonb),
         COALESCE(f.enquiry_details,w.enquiry_details,'{}'::jsonb),
         COALESCE(f.contact_name,w.contact_name),
         COALESCE(f.contact_email,w.contact_email),
         COALESCE(f.contact_phone,w.contact_phone)
  FROM public.tradexchange_lead_recipients r
  LEFT JOIN public.tradexchange_finance_leads f ON r.lead_type='finance' AND f.id=r.lead_id
  LEFT JOIN public.tradexchange_warranty_leads w ON r.lead_type='warranty' AND w.id=r.lead_id
  WHERE r.lead_type IN ('finance','warranty')
    AND (_type IS NULL OR _type='all' OR r.lead_type=_type)
    AND public.tradexchange_can_access_lead(r.dealer_profile_id,r.lead_type,false)
  ORDER BY r.assigned_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.tradexchange_update_lead_status(p_recipient_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r public.tradexchange_lead_recipients;
BEGIN
  IF p_status NOT IN('new','contacted','in_progress','closed') THEN RAISE EXCEPTION 'Invalid lead status'; END IF;
  SELECT * INTO r FROM public.tradexchange_lead_recipients WHERE id=p_recipient_id;
  IF r.id IS NULL OR NOT public.tradexchange_can_access_lead(r.dealer_profile_id,r.lead_type,true) THEN RAISE EXCEPTION 'Lead management permission required'; END IF;
  UPDATE public.tradexchange_lead_recipients SET status=p_status,updated_at=now() WHERE id=p_recipient_id;
  INSERT INTO public.tradexchange_audit_log(actor_user_id,dealer_profile_id,action,entity_type,entity_id,metadata)
  VALUES(auth.uid()::text,r.dealer_profile_id,'lead_status_updated',r.lead_type||'_lead',r.lead_id::text,jsonb_build_object('status',p_status,'recipient_id',p_recipient_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.tradexchange_update_job_progress(p_job_id uuid, p_action text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_job public.tradexchange_jobs%ROWTYPE;
  v_tx public.tradexchange_transactions%ROWTYPE;
  v_is_provider boolean;
  v_team uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_job FROM public.tradexchange_jobs WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Job not found'; END IF;
  SELECT * INTO v_tx FROM public.tradexchange_transactions WHERE job_id=p_job_id FOR UPDATE;
  IF NOT FOUND OR v_tx.payment_status<>'paid' THEN RAISE EXCEPTION 'Customer payment must be confirmed first'; END IF;

  v_is_provider:=public.tradexchange_owns_dealer(v_job.provider_dealer_profile_id);
  IF NOT v_is_provider THEN
    SELECT tm.id INTO v_team
    FROM public.tradexchange_team_members tm
    JOIN public.tradexchange_team_permissions tp ON tp.team_member_id=tm.id
    WHERE tm.dealer_profile_id=v_job.provider_dealer_profile_id
      AND tm.user_id=auth.uid()::text
      AND tm.status='active'
      AND tp.permission=CASE v_job.service_type WHEN 'delivery_recovery' THEN 'delivery_jobs' ELSE 'inspection_jobs' END
      AND tp.can_complete=true
    LIMIT 1;
    v_is_provider:=v_team IS NOT NULL;
  END IF;

  IF p_action='start' THEN
    IF NOT v_is_provider THEN RAISE EXCEPTION 'Provider permission required'; END IF;
    IF v_job.status NOT IN('booked','in_progress') THEN RAISE EXCEPTION 'Job cannot be started'; END IF;
    UPDATE public.tradexchange_jobs SET status='in_progress',updated_at=now() WHERE id=p_job_id;
    UPDATE public.tradexchange_transactions SET completion_status='in_progress',updated_at=now() WHERE id=v_tx.id;
  ELSIF p_action='provider_complete' THEN
    IF NOT v_is_provider THEN RAISE EXCEPTION 'Provider permission required'; END IF;
    IF v_job.status NOT IN('booked','in_progress','provider_completed') THEN RAISE EXCEPTION 'Job cannot be completed by the provider from this state'; END IF;
    UPDATE public.tradexchange_transactions SET completion_status='provider_confirmed',updated_at=now() WHERE id=v_tx.id;
    UPDATE public.tradexchange_jobs SET status='provider_completed',updated_at=now() WHERE id=p_job_id;
  ELSIF p_action='customer_confirm' THEN
    IF v_job.customer_user_id<>auth.uid()::text THEN RAISE EXCEPTION 'Customer permission required'; END IF;
    IF v_tx.completion_status<>'provider_confirmed' THEN RAISE EXCEPTION 'Provider must mark the work complete first'; END IF;
    UPDATE public.tradexchange_transactions SET completion_status='completed',transfer_status='ready',completed_at=now(),updated_at=now() WHERE id=v_tx.id;
    UPDATE public.tradexchange_jobs SET status='completed',updated_at=now() WHERE id=p_job_id;
  ELSE
    RAISE EXCEPTION 'Unsupported action';
  END IF;

  INSERT INTO public.tradexchange_job_events(job_id,actor_user_id,actor_team_member_id,event_type,metadata)
  VALUES(p_job_id,auth.uid()::text,v_team,'progress_'||p_action,'{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_service_job(_job_id uuid, _reason text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_job public.tradexchange_jobs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT * INTO v_job FROM public.tradexchange_jobs WHERE id=_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.customer_user_id <> auth.uid()::text THEN RAISE EXCEPTION 'Only the customer who posted this job can cancel it'; END IF;
  IF v_job.status NOT IN ('draft','open','awaiting_payment') THEN RAISE EXCEPTION 'This job can no longer be cancelled here'; END IF;
  IF EXISTS (SELECT 1 FROM public.tradexchange_transactions t WHERE t.job_id=_job_id AND t.payment_status='paid') THEN RAISE EXCEPTION 'A paid job must be refunded through the dispute/refund workflow'; END IF;

  UPDATE public.tradexchange_jobs SET status='cancelled', updated_at=now() WHERE id=_job_id;
  UPDATE public.tradexchange_offers SET status='declined', updated_at=now() WHERE job_id=_job_id AND status IN ('active','accepted');
  UPDATE public.tradexchange_transactions SET completion_status='cancelled', updated_at=now() WHERE job_id=_job_id AND payment_status='pending';
  INSERT INTO public.tradexchange_job_events(job_id, actor_user_id, event_type, metadata)
  VALUES(_job_id, auth.uid()::text, 'job_cancelled', jsonb_build_object('reason', NULLIF(trim(_reason),'')));
END;
$$;

CREATE OR REPLACE FUNCTION public.tradexchange_settle_checkout(
  p_transaction_id uuid,
  p_checkout_session_id text,
  p_job_id uuid,
  p_customer_user_id text,
  p_currency text,
  p_amount_total integer,
  p_payment_intent_id text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  t public.tradexchange_transactions%ROWTYPE;
  j public.tradexchange_jobs%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO t FROM public.tradexchange_transactions WHERE id=p_transaction_id FOR UPDATE;
  IF t.id IS NULL THEN RAISE EXCEPTION 'TradeXchange transaction not found'; END IF;
  SELECT * INTO j FROM public.tradexchange_jobs WHERE id=t.job_id FOR UPDATE;
  IF j.id IS NULL THEN RAISE EXCEPTION 'TradeXchange job not found'; END IF;

  IF t.stripe_checkout_session_id IS DISTINCT FROM p_checkout_session_id THEN RAISE EXCEPTION 'Checkout session does not match transaction'; END IF;
  IF t.job_id IS DISTINCT FROM p_job_id THEN RAISE EXCEPTION 'Checkout job does not match transaction'; END IF;
  IF t.customer_user_id IS DISTINCT FROM p_customer_user_id THEN RAISE EXCEPTION 'Checkout customer does not match transaction'; END IF;
  IF upper(t.currency) IS DISTINCT FROM upper(p_currency) THEN RAISE EXCEPTION 'Checkout currency does not match transaction'; END IF;
  IF t.gross_amount_pence IS DISTINCT FROM p_amount_total THEN RAISE EXCEPTION 'Checkout amount does not match transaction'; END IF;

  IF t.payment_status='paid' THEN RETURN false; END IF;
  IF t.payment_status <> 'pending' OR t.completion_status <> 'awaiting_payment' OR j.status <> 'awaiting_payment' THEN RAISE EXCEPTION 'TradeXchange transaction is not in a payable state'; END IF;

  UPDATE public.tradexchange_transactions
     SET payment_status='paid', completion_status='booked', stripe_payment_intent_id=p_payment_intent_id, paid_at=v_now, updated_at=v_now
   WHERE id=t.id;
  UPDATE public.tradexchange_jobs SET status='booked', updated_at=v_now WHERE id=t.job_id;
  INSERT INTO public.tradexchange_job_events(job_id,actor_user_id,event_type,metadata)
  VALUES(t.job_id,t.customer_user_id,'payment_received',jsonb_build_object('transaction_id',t.id,'stripe_checkout_session_id',p_checkout_session_id,'stripe_payment_intent_id',p_payment_intent_id));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_trade_provider_capabilities() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.provider_lead_feed(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tradexchange_update_lead_status(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tradexchange_update_job_progress(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_service_job(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tradexchange_settle_checkout(uuid,text,uuid,text,text,integer,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_trade_provider_capabilities() TO authenticated;
GRANT EXECUTE ON FUNCTION public.provider_lead_feed(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tradexchange_update_lead_status(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tradexchange_update_job_progress(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_service_job(uuid,text) TO authenticated;
-- tradexchange_settle_checkout intentionally remains server/service-role only.
