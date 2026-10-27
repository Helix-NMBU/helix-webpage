-- Purchase requests and Head of Finance decisions. Additive only.
-- Lock order (never invert budget writers such as edit_budget_item, which lock budget_items FOR UPDATE then budgets FOR UPDATE):
--   1. finance.requests FOR UPDATE when the row exists
--   2. referenced finance.budget_items FOR SHARE (or FOR KEY SHARE), ordered by budget_item id
--   3. finance.budgets FOR SHARE for the current season approved budget
-- New drafts without a request row: (2) then (3) then insert the request. Never lock finance.systems FOR UPDATE.
-- Idempotency: pg_advisory_xact_lock(actor:requestId) before finance.begin_request_mutation; finance.replay_request_mutation on races.

begin;

alter table finance.requests
  add column submitted_revision_id uuid references finance.request_revisions(id),
  add column approved_revision_id uuid references finance.request_revisions(id),
  add column released_ore bigint not null default 0 check (released_ore >= 0),
  add column closed_at timestamptz,
  add column closed_by_member_id uuid references identity.members(id);

create table finance.request_draft_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references finance.requests(id) on delete cascade,
  budget_item_id uuid not null references finance.budget_items(id),
  ordinal integer not null check (ordinal > 0),
  description text not null check (char_length(btrim(description)) between 1 and 300),
  estimated_ore bigint not null check (estimated_ore > 0),
  unique (request_id, ordinal)
);

create index request_draft_lines_request_idx on finance.request_draft_lines (request_id, ordinal);

alter table finance.request_draft_lines enable row level security;

create or replace function finance.member_has_capability(p_member_id uuid, p_capability text)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, finance
as $fn$
  select coalesce((finance.capability_flags(p_member_id) ->> p_capability)::boolean, false);
$fn$;

create or replace function finance.begin_request_mutation(
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
  existing finance.idempotency_keys%rowtype;
begin
  if p_actor is null or not exists (select 1 from identity.members where id = p_actor) then
    raise exception 'FINANCE|denied|A verified Helix member account is required.';
  end if;
  if p_request_id is null or p_payload_hash is null or char_length(p_payload_hash) < 32 then
    raise exception 'FINANCE|invalid|A valid request ID is required.';
  end if;
  if not finance.member_has_capability(p_actor, p_capability) then
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

create or replace function finance.replay_request_mutation(
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

create or replace function finance.finish_request_mutation(
  p_actor uuid,
  p_request_id uuid,
  p_action text,
  p_payload_hash text,
  p_entity_id uuid,
  p_revision integer default null
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
    'revision', p_revision,
    'warnings', '[]'::jsonb,
    'errors', '[]'::jsonb
  );
  insert into finance.idempotency_keys (member_id, request_id, action, payload_hash, response)
  values (p_actor, p_request_id, p_action, p_payload_hash, response);
  return response;
end;
$fn$;

create or replace function finance.store_request_mutation(
  p_actor uuid,
  p_request_id uuid,
  p_action text,
  p_payload_hash text,
  p_entity_id uuid,
  p_revision integer default null
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
    'revision', p_revision,
    'warnings', '[]'::jsonb,
    'errors', '[]'::jsonb
  );
  insert into finance.idempotency_keys (member_id, request_id, action, payload_hash, response)
  values (p_actor, p_request_id, p_action, p_payload_hash, response);
  return response;
end;
$fn$;

create or replace function finance.issue_request_ordinal(p_actor uuid, p_season text)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  key_value text := 'request:' || p_season;
  issued bigint;
begin
  if p_season is null or p_season !~ '^S[0-9]{2}$' then
    raise exception 'FINANCE|invalid|Enter a valid reference.';
  end if;
  loop
    select configured_next into issued
    from finance.reference_counters
    where counter_key = key_value
    for update;
    if found then
      update finance.reference_counters
        set last_issued = configured_next,
            configured_next = configured_next + 1,
            updated_at = clock_timestamp(),
            updated_by_member_id = p_actor
        where counter_key = key_value
        returning last_issued into issued;
      return issued::integer;
    end if;
    begin
      insert into finance.reference_counters (counter_key, calendar_year, configured_next, last_issued, updated_by_member_id)
      values (key_value, null, 2, 1, p_actor);
      return 1;
    exception when unique_violation then
      null;
    end;
  end loop;
end;
$fn$;

create or replace function finance.request_public_ref(p_season text, p_ordinal integer)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $fn$
  select 'RQ-' || p_season || '-' || case
    when p_ordinal < 1000 then lpad(p_ordinal::text, 3, '0')
    else p_ordinal::text
  end;
$fn$;

create or replace function finance.enqueue_request_outbox(
  p_event_type text,
  p_entity_id uuid,
  p_recipient uuid,
  p_dedupe_key text,
  p_payload jsonb
) returns void
language sql
security invoker
set search_path = pg_catalog, finance
as $fn$
  insert into finance.outbox (event_type, entity, entity_id, recipient_member_id, dedupe_key, payload)
  values (p_event_type, 'request', p_entity_id, p_recipient, p_dedupe_key, p_payload)
  on conflict (dedupe_key) do nothing;
$fn$;

create or replace function finance.notify_heads_request_submitted(
  p_request_id uuid,
  p_revision_id uuid,
  p_public_ref text
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
declare
  head_row record;
  payload jsonb := jsonb_build_object(
    'requestId', p_request_id,
    'revisionId', p_revision_id,
    'publicRef', p_public_ref,
    'event', 'request.submitted'
  );
begin
  for head_row in
    select member_id
    from finance.member_grants
    where profile = 'head_of_finance' and active
  loop
    perform finance.enqueue_request_outbox(
      'request.submitted',
      p_request_id,
      head_row.member_id,
      'request.submitted:' || p_request_id::text || ':' || p_revision_id::text || ':' || head_row.member_id::text,
      payload
    );
  end loop;
end;
$fn$;

create or replace function finance.notify_requester_decision(
  p_request_id uuid,
  p_revision_id uuid,
  p_public_ref text,
  p_requester uuid,
  p_decision text
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  payload jsonb := jsonb_build_object(
    'requestId', p_request_id,
    'revisionId', p_revision_id,
    'publicRef', p_public_ref,
    'decision', p_decision,
    'event', 'request.decided'
  );
begin
  perform finance.enqueue_request_outbox(
    'request.decided',
    p_request_id,
    p_requester,
    'request.decided:' || p_request_id::text || ':' || p_revision_id::text || ':' || p_decision,
    payload
  );
end;
$fn$;

create or replace function finance.fetch_current_season_budget_row(p_season_code text)
returns finance.budgets
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  budget_row finance.budgets%rowtype;
begin
  select b.* into budget_row
  from finance.seasons s
  join finance.budgets b on b.season_id = s.id
  where s.code = p_season_code;
  if not found then
    raise exception 'FINANCE|conflict|Create and approve a season budget first.';
  end if;
  if budget_row.status <> 'approved' then
    raise exception 'FINANCE|conflict|The season budget must be approved before submitting requests.';
  end if;
  return budget_row;
end;
$fn$;

create or replace function finance.lock_request_line_items_share(p_lines jsonb, p_budget_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  item_id uuid;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    return;
  end if;
  for item_id in
    select distinct (elem->>'budgetItemId')::uuid
    from jsonb_array_elements(p_lines) as elem
    where elem->>'budgetItemId' is not null
    order by 1
  loop
    perform 1
    from finance.budget_items i
    where i.id = item_id
      and i.budget_id = p_budget_id
      and i.status <> 'cancelled'
    for share;
    if not found then
      raise exception 'FINANCE|invalid|Choose valid budget lines with positive estimates.|lines';
    end if;
  end loop;
end;
$fn$;

create or replace function finance.lock_budget_share(p_budget_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
begin
  perform 1 from finance.budgets where id = p_budget_id for share;
  if not found then
    raise exception 'FINANCE|conflict|Create and approve a season budget first.';
  end if;
end;
$fn$;

create or replace function finance.replace_request_draft_lines(
  p_request_id uuid,
  p_lines jsonb
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  line_row jsonb;
  ord integer := 0;
begin
  delete from finance.request_draft_lines where request_id = p_request_id;
  for line_row in select * from jsonb_array_elements(p_lines)
  loop
    ord := ord + 1;
    insert into finance.request_draft_lines (request_id, budget_item_id, ordinal, description, estimated_ore)
    values (
      p_request_id,
      (line_row->>'budgetItemId')::uuid,
      ord,
      btrim(line_row->>'description'),
      (line_row->>'estimatedOre')::bigint
    );
  end loop;
end;
$fn$;

create or replace function finance.request_draft_lines_equal(p_request_id uuid, p_lines jsonb)
returns boolean
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  existing jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
    'budgetItemId', budget_item_id,
    'description', description,
    'estimatedOre', estimated_ore::text
  ) order by ordinal), '[]'::jsonb)
  into existing
  from finance.request_draft_lines
  where request_id = p_request_id;
  return existing = p_lines;
end;
$fn$;

create or replace function finance.apply_request_change(
  p_actor_member_id uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_command jsonb,
  p_today date
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
#variable_conflict use_variable
declare
  action_name text := coalesce(p_command->>'action', '');
  replay jsonb;
  stored jsonb;
  season_code text;
  season_id uuid;
  budget_row finance.budgets%rowtype;
  req finance.requests%rowtype;
  record_id uuid;
  expected_revision integer;
  revision_id uuid;
  revision_number integer;
  ordinal integer;
  line_row jsonb;
  approved_map jsonb;
  line_rec record;
  approved_amount bigint;
  positive_lines integer := 0;
  total_approved bigint := 0;
  released_ore bigint;
  close_reason text;
  decision_text text;
  reason_text text;
  payload_lines jsonb;
  supplier text;
  justification text;
  planned date;
  late_reason text;
  no_change boolean;
  public_ref text;
  item_ok boolean;
begin
  if p_actor_member_id is null or p_request_id is null or p_payload_hash is null or char_length(p_payload_hash) < 32 or p_command is null or p_today is null then
    raise exception 'FINANCE|invalid|A valid request ID is required.';
  end if;

  action_name := coalesce(p_command->>'action', '');
  if action_name = '' then
    raise exception 'FINANCE|invalid|Unknown request.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_actor_member_id::text || ':' || p_request_id::text, 0));

  if action_name in ('saveRequest', 'submitRequest', 'reviseRequest') then
    replay := finance.begin_request_mutation(p_actor_member_id, p_request_id, action_name, p_payload_hash, 'ownRequests');
  elsif action_name = 'decideRequest' then
    replay := finance.begin_request_mutation(p_actor_member_id, p_request_id, action_name, p_payload_hash, 'decideRequests');
  elsif action_name in ('withdrawRequest', 'cancelRequest') then
    replay := finance.begin_request_mutation(p_actor_member_id, p_request_id, action_name, p_payload_hash, 'ownRequests');
  elsif action_name = 'closeRequest' then
    if finance.member_has_capability(p_actor_member_id, 'ownRequests') then
      replay := finance.begin_request_mutation(p_actor_member_id, p_request_id, action_name, p_payload_hash, 'ownRequests');
    elsif finance.member_has_capability(p_actor_member_id, 'decideRequests') then
      replay := finance.begin_request_mutation(p_actor_member_id, p_request_id, action_name, p_payload_hash, 'decideRequests');
    else
      raise exception 'FINANCE|denied|Finance access is required.';
    end if;
  else
    raise exception 'FINANCE|invalid|Unknown request.';
  end if;
  if replay is not null then
    return replay;
  end if;

  select setting_value #>> '{}' into season_code from finance.settings where setting_key = 'current_season';
  if season_code is null then
    raise exception 'FINANCE|conflict|An operator has not configured the current season.';
  end if;
  select id into season_id from finance.seasons where code = season_code;

  record_id := nullif(p_command->>'requestRecordId', '')::uuid;
  expected_revision := nullif(p_command->>'expectedRevision', '')::integer;

  if action_name = 'saveRequest' then
    supplier := btrim(coalesce(p_command #>> '{request,supplierName}', ''));
    justification := btrim(coalesce(p_command #>> '{request,justification}', ''));
    planned := (p_command #>> '{request,plannedDate}')::date;
    late_reason := nullif(btrim(coalesce(p_command #>> '{request,lateReason}', '')), '');
    payload_lines := coalesce(p_command #> '{request,lines}', '[]'::jsonb);
    budget_row := finance.fetch_current_season_budget_row(season_code);

    if record_id is not null then
      select * into req from finance.requests where id = record_id for update;
      if not found then
        raise exception 'FINANCE|not_found|Request was not found.';
      end if;
      if req.requester_member_id <> p_actor_member_id then
        raise exception 'FINANCE|denied|Finance access is required.';
      end if;
      if req.status not in ('draft', 'rejected') then
        raise exception 'FINANCE|invalid|This request cannot be edited.';
      end if;
      if expected_revision is null or expected_revision <> req.revision then
        raise exception 'FINANCE|stale|This record changed before it could be saved. Review the latest values and try again.';
      end if;
      no_change := req.supplier_name is not distinct from supplier
        and req.justification is not distinct from justification
        and req.planned_date is not distinct from planned
        and req.late_reason is not distinct from late_reason
        and finance.request_draft_lines_equal(record_id, payload_lines);
      if no_change then
        return finance.store_request_mutation(p_actor_member_id, p_request_id, action_name, p_payload_hash, record_id, req.revision);
      end if;
      perform finance.lock_request_line_items_share(payload_lines, budget_row.id);
      perform finance.lock_budget_share(budget_row.id);
      update finance.requests
        set supplier_name = supplier,
            justification = justification,
            planned_date = planned,
            late_reason = late_reason,
            revision = finance.requests.revision + 1,
            updated_at = clock_timestamp()
        where id = record_id
        returning * into req;
    else
      perform finance.lock_request_line_items_share(payload_lines, budget_row.id);
      perform finance.lock_budget_share(budget_row.id);
      public_ref := finance.request_public_ref(season_code, finance.issue_request_ordinal(p_actor_member_id, season_code));
      insert into finance.requests (
        season_id, requester_member_id, public_ref, status,
        supplier_name, justification, planned_date, late_reason, revision
      ) values (
        season_id, p_actor_member_id, public_ref, 'draft',
        supplier, justification, planned, late_reason, 0
      ) returning * into req;
      record_id := req.id;
    end if;

    perform finance.replace_request_draft_lines(record_id, payload_lines);
    perform finance.append_audit(p_actor_member_id, 'request', record_id::text, 'status', null, req.status, 'draft saved');
    return finance.finish_request_mutation(p_actor_member_id, p_request_id, action_name, p_payload_hash, record_id, req.revision);

  elsif action_name in ('submitRequest', 'reviseRequest') then
    record_id := coalesce(record_id, nullif(p_command->>'requestRecordId', '')::uuid);
    if record_id is null then
      raise exception 'FINANCE|invalid|A valid request ID is required.';
    end if;
    select * into req from finance.requests where id = record_id for update;
    if not found then raise exception 'FINANCE|not_found|Request was not found.'; end if;
    if req.requester_member_id <> p_actor_member_id then
      raise exception 'FINANCE|denied|Finance access is required.';
    end if;
    if action_name = 'submitRequest' and req.status <> 'draft' then
      raise exception 'FINANCE|conflict|This request cannot be submitted.';
    end if;
    if action_name = 'reviseRequest' and req.status <> 'rejected' then
      raise exception 'FINANCE|conflict|Only a rejected request can be revised.';
    end if;
    if expected_revision is null or expected_revision <> req.revision then
      raise exception 'FINANCE|stale|This record changed before it could be saved. Review the latest values and try again.';
    end if;

    supplier := btrim(coalesce(p_command #>> '{request,supplierName}', req.supplier_name));
    justification := btrim(coalesce(p_command #>> '{request,justification}', req.justification));
    planned := coalesce((p_command #>> '{request,plannedDate}')::date, req.planned_date);
    late_reason := nullif(btrim(coalesce(p_command #>> '{request,lateReason}', coalesce(req.late_reason, ''))), '');
    payload_lines := coalesce(p_command #> '{request,lines}', '[]'::jsonb);
    budget_row := finance.fetch_current_season_budget_row(season_code);
    perform finance.lock_request_line_items_share(payload_lines, budget_row.id);
    perform finance.lock_budget_share(budget_row.id);

    select coalesce(max(r.revision_number), 0) + 1 into revision_number
    from finance.request_revisions r where r.request_id = record_id;

    insert into finance.request_revisions (request_id, revision_number, supplier_name, justification, planned_date, late_reason)
    values (record_id, revision_number, supplier, justification, planned, late_reason)
    returning id into revision_id;

    ordinal := 0;
    for line_row in select * from jsonb_array_elements(payload_lines)
    loop
      ordinal := ordinal + 1;
      select exists (
        select 1
        from finance.budget_items i
        where i.id = (line_row->>'budgetItemId')::uuid
          and i.budget_id = budget_row.id
          and i.status <> 'cancelled'
          and (line_row->>'estimatedOre')::bigint > 0
      ) into item_ok;
      if not item_ok then
        raise exception 'FINANCE|invalid|Choose valid budget lines with positive estimates.|lines';
      end if;
      insert into finance.request_lines (revision_id, budget_item_id, ordinal, description, estimated_ore)
      values (
        revision_id,
        (line_row->>'budgetItemId')::uuid,
        ordinal,
        btrim(line_row->>'description'),
        (line_row->>'estimatedOre')::bigint
      );
    end loop;
    if ordinal = 0 then
      raise exception 'FINANCE|invalid|Add at least one budget line with a positive estimate.|lines';
    end if;
    if planned >= p_today and (planned - p_today) < 3 and (late_reason is null or char_length(late_reason) < 3) then
      raise exception 'FINANCE|invalid|Explain why this purchase is planned within three calendar days.|lateReason';
    end if;

    update finance.requests
      set status = 'submitted',
          supplier_name = supplier,
          justification = justification,
          planned_date = planned,
          late_reason = late_reason,
          submitted_revision_id = revision_id,
          approved_revision_id = null,
          revision = finance.requests.revision + 1,
          updated_at = clock_timestamp()
      where id = record_id
      returning * into req;

    delete from finance.request_draft_lines where request_id = record_id;
    perform finance.notify_heads_request_submitted(record_id, revision_id, req.public_ref);
    perform finance.append_audit(p_actor_member_id, 'request', record_id::text, 'status', 'draft', 'submitted', action_name);
    return finance.finish_request_mutation(p_actor_member_id, p_request_id, action_name, p_payload_hash, record_id, req.revision);

  elsif action_name = 'withdrawRequest' then
    record_id := nullif(p_command->>'requestRecordId', '')::uuid;
    select * into req from finance.requests where id = record_id for update;
    if not found then raise exception 'FINANCE|not_found|Request was not found.'; end if;
    if req.requester_member_id <> p_actor_member_id then raise exception 'FINANCE|denied|Finance access is required.'; end if;
    if req.status <> 'submitted' then raise exception 'FINANCE|conflict|This request is not awaiting withdrawal.'; end if;
    if expected_revision is null or expected_revision <> req.revision then
      raise exception 'FINANCE|stale|This record changed before it could be saved. Review the latest values and try again.';
    end if;
    update finance.requests
      set status = 'draft',
          submitted_revision_id = null,
          revision = finance.requests.revision + 1,
          updated_at = clock_timestamp()
      where id = record_id
      returning * into req;
    perform finance.append_audit(p_actor_member_id, 'request', record_id::text, 'status', 'submitted', 'draft', 'withdrawn');
    return finance.finish_request_mutation(p_actor_member_id, p_request_id, action_name, p_payload_hash, record_id, req.revision);

  elsif action_name = 'cancelRequest' then
    record_id := nullif(p_command->>'requestRecordId', '')::uuid;
    select * into req from finance.requests where id = record_id for update;
    if not found then raise exception 'FINANCE|not_found|Request was not found.'; end if;
    if req.requester_member_id <> p_actor_member_id then raise exception 'FINANCE|denied|Finance access is required.'; end if;
    if req.status not in ('draft', 'submitted', 'rejected') then raise exception 'FINANCE|conflict|This request cannot be cancelled.'; end if;
    if expected_revision is null or expected_revision <> req.revision then
      raise exception 'FINANCE|stale|This record changed before it could be saved. Review the latest values and try again.';
    end if;
    perform finance.append_audit(p_actor_member_id, 'request', record_id::text, 'status', req.status, 'cancelled', 'cancelled');
    update finance.requests
      set status = 'cancelled',
          submitted_revision_id = null,
          revision = finance.requests.revision + 1,
          updated_at = clock_timestamp()
      where id = record_id
      returning * into req;
    delete from finance.request_draft_lines where request_id = record_id;
    return finance.finish_request_mutation(p_actor_member_id, p_request_id, action_name, p_payload_hash, record_id, req.revision);

  elsif action_name = 'decideRequest' then
    record_id := nullif(p_command->>'requestRecordId', '')::uuid;
    revision_id := nullif(p_command->>'revisionId', '')::uuid;
    decision_text := btrim(coalesce(p_command->>'decision', ''));
    reason_text := btrim(coalesce(p_command->>'reason', ''));
    approved_map := coalesce(p_command->'approvedOreByLine', '{}'::jsonb);

    select * into req from finance.requests where id = record_id for update;
    if not found then raise exception 'FINANCE|not_found|Request was not found.'; end if;
    if req.status <> 'submitted' or req.submitted_revision_id is distinct from revision_id then
      raise exception 'FINANCE|conflict|This decision no longer applies to the submitted revision.';
    end if;
    if exists (select 1 from finance.request_decisions d where d.revision_id = revision_id) then
      raise exception 'FINANCE|conflict|This revision already has a decision.';
    end if;
    if char_length(reason_text) < 3 then
      raise exception 'FINANCE|invalid|Enter a decision reason.|reason';
    end if;
    if decision_text not in ('approved', 'rejected') then
      raise exception 'FINANCE|invalid|Choose approve or reject.|decision';
    end if;

    if decision_text = 'approved' then
      -- Item locks FOR SHARE after the request row (same order as submit); a line whose item was cancelled since submission cannot be approved.
      for line_rec in
        select i.id, i.status
        from finance.request_lines l
        join finance.budget_items i on i.id = l.budget_item_id
        where l.revision_id = revision_id
        order by i.id
        for share of i
      loop
        if line_rec.status = 'cancelled' then
          raise exception 'FINANCE|conflict|A budget line on this request was cancelled. Ask the requester to revise it.';
        end if;
      end loop;
      for line_rec in
        select l.id,
               coalesce((approved_map->>(l.id::text))::bigint, l.estimated_ore) as amount
        from finance.request_lines l
        where l.revision_id = revision_id
      loop
        approved_amount := line_rec.amount;
        if approved_amount > 0 then
          positive_lines := positive_lines + 1;
          total_approved := total_approved + approved_amount;
        end if;
        update finance.request_lines set approved_ore = approved_amount where id = line_rec.id;
      end loop;
      if positive_lines = 0 then
        raise exception 'FINANCE|invalid|Approve at least one positive line amount.|approvedOreByLine';
      end if;
      insert into finance.request_decisions (revision_id, decision, reason, actor_member_id)
      values (revision_id, 'approved', reason_text, p_actor_member_id);
      update finance.requests
        set status = 'approved',
            approved_revision_id = revision_id,
            revision = finance.requests.revision + 1,
            updated_at = clock_timestamp()
        where id = record_id
        returning * into req;
    else
      insert into finance.request_decisions (revision_id, decision, reason, actor_member_id)
      values (revision_id, 'rejected', reason_text, p_actor_member_id);
      update finance.requests
        set status = 'rejected',
            submitted_revision_id = null,
            revision = finance.requests.revision + 1,
            updated_at = clock_timestamp()
        where id = record_id
        returning * into req;
    end if;

    perform finance.notify_requester_decision(record_id, revision_id, req.public_ref, req.requester_member_id, decision_text);
    perform finance.append_audit(p_actor_member_id, 'request', record_id::text, 'decision', null, decision_text, reason_text);
    return finance.finish_request_mutation(p_actor_member_id, p_request_id, action_name, p_payload_hash, record_id, req.revision);

  elsif action_name = 'closeRequest' then
    record_id := nullif(p_command->>'requestRecordId', '')::uuid;
    close_reason := btrim(coalesce(p_command->>'reason', ''));
    released_ore := coalesce((p_command->>'releasedOre')::bigint, 0);
    select * into req from finance.requests where id = record_id for update;
    if not found then raise exception 'FINANCE|not_found|Request was not found.'; end if;
    if req.status <> 'approved' then raise exception 'FINANCE|conflict|Only an open approval can be closed.'; end if;
    if not (req.requester_member_id = p_actor_member_id or finance.member_has_capability(p_actor_member_id, 'decideRequests')) then
      raise exception 'FINANCE|denied|Finance access is required.';
    end if;
    if expected_revision is null or expected_revision <> req.revision then
      raise exception 'FINANCE|stale|This record changed before it could be saved. Review the latest values and try again.';
    end if;
    if char_length(close_reason) < 3 then
      raise exception 'FINANCE|invalid|Enter a closure reason.|reason';
    end if;
    if released_ore < 0 then
      raise exception 'FINANCE|invalid|Enter a valid released amount.|releasedOre';
    end if;
    if released_ore > coalesce((select sum(l.approved_ore) from finance.request_lines l where l.revision_id = req.approved_revision_id), 0) then
      raise exception 'FINANCE|invalid|The released amount cannot exceed the approved amount.|releasedOre';
    end if;
    update finance.requests
      set status = 'closed',
          close_reason = close_reason,
          released_ore = released_ore,
          closed_at = clock_timestamp(),
          closed_by_member_id = p_actor_member_id,
          revision = finance.requests.revision + 1,
          updated_at = clock_timestamp()
      where id = record_id
      returning * into req;
    perform finance.append_audit(p_actor_member_id, 'request', record_id::text, 'status', 'approved', 'closed', close_reason);
    return finance.finish_request_mutation(p_actor_member_id, p_request_id, action_name, p_payload_hash, record_id, req.revision);
  end if;

  raise exception 'FINANCE|invalid|Unknown request.';
exception
  when unique_violation then
    stored := finance.replay_request_mutation(
      p_actor_member_id,
      p_request_id,
      action_name,
      p_payload_hash
    );
    if stored is not null then
      return stored;
    end if;
    if exists (
      select 1
      from finance.request_decisions d
      where d.revision_id = revision_id
    ) then
      raise exception 'FINANCE|conflict|This revision already has a decision.';
    end if;
    raise exception 'FINANCE|conflict|This request ID was already used for a different change.';
end;
$fn$;

revoke all on all functions in schema finance from public;
grant execute on all functions in schema finance to current_user;

do $$
declare browser_role text;
begin
  for browser_role in select rolname from pg_roles where rolname in ('anon', 'anonymous', 'authenticated') loop
    execute format('revoke all on all functions in schema finance from %I', browser_role);
  end loop;
end;
$$;

commit;
