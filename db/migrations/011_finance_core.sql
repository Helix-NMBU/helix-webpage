-- Finance core schema. Additive and private.
-- Depends on identity.members (001) and identity.departments (009).
-- Does not renumber or edit earlier migrations.
-- Inserts no grants, seasons, budgets, funding, purchases, or other business rows.
-- The single view_versions row is the freshness token, starting at 0.
-- The API connects as the table owner and bypasses row level security.
-- Browser roles receive no privileges. Enable RLS so a future non-owner role is denied by default.

begin;

create schema if not exists finance;

create table finance.view_versions (
  singleton boolean primary key default true check (singleton),
  version bigint not null default 0 check (version >= 0)
);

insert into finance.view_versions (singleton, version) values (true, 0);

create table finance.member_grants (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references identity.members(id) on delete restrict,
  profile text not null check (profile in ('business', 'finance', 'head_of_finance')),
  active boolean not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  operator_member_id uuid not null references identity.members(id),
  revoked_by_member_id uuid references identity.members(id),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  check (operator_member_id <> member_id),
  check (
    (active and revoked_at is null and revoked_by_member_id is null)
    or (not active and revoked_at is not null and revoked_by_member_id is not null and revoked_by_member_id <> member_id)
  )
);

create unique index member_grants_one_active_profile
  on finance.member_grants (member_id, profile)
  where active;

create index member_grants_member_idx on finance.member_grants (member_id, active);

create table finance.seasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^S[0-9]{2}$'),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  start_date date not null,
  end_date date not null,
  status text not null default 'planning' check (status in ('planning', 'active', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_member_id uuid not null references identity.members(id),
  updated_by_member_id uuid not null references identity.members(id),
  check (end_date >= start_date)
);

create table finance.settings (
  setting_key text primary key check (setting_key in ('current_season', 'approval_threshold_ore')),
  setting_value jsonb not null,
  description text not null,
  updated_at timestamptz not null default now(),
  updated_by_member_id uuid not null references identity.members(id)
);

create table finance.reference_counters (
  counter_key text primary key,
  calendar_year integer,
  configured_next bigint not null check (configured_next > 0),
  last_issued bigint,
  updated_at timestamptz not null default now(),
  updated_by_member_id uuid not null references identity.members(id),
  check (last_issued is null or (last_issued > 0 and configured_next > last_issued)),
  check (
    counter_key ~ '^purchase:[0-9]{4}$'
    or counter_key ~ '^budget_item:S[0-9]{2}$'
    or counter_key ~ '^funding:S[0-9]{2}$'
    or counter_key ~ '^request:S[0-9]{2}$'
    or counter_key = 'earmark'
  ),
  check (
    (counter_key ~ '^purchase:' and calendar_year is not null and counter_key = 'purchase:' || calendar_year::text)
    or (counter_key !~ '^purchase:' and calendar_year is null)
  )
);

create table finance.systems (
  id uuid primary key default gen_random_uuid(),
  department_key text not null references identity.departments(department_key),
  code text not null unique check (code ~ '^SYS-[A-Z0-9]+$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  active boolean not null default true,
  is_engineering boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index systems_department_idx on finance.systems (department_key, active, name);

create table finance.funding (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references finance.seasons(id),
  public_ref text not null unique check (public_ref ~ '^F-S[0-9]{2}-[0-9]{3,}$'),
  source_name text not null check (char_length(btrim(source_name)) between 1 and 200),
  owner_name text not null check (char_length(btrim(owner_name)) between 1 and 200),
  funding_type text not null check (funding_type in ('sponsor_cash', 'grant', 'membership', 'other')),
  amount_ore bigint not null check (amount_ore > 0),
  status text not null check (status in ('prospect', 'applied', 'secured', 'received', 'rejected', 'deleted')),
  prior_status text check (prior_status in ('prospect', 'applied', 'secured', 'received', 'rejected')),
  confidence text check (confidence in ('high', 'medium', 'low')),
  expected_date date,
  received_date date,
  owner_email text,
  reporting_required boolean not null default false,
  agreement_link text,
  note text,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_member_id uuid not null references identity.members(id),
  updated_by_member_id uuid not null references identity.members(id)
);

create index funding_season_idx on finance.funding (season_id, status);

create table finance.funding_parts (
  id uuid primary key default gen_random_uuid(),
  funding_id uuid not null references finance.funding(id),
  public_ref text not null unique check (public_ref ~ '^FE-[0-9]{3,}$'),
  purpose text not null check (char_length(btrim(purpose)) between 1 and 300),
  amount_ore bigint not null check (amount_ore > 0),
  spend_by date,
  conditions text,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_member_id uuid not null references identity.members(id),
  updated_by_member_id uuid not null references identity.members(id)
);

create index funding_parts_funding_idx on finance.funding_parts (funding_id);

create table finance.budgets (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null unique references finance.seasons(id),
  public_ref text not null unique check (public_ref ~ '^B-S[0-9]{2}$'),
  status text not null check (status in ('draft', 'approved')),
  revision integer not null default 0 check (revision >= 0),
  approved_by_member_id uuid references identity.members(id),
  approved_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_member_id uuid not null references identity.members(id),
  updated_by_member_id uuid not null references identity.members(id),
  check ((status = 'approved' and approved_by_member_id is not null and approved_on is not null) or (status = 'draft' and approved_by_member_id is null and approved_on is null))
);

create table finance.budget_items (
  id uuid primary key default gen_random_uuid(),
  budget_id uuid not null references finance.budgets(id),
  system_id uuid not null references finance.systems(id),
  public_ref text not null unique check (public_ref ~ '^BI-S[0-9]{2}-([0-9]{3,}|[A-Z0-9]+-UNALLOC)$'),
  description text not null check (char_length(btrim(description)) between 1 and 300),
  category text not null,
  planned_ore bigint not null check (planned_ore >= 0),
  priority text not null check (priority in ('P1', 'P2', 'P3', 'P4', 'EM')),
  reuse_status text not null check (reuse_status in ('new', 'reuse', 'inspect', 'consumable')),
  expected_purchase_date date,
  owner_member_id uuid references identity.members(id),
  status text not null check (status in ('planned', 'active', 'done', 'cancelled')),
  note text,
  earmark_id uuid references finance.funding_parts(id),
  protected boolean not null default false,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_member_id uuid not null references identity.members(id),
  updated_by_member_id uuid not null references identity.members(id),
  check ((priority = 'EM' and earmark_id is not null) or (priority <> 'EM' and earmark_id is null)),
  check (not protected or planned_ore = 0)
);

create index budget_items_budget_idx on finance.budget_items (budget_id, system_id, status);
create index budget_items_earmark_idx on finance.budget_items (earmark_id) where earmark_id is not null;

create table finance.requests (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references finance.seasons(id),
  requester_member_id uuid not null references identity.members(id),
  public_ref text not null unique check (public_ref ~ '^RQ-S[0-9]{2}-[0-9]{3,}$'),
  status text not null check (status in ('draft', 'submitted', 'rejected', 'approved', 'closed', 'cancelled')),
  supplier_name text,
  justification text,
  planned_date date,
  late_reason text,
  close_reason text,
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index requests_requester_idx on finance.requests (requester_member_id, season_id, status);

create table finance.request_revisions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references finance.requests(id),
  revision_number integer not null check (revision_number > 0),
  supplier_name text not null,
  justification text not null,
  planned_date date not null,
  late_reason text,
  submitted_at timestamptz not null default now(),
  unique (request_id, revision_number)
);

create table finance.request_lines (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references finance.request_revisions(id),
  budget_item_id uuid not null references finance.budget_items(id),
  ordinal integer not null check (ordinal > 0),
  description text not null,
  estimated_ore bigint not null check (estimated_ore > 0),
  approved_ore bigint check (approved_ore is null or approved_ore >= 0),
  unique (revision_id, ordinal)
);

create table finance.request_decisions (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null unique references finance.request_revisions(id),
  decision text not null check (decision in ('approved', 'rejected')),
  reason text not null,
  actor_member_id uuid not null references identity.members(id),
  decided_at timestamptz not null default now()
);

create table finance.purchases (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references finance.seasons(id),
  requester_member_id uuid not null references identity.members(id),
  public_ref text not null unique check (public_ref ~ '^[0-9]{4}-[0-9]{4,}$'),
  status text not null check (status in ('registered', 'voided')),
  buyer_name text not null check (char_length(btrim(buyer_name)) between 1 and 200),
  supplier_name text not null check (char_length(btrim(supplier_name)) between 1 and 200),
  payment_method text not null check (payment_method in ('team_account', 'outlay', 'invoice')),
  purchase_date date not null,
  justification text not null check (char_length(btrim(justification)) >= 10),
  document_kind text not null check (document_kind in ('receipt', 'invoice')),
  document_number text,
  refund_account text check (refund_account is null or refund_account ~ '^[0-9]{11}$'),
  refund_phone text check (refund_phone is null or refund_phone ~ '^[0-9]{8}$'),
  void_reason text,
  voided_at timestamptz,
  voided_by_member_id uuid references identity.members(id),
  request_id uuid references finance.requests(id),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(),
  check (
    (status = 'voided' and void_reason is not null and voided_at is not null and voided_by_member_id is not null)
    or (status = 'registered' and void_reason is null and voided_at is null and voided_by_member_id is null)
  ),
  check (
    (
      payment_method = 'outlay'
      and ((refund_account is not null and refund_phone is null) or (refund_account is null and refund_phone is not null))
    )
    or (
      payment_method <> 'outlay'
      and refund_account is null
      and refund_phone is null
    )
  )
);

create index purchases_season_idx on finance.purchases (season_id, status, public_ref);
create index purchases_requester_idx on finance.purchases (requester_member_id, created_at);

create table finance.purchase_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references finance.purchases(id) on delete cascade,
  public_ref text not null unique check (public_ref ~ '^[0-9]{4}-[0-9]{4,}-L[0-9]+$'),
  system_id uuid not null references finance.systems(id),
  budget_item_id uuid references finance.budget_items(id),
  unbudgeted boolean not null default false,
  request_line_id uuid references finance.request_lines(id),
  description text not null check (char_length(btrim(description)) between 1 and 300),
  quantity numeric not null check (quantity > 0),
  amount_ore bigint not null check (amount_ore > 0),
  check ((unbudgeted and budget_item_id is null) or (not unbudgeted and budget_item_id is not null))
);

create index purchase_lines_purchase_idx on finance.purchase_lines (purchase_id);

create table finance.allocations (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null references finance.purchase_lines(id) on delete cascade,
  budget_item_id uuid not null references finance.budget_items(id),
  public_ref text not null unique check (public_ref ~ '^[0-9]{4}-[0-9]{4,}-L[0-9]+-A[0-9]+$'),
  amount_ore bigint not null check (amount_ore > 0),
  note text
);

create index allocations_line_idx on finance.allocations (line_id);
create index allocations_item_idx on finance.allocations (budget_item_id);

create table finance.invoice_obligations (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null unique references finance.purchases(id),
  due_date date,
  paid boolean not null default false,
  paid_on date,
  paid_by_member_id uuid references identity.members(id),
  check ((paid and paid_on is not null and paid_by_member_id is not null) or (not paid and paid_on is null and paid_by_member_id is null))
);

create table finance.outlay_reimbursements (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null unique references finance.purchases(id),
  paid boolean not null default false,
  paid_on date,
  paid_by_member_id uuid references identity.members(id),
  check ((paid and paid_on is not null and paid_by_member_id is not null) or (not paid and paid_on is null and paid_by_member_id is null))
);

create table finance.documents (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references finance.purchases(id),
  public_ref text not null unique check (public_ref ~ '^[0-9]{4}-[0-9]{4,}-D[0-9]+$'),
  kind text not null check (kind in ('receipt', 'invoice')),
  document_number text,
  document_date date,
  original_name text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  content_sha256 text not null,
  storage_key text not null unique,
  created_at timestamptz not null default now()
);

create index documents_purchase_idx on finance.documents (purchase_id);

create table finance.uploads (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references identity.members(id),
  staging_key text not null unique,
  final_key text unique,
  status text not null check (status in ('pending', 'finalized', 'abandoned')),
  byte_size bigint check (byte_size is null or (byte_size > 0 and byte_size <= 10485760)),
  content_type text,
  original_name text,
  content_sha256 text,
  expires_at timestamptz not null,
  purchase_id uuid references finance.purchases(id),
  created_at timestamptz not null default now(),
  check (
    (status = 'finalized' and final_key is not null and byte_size is not null and content_sha256 is not null)
    or (status <> 'finalized')
  )
);

create index uploads_member_idx on finance.uploads (member_id, status);

create table finance.exception_reviews (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references finance.purchases(id),
  kind text not null check (kind in ('missing_approval', 'overrun', 'line_mismatch', 'dated_before_approval')),
  facts jsonb not null check (jsonb_typeof(facts) = 'object'),
  review_status text not null default 'open' check (review_status in ('open', 'reviewed')),
  reason text,
  actor_member_id uuid references identity.members(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (review_status = 'open' and reviewed_at is null and reason is null and actor_member_id is null)
    or (review_status = 'reviewed' and reviewed_at is not null and reason is not null and actor_member_id is not null)
  )
);

create index exception_reviews_purchase_idx on finance.exception_reviews (purchase_id, created_at);

create table finance.idempotency_keys (
  member_id uuid not null references identity.members(id) on delete cascade,
  request_id uuid not null,
  action text not null,
  payload_hash text not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (member_id, request_id)
);

create table finance.outbox (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  entity text not null,
  entity_id uuid not null,
  recipient_member_id uuid references identity.members(id),
  dedupe_key text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'uncertain')),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index outbox_status_idx on finance.outbox (status, created_at);

create table finance.audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_member_id uuid references identity.members(id),
  entity text not null,
  entity_id text not null,
  field_name text not null,
  old_value text,
  new_value text,
  reason text
);

create index audit_log_entity_idx on finance.audit_log (entity, entity_id, occurred_at);

create or replace function finance.reject_audit_mutation()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'Audit history is append-only' using errcode = '42501';
end;
$fn$;

create trigger audit_log_append_only
  before update or delete on finance.audit_log
  for each row execute function finance.reject_audit_mutation();

create trigger audit_log_no_truncate
  before truncate on finance.audit_log
  for each statement execute function finance.reject_audit_mutation();

create or replace function finance.append_audit(
  p_actor_member_id uuid,
  p_entity text,
  p_entity_id text,
  p_field_name text,
  p_old_value text,
  p_new_value text,
  p_reason text
) returns void
language sql
security invoker
set search_path = pg_catalog, finance
as $fn$
  insert into finance.audit_log (actor_member_id, entity, entity_id, field_name, old_value, new_value, reason)
  values (p_actor_member_id, p_entity, p_entity_id, p_field_name, p_old_value, p_new_value, p_reason);
$fn$;

create or replace function finance.bump_view_version()
returns bigint
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  next_version bigint;
begin
  update finance.view_versions
    set version = version + 1
    where singleton
    returning version into next_version;
  return next_version;
end;
$fn$;

create or replace function finance.reject_closed_season_write()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  season_status text;
begin
  select status into season_status from finance.seasons where id = new.season_id;
  if season_status = 'closed' then
    raise exception 'This season is closed' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

create trigger budgets_reject_closed_season
  before insert or update on finance.budgets
  for each row execute function finance.reject_closed_season_write();
create trigger funding_reject_closed_season
  before insert or update on finance.funding
  for each row execute function finance.reject_closed_season_write();
create trigger purchases_reject_closed_season
  before insert or update on finance.purchases
  for each row execute function finance.reject_closed_season_write();
create trigger requests_reject_closed_season
  before insert or update on finance.requests
  for each row execute function finance.reject_closed_season_write();

create or replace function finance.enforce_earmark_system()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
begin
  if new.earmark_id is null or new.status = 'cancelled' then
    return new;
  end if;
  if exists (
    select 1
    from finance.budget_items other
    where other.earmark_id = new.earmark_id
      and other.id <> new.id
      and other.status <> 'cancelled'
      and other.system_id <> new.system_id
  ) then
    raise exception 'An earmarked part can only link items in one system' using errcode = '23514';
  end if;
  return new;
end;
$fn$;

create trigger budget_items_one_earmark_system
  before insert or update on finance.budget_items
  for each row execute function finance.enforce_earmark_system();

create or replace function finance.enforce_earmark_season()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
begin
  if new.earmark_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from finance.funding_parts p
    join finance.funding f on f.id = p.funding_id
    join finance.budgets b on b.id = new.budget_id
    where p.id = new.earmark_id
      and f.season_id = b.season_id
  ) then
    raise exception 'An earmarked part must belong to the same season' using errcode = '23514';
  end if;
  return new;
end;
$fn$;

create trigger budget_items_earmark_same_season
  before insert or update on finance.budget_items
  for each row execute function finance.enforce_earmark_season();

create or replace function finance.enforce_allocation_total()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  target_line uuid;
  line_amount bigint;
  allocated bigint;
begin
  if tg_table_name = 'allocations' then
    target_line := coalesce(new.line_id, old.line_id);
  else
    target_line := coalesce(new.id, old.id);
  end if;
  select amount_ore into line_amount from finance.purchase_lines where id = target_line;
  if not found then
    return null;
  end if;
  select coalesce(sum(amount_ore), 0) into allocated from finance.allocations where line_id = target_line;
  if allocated <> line_amount then
    raise exception 'Allocation total must equal the line amount' using errcode = '23514';
  end if;
  return null;
end;
$fn$;

create constraint trigger purchase_lines_allocation_total
  after insert or update or delete on finance.purchase_lines
  deferrable initially deferred
  for each row execute function finance.enforce_allocation_total();

create constraint trigger allocations_match_line_total
  after insert or update or delete on finance.allocations
  deferrable initially deferred
  for each row execute function finance.enforce_allocation_total();

create or replace function finance.require_operator(p_operator_member_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, identity
as $fn$
begin
  if p_operator_member_id is null or not exists (select 1 from identity.members where id = p_operator_member_id) then
    raise exception 'Operator not found' using errcode = 'P0002';
  end if;
end;
$fn$;

-- Trusted operator path. Not exposed through the member API. Rejects self-grant.
create or replace function finance.set_member_grant(
  p_operator_member_id uuid,
  p_member_id uuid,
  p_profile text,
  p_active boolean,
  p_reason text
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
declare
  grant_id uuid;
begin
  perform finance.require_operator(p_operator_member_id);
  if p_member_id is null or p_active is null then
    raise exception 'Grant details are required' using errcode = '22023';
  end if;
  if p_operator_member_id = p_member_id then
    raise exception 'Self-grant is not allowed' using errcode = '42501';
  end if;
  if not exists (
    select 1
    from identity.member_roles
    where member_id = p_operator_member_id
      and role_key = 'platform_administrator'
  ) then
    raise exception 'Operator must be an active platform administrator' using errcode = '42501';
  end if;
  if p_profile not in ('business', 'finance', 'head_of_finance') then
    raise exception 'Invalid finance profile' using errcode = '22023';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 1 or char_length(p_reason) > 500 then
    raise exception 'A grant reason is required' using errcode = '22023';
  end if;
  if not exists (select 1 from identity.members where id = p_member_id) then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;

  select id into grant_id
  from finance.member_grants
  where member_id = p_member_id and profile = p_profile and active
  for update;

  if p_active then
    if grant_id is not null then
      return grant_id;
    end if;
    insert into finance.member_grants (member_id, profile, active, operator_member_id, reason)
    values (p_member_id, p_profile, true, p_operator_member_id, btrim(p_reason))
    returning id into grant_id;
    perform finance.append_audit(p_operator_member_id, 'member_grant', grant_id::text, 'active', 'false', 'true', btrim(p_reason));
  else
    if grant_id is null then
      raise exception 'Active finance profile not found' using errcode = 'P0002';
    end if;
    update finance.member_grants
      set active = false,
          revoked_at = clock_timestamp(),
          revoked_by_member_id = p_operator_member_id
      where id = grant_id;
    perform finance.append_audit(p_operator_member_id, 'member_grant', grant_id::text, 'active', 'true', 'false', btrim(p_reason));
  end if;
  perform finance.bump_view_version();
  return grant_id;
end;
$fn$;

create or replace function finance.configure_current_season(
  p_operator_member_id uuid,
  p_code text,
  p_name text,
  p_start_date date,
  p_end_date date
) returns text
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
declare
  season_id uuid;
  previous text;
begin
  perform finance.require_operator(p_operator_member_id);
  if p_code is null or p_code !~ '^S[0-9]{2}$' or p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
    raise exception 'Season details are invalid' using errcode = '22023';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'Season dates are invalid' using errcode = '22023';
  end if;
  select id into season_id from finance.seasons where code = p_code;
  if season_id is null then
    insert into finance.seasons (code, name, start_date, end_date, created_by_member_id, updated_by_member_id)
    values (p_code, btrim(p_name), p_start_date, p_end_date, p_operator_member_id, p_operator_member_id);
  else
    update finance.seasons
      set name = btrim(p_name),
          start_date = p_start_date,
          end_date = p_end_date,
          updated_at = clock_timestamp(),
          updated_by_member_id = p_operator_member_id
      where id = season_id;
  end if;
  select setting_value #>> '{}' into previous from finance.settings where setting_key = 'current_season';
  insert into finance.settings (setting_key, setting_value, description, updated_by_member_id)
  values ('current_season', to_jsonb(p_code), 'Current finance season code', p_operator_member_id)
  on conflict (setting_key) do update
    set setting_value = excluded.setting_value,
        updated_at = clock_timestamp(),
        updated_by_member_id = excluded.updated_by_member_id;
  perform finance.append_audit(p_operator_member_id, 'settings', 'current_season', 'current_season', previous, p_code, null);
  perform finance.bump_view_version();
  return p_code;
end;
$fn$;

create or replace function finance.configure_approval_threshold(
  p_operator_member_id uuid,
  p_threshold_ore bigint
) returns bigint
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
declare
  previous text;
begin
  perform finance.require_operator(p_operator_member_id);
  if p_threshold_ore is null or p_threshold_ore <= 0 then
    raise exception 'Approval threshold must be a positive number of ore' using errcode = '22023';
  end if;
  select setting_value::text into previous from finance.settings where setting_key = 'approval_threshold_ore';
  insert into finance.settings (setting_key, setting_value, description, updated_by_member_id)
  values ('approval_threshold_ore', to_jsonb(p_threshold_ore), 'Strict approval threshold in ore', p_operator_member_id)
  on conflict (setting_key) do update
    set setting_value = excluded.setting_value,
        updated_at = clock_timestamp(),
        updated_by_member_id = excluded.updated_by_member_id;
  perform finance.append_audit(
    p_operator_member_id,
    'settings',
    'approval_threshold_ore',
    'approval_threshold_ore',
    previous,
    p_threshold_ore::text,
    null
  );
  perform finance.bump_view_version();
  return p_threshold_ore;
end;
$fn$;

-- Sets the next annual purchase reference. Does not write last_issued and does not create a purchase.
create or replace function finance.configure_annual_reference_start(
  p_operator_member_id uuid,
  p_year integer,
  p_next_value bigint
) returns table (calendar_year integer, next_value bigint, issued boolean)
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
declare
  key_value text;
  current_next bigint;
  current_issued bigint;
begin
  perform finance.require_operator(p_operator_member_id);
  if p_year is null or p_year < 2000 or p_year > 2200 or p_next_value is null or p_next_value <= 0 then
    raise exception 'Annual reference start is invalid' using errcode = '22023';
  end if;
  key_value := 'purchase:' || p_year::text;
  select configured_next, last_issued into current_next, current_issued
  from finance.reference_counters
  where finance.reference_counters.counter_key = key_value
  for update;
  if current_issued is not null and p_next_value <= current_issued then
    raise exception 'Reference start would reuse an issued value' using errcode = '23514';
  end if;
  if current_next is not null and p_next_value < current_next then
    raise exception 'Reference start must not move backward' using errcode = '23514';
  end if;
  insert into finance.reference_counters (counter_key, calendar_year, configured_next, last_issued, updated_by_member_id)
  values (key_value, p_year, p_next_value, null, p_operator_member_id)
  on conflict (counter_key) do update
    set configured_next = excluded.configured_next,
        updated_at = clock_timestamp(),
        updated_by_member_id = excluded.updated_by_member_id;
  perform finance.append_audit(
    p_operator_member_id,
    'reference_counter',
    key_value,
    'configured_next',
    current_next::text,
    p_next_value::text,
    null
  );
  perform finance.bump_view_version();
  calendar_year := p_year;
  next_value := p_next_value;
  issued := false;
  return next;
end;
$fn$;

-- Membership is the caller's responsibility. This function does not read platform roles,
-- departments, titles, team.finance, or recruiting grants.
create or replace function finance.capability_flags(p_member_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
declare
  profiles text[];
  head boolean;
  finance_profile boolean;
  business boolean;
begin
  if p_member_id is null or not exists (select 1 from identity.members where id = p_member_id) then
    return jsonb_build_object(
      'profiles', '[]'::jsonb,
      'publicBudgets', false,
      'publicEarmarks', false,
      'registerActual', false,
      'ownRequests', false,
      'financing', false,
      'manageFunding', false,
      'purchaseRegister', false,
      'filesAndRefunds', false,
      'paymentsVoidReview', false,
      'draftBudgetItems', false,
      'permittedImports', false,
      'createBudget', false,
      'approveBudget', false,
      'protectedBudgetEdits', false,
      'decideRequests', false
    );
  end if;
  select coalesce(array_agg(profile order by profile), '{}'::text[])
    into profiles
  from finance.member_grants
  where member_id = p_member_id and active and revoked_at is null;
  head := 'head_of_finance' = any(profiles);
  finance_profile := head or 'finance' = any(profiles);
  business := finance_profile or 'business' = any(profiles);
  return jsonb_build_object(
    'profiles', to_jsonb(profiles),
    'publicBudgets', true,
    'publicEarmarks', true,
    'registerActual', true,
    'ownRequests', true,
    'financing', business,
    'manageFunding', business,
    'purchaseRegister', finance_profile,
    'filesAndRefunds', finance_profile,
    'paymentsVoidReview', finance_profile,
    'draftBudgetItems', finance_profile,
    'permittedImports', finance_profile,
    'createBudget', head,
    'approveBudget', head,
    'protectedBudgetEdits', head,
    'decideRequests', head
  );
end;
$fn$;

alter table finance.view_versions enable row level security;
alter table finance.member_grants enable row level security;
alter table finance.seasons enable row level security;
alter table finance.settings enable row level security;
alter table finance.reference_counters enable row level security;
alter table finance.systems enable row level security;
alter table finance.funding enable row level security;
alter table finance.funding_parts enable row level security;
alter table finance.budgets enable row level security;
alter table finance.budget_items enable row level security;
alter table finance.requests enable row level security;
alter table finance.request_revisions enable row level security;
alter table finance.request_lines enable row level security;
alter table finance.request_decisions enable row level security;
alter table finance.purchases enable row level security;
alter table finance.purchase_lines enable row level security;
alter table finance.allocations enable row level security;
alter table finance.invoice_obligations enable row level security;
alter table finance.outlay_reimbursements enable row level security;
alter table finance.documents enable row level security;
alter table finance.uploads enable row level security;
alter table finance.exception_reviews enable row level security;
alter table finance.idempotency_keys enable row level security;
alter table finance.outbox enable row level security;
alter table finance.audit_log enable row level security;

revoke all on schema finance from public;
revoke all on all tables in schema finance from public;
revoke all on all sequences in schema finance from public;
revoke all on all functions in schema finance from public;
alter default privileges in schema finance revoke all on tables from public;
alter default privileges in schema finance revoke all on sequences from public;
alter default privileges in schema finance revoke execute on functions from public;

do $$
declare browser_role text;
begin
  for browser_role in select rolname from pg_roles where rolname in ('anon', 'anonymous', 'authenticated') loop
    execute format('revoke all on schema finance from %I', browser_role);
    execute format('revoke all on all tables in schema finance from %I', browser_role);
    execute format('revoke all on all sequences in schema finance from %I', browser_role);
    execute format('revoke all on all functions in schema finance from %I', browser_role);
  end loop;
end;
$$;

grant usage on schema finance to current_user;
grant select, insert, update, delete on all tables in schema finance to current_user;
revoke update, delete, truncate on finance.audit_log from current_user;
grant execute on all functions in schema finance to current_user;

commit;
