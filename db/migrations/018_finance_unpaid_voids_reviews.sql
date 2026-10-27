-- Purchase payment state, void lock order, and exception review.
-- Successful settlement, void, and review bump finance.view_versions through finish_purchase_mutation.
-- Calendar dates use Europe/Oslo. Settlement does not change recorded amounts or commitments.

begin;

create or replace function finance.purchase_has_unsettled_obligation(p_purchase_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, finance
as $fn$
  select exists (
    select 1
    from finance.purchases p
    where p.id = p_purchase_id
      and p.status = 'registered'
      and (
        exists (
          select 1
          from finance.invoice_obligations i
          where i.purchase_id = p.id
            and i.paid = false
        )
        or exists (
          select 1
          from finance.outlay_reimbursements o
          where o.purchase_id = p.id
            and o.paid = false
        )
      )
  );
$fn$;

create or replace function finance.apply_purchase_settlement(
  p_actor uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_action text,
  p_purchase_id uuid,
  p_paid_on text,
  p_expected_revision integer
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
declare
  replay jsonb;
  purchase_row finance.purchases%rowtype;
  invoice_row finance.invoice_obligations%rowtype;
  outlay_row finance.outlay_reimbursements%rowtype;
  saved jsonb;
  v_constraint text;
  paid_date date;
  marking boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_request_id::text, 0));
  replay := finance.begin_purchase_mutation(p_actor, p_request_id, p_action, p_payload_hash, 'paymentsVoidReview');
  if replay is not null then
    return replay;
  end if;
  if p_action not in ('markInvoicePaid', 'unmarkInvoicePaid', 'markRefundPaid', 'unmarkRefundPaid') then
    raise exception 'FINANCE|invalid|Unknown request.';
  end if;
  marking := p_action in ('markInvoicePaid', 'markRefundPaid');
  if marking then
    if p_paid_on is null or p_paid_on !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
      raise exception 'FINANCE|invalid|Enter a valid payment date.|paidOn';
    end if;
    begin
      paid_date := to_date(p_paid_on, 'YYYY-MM-DD');
      if to_char(paid_date, 'YYYY-MM-DD') <> p_paid_on then
        raise exception 'FINANCE|invalid|Enter a valid payment date.|paidOn';
      end if;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        raise exception 'FINANCE|invalid|Enter a valid payment date.|paidOn';
    end;
    if paid_date > (clock_timestamp() at time zone 'Europe/Oslo')::date then
      raise exception 'FINANCE|invalid|Payment date cannot be after today.|paidOn';
    end if;
  end if;
  select * into purchase_row from finance.purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'FINANCE|not_found|Purchase was not found.';
  end if;
  if p_expected_revision is null or purchase_row.revision <> p_expected_revision then
    raise exception 'FINANCE|stale|This record changed before it could be saved. Review the latest values and try again.';
  end if;
  if purchase_row.status <> 'registered' then
    raise exception 'FINANCE|conflict|Only a registered purchase can be updated.';
  end if;
  if p_action in ('markInvoicePaid', 'unmarkInvoicePaid') then
    select * into invoice_row from finance.invoice_obligations where purchase_id = p_purchase_id for update;
    if not found then
      raise exception 'FINANCE|invalid|This purchase has no invoice obligation.';
    end if;
    if marking and invoice_row.paid then
      raise exception 'FINANCE|conflict|This invoice is already marked paid.';
    end if;
    if not marking and not invoice_row.paid then
      raise exception 'FINANCE|conflict|This invoice is not marked paid.';
    end if;
    update finance.invoice_obligations
      set paid = marking,
          paid_on = case when marking then paid_date else null end,
          paid_by_member_id = case when marking then p_actor else null end
    where purchase_id = p_purchase_id;
    perform finance.append_audit(p_actor, 'purchase', p_purchase_id::text, 'invoice_paid', case when invoice_row.paid then 'true' else 'false' end, case when marking then 'true' else 'false' end, null);
    perform finance.append_audit(p_actor, 'purchase', p_purchase_id::text, 'invoice_paid_on', invoice_row.paid_on::text, case when marking then p_paid_on else null end, null);
  else
    select * into outlay_row from finance.outlay_reimbursements where purchase_id = p_purchase_id for update;
    if not found then
      raise exception 'FINANCE|invalid|This purchase has no outlay reimbursement.';
    end if;
    if marking and outlay_row.paid then
      raise exception 'FINANCE|conflict|This outlay is already marked reimbursed.';
    end if;
    if not marking and not outlay_row.paid then
      raise exception 'FINANCE|conflict|This outlay is not marked reimbursed.';
    end if;
    update finance.outlay_reimbursements
      set paid = marking,
          paid_on = case when marking then paid_date else null end,
          paid_by_member_id = case when marking then p_actor else null end
    where purchase_id = p_purchase_id;
    perform finance.append_audit(p_actor, 'purchase', p_purchase_id::text, 'refund_paid', case when outlay_row.paid then 'true' else 'false' end, case when marking then 'true' else 'false' end, null);
    perform finance.append_audit(p_actor, 'purchase', p_purchase_id::text, 'refund_paid_on', outlay_row.paid_on::text, case when marking then p_paid_on else null end, null);
  end if;
  update finance.purchases
    set revision = revision + 1
  where id = p_purchase_id;
  return finance.finish_purchase_mutation(p_actor, p_request_id, p_action, p_payload_hash, p_purchase_id, '[]'::jsonb);
exception
  when unique_violation then
    get stacked diagnostics v_constraint = CONSTRAINT_NAME;
    if v_constraint = 'idempotency_keys_pkey' then
      saved := finance.replay_purchase_mutation(p_actor, p_request_id, p_action, p_payload_hash);
      if saved is not null then
        return saved;
      end if;
    end if;
    raise;
end;
$fn$;

create or replace function finance.review_purchase_exception(
  p_actor uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_review_id uuid,
  p_reason text,
  p_expected_revision integer
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
declare
  replay jsonb;
  review_row finance.exception_reviews%rowtype;
  saved jsonb;
  v_constraint text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_request_id::text, 0));
  replay := finance.begin_purchase_mutation(p_actor, p_request_id, 'reviewException', p_payload_hash, 'paymentsVoidReview');
  if replay is not null then
    return replay;
  end if;
  if p_expected_revision is not null and p_expected_revision < 0 then
    raise exception 'FINANCE|invalid|A valid revision is required.';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'FINANCE|invalid|Enter a review reason.|reason';
  end if;
  select * into review_row from finance.exception_reviews where id = p_review_id for update;
  if not found then
    raise exception 'FINANCE|not_found|Exception was not found.';
  end if;
  if review_row.review_status = 'reviewed' then
    raise exception 'FINANCE|conflict|This exception is already reviewed.'
      using detail = jsonb_build_object(
        'reviewer', review_row.actor_member_id,
        'time', review_row.reviewed_at,
        'reason', review_row.reason
      )::text;
  end if;
  update finance.exception_reviews
    set review_status = 'reviewed',
        reason = btrim(p_reason),
        actor_member_id = p_actor,
        reviewed_at = clock_timestamp()
  where id = p_review_id;
  perform finance.append_audit(p_actor, 'exception_review', p_review_id::text, 'review_status', 'open', 'reviewed', btrim(p_reason));
  return finance.finish_purchase_mutation(p_actor, p_request_id, 'reviewException', p_payload_hash, p_review_id, '[]'::jsonb);
exception
  when unique_violation then
    get stacked diagnostics v_constraint = CONSTRAINT_NAME;
    if v_constraint = 'idempotency_keys_pkey' then
      saved := finance.replay_purchase_mutation(p_actor, p_request_id, 'reviewException', p_payload_hash);
      if saved is not null then
        return saved;
      end if;
    end if;
    raise;
end;
$fn$;

drop function if exists finance.void_registered_purchase(uuid, uuid, text, uuid, text);

create function finance.void_registered_purchase(
  p_actor uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_purchase_id uuid,
  p_reason text,
  p_expected_revision integer default null
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
declare
  replay jsonb;
  purchase_row finance.purchases%rowtype;
  linked_request_id uuid;
  locked_item uuid;
  saved jsonb;
  v_constraint text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_request_id::text, 0));
  replay := finance.begin_purchase_mutation(p_actor, p_request_id, 'voidPurchase', p_payload_hash, 'paymentsVoidReview');
  if replay is not null then
    return replay;
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'FINANCE|invalid|Enter a void reason.|reason';
  end if;
  select p.request_id
    into linked_request_id
  from finance.purchases p
  where p.id = p_purchase_id;
  if not found then
    raise exception 'FINANCE|not_found|Purchase was not found.';
  end if;
  if linked_request_id is not null then
    perform 1 from finance.requests where id = linked_request_id for update;
  end if;
  for locked_item in
    select i.id
    from finance.budget_items i
    where i.id in (
      select a.budget_item_id
      from finance.allocations a
      join finance.purchase_lines pl on pl.id = a.line_id
      where pl.purchase_id = p_purchase_id
      union
      select rl.budget_item_id
      from finance.request_lines rl
      join finance.request_revisions rev on rev.id = rl.revision_id
      join finance.requests r on r.id = rev.request_id
      where r.id = linked_request_id
    )
    order by i.id
    for share of i
  loop
    null;
  end loop;
  perform finance.lock_current_budget();
  select * into purchase_row from finance.purchases where id = p_purchase_id for update;
  if not found then
    raise exception 'FINANCE|not_found|Purchase was not found.';
  end if;
  if p_expected_revision is not null and purchase_row.revision <> p_expected_revision then
    raise exception 'FINANCE|stale|This record changed before it could be saved. Review the latest values and try again.';
  end if;
  if purchase_row.status <> 'registered' then
    raise exception 'FINANCE|conflict|Only a registered purchase can be voided.';
  end if;
  update finance.purchases
    set status = 'voided',
        void_reason = btrim(p_reason),
        voided_at = clock_timestamp(),
        voided_by_member_id = p_actor,
        revision = revision + 1
  where id = p_purchase_id;
  perform finance.append_audit(p_actor, 'purchase', p_purchase_id::text, 'voided', purchase_row.public_ref, btrim(p_reason), null);
  return finance.finish_purchase_mutation(p_actor, p_request_id, 'voidPurchase', p_payload_hash, p_purchase_id, '[]'::jsonb);
exception
  when unique_violation then
    get stacked diagnostics v_constraint = CONSTRAINT_NAME;
    if v_constraint = 'idempotency_keys_pkey' then
      saved := finance.replay_purchase_mutation(p_actor, p_request_id, 'voidPurchase', p_payload_hash);
      if saved is not null then
        return saved;
      end if;
    end if;
    raise;
end;
$fn$;


create or replace function finance.register_purchase(
  p_actor uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_body jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
declare
  replay jsonb;
  current_budget finance.budgets%rowtype;
  registered_purchase_id uuid := gen_random_uuid();
  purchase_ref text;
  purchase_ordinal bigint;
  registration_year integer;
  quota_count integer;
  line jsonb;
  line_index integer := 0;
  line_id uuid;
  line_ref text;
  alloc_ref text;
  doc_ref text;
  doc_index integer := 0;
  upload_id uuid;
  upload_row finance.uploads%rowtype;
  target_item_id uuid;
  line_system_id uuid;
  amount_ore bigint;
  quantity numeric;
  line_description text;
  unbudgeted boolean;
  total_ore bigint := 0;
  warnings jsonb := coalesce(p_body -> 'warnings', '[]'::jsonb);
  missing_approval boolean := coalesce((p_body ->> 'missingApproval')::boolean, false);
  threshold_ore bigint := coalesce((p_body ->> 'thresholdOre')::bigint, 0);
  payment_method text := p_body ->> 'paymentMethod';
  document_kind text := p_body ->> 'documentKind';
  invoice_due date := nullif(p_body ->> 'invoiceDueDate', '')::date;
  refund_account text := nullif(p_body ->> 'refundAccount', '');
  refund_phone text := nullif(p_body ->> 'refundPhone', '');
  link_request_id uuid := nullif(p_body ->> 'requestRecordId', '')::uuid;
  force_direct boolean := coalesce((p_body ->> 'forceDirect')::boolean, false);
  recovery_ctx jsonb := coalesce(p_body -> 'recoveryContext', 'null'::jsonb);
  request_line_id uuid;
  linked_request finance.requests%rowtype;
  request_line_rec record;
  approval_decided_at timestamptz;
  purchase_date date := (p_body ->> 'purchaseDate')::date;
  has_valid_link boolean := false;
  line_overrun boolean;
  fulfilled_after bigint;
  approved_line bigint;
  v_constraint text;
  saved jsonb;
  recipient record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_request_id::text, 0));
  replay := finance.begin_purchase_mutation(p_actor, p_request_id, 'registerPurchase', p_payload_hash, 'registerActual');
  if replay is not null then
    return replay;
  end if;

  if link_request_id is not null then
    linked_request := finance.lock_request_fulfillment(link_request_id);
  end if;

  for request_line_rec in
    select i.id, i.status
    from finance.budget_items i
    where i.id in (
        select (l ->> 'budgetItemId')::uuid
        from jsonb_array_elements(coalesce(p_body -> 'lines', '[]'::jsonb)) l
        where coalesce((l ->> 'unbudgeted')::boolean, false) is not true and nullif(l ->> 'budgetItemId', '') is not null
        union
        select rl.budget_item_id
        from jsonb_array_elements(coalesce(p_body -> 'lines', '[]'::jsonb)) l
        join finance.request_lines rl on rl.id = nullif(l ->> 'requestLineId', '')::uuid
        where nullif(l ->> 'requestLineId', '') is not null
        union
        select rl.budget_item_id
        from finance.request_lines rl
        where link_request_id is not null
          and rl.revision_id = linked_request.approved_revision_id
      )
      or (
        i.protected
        and i.budget_id = (select b.id from finance.budgets b join finance.seasons s on s.id = b.season_id join finance.settings st on st.setting_key = 'current_season' and s.code = st.setting_value #>> '{}')
        and i.system_id in (
          select (l ->> 'systemId')::uuid
          from jsonb_array_elements(coalesce(p_body -> 'lines', '[]'::jsonb)) l
          where coalesce((l ->> 'unbudgeted')::boolean, false)
        )
      )
    order by i.id
    for share of i
  loop
    if link_request_id is not null
      and linked_request.approved_revision_id is not null
      and exists (
        select 1
        from finance.request_lines rl
        where rl.revision_id = linked_request.approved_revision_id
          and rl.budget_item_id = request_line_rec.id
      )
      and request_line_rec.status = 'cancelled'
    then
      raise exception 'FINANCE|recover|A budget line on this approval was cancelled. Register the purchase directly and keep the request reference for Finance review.|requestRecordId';
    end if;
  end loop;

  current_budget := finance.lock_current_budget();

  select count(*)::integer into quota_count
  from finance.purchases
  where requester_member_id = p_actor
    and created_at > clock_timestamp() - interval '1 hour';
  if quota_count >= 20 then
    raise exception 'FINANCE|quota|You can save at most 20 purchases per hour. Try again later.';
  end if;
  if current_budget.status <> 'approved' then
    raise exception 'FINANCE|conflict|The season budget must be approved before registering purchases.';
  end if;

  registration_year := coalesce((p_body ->> 'registrationYear')::integer, extract(year from clock_timestamp())::integer);

  if jsonb_array_length(coalesce(p_body -> 'uploadIds', '[]'::jsonb)) < 1 then
    raise exception 'FINANCE|invalid|Add at least one supporting file.|files';
  end if;
  if jsonb_array_length(coalesce(p_body -> 'uploadIds', '[]'::jsonb)) > 15 then
    raise exception 'FINANCE|invalid|You can attach at most 15 files.|files';
  end if;
  if jsonb_array_length(coalesce(p_body -> 'lines', '[]'::jsonb)) < 1 then
    raise exception 'FINANCE|invalid|Add at least one purchase line.|lines';
  end if;

  for upload_id in
    select value::uuid
    from jsonb_array_elements_text(p_body -> 'uploadIds') as value
    order by 1
  loop
    select * into upload_row
    from finance.uploads
    where id = upload_id
    for update;
    if not found then
      raise exception 'FINANCE|invalid|Supporting file is missing or not finalized.|files';
    end if;
    if upload_row.member_id <> p_actor then
      raise exception 'FINANCE|denied|Supporting file belongs to another member.';
    end if;
    if upload_row.status <> 'finalized' or upload_row.final_key is null then
      raise exception 'FINANCE|invalid|Supporting file is missing or not finalized.|files';
    end if;
    if upload_row.purchase_id is not null then
      raise exception 'FINANCE|conflict|Supporting file is already linked to a purchase.';
    end if;
  end loop;

  if link_request_id is not null then
    if linked_request.requester_member_id <> p_actor then
      raise exception 'FINANCE|recover|This approval belongs to another member. Register the purchase directly and keep the request reference for Finance review.|requestRecordId';
    end if;
    if linked_request.season_id <> current_budget.season_id then
      raise exception 'FINANCE|recover|This approval is for another season. Register the purchase directly and keep the request reference for Finance review.|requestRecordId';
    end if;
    if linked_request.status <> 'approved' or linked_request.approved_revision_id is null then
      raise exception 'FINANCE|recover|This request is not an open approval. Register the purchase directly and keep the request reference for Finance review.|requestRecordId';
    end if;
    select d.decided_at into approval_decided_at
    from finance.request_decisions d
    where d.revision_id = linked_request.approved_revision_id;
  end if;

  select public_ref, ordinal into purchase_ref, purchase_ordinal
  from finance.issue_purchase_reference(p_actor, registration_year);

  insert into finance.purchases (
    id, season_id, requester_member_id, public_ref, status, buyer_name, supplier_name,
    payment_method, purchase_date, justification, document_kind, document_number,
    refund_account, refund_phone, request_id
  ) values (
    registered_purchase_id,
    current_budget.season_id,
    p_actor,
    purchase_ref,
    'registered',
    p_body ->> 'buyerName',
    p_body ->> 'supplierName',
    payment_method,
    purchase_date,
    p_body ->> 'justification',
    document_kind,
    nullif(p_body ->> 'documentNumber', ''),
    refund_account,
    refund_phone,
    case when link_request_id is not null and not force_direct then link_request_id else null end
  );

  for line in select value from jsonb_array_elements(p_body -> 'lines') as value
  loop
    line_index := line_index + 1;
    line_system_id := (line ->> 'systemId')::uuid;
    unbudgeted := coalesce((line ->> 'unbudgeted')::boolean, false);
    amount_ore := (line ->> 'amountOre')::bigint;
    quantity := (line ->> 'quantity')::numeric;
    line_description := line ->> 'description';
    request_line_id := nullif(line ->> 'requestLineId', '')::uuid;
    total_ore := total_ore + amount_ore;

    if unbudgeted then
      target_item_id := finance.ensure_unallocated_for_purchase(p_actor, current_budget.id, line_system_id);
    else
      target_item_id := (line ->> 'budgetItemId')::uuid;
      if not exists (
        select 1 from finance.budget_items i
        where i.id = target_item_id
          and i.budget_id = current_budget.id
          and i.system_id = line_system_id
          and i.status <> 'cancelled'
          and i.protected is not true
      ) then
        raise exception 'FINANCE|invalid|Choose a current budget item for this system.|budgetItemId';
      end if;
    end if;

    if request_line_id is not null and not force_direct then
      select rl.id, rl.budget_item_id, rl.approved_ore, rl.revision_id
        into request_line_rec
      from finance.request_lines rl
      where rl.id = request_line_id;
      if not found
        or link_request_id is null
        or request_line_rec.revision_id <> linked_request.approved_revision_id
        or request_line_rec.budget_item_id <> target_item_id
      then
        raise exception 'FINANCE|recover|This line does not match the open approval. Register the purchase directly and keep the request reference for Finance review.|requestLineId';
      end if;
      has_valid_link := true;
    elsif force_direct and recovery_ctx is not null and recovery_ctx <> 'null'::jsonb then
      request_line_id := null;
    end if;

    line_ref := purchase_ref || '-L' || line_index::text;
    insert into finance.purchase_lines (
      purchase_id, public_ref, system_id, budget_item_id, unbudgeted, request_line_id, description, quantity, amount_ore
    ) values (
      registered_purchase_id,
      line_ref,
      line_system_id,
      case when unbudgeted then null else target_item_id end,
      unbudgeted,
      case when force_direct then null else request_line_id end,
      line_description,
      quantity,
      amount_ore
    ) returning id into line_id;

    alloc_ref := line_ref || '-A1';
    insert into finance.allocations (line_id, budget_item_id, public_ref, amount_ore)
    values (line_id, target_item_id, alloc_ref, amount_ore);

    if request_line_id is not null and not force_direct then
      approved_line := coalesce(request_line_rec.approved_ore, 0);
      fulfilled_after := finance.request_line_linked_actual_ore(request_line_id);
      line_overrun := fulfilled_after > approved_line;
      if line_overrun then
        perform finance.record_purchase_exception(
          registered_purchase_id,
          'overrun',
          jsonb_build_object(
            'requestId', link_request_id,
            'requestLineId', request_line_id,
            'approvedOre', approved_line::text,
            'fulfilledOre', fulfilled_after::text,
            'overrunOre', (fulfilled_after - approved_line)::text,
            'publicRef', purchase_ref
          )
        );
      end if;
    end if;
  end loop;

  if has_valid_link
    and approval_decided_at is not null
    and purchase_date < (approval_decided_at at time zone 'Europe/Oslo')::date
  then
    perform finance.record_purchase_exception(
      registered_purchase_id,
      'dated_before_approval',
      jsonb_build_object(
        'requestId', link_request_id,
        'purchaseDate', purchase_date::text,
        'approvalDecidedAt', approval_decided_at::text,
        'publicRef', purchase_ref
      )
    );
  end if;

  if force_direct and recovery_ctx is not null and recovery_ctx <> 'null'::jsonb then
    perform finance.record_purchase_exception(
      registered_purchase_id,
      'line_mismatch',
      jsonb_build_object(
        'requestId', recovery_ctx ->> 'requestRecordId',
        'requestLineId', recovery_ctx ->> 'requestLineId',
        'publicRef', purchase_ref,
        'recovery', 'direct_registration'
      )
    );
  end if;

  if document_kind = 'invoice' and invoice_due is null then
    raise exception 'FINANCE|invalid|Enter an invoice due date.|invoiceDueDate';
  end if;
  if document_kind = 'invoice' or payment_method = 'invoice' then
    insert into finance.invoice_obligations (purchase_id, due_date)
    values (registered_purchase_id, invoice_due);
  end if;
  if payment_method = 'outlay' then
    insert into finance.outlay_reimbursements (purchase_id) values (registered_purchase_id);
  end if;

  for upload_id in
    select value::uuid
    from jsonb_array_elements_text(p_body -> 'uploadIds') as value
  loop
    doc_index := doc_index + 1;
    select * into upload_row from finance.uploads where id = upload_id;
    doc_ref := purchase_ref || '-D' || doc_index::text;
    insert into finance.documents (
      purchase_id, public_ref, kind, document_number, document_date, original_name,
      content_type, byte_size, content_sha256, storage_key
    ) values (
      registered_purchase_id,
      doc_ref,
      document_kind,
      nullif(p_body ->> 'documentNumber', ''),
      purchase_date,
      upload_row.original_name,
      upload_row.content_type,
      upload_row.byte_size,
      upload_row.content_sha256,
      upload_row.final_key
    );
    update finance.uploads set purchase_id = registered_purchase_id where id = upload_id;
  end loop;

  if has_valid_link then
    missing_approval := false;
  end if;

  if missing_approval and threshold_ore > 0 and total_ore > threshold_ore then
    perform finance.record_purchase_exception(
      registered_purchase_id,
      'missing_approval',
      jsonb_build_object(
        'totalOre', total_ore::text,
        'thresholdOre', threshold_ore::text,
        'publicRef', purchase_ref
      )
    );
  end if;

  perform finance.append_audit(p_actor, 'purchase', registered_purchase_id::text, 'created', null, purchase_ref, null);

  for recipient in
    select distinct g.member_id
    from finance.member_grants g
    where g.active
      and g.profile in ('finance', 'head_of_finance')
  loop
    insert into finance.outbox (event_type, entity, entity_id, recipient_member_id, dedupe_key, payload)
    values (
      'purchase_registered',
      'purchase',
      registered_purchase_id,
      recipient.member_id,
      'purchase_registered:' || registered_purchase_id::text || ':' || recipient.member_id::text,
      jsonb_build_object(
        'publicRef', purchase_ref,
        'supplierName', p_body ->> 'supplierName',
        'totalOre', total_ore::text
      )
    )
    on conflict (dedupe_key) do nothing;
  end loop;

  return finance.finish_purchase_mutation(
    p_actor, p_request_id, 'registerPurchase', p_payload_hash, registered_purchase_id, warnings
  );
exception
  when unique_violation then
    get stacked diagnostics v_constraint = CONSTRAINT_NAME;
    if v_constraint = 'idempotency_keys_pkey' then
      saved := finance.replay_purchase_mutation(p_actor, p_request_id, 'registerPurchase', p_payload_hash);
      if saved is not null then
        return saved;
      end if;
    end if;
    if v_constraint = 'purchases_public_ref_key' then
      saved := finance.replay_purchase_mutation(p_actor, p_request_id, 'registerPurchase', p_payload_hash);
      if saved is not null then
        return saved;
      end if;
    end if;
    raise;
end;
$fn$;
revoke all on function finance.purchase_has_unsettled_obligation(uuid) from public;
revoke all on function finance.apply_purchase_settlement(uuid, uuid, text, text, uuid, text, integer) from public;
revoke all on function finance.review_purchase_exception(uuid, uuid, text, uuid, text, integer) from public;
revoke all on function finance.void_registered_purchase(uuid, uuid, text, uuid, text, integer) from public;
revoke all on function finance.register_purchase(uuid, uuid, text, jsonb) from public;

grant execute on function finance.purchase_has_unsettled_obligation(uuid) to current_user;
grant execute on function finance.apply_purchase_settlement(uuid, uuid, text, text, uuid, text, integer) to current_user;
grant execute on function finance.review_purchase_exception(uuid, uuid, text, uuid, text, integer) to current_user;
grant execute on function finance.void_registered_purchase(uuid, uuid, text, uuid, text, integer) to current_user;
grant execute on function finance.register_purchase(uuid, uuid, text, jsonb) to current_user;

commit;
