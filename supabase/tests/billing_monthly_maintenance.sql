-- LOCAL ONLY. Run after the monthly maintenance migration inside a transaction and ROLLBACK.
DO $test$
DECLARE
  v_org uuid := gen_random_uuid(); v_other_org uuid := gen_random_uuid();
  v_user uuid := (SELECT id FROM public.users ORDER BY id LIMIT 1);
  v_t1 uuid := gen_random_uuid(); v_t2 uuid := gen_random_uuid();
  v_t3 uuid := gen_random_uuid(); v_t4 uuid := gen_random_uuid();
  v_c uuid; v_other_c uuid; v_legacy uuid; v_i1 uuid; v_i2 uuid;
  v_original_audit timestamptz; v_tournaments jsonb; v_installments jsonb;
BEGIN
  IF (SELECT count(*) FROM pg_constraint WHERE conrelid='public.billing_collection_installments'::regclass
      AND confrelid='public.billing_collections'::regclass AND contype='f') <> 1 THEN
    RAISE EXCEPTION 'PostgREST collection embedding must have exactly one relationship';
  END IF;
  IF v_user IS NULL THEN RAISE EXCEPTION 'Local fixture requires an existing test user'; END IF;
  INSERT INTO public.organizaciones(id,name,slug) VALUES
    (v_org,'Billing QA', 'billing-qa-' || v_org), (v_other_org,'Other billing QA','billing-qa-' || v_other_org);
  INSERT INTO public.tenant_billing_settings(organization_id,billing_model) VALUES (v_org,'FV_LEAGUE'),(v_other_org,'TPE_PLAYER');
  INSERT INTO public.tournaments(id,name,type,status,organization_id,club_id,es_prueba) VALUES
    (v_t1,'Billing QA 1','LONG','ZONE_PHASE',v_org,NULL,false),
    (v_t2,'Billing QA 2','LONG','ZONE_PHASE',v_org,NULL,false),
    (v_t3,'Billing QA 3','LONG','ZONE_PHASE',v_org,NULL,false),
    (v_t4,'Billing QA 4','LONG','ZONE_PHASE',v_org,NULL,false);
  v_tournaments := jsonb_build_array(
    jsonb_build_object('tournament_id',v_t1,'amount_ars',50000,'tournament_name','QA 1','club_name','QA','billable_units',12,'tournament_status','ZONE_PHASE'),
    jsonb_build_object('tournament_id',v_t2,'amount_ars',70000,'tournament_name','QA 2','club_name','QA','billable_units',20,'tournament_status','ZONE_PHASE'));
  v_installments := '[{"installment_number":1,"amount_ars":60100},{"installment_number":2,"amount_ars":60100}]';
  v_c := public.create_billing_collection_monthly(v_org,NULL,'QA',120200,100,v_tournaments,v_installments,v_user,'2091-12-01');
  SELECT id INTO v_i1 FROM public.billing_collection_installments WHERE collection_id=v_c AND installment_number=1;
  SELECT id INTO v_i2 FROM public.billing_collection_installments WHERE collection_id=v_c AND installment_number=2;
  IF (SELECT billing_month FROM public.billing_collection_installments WHERE id=v_i2) <> '2092-01-01'::date
      OR EXISTS (SELECT 1 FROM public.billing_collection_installments WHERE collection_id=v_c AND
        (organization_id<>v_org OR billing_account_key<>'tenant' OR maintenance_amount_ars<>100 OR billing_month_assigned_by<>v_user)) THEN
    RAISE EXCEPTION 'Monthly schedule or tenant metadata incorrect';
  END IF;
  BEGIN
    PERFORM public.create_billing_collection_monthly(v_other_org,NULL,'QA',120200,100,v_tournaments,v_installments,v_user,'2091-12-01');
    RAISE EXCEPTION 'TPE monthly collection unexpectedly allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Los cobros mensuales solo están disponibles para FV' THEN RAISE; END IF; END;
  UPDATE public.tenant_billing_settings SET billing_model='FV_LEAGUE' WHERE organization_id=v_other_org;
  BEGIN
    PERFORM public.create_billing_collection_monthly(v_other_org,NULL,'QA',120200,100,v_tournaments,v_installments,v_user,'2091-12-01');
    RAISE EXCEPTION 'Cross tenant tournament unexpectedly allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Los torneos no están disponibles para este tenant' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.create_billing_collection_monthly(v_org,NULL,'QA',120200,100,v_tournaments,
      '[{"installment_number":1,"amount_ars":60100},{"installment_number":1,"amount_ars":60100}]',v_user,'2091-12-01');
    RAISE EXCEPTION 'Duplicate installment numbering allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Las cuotas deben ser consecutivas y cubrir su mantenimiento' THEN RAISE; END IF; END;

  -- A different tournament cannot generate another maintenance for the same account/month.
  v_tournaments := jsonb_build_array(jsonb_build_object('tournament_id',v_t3,'amount_ars',100000,
    'tournament_name','QA 3','club_name','QA','billable_units',20,'tournament_status','ZONE_PHASE'));
  BEGIN
    PERFORM public.create_billing_collection_monthly(v_org,NULL,'QA',100100,100,v_tournaments,
      '[{"installment_number":1,"amount_ars":100100}]',v_user,'2091-12-01');
    RAISE EXCEPTION 'Duplicate monthly maintenance allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.billing_collection_tournaments WHERE tournament_id=v_t3) THEN
    RAISE EXCEPTION 'Rejected collection leaked a tournament association';
  END IF;
  v_other_c := public.create_billing_collection_monthly(v_org,NULL,'QA',100100,100,v_tournaments,
    '[{"installment_number":1,"amount_ars":100100}]',v_user,'2092-02-01');

  -- A quota without maintenance does not reserve a second maintenance for the month.
  PERFORM public.cancel_billing_collection(v_other_c,v_org);
  v_other_c := public.create_billing_collection_monthly(v_org,NULL,'QA no maintenance',100000,0,v_tournaments,
    '[{"installment_number":1,"amount_ars":100000}]',v_user,'2091-12-01');
  PERFORM public.cancel_billing_collection(v_other_c,v_org);
  BEGIN
    PERFORM public.create_billing_collection_monthly(v_org,NULL,'QA invalid month',100100,100,v_tournaments,
      '[{"installment_number":1,"amount_ars":100100}]',v_user,'2092-02-02');
    RAISE EXCEPTION 'Non-month period allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Mes de facturación inválido' THEN RAISE; END IF; END;
  v_other_c := public.create_billing_collection_monthly(v_org,NULL,'QA',100100,100,v_tournaments,
    '[{"installment_number":1,"amount_ars":100100}]',v_user,'2092-02-01');

  -- Original RPC remains usable. Historical periods are explicitly assigned without recreating payments.
  v_tournaments := jsonb_build_array(jsonb_build_object('tournament_id',v_t4,'amount_ars',100000,
    'tournament_name','QA 4','club_name','QA','billable_units',20,'tournament_status','ZONE_PHASE'));
  v_legacy := public.create_billing_collection(v_org,NULL,'QA legacy',100100,50,v_tournaments,
    '[{"installment_number":1,"amount_ars":50050},{"installment_number":2,"amount_ars":50050}]',v_user);
  IF EXISTS (SELECT 1 FROM public.billing_collection_installments WHERE collection_id=v_legacy AND
      (maintenance_amount_ars<>50 OR billing_month IS NOT NULL OR organization_id<>v_org)) THEN
    RAISE EXCEPTION 'Legacy RPC snapshot changed';
  END IF;
  SELECT id INTO v_i1 FROM public.billing_collection_installments WHERE collection_id=v_legacy AND installment_number=1;
  SELECT id INTO v_i2 FROM public.billing_collection_installments WHERE collection_id=v_legacy AND installment_number=2;
  PERFORM public.register_billing_installment_payment(v_i1,50050,'QA','',v_user);
  PERFORM public.assign_billing_installment_month(v_i1,v_org,'2092-03-01',v_user);
  SELECT billing_month_assigned_at INTO v_original_audit FROM public.billing_collection_installments WHERE id=v_i1;
  PERFORM public.assign_billing_installment_month(v_i1,v_org,'2092-03-01',v_user);
  IF (SELECT billing_month_assigned_at FROM public.billing_collection_installments WHERE id=v_i1) IS DISTINCT FROM v_original_audit THEN
    RAISE EXCEPTION 'Idempotent month assignment changed audit';
  END IF;
  BEGIN
    PERFORM public.assign_billing_installment_month(v_i2,v_other_org,'2092-04-01',v_user);
    RAISE EXCEPTION 'Cross tenant period assignment allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'Cuota no encontrada para este tenant' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.assign_billing_installment_month(v_i2,v_org,'2092-03-01',v_user);
    RAISE EXCEPTION 'Duplicate legacy month allowed';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  PERFORM public.assign_billing_installment_month(v_i2,v_org,'2092-04-01',v_user);
  BEGIN
    PERFORM public.assign_billing_installment_month(v_i1,v_org,'2092-05-01',v_user);
    RAISE EXCEPTION 'Assigned period unexpectedly mutable';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'El mes facturado ya fue asignado; requiere revisión administrativa' THEN RAISE; END IF; END;
  BEGIN
    UPDATE public.billing_collection_installments SET maintenance_amount_ars=0 WHERE id=v_i2;
    RAISE EXCEPTION 'Original amounts unexpectedly mutable';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'No se pueden modificar los importes originales de una cuota' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.register_billing_installment_payment(v_i1,50050,'QA','',v_user);
    RAISE EXCEPTION 'Duplicate payment allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'La cuota ya fue abonada' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.register_billing_installment_payment(v_i2,1,'QA','',v_user);
    RAISE EXCEPTION 'Wrong amount allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'El pago debe coincidir con el importe completo de la cuota' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.cancel_billing_collection(v_legacy,v_org);
    RAISE EXCEPTION 'Paid collection cancellation allowed';
  EXCEPTION WHEN raise_exception THEN IF SQLERRM <> 'No se puede cancelar un cobro con pagos registrados' THEN RAISE; END IF; END;
  PERFORM public.register_billing_installment_payment(v_i2,50050,'QA','',v_user);
  IF NOT EXISTS (SELECT 1 FROM public.billing_collections WHERE id=v_legacy AND status='PAID' AND amount_paid_ars=100100 AND balance_ars=0) THEN
    RAISE EXCEPTION 'Final collection totals incorrect';
  END IF;
  IF has_table_privilege('authenticated','public.billing_collection_installments','SELECT')
    OR has_function_privilege('authenticated','public.create_billing_collection_monthly(uuid,uuid,text,integer,integer,jsonb,jsonb,uuid,date)','EXECUTE')
    OR has_function_privilege('anon','public.assign_billing_installment_month(uuid,uuid,date,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Billing privileges leaked';
  END IF;
  RAISE NOTICE 'Monthly maintenance SQL integration checks passed';
END;
$test$;
