-- Season budget lifecycle. Additive.
-- Creates, approves, and maintains the current season budget and its items.
-- Does not issue purchase or request references.
-- Each successful mutation bumps finance.view_versions in the same transaction.

begin;

alter table finance.budget_items
  add column owner_email text,
  add constraint budget_items_owner_email_check check (
    owner_email is null
    or (
      char_length(owner_email) between 3 and 200
      and owner_email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
    )
  ),
  add constraint budget_items_category_check check (
    category in (
      'material', 'component', 'tooling', 'manufacturing_service',
      'travel', 'fees', 'marketing', 'other'
    )
  ),
  add constraint budget_items_unallocated_open check (not protected or status <> 'cancelled');

create unique index budget_items_one_unallocated
  on finance.budget_items (budget_id, system_id)
  where protected;

create or replace function finance.reject_closed_budget_item_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  season_status text;
  budget_uuid uuid;
begin
  budget_uuid := coalesce(new.budget_id, old.budget_id);
  select s.status into season_status
  from finance.budgets b
  join finance.seasons s on s.id = b.season_id
  where b.id = budget_uuid;
  if season_status = 'closed' then
    raise exception 'This season is closed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$fn$;

create trigger budget_items_reject_closed_season
  before insert or update on finance.budget_items
  for each row execute function finance.reject_closed_budget_item_write();

create or replace function finance.reject_unallocated_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
begin
  if old.protected and (
    new.system_id is distinct from old.system_id
    or new.budget_id is distinct from old.budget_id
    or new.public_ref is distinct from old.public_ref
    or new.description is distinct from old.description
    or new.category is distinct from old.category
    or new.planned_ore is distinct from old.planned_ore
    or new.priority is distinct from old.priority
    or new.reuse_status is distinct from old.reuse_status
    or new.expected_purchase_date is distinct from old.expected_purchase_date
    or new.owner_member_id is distinct from old.owner_member_id
    or new.owner_email is distinct from old.owner_email
    or new.status is distinct from old.status
    or new.earmark_id is distinct from old.earmark_id
    or new.protected is distinct from old.protected
  ) then
    raise exception 'FINANCE|invalid|Only the note on an unallocated item can be changed.|note';
  end if;
  return new;
end;
$fn$;

create trigger budget_items_protect_unallocated
  before update on finance.budget_items
  for each row execute function finance.reject_unallocated_change();

create or replace function finance.begin_budget_mutation(
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

create or replace function finance.replay_budget_mutation(
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

create or replace function finance.finish_budget_mutation(
  p_actor uuid,
  p_request_id uuid,
  p_action text,
  p_payload_hash text,
  p_entity_id uuid
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
    'warnings', '[]'::jsonb,
    'errors', '[]'::jsonb
  );
  insert into finance.idempotency_keys (member_id, request_id, action, payload_hash, response)
  values (p_actor, p_request_id, p_action, p_payload_hash, response);
  return response;
end;
$fn$;

create or replace function finance.store_budget_result(
  p_actor uuid,
  p_request_id uuid,
  p_action text,
  p_payload_hash text,
  p_entity_id uuid
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
    'warnings', '[]'::jsonb,
    'errors', '[]'::jsonb
  );
  insert into finance.idempotency_keys (member_id, request_id, action, payload_hash, response)
  values (p_actor, p_request_id, p_action, p_payload_hash, response);
  return response;
end;
$fn$;

create or replace function finance.require_budget_reason(
  p_actor uuid,
  p_needs_reason boolean,
  p_reason text
) returns text
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
declare
  reason_text text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if reason_text is not null and char_length(reason_text) > 500 then
    raise exception 'FINANCE|invalid|Enter a shorter reason.|reason';
  end if;
  if p_needs_reason then
    if coalesce((finance.capability_flags(p_actor) ->> 'protectedBudgetEdits')::boolean, false) is not true then
      raise exception 'FINANCE|denied|Only the Head of Finance can change an approved budget this way.';
    end if;
    if reason_text is null then
      raise exception 'FINANCE|invalid|A reason is required for this approved-budget change.|reason';
    end if;
  end if;
  return reason_text;
end;
$fn$;

create or replace function finance.lock_current_budget()
returns finance.budgets
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  current_budget finance.budgets%rowtype;
  season_status text;
begin
  select b.* into current_budget
  from finance.budgets b
  join finance.seasons s on s.id = b.season_id
  join finance.settings st on st.setting_key = 'current_season' and s.code = st.setting_value #>> '{}'
  for update of b;
  if not found then
    raise exception 'FINANCE|conflict|Create a season budget first.';
  end if;
  select status into season_status from finance.seasons where id = current_budget.season_id;
  if season_status = 'closed' then
    raise exception 'FINANCE|conflict|This season is closed.';
  end if;
  return current_budget;
end;
$fn$;

create or replace function finance.issue_budget_item_ordinal(p_actor uuid, p_season text)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  key_value text := 'budget_item:' || p_season;
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

create or replace function finance.budget_item_reference(p_season text, p_ordinal integer)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $fn$
  select 'BI-' || p_season || '-' || case
    when p_ordinal < 1000 then lpad(p_ordinal::text, 3, '0')
    else p_ordinal::text
  end;
$fn$;

create or replace function finance.create_season_budget(
  p_actor uuid,
  p_request_id uuid,
  p_payload_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
declare
  replay jsonb;
  v_season_id uuid;
  season_code text;
  season_status text;
  budget_id uuid;
  system_row record;
  item_id uuid;
  item_ref text;
  v_constraint text;
  saved jsonb;
begin
  replay := finance.begin_budget_mutation(p_actor, p_request_id, 'createBudget', p_payload_hash, 'createBudget');
  if replay is not null then
    return replay;
  end if;

  select s.id, s.code, s.status into v_season_id, season_code, season_status
  from finance.seasons s
  where s.code = (select setting_value #>> '{}' from finance.settings where setting_key = 'current_season')
  for update;
  if not found then
    raise exception 'FINANCE|conflict|An operator has not configured the current season.';
  end if;
  if season_status = 'closed' then
    raise exception 'FINANCE|conflict|This season is closed.';
  end if;
  if exists (select 1 from finance.budgets b where b.season_id = v_season_id) then
    raise exception 'FINANCE|conflict|A budget already exists for this season.';
  end if;

  insert into finance.budgets (season_id, public_ref, status, created_by_member_id, updated_by_member_id)
  values (v_season_id, 'B-' || season_code, 'draft', p_actor, p_actor)
  returning id into budget_id;
  perform finance.append_audit(p_actor, 'budget', budget_id::text, 'status', null, 'draft', null);

  for system_row in
    select id, code from finance.systems where active order by code
  loop
    item_ref := 'BI-' || season_code || '-' || substring(system_row.code from 5) || '-UNALLOC';
    insert into finance.budget_items (
      budget_id, system_id, public_ref, description, category, planned_ore, priority,
      reuse_status, status, protected, created_by_member_id, updated_by_member_id
    ) values (
      budget_id, system_row.id, item_ref, 'Unallocated', 'other', 0, 'P4',
      'new', 'planned', true, p_actor, p_actor
    ) returning id into item_id;
    perform finance.append_audit(p_actor, 'budget_item', item_id::text, 'created', null, item_ref, null);
  end loop;

  return finance.finish_budget_mutation(p_actor, p_request_id, 'createBudget', p_payload_hash, budget_id);
exception when unique_violation then
  get stacked diagnostics v_constraint = CONSTRAINT_NAME;
  if v_constraint = 'idempotency_keys_pkey' then
    saved := finance.replay_budget_mutation(p_actor, p_request_id, 'createBudget', p_payload_hash);
    if saved is not null then
      return saved;
    end if;
  end if;
  if v_constraint in ('budgets_season_id_key', 'budgets_public_ref_key') then
    raise exception 'FINANCE|conflict|A budget already exists for this season.';
  end if;
  raise;
end;
$fn$;

create or replace function finance.approve_season_budget(
  p_actor uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_expected_revision integer,
  p_approved_on date
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  replay jsonb;
  current_budget finance.budgets%rowtype;
  updated_id uuid;
  v_constraint text;
  saved jsonb;
begin
  replay := finance.begin_budget_mutation(p_actor, p_request_id, 'approveBudget', p_payload_hash, 'approveBudget');
  if replay is not null then
    return replay;
  end if;
  if p_approved_on is null then
    raise exception 'FINANCE|invalid|Enter a valid date.|approvedOn';
  end if;
  current_budget := finance.lock_current_budget();
  if current_budget.status = 'approved' then
    raise exception 'FINANCE|conflict|This budget is already approved.';
  end if;
  if current_budget.revision <> p_expected_revision then
    raise exception 'FINANCE|stale|This record changed before it could be saved. Review the latest values and try again.';
  end if;
  update finance.budgets
    set status = 'approved',
        approved_by_member_id = p_actor,
        approved_on = p_approved_on,
        revision = revision + 1,
        updated_at = clock_timestamp(),
        updated_by_member_id = p_actor
    where id = current_budget.id
      and status = 'draft'
      and revision = p_expected_revision
    returning id into updated_id;
  if updated_id is null then
    raise exception 'FINANCE|conflict|This budget is already approved.';
  end if;
  perform finance.append_audit(p_actor, 'budget', updated_id::text, 'status', 'draft', 'approved', null);
  perform finance.append_audit(p_actor, 'budget', updated_id::text, 'approved_on', null, p_approved_on::text, null);
  return finance.finish_budget_mutation(p_actor, p_request_id, 'approveBudget', p_payload_hash, updated_id);
exception when unique_violation then
  get stacked diagnostics v_constraint = CONSTRAINT_NAME;
  if v_constraint = 'idempotency_keys_pkey' then
    saved := finance.replay_budget_mutation(p_actor, p_request_id, 'approveBudget', p_payload_hash);
    if saved is not null then
      return saved;
    end if;
  end if;
  raise;
end;
$fn$;

create or replace function finance.assert_earmark_link(
  p_budget_id uuid,
  p_item_id uuid,
  p_system_id uuid,
  p_earmark_id uuid,
  p_priority text
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
begin
  if p_priority = 'EM' and p_earmark_id is null then
    raise exception 'FINANCE|invalid|Choose an earmarked part for this item.|earmarkId';
  end if;
  if p_priority <> 'EM' and p_earmark_id is not null then
    raise exception 'FINANCE|invalid|Clear the earmarked part unless the priority is EM.|earmarkId';
  end if;
  if p_earmark_id is null then
    return;
  end if;
  if not exists (
    select 1
    from finance.funding_parts p
    join finance.funding f on f.id = p.funding_id
    join finance.budgets b on b.id = p_budget_id
    where p.id = p_earmark_id and f.season_id = b.season_id
  ) then
    raise exception 'FINANCE|invalid|Choose an earmarked part from this season.|earmarkId';
  end if;
  if exists (
    select 1
    from finance.funding_parts p
    join finance.funding f on f.id = p.funding_id
    where p.id = p_earmark_id
      and f.status = 'deleted'
      and not exists (
        select 1
        from finance.budget_items current_item
        where current_item.id = p_item_id
          and current_item.earmark_id is not distinct from p_earmark_id
      )
  ) then
    raise exception 'FINANCE|invalid|Choose an earmarked part from funding that is not deleted.|earmarkId';
  end if;
  if exists (
    select 1
    from finance.budget_items other
    where other.earmark_id = p_earmark_id
      and other.status <> 'cancelled'
      and other.system_id <> p_system_id
      and (p_item_id is null or other.id <> p_item_id)
  ) then
    raise exception 'FINANCE|invalid|An earmarked part can only link items in one system.|earmarkId';
  end if;
end;
$fn$;

create or replace function finance.add_budget_item(
  p_actor uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_expected_revision integer,
  p_system_id uuid,
  p_description text,
  p_category text,
  p_planned_ore bigint,
  p_priority text,
  p_reuse text,
  p_expected_date date,
  p_owner_email text,
  p_status text,
  p_note text,
  p_earmark_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  replay jsonb;
  current_budget finance.budgets%rowtype;
  season_code text;
  reason_text text;
  description_text text;
  note_text text;
  ordinal integer;
  item_ref text;
  item_id uuid;
  v_constraint text;
  saved jsonb;
begin
  replay := finance.begin_budget_mutation(p_actor, p_request_id, 'addItem', p_payload_hash, 'draftBudgetItems');
  if replay is not null then
    return replay;
  end if;
  current_budget := finance.lock_current_budget();
  if current_budget.revision <> p_expected_revision then
    raise exception 'FINANCE|stale|This record changed before it could be saved. Review the latest values and try again.';
  end if;
  reason_text := finance.require_budget_reason(p_actor, current_budget.status = 'approved', p_reason);
  if not exists (select 1 from finance.systems where id = p_system_id and active) then
    raise exception 'FINANCE|invalid|Choose an active system.|systemId';
  end if;
  description_text := btrim(coalesce(p_description, ''));
  if char_length(description_text) < 1 or char_length(description_text) > 300 then
    raise exception 'FINANCE|invalid|Enter a description.|description';
  end if;
  if p_planned_ore is null or p_planned_ore < 0 then
    raise exception 'FINANCE|invalid|Enter an amount of zero or more.|plannedNok';
  end if;
  if p_status is null or p_status not in ('planned', 'active', 'done') then
    raise exception 'FINANCE|invalid|Choose a status.|status';
  end if;
  note_text := nullif(btrim(coalesce(p_note, '')), '');
  if note_text is not null and char_length(note_text) > 2000 then
    raise exception 'FINANCE|invalid|Enter a shorter note.|note';
  end if;
  perform finance.assert_earmark_link(current_budget.id, null, p_system_id, p_earmark_id, p_priority);
  select code into season_code from finance.seasons where id = current_budget.season_id;
  ordinal := finance.issue_budget_item_ordinal(p_actor, season_code);
  item_ref := finance.budget_item_reference(season_code, ordinal);
  insert into finance.budget_items (
    budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status,
    expected_purchase_date, owner_email, status, note, earmark_id, protected,
    created_by_member_id, updated_by_member_id
  ) values (
    current_budget.id, p_system_id, item_ref, description_text, p_category, p_planned_ore, p_priority, p_reuse,
    p_expected_date, nullif(btrim(coalesce(p_owner_email, '')), ''), p_status, note_text, p_earmark_id, false,
    p_actor, p_actor
  ) returning id into item_id;
  perform finance.append_audit(p_actor, 'budget_item', item_id::text, 'created', null, item_ref, reason_text);
  perform finance.append_audit(p_actor, 'budget_item', item_id::text, 'planned_ore', null, p_planned_ore::text, reason_text);
  perform finance.append_audit(p_actor, 'budget_item', item_id::text, 'priority', null, p_priority, reason_text);
  perform finance.append_audit(p_actor, 'budget_item', item_id::text, 'system_id', null, p_system_id::text, reason_text);
  if p_earmark_id is not null then
    perform finance.append_audit(p_actor, 'budget_item', item_id::text, 'earmark_id', null, p_earmark_id::text, reason_text);
  end if;
  return finance.finish_budget_mutation(p_actor, p_request_id, 'addItem', p_payload_hash, item_id);
exception when unique_violation then
  get stacked diagnostics v_constraint = CONSTRAINT_NAME;
  if v_constraint = 'idempotency_keys_pkey' then
    saved := finance.replay_budget_mutation(p_actor, p_request_id, 'addItem', p_payload_hash);
    if saved is not null then
      return saved;
    end if;
  end if;
  raise;
end;
$fn$;

create or replace function finance.edit_budget_item(
  p_actor uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_item_id uuid,
  p_expected_revision integer,
  p_patch jsonb,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  replay jsonb;
  item finance.budget_items%rowtype;
  current_budget finance.budgets%rowtype;
  reason_text text;
  new_system uuid;
  new_description text;
  new_category text;
  new_planned bigint;
  new_priority text;
  new_reuse text;
  new_date date;
  new_owner text;
  new_status text;
  new_note text;
  new_earmark uuid;
  protected_change boolean;
  system_active boolean;
  v_constraint text;
  saved jsonb;
begin
  replay := finance.begin_budget_mutation(p_actor, p_request_id, 'editItem', p_payload_hash, 'draftBudgetItems');
  if replay is not null then
    return replay;
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'FINANCE|invalid|Enter the fields to change.|patch';
  end if;
  select * into item from finance.budget_items where id = p_item_id for update;
  if not found then
    raise exception 'FINANCE|not_found|Budget item not found.';
  end if;
  if item.status = 'cancelled' then
    raise exception 'FINANCE|conflict|Restore this item before editing it.';
  end if;
  if item.revision <> p_expected_revision then
    raise exception 'FINANCE|stale|This record changed before it could be saved. Review the latest values and try again.';
  end if;
  select * into current_budget from finance.budgets where id = item.budget_id for update;
  if not exists (
    select 1
    from finance.seasons s
    join finance.settings st on st.setting_key = 'current_season' and s.code = st.setting_value #>> '{}'
    where s.id = current_budget.season_id and s.status <> 'closed'
  ) then
    raise exception 'FINANCE|conflict|Only the current open season budget can be changed.';
  end if;

  new_system := item.system_id;
  new_description := item.description;
  new_category := item.category;
  new_planned := item.planned_ore;
  new_priority := item.priority;
  new_reuse := item.reuse_status;
  new_date := item.expected_purchase_date;
  new_owner := item.owner_email;
  new_status := item.status;
  new_note := item.note;
  new_earmark := item.earmark_id;

  if p_patch ? 'systemId' then
    if p_patch ->> 'systemId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'FINANCE|invalid|Choose a system.|systemId';
    end if;
    new_system := (p_patch ->> 'systemId')::uuid;
  end if;
  if p_patch ? 'description' then
    new_description := btrim(coalesce(p_patch ->> 'description', ''));
  end if;
  if p_patch ? 'category' then
    new_category := p_patch ->> 'category';
  end if;
  if p_patch ? 'plannedOre' then
    if p_patch ->> 'plannedOre' !~ '^[0-9]+$' then
      raise exception 'FINANCE|invalid|Enter an amount of zero or more.|plannedNok';
    end if;
    new_planned := (p_patch ->> 'plannedOre')::bigint;
  end if;
  if p_patch ? 'priority' then
    new_priority := p_patch ->> 'priority';
  end if;
  if p_patch ? 'reuseStatus' then
    new_reuse := p_patch ->> 'reuseStatus';
  end if;
  if p_patch ? 'expectedPurchaseDate' then
    if p_patch -> 'expectedPurchaseDate' = 'null'::jsonb or nullif(p_patch ->> 'expectedPurchaseDate', '') is null then
      new_date := null;
    else
      new_date := (p_patch ->> 'expectedPurchaseDate')::date;
    end if;
  end if;
  if p_patch ? 'ownerEmail' then
    if p_patch -> 'ownerEmail' = 'null'::jsonb or nullif(btrim(coalesce(p_patch ->> 'ownerEmail', '')), '') is null then
      new_owner := null;
    else
      new_owner := btrim(p_patch ->> 'ownerEmail');
    end if;
  end if;
  if p_patch ? 'status' then
    new_status := p_patch ->> 'status';
  end if;
  if p_patch ? 'note' then
    if p_patch -> 'note' = 'null'::jsonb then
      new_note := null;
    else
      new_note := nullif(btrim(coalesce(p_patch ->> 'note', '')), '');
    end if;
  end if;
  if p_patch ? 'earmarkId' then
    if p_patch -> 'earmarkId' = 'null'::jsonb or nullif(p_patch ->> 'earmarkId', '') is null then
      new_earmark := null;
    elsif p_patch ->> 'earmarkId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'FINANCE|invalid|Choose an earmarked part.|earmarkId';
    else
      new_earmark := (p_patch ->> 'earmarkId')::uuid;
    end if;
  end if;

  if char_length(btrim(coalesce(new_description, ''))) < 1 or char_length(new_description) > 300 then
    raise exception 'FINANCE|invalid|Enter a description.|description';
  end if;
  if new_planned is null or new_planned < 0 then
    raise exception 'FINANCE|invalid|Enter an amount of zero or more.|plannedNok';
  end if;
  if new_status is null or new_status not in ('planned', 'active', 'done') then
    raise exception 'FINANCE|invalid|Choose a status.|status';
  end if;
  if new_note is not null and char_length(new_note) > 2000 then
    raise exception 'FINANCE|invalid|Enter a shorter note.|note';
  end if;
  if new_system is distinct from item.system_id then
    select active into system_active from finance.systems where id = new_system;
    if system_active is not true then
      raise exception 'FINANCE|invalid|Choose an active system.|systemId';
    end if;
  end if;
  perform finance.assert_earmark_link(current_budget.id, item.id, new_system, new_earmark, new_priority);

  if item.protected and (
    new_system is distinct from item.system_id
    or new_description is distinct from item.description
    or new_category is distinct from item.category
    or new_planned is distinct from item.planned_ore
    or new_priority is distinct from item.priority
    or new_reuse is distinct from item.reuse_status
    or new_date is distinct from item.expected_purchase_date
    or new_owner is distinct from item.owner_email
    or new_status is distinct from item.status
    or new_earmark is distinct from item.earmark_id
  ) then
    raise exception 'FINANCE|invalid|Only the note on an unallocated item can be changed.|note';
  end if;

  if new_system is not distinct from item.system_id
     and new_description is not distinct from item.description
     and new_category is not distinct from item.category
     and new_planned is not distinct from item.planned_ore
     and new_priority is not distinct from item.priority
     and new_reuse is not distinct from item.reuse_status
     and new_date is not distinct from item.expected_purchase_date
     and new_owner is not distinct from item.owner_email
     and new_status is not distinct from item.status
     and new_note is not distinct from item.note
     and new_earmark is not distinct from item.earmark_id
  then
    return finance.store_budget_result(p_actor, p_request_id, 'editItem', p_payload_hash, item.id);
  end if;

  protected_change := new_planned is distinct from item.planned_ore
    or new_priority is distinct from item.priority
    or new_earmark is distinct from item.earmark_id;
  reason_text := finance.require_budget_reason(p_actor, current_budget.status = 'approved' and protected_change, p_reason);

  if new_system is distinct from item.system_id then
    perform finance.append_audit(p_actor, 'budget_item', item.id::text, 'system_id', item.system_id::text, new_system::text, reason_text);
  end if;
  if new_description is distinct from item.description then
    perform finance.append_audit(p_actor, 'budget_item', item.id::text, 'description', item.description, new_description, reason_text);
  end if;
  if new_category is distinct from item.category then
    perform finance.append_audit(p_actor, 'budget_item', item.id::text, 'category', item.category, new_category, reason_text);
  end if;
  if new_planned is distinct from item.planned_ore then
    perform finance.append_audit(p_actor, 'budget_item', item.id::text, 'planned_ore', item.planned_ore::text, new_planned::text, reason_text);
  end if;
  if new_priority is distinct from item.priority then
    perform finance.append_audit(p_actor, 'budget_item', item.id::text, 'priority', item.priority, new_priority, reason_text);
  end if;
  if new_reuse is distinct from item.reuse_status then
    perform finance.append_audit(p_actor, 'budget_item', item.id::text, 'reuse_status', item.reuse_status, new_reuse, reason_text);
  end if;
  if new_date is distinct from item.expected_purchase_date then
    perform finance.append_audit(p_actor, 'budget_item', item.id::text, 'expected_purchase_date', item.expected_purchase_date::text, new_date::text, reason_text);
  end if;
  if new_owner is distinct from item.owner_email then
    perform finance.append_audit(p_actor, 'budget_item', item.id::text, 'owner_email', item.owner_email, new_owner, reason_text);
  end if;
  if new_status is distinct from item.status then
    perform finance.append_audit(p_actor, 'budget_item', item.id::text, 'status', item.status, new_status, reason_text);
  end if;
  if new_note is distinct from item.note then
    perform finance.append_audit(p_actor, 'budget_item', item.id::text, 'note', item.note, new_note, reason_text);
  end if;
  if new_earmark is distinct from item.earmark_id then
    perform finance.append_audit(p_actor, 'budget_item', item.id::text, 'earmark_id', item.earmark_id::text, new_earmark::text, reason_text);
  end if;

  update finance.budget_items
    set system_id = new_system,
        description = new_description,
        category = new_category,
        planned_ore = new_planned,
        priority = new_priority,
        reuse_status = new_reuse,
        expected_purchase_date = new_date,
        owner_email = new_owner,
        status = new_status,
        note = new_note,
        earmark_id = new_earmark,
        revision = revision + 1,
        updated_at = clock_timestamp(),
        updated_by_member_id = p_actor
    where id = item.id;
  return finance.finish_budget_mutation(p_actor, p_request_id, 'editItem', p_payload_hash, item.id);
exception when unique_violation then
  get stacked diagnostics v_constraint = CONSTRAINT_NAME;
  if v_constraint = 'idempotency_keys_pkey' then
    saved := finance.replay_budget_mutation(p_actor, p_request_id, 'editItem', p_payload_hash);
    if saved is not null then
      return saved;
    end if;
  end if;
  raise;
end;
$fn$;

create or replace function finance.cancel_budget_item(
  p_actor uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_item_id uuid,
  p_expected_revision integer,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  replay jsonb;
  item finance.budget_items%rowtype;
  current_budget finance.budgets%rowtype;
  reason_text text;
  v_constraint text;
  saved jsonb;
begin
  replay := finance.begin_budget_mutation(p_actor, p_request_id, 'cancelItem', p_payload_hash, 'draftBudgetItems');
  if replay is not null then
    return replay;
  end if;
  select * into item from finance.budget_items where id = p_item_id for update;
  if not found then
    raise exception 'FINANCE|not_found|Budget item not found.';
  end if;
  if item.protected then
    raise exception 'FINANCE|invalid|An unallocated item cannot be cancelled.|itemId';
  end if;
  if item.status = 'cancelled' then
    raise exception 'FINANCE|conflict|This item is already cancelled.';
  end if;
  if item.revision <> p_expected_revision then
    raise exception 'FINANCE|stale|This record changed before it could be saved. Review the latest values and try again.';
  end if;
  select * into current_budget from finance.budgets where id = item.budget_id for update;
  if not exists (
    select 1
    from finance.seasons s
    join finance.settings st on st.setting_key = 'current_season' and s.code = st.setting_value #>> '{}'
    where s.id = current_budget.season_id and s.status <> 'closed'
  ) then
    raise exception 'FINANCE|conflict|Only the current open season budget can be changed.';
  end if;
  reason_text := finance.require_budget_reason(p_actor, current_budget.status = 'approved', p_reason);
  update finance.budget_items
    set status = 'cancelled',
        revision = revision + 1,
        updated_at = clock_timestamp(),
        updated_by_member_id = p_actor
    where id = item.id;
  perform finance.append_audit(p_actor, 'budget_item', item.id::text, 'status', item.status, 'cancelled', reason_text);
  return finance.finish_budget_mutation(p_actor, p_request_id, 'cancelItem', p_payload_hash, item.id);
exception when unique_violation then
  get stacked diagnostics v_constraint = CONSTRAINT_NAME;
  if v_constraint = 'idempotency_keys_pkey' then
    saved := finance.replay_budget_mutation(p_actor, p_request_id, 'cancelItem', p_payload_hash);
    if saved is not null then
      return saved;
    end if;
  end if;
  raise;
end;
$fn$;

create or replace function finance.restore_budget_item(
  p_actor uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_item_id uuid,
  p_expected_revision integer,
  p_reason text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  replay jsonb;
  item finance.budget_items%rowtype;
  current_budget finance.budgets%rowtype;
  reason_text text;
  v_constraint text;
  saved jsonb;
begin
  replay := finance.begin_budget_mutation(p_actor, p_request_id, 'restoreItem', p_payload_hash, 'draftBudgetItems');
  if replay is not null then
    return replay;
  end if;
  select * into item from finance.budget_items where id = p_item_id for update;
  if not found then
    raise exception 'FINANCE|not_found|Budget item not found.';
  end if;
  if item.protected then
    raise exception 'FINANCE|invalid|An unallocated item cannot be restored.|itemId';
  end if;
  if item.status <> 'cancelled' then
    raise exception 'FINANCE|conflict|Only a cancelled item can be restored.';
  end if;
  if item.revision <> p_expected_revision then
    raise exception 'FINANCE|stale|This record changed before it could be saved. Review the latest values and try again.';
  end if;
  select * into current_budget from finance.budgets where id = item.budget_id for update;
  if not exists (
    select 1
    from finance.seasons s
    join finance.settings st on st.setting_key = 'current_season' and s.code = st.setting_value #>> '{}'
    where s.id = current_budget.season_id and s.status <> 'closed'
  ) then
    raise exception 'FINANCE|conflict|Only the current open season budget can be changed.';
  end if;
  reason_text := finance.require_budget_reason(p_actor, current_budget.status = 'approved', p_reason);
  perform finance.assert_earmark_link(current_budget.id, item.id, item.system_id, item.earmark_id, item.priority);
  update finance.budget_items
    set status = 'planned',
        revision = revision + 1,
        updated_at = clock_timestamp(),
        updated_by_member_id = p_actor
    where id = item.id;
  perform finance.append_audit(p_actor, 'budget_item', item.id::text, 'status', 'cancelled', 'planned', reason_text);
  return finance.finish_budget_mutation(p_actor, p_request_id, 'restoreItem', p_payload_hash, item.id);
exception when unique_violation then
  get stacked diagnostics v_constraint = CONSTRAINT_NAME;
  if v_constraint = 'idempotency_keys_pkey' then
    saved := finance.replay_budget_mutation(p_actor, p_request_id, 'restoreItem', p_payload_hash);
    if saved is not null then
      return saved;
    end if;
  end if;
  raise;
end;
$fn$;

create or replace function finance.ensure_unallocated_item(
  p_actor uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_system_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  replay jsonb;
  current_budget finance.budgets%rowtype;
  season_code text;
  system_code text;
  system_active boolean;
  existing_id uuid;
  item_ref text;
  item_id uuid;
  v_constraint text;
  saved jsonb;
  winner uuid;
begin
  replay := finance.begin_budget_mutation(p_actor, p_request_id, 'ensureUnallocated', p_payload_hash, 'registerActual');
  if replay is not null then
    return replay;
  end if;
  select code, active into system_code, system_active
  from finance.systems
  where id = p_system_id
  for update;
  if not found or system_active is not true then
    raise exception 'FINANCE|invalid|Choose an active system.|systemId';
  end if;
  current_budget := finance.lock_current_budget();
  select id into existing_id
  from finance.budget_items
  where budget_id = current_budget.id and system_id = p_system_id and protected;
  if found then
    return finance.store_budget_result(p_actor, p_request_id, 'ensureUnallocated', p_payload_hash, existing_id);
  end if;
  select code into season_code from finance.seasons where id = current_budget.season_id;
  item_ref := 'BI-' || season_code || '-' || substring(system_code from 5) || '-UNALLOC';
  insert into finance.budget_items (
    budget_id, system_id, public_ref, description, category, planned_ore, priority,
    reuse_status, status, protected, created_by_member_id, updated_by_member_id
  ) values (
    current_budget.id, p_system_id, item_ref, 'Unallocated', 'other', 0, 'P4',
    'new', 'planned', true, p_actor, p_actor
  ) returning id into item_id;
  perform finance.append_audit(p_actor, 'budget_item', item_id::text, 'created', null, item_ref, null);
  return finance.finish_budget_mutation(p_actor, p_request_id, 'ensureUnallocated', p_payload_hash, item_id);
exception when unique_violation then
  get stacked diagnostics v_constraint = CONSTRAINT_NAME;
  if v_constraint = 'idempotency_keys_pkey' then
    saved := finance.replay_budget_mutation(p_actor, p_request_id, 'ensureUnallocated', p_payload_hash);
    if saved is not null then
      return saved;
    end if;
  end if;
  if v_constraint in ('budget_items_one_unallocated', 'budget_items_public_ref_key') then
    select i.id into winner
    from finance.budget_items i
    join finance.budgets b on b.id = i.budget_id
    join finance.seasons s on s.id = b.season_id
    join finance.settings st on st.setting_key = 'current_season' and s.code = st.setting_value #>> '{}'
    where i.system_id = p_system_id and i.protected;
    if winner is not null then
      return finance.store_budget_result(p_actor, p_request_id, 'ensureUnallocated', p_payload_hash, winner);
    end if;
  end if;
  raise;
end;
$fn$;

revoke all on function finance.reject_closed_budget_item_write() from public;
revoke all on function finance.reject_unallocated_change() from public;
revoke all on function finance.begin_budget_mutation(uuid, uuid, text, text, text) from public;
revoke all on function finance.replay_budget_mutation(uuid, uuid, text, text) from public;
revoke all on function finance.finish_budget_mutation(uuid, uuid, text, text, uuid) from public;
revoke all on function finance.store_budget_result(uuid, uuid, text, text, uuid) from public;
revoke all on function finance.require_budget_reason(uuid, boolean, text) from public;
revoke all on function finance.lock_current_budget() from public;
revoke all on function finance.issue_budget_item_ordinal(uuid, text) from public;
revoke all on function finance.budget_item_reference(text, integer) from public;
revoke all on function finance.create_season_budget(uuid, uuid, text) from public;
revoke all on function finance.approve_season_budget(uuid, uuid, text, integer, date) from public;
revoke all on function finance.assert_earmark_link(uuid, uuid, uuid, uuid, text) from public;
revoke all on function finance.add_budget_item(uuid, uuid, text, integer, uuid, text, text, bigint, text, text, date, text, text, text, uuid, text) from public;
revoke all on function finance.edit_budget_item(uuid, uuid, text, uuid, integer, jsonb, text) from public;
revoke all on function finance.cancel_budget_item(uuid, uuid, text, uuid, integer, text) from public;
revoke all on function finance.restore_budget_item(uuid, uuid, text, uuid, integer, text) from public;
revoke all on function finance.ensure_unallocated_item(uuid, uuid, text, uuid) from public;

grant execute on function finance.reject_closed_budget_item_write() to current_user;
grant execute on function finance.reject_unallocated_change() to current_user;
grant execute on function finance.begin_budget_mutation(uuid, uuid, text, text, text) to current_user;
grant execute on function finance.replay_budget_mutation(uuid, uuid, text, text) to current_user;
grant execute on function finance.finish_budget_mutation(uuid, uuid, text, text, uuid) to current_user;
grant execute on function finance.store_budget_result(uuid, uuid, text, text, uuid) to current_user;
grant execute on function finance.require_budget_reason(uuid, boolean, text) to current_user;
grant execute on function finance.lock_current_budget() to current_user;
grant execute on function finance.issue_budget_item_ordinal(uuid, text) to current_user;
grant execute on function finance.budget_item_reference(text, integer) to current_user;
grant execute on function finance.create_season_budget(uuid, uuid, text) to current_user;
grant execute on function finance.approve_season_budget(uuid, uuid, text, integer, date) to current_user;
grant execute on function finance.assert_earmark_link(uuid, uuid, uuid, uuid, text) to current_user;
grant execute on function finance.add_budget_item(uuid, uuid, text, integer, uuid, text, text, bigint, text, text, date, text, text, text, uuid, text) to current_user;
grant execute on function finance.edit_budget_item(uuid, uuid, text, uuid, integer, jsonb, text) to current_user;
grant execute on function finance.cancel_budget_item(uuid, uuid, text, uuid, integer, text) to current_user;
grant execute on function finance.restore_budget_item(uuid, uuid, text, uuid, integer, text) to current_user;
grant execute on function finance.ensure_unallocated_item(uuid, uuid, text, uuid) to current_user;

commit;
