-- Direct purchase registration, private uploads, quota, and references. Additive.
-- Does not modify budget mutation helpers from 012.
-- Each successful registration bumps finance.view_versions in the same transaction.

begin;

create or replace function finance.begin_purchase_mutation(
  p_actor uuid,
  p_request_id uuid,
  p_action text,
  p_payload_hash text,
  p_capability text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
declare
  flags jsonb;
  existing finance.idempotency_keys%rowtype;
begin
  if p_actor is null or not exists (select 1 from identity.members where id = p_actor) then
    raise exception 'FINANCE|denied|A verified Helix member account is required.';
  end if;
  if p_request_id is null or p_payload_hash is null or char_length(p_payload_hash) < 32 then
    raise exception 'FINANCE|invalid|A valid request ID is required.';
  end if;
  flags := finance.capability_flags(p_actor);
  if coalesce((flags ->> p_capability)::boolean, false) is not true then
    raise exception 'FINANCE|denied|Finance access is required.';
  end if;
  select * into existing
  from finance.idempotency_keys
  where member_id = p_actor and request_id = p_request_id
  for update;
  if found then
    if existing.action <> p_action or existing.payload_hash <> p_payload_hash or existing.response is null then
      raise exception 'FINANCE|conflict|This request ID was already used for a different change.';
    end if;
    return existing.response;
  end if;
  return null;
end;
$fn$;

create or replace function finance.replay_purchase_mutation(
  p_actor uuid,
  p_request_id uuid,
  p_action text,
  p_payload_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  existing finance.idempotency_keys%rowtype;
begin
  select * into existing
  from finance.idempotency_keys
  where member_id = p_actor and request_id = p_request_id;
  if not found or existing.response is null then
    return null;
  end if;
  if existing.action = p_action and existing.payload_hash = p_payload_hash then
    return existing.response;
  end if;
  raise exception 'FINANCE|conflict|This request ID was already used for a different change.';
end;
$fn$;

create or replace function finance.finish_purchase_mutation(
  p_actor uuid,
  p_request_id uuid,
  p_action text,
  p_payload_hash text,
  p_entity_id uuid,
  p_warnings jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  next_version bigint;
  response jsonb;
begin
  next_version := finance.bump_view_version();
  response := jsonb_build_object(
    'ok', true,
    'viewVersion', next_version,
    'id', p_entity_id,
    'warnings', coalesce(p_warnings, '[]'::jsonb),
    'errors', '[]'::jsonb
  );
  insert into finance.idempotency_keys (member_id, request_id, action, payload_hash, response)
  values (p_actor, p_request_id, p_action, p_payload_hash, response);
  return response;
end;
$fn$;

create or replace function finance.store_purchase_result(
  p_actor uuid,
  p_request_id uuid,
  p_action text,
  p_payload_hash text,
  p_entity_id uuid,
  p_warnings jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  response jsonb;
begin
  response := jsonb_build_object(
    'ok', true,
    'viewVersion', (select version from finance.view_versions where singleton),
    'id', p_entity_id,
    'warnings', coalesce(p_warnings, '[]'::jsonb),
    'errors', '[]'::jsonb
  );
  insert into finance.idempotency_keys (member_id, request_id, action, payload_hash, response)
  values (p_actor, p_request_id, p_action, p_payload_hash, response);
  return response;
end;
$fn$;

create or replace function finance.issue_purchase_reference(p_actor uuid, p_year integer)
returns table (public_ref text, ordinal bigint)
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  key_value text;
  configured bigint;
  issued bigint;
  next_value bigint;
begin
  if p_year is null or p_year < 2000 or p_year > 2200 then
    raise exception 'FINANCE|invalid|Enter a valid reference.';
  end if;
  key_value := 'purchase:' || p_year::text;
  insert into finance.reference_counters (counter_key, calendar_year, configured_next, last_issued, updated_by_member_id)
  values (key_value, p_year, 1, null, p_actor)
  on conflict (counter_key) do nothing;

  select configured_next, last_issued
    into configured, issued
  from finance.reference_counters
  where counter_key = key_value
  for update;

  if not found then
    raise exception 'FINANCE|conflict|Purchase reference counter is unavailable.';
  end if;

  next_value := greatest(coalesce(issued, 0) + 1, configured);
  update finance.reference_counters
    set last_issued = next_value,
        configured_next = next_value + 1,
        updated_at = clock_timestamp(),
        updated_by_member_id = p_actor
    where counter_key = key_value;

  public_ref := p_year::text || '-' || lpad(next_value::text, 4, '0');
  ordinal := next_value;
  return next;
end;
$fn$;

create or replace function finance.ensure_unallocated_for_purchase(
  p_actor uuid,
  p_budget_id uuid,
  p_system_id uuid
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  existing_id uuid;
  season_code text;
  system_code text;
  system_active boolean;
  item_ref text;
  item_id uuid;
begin
  select code, active into system_code, system_active
  from finance.systems
  where id = p_system_id
  for share;
  if not found or system_active is not true then
    raise exception 'FINANCE|invalid|Choose an active system.|systemId';
  end if;
  select id into existing_id
  from finance.budget_items
  where budget_id = p_budget_id and system_id = p_system_id and protected;
  if found then
    return existing_id;
  end if;
  select code into season_code from finance.seasons s join finance.budgets b on b.season_id = s.id where b.id = p_budget_id;
  item_ref := 'BI-' || season_code || '-' || substring(system_code from 5) || '-UNALLOC';
  begin
    insert into finance.budget_items (
      budget_id, system_id, public_ref, description, category, planned_ore, priority,
      reuse_status, status, protected, created_by_member_id, updated_by_member_id
    ) values (
      p_budget_id, p_system_id, item_ref, 'Unallocated', 'other', 0, 'P4',
      'new', 'planned', true, p_actor, p_actor
    )
    returning id into item_id;
    perform finance.append_audit(p_actor, 'budget_item', item_id::text, 'created', null, item_ref, null);
    return item_id;
  exception when unique_violation then
    select id into existing_id
    from finance.budget_items
    where budget_id = p_budget_id and system_id = p_system_id and protected;
    return existing_id;
  end;
end;
$fn$;

create or replace function finance.item_registered_actual_ore(p_item_id uuid)
returns bigint
language sql
stable
security invoker
set search_path = pg_catalog, finance
as $fn$
  select coalesce(sum(a.amount_ore), 0)::bigint
  from finance.allocations a
  join finance.purchase_lines l on l.id = a.line_id
  join finance.purchases p on p.id = l.purchase_id
  where a.budget_item_id = p_item_id
    and p.status = 'registered';
$fn$;

create or replace function finance.create_upload_authorization(
  p_actor uuid,
  p_upload_id uuid,
  p_staging_key text,
  p_original_name text,
  p_content_type text,
  p_byte_size bigint,
  p_expires_at timestamptz
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
begin
  if p_byte_size is null or p_byte_size <= 0 or p_byte_size > 10485760 then
    raise exception 'FINANCE|invalid|Each file must be 10 MB or smaller.|files';
  end if;
  insert into finance.uploads (
    id, member_id, staging_key, status, byte_size, content_type, original_name, expires_at
  ) values (
    p_upload_id, p_actor, p_staging_key, 'pending', p_byte_size, p_content_type, p_original_name, p_expires_at
  );
  return p_upload_id;
end;
$fn$;

create or replace function finance.complete_upload_finalize(
  p_actor uuid,
  p_upload_id uuid,
  p_final_key text,
  p_content_sha256 text,
  p_byte_size bigint,
  p_content_type text
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  row finance.uploads%rowtype;
begin
  select * into row
  from finance.uploads
  where id = p_upload_id
  for update;
  if not found then
    raise exception 'FINANCE|not_found|Upload not found.';
  end if;
  if row.member_id <> p_actor then
    raise exception 'FINANCE|denied|This upload belongs to another member.';
  end if;
  if row.status <> 'pending' then
    raise exception 'FINANCE|conflict|This upload has already been finalized.';
  end if;
  if row.byte_size is distinct from p_byte_size then
    raise exception 'FINANCE|invalid|Uploaded file size does not match.|files';
  end if;
  update finance.uploads
    set status = 'finalized',
        final_key = p_final_key,
        content_sha256 = p_content_sha256,
        content_type = p_content_type,
        byte_size = p_byte_size
  where id = p_upload_id;
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
  v_constraint text;
  saved jsonb;
  recipient record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_request_id::text, 0));
  replay := finance.begin_purchase_mutation(p_actor, p_request_id, 'registerPurchase', p_payload_hash, 'registerActual');
  if replay is not null then
    return replay;
  end if;

  perform 1
  from finance.budget_items i
  where i.id in (
      select (l ->> 'budgetItemId')::uuid
      from jsonb_array_elements(coalesce(p_body -> 'lines', '[]'::jsonb)) l
      where coalesce((l ->> 'unbudgeted')::boolean, false) is not true and nullif(l ->> 'budgetItemId', '') is not null
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
  for key share of i;

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

  select public_ref, ordinal into purchase_ref, purchase_ordinal
  from finance.issue_purchase_reference(p_actor, registration_year);

  insert into finance.purchases (
    id, season_id, requester_member_id, public_ref, status, buyer_name, supplier_name,
    payment_method, purchase_date, justification, document_kind, document_number,
    refund_account, refund_phone
  ) values (
    registered_purchase_id,
    current_budget.season_id,
    p_actor,
    purchase_ref,
    'registered',
    p_body ->> 'buyerName',
    p_body ->> 'supplierName',
    payment_method,
    (p_body ->> 'purchaseDate')::date,
    p_body ->> 'justification',
    document_kind,
    nullif(p_body ->> 'documentNumber', ''),
    refund_account,
    refund_phone
  );

  for line in select value from jsonb_array_elements(p_body -> 'lines') as value
  loop
    line_index := line_index + 1;
    line_system_id := (line ->> 'systemId')::uuid;
    unbudgeted := coalesce((line ->> 'unbudgeted')::boolean, false);
    amount_ore := (line ->> 'amountOre')::bigint;
    quantity := (line ->> 'quantity')::numeric;
    line_description := line ->> 'description';
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

    line_ref := purchase_ref || '-L' || line_index::text;
    insert into finance.purchase_lines (
      purchase_id, public_ref, system_id, budget_item_id, unbudgeted, description, quantity, amount_ore
    ) values (
      registered_purchase_id,
      line_ref,
      line_system_id,
      case when unbudgeted then null else target_item_id end,
      unbudgeted,
      line_description,
      quantity,
      amount_ore
    ) returning id into line_id;

    alloc_ref := line_ref || '-A1';
    insert into finance.allocations (line_id, budget_item_id, public_ref, amount_ore)
    values (line_id, target_item_id, alloc_ref, amount_ore);
  end loop;

  if payment_method = 'invoice' then
    insert into finance.invoice_obligations (purchase_id, due_date)
    values (registered_purchase_id, invoice_due);
  elsif payment_method = 'outlay' then
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
      (p_body ->> 'purchaseDate')::date,
      upload_row.original_name,
      upload_row.content_type,
      upload_row.byte_size,
      upload_row.content_sha256,
      upload_row.final_key
    );
    update finance.uploads set purchase_id = registered_purchase_id where id = upload_id;
  end loop;

  if missing_approval and threshold_ore > 0 and total_ore > threshold_ore then
    insert into finance.exception_reviews (purchase_id, kind, facts)
    values (
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

revoke all on function finance.begin_purchase_mutation(uuid, uuid, text, text, text) from public;
revoke all on function finance.replay_purchase_mutation(uuid, uuid, text, text) from public;
revoke all on function finance.finish_purchase_mutation(uuid, uuid, text, text, uuid, jsonb) from public;
revoke all on function finance.store_purchase_result(uuid, uuid, text, text, uuid, jsonb) from public;
revoke all on function finance.issue_purchase_reference(uuid, integer) from public;
revoke all on function finance.ensure_unallocated_for_purchase(uuid, uuid, uuid) from public;
revoke all on function finance.item_registered_actual_ore(uuid) from public;
revoke all on function finance.create_upload_authorization(uuid, uuid, text, text, text, bigint, timestamptz) from public;
revoke all on function finance.complete_upload_finalize(uuid, uuid, text, text, bigint, text) from public;
revoke all on function finance.register_purchase(uuid, uuid, text, jsonb) from public;

grant execute on function finance.begin_purchase_mutation(uuid, uuid, text, text, text) to current_user;
grant execute on function finance.replay_purchase_mutation(uuid, uuid, text, text) to current_user;
grant execute on function finance.finish_purchase_mutation(uuid, uuid, text, text, uuid, jsonb) to current_user;
grant execute on function finance.store_purchase_result(uuid, uuid, text, text, uuid, jsonb) to current_user;
grant execute on function finance.issue_purchase_reference(uuid, integer) to current_user;
grant execute on function finance.ensure_unallocated_for_purchase(uuid, uuid, uuid) to current_user;
grant execute on function finance.item_registered_actual_ore(uuid) to current_user;
grant execute on function finance.create_upload_authorization(uuid, uuid, text, text, text, bigint, timestamptz) to current_user;
grant execute on function finance.complete_upload_finalize(uuid, uuid, text, text, bigint, text) to current_user;
grant execute on function finance.register_purchase(uuid, uuid, text, jsonb) to current_user;

commit;
