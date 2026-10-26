-- Financing and earmarked parts. Additive functions only.
-- Depends on 011_finance_core.sql. Does not edit earlier migrations and does not add a second file.
-- Does not seed funding, parts, grants, or seasons.
-- Same-season and one-system earmark links stay enforced by the 011 triggers.
-- Each successful change audits, bumps finance.view_versions, and stores the idempotency response in one function call.

begin;

create or replace function finance.format_ore(p_ore bigint)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $fn$
  select case when p_ore < 0 then '-' else '' end
    || (abs(p_ore) / 100)::text
    || '.'
    || lpad((abs(p_ore) % 100)::text, 2, '0');
$fn$;

create or replace function finance.json_has(p_fields jsonb, p_field text)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $fn$
  select coalesce(p_fields, '[]'::jsonb) @> jsonb_build_array(p_field);
$fn$;

create or replace function finance.audit_change(
  p_actor_member_id uuid,
  p_entity text,
  p_entity_id text,
  p_field_name text,
  p_old_value text,
  p_new_value text
) returns void
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
begin
  if p_old_value is distinct from p_new_value then
    perform finance.append_audit(p_actor_member_id, p_entity, p_entity_id, p_field_name, p_old_value, p_new_value, null);
  end if;
end;
$fn$;

-- Soft-delete used by deleteFunding and by an edit whose only change is status deleted.
-- A delete mixed with any other changed field is rejected before this runs.
-- Does not bump the view version; the caller does that once for the whole change.
create or replace function finance.soft_delete_funding(p_actor_member_id uuid, p_funding_id uuid)
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  funding_row finance.funding%rowtype;
  new_revision integer;
begin
  if p_actor_member_id is null or p_funding_id is null then
    raise exception 'finance:INVALID' using errcode = '22023';
  end if;
  select * into funding_row from finance.funding where id = p_funding_id for update;
  if not found then
    raise exception 'finance:FUNDING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if funding_row.status = 'deleted' then
    raise exception 'finance:ALREADY_DELETED' using errcode = 'P0001';
  end if;
  perform 1 from finance.funding_parts where funding_id = funding_row.id for update;
  update finance.funding
    set prior_status = funding_row.status,
        status = 'deleted',
        revision = revision + 1,
        updated_at = clock_timestamp(),
        updated_by_member_id = p_actor_member_id
    where id = funding_row.id
    returning revision into new_revision;
  perform finance.audit_change(p_actor_member_id, 'funding', funding_row.id::text, 'status', funding_row.status, 'deleted');
  return new_revision;
end;
$fn$;

-- Issues the next funding or earmark reference. Does not bump the view version; the caller does.
create or replace function finance.issue_counter(p_key text, p_actor_member_id uuid)
returns bigint
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  configured bigint;
  issued bigint;
  next_value bigint;
begin
  if p_key is null or p_key !~ '^(funding:S[0-9]{2}|earmark)$' then
    raise exception 'finance:INVALID' using errcode = '22023';
  end if;
  insert into finance.reference_counters (counter_key, calendar_year, configured_next, last_issued, updated_by_member_id)
  values (p_key, null, 1, null, p_actor_member_id)
  on conflict (counter_key) do nothing;

  select configured_next, last_issued
    into configured, issued
  from finance.reference_counters
  where counter_key = p_key
  for update;

  next_value := greatest(coalesce(issued, 0) + 1, configured);
  update finance.reference_counters
    set last_issued = next_value,
        configured_next = next_value + 1,
        updated_at = clock_timestamp(),
        updated_by_member_id = p_actor_member_id
    where counter_key = p_key;
  return next_value;
end;
$fn$;

create or replace function finance.apply_funding_change(
  p_actor_member_id uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_command jsonb,
  p_include_draft boolean
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
#variable_conflict use_variable
<<change>>
declare
  stored jsonb;
  constraint_name text;
  season_id uuid;
  season_code text;
  season_status text;
  action text;
  fields jsonb;
  funding_row finance.funding%rowtype;
  part_row finance.funding_parts%rowtype;
  target_funding uuid;
  result_id uuid;
  result_revision integer;
  warn_links boolean := false;
  issued bigint;
  public_ref text;
  source_name text;
  owner_name text;
  funding_type text;
  amount_ore bigint;
  status text;
  confidence text;
  expected_date date;
  received_date date;
  owner_email text;
  reporting_required boolean;
  agreement_link text;
  note text;
  purpose text;
  spend_by date;
  conditions text;
  restored text;
  earmarked bigint;
  funding_amount bigint;
  active_count integer;
  next_version bigint;
  change_response jsonb;
begin
  if p_actor_member_id is null or p_request_id is null or p_payload_hash is null or char_length(p_payload_hash) < 32 or p_command is null or p_include_draft is null then
    raise exception 'finance:INVALID' using errcode = '22023';
  end if;

  select keys.response into stored
  from finance.idempotency_keys as keys
  where keys.member_id = p_actor_member_id and keys.request_id = p_request_id
  for update;
  if found then
    if (select payload_hash from finance.idempotency_keys where member_id = p_actor_member_id and request_id = p_request_id) is distinct from p_payload_hash then
      raise exception 'finance:IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return stored;
  end if;

  select s.id, s.code, s.status
    into season_id, season_code, season_status
  from finance.settings st
  join finance.seasons s on s.code = st.setting_value #>> '{}'
  where st.setting_key = 'current_season';
  if season_id is null then
    raise exception 'finance:NO_SEASON' using errcode = 'P0001';
  end if;
  if season_status = 'closed' then
    raise exception 'finance:SEASON_CLOSED' using errcode = '42501';
  end if;

  action := p_command->>'action';
  fields := p_command->'fields';

  if action = 'addFunding' then
    source_name := btrim(p_command->>'sourceName');
    owner_name := btrim(p_command->>'ownerName');
    funding_type := p_command->>'fundingType';
    status := p_command->>'status';
    confidence := p_command->>'confidence';
    owner_email := nullif(btrim(p_command->>'ownerEmail'), '');
    agreement_link := nullif(btrim(p_command->>'agreementLink'), '');
    note := nullif(btrim(p_command->>'note'), '');
    if source_name is null or char_length(source_name) not between 1 and 200
      or owner_name is null or char_length(owner_name) not between 1 and 200
      or funding_type not in ('sponsor_cash', 'grant', 'membership', 'other')
      or status not in ('prospect', 'applied', 'secured', 'received', 'rejected', 'deleted')
      or (confidence is not null and confidence not in ('high', 'medium', 'low'))
      or coalesce(p_command->>'amountOre', '') !~ '^[0-9]+$'
      or jsonb_typeof(p_command->'reportingRequired') <> 'boolean' then
      raise exception 'finance:INVALID' using errcode = '22023';
    end if;
    amount_ore := (p_command->>'amountOre')::bigint;
    reporting_required := (p_command->>'reportingRequired')::boolean;
    if amount_ore <= 0 then
      raise exception 'finance:INVALID' using errcode = '22023';
    end if;
    if p_command->>'expectedDate' is null then
      expected_date := null;
    else
      expected_date := (p_command->>'expectedDate')::date;
      if to_char(expected_date, 'YYYY-MM-DD') is distinct from p_command->>'expectedDate' then
        raise exception 'finance:INVALID' using errcode = '22023';
      end if;
    end if;
    if p_command->>'receivedDate' is null then
      received_date := null;
    else
      received_date := (p_command->>'receivedDate')::date;
      if to_char(received_date, 'YYYY-MM-DD') is distinct from p_command->>'receivedDate' then
        raise exception 'finance:INVALID' using errcode = '22023';
      end if;
    end if;
    issued := finance.issue_counter('funding:' || season_code, p_actor_member_id);
    public_ref := 'F-' || season_code || '-' || lpad(issued::text, 3, '0');
    insert into finance.funding (
      season_id, public_ref, source_name, owner_name, funding_type, amount_ore, status, confidence,
      expected_date, received_date, owner_email, reporting_required, agreement_link, note,
      created_by_member_id, updated_by_member_id
    ) values (
      season_id, public_ref, source_name, owner_name, funding_type, amount_ore, status, confidence,
      expected_date, received_date, owner_email, reporting_required, agreement_link, note,
      p_actor_member_id, p_actor_member_id
    ) returning id, revision into result_id, result_revision;
    perform finance.audit_change(p_actor_member_id, 'funding', result_id::text, 'source_name', null, source_name);
    perform finance.audit_change(p_actor_member_id, 'funding', result_id::text, 'owner_name', null, owner_name);
    perform finance.audit_change(p_actor_member_id, 'funding', result_id::text, 'funding_type', null, funding_type);
    perform finance.audit_change(p_actor_member_id, 'funding', result_id::text, 'amount_nok', null, finance.format_ore(amount_ore));
    perform finance.audit_change(p_actor_member_id, 'funding', result_id::text, 'status', null, status);
    perform finance.audit_change(p_actor_member_id, 'funding', result_id::text, 'confidence', null, confidence);
    perform finance.audit_change(p_actor_member_id, 'funding', result_id::text, 'expected_date', null, to_char(expected_date, 'YYYY-MM-DD'));
    perform finance.audit_change(p_actor_member_id, 'funding', result_id::text, 'received_date', null, to_char(received_date, 'YYYY-MM-DD'));
    perform finance.audit_change(p_actor_member_id, 'funding', result_id::text, 'owner_email', null, owner_email);
    perform finance.audit_change(p_actor_member_id, 'funding', result_id::text, 'reporting_required', null, reporting_required::text);
    perform finance.audit_change(p_actor_member_id, 'funding', result_id::text, 'agreement_link', null, agreement_link);
    perform finance.audit_change(p_actor_member_id, 'funding', result_id::text, 'note', null, note);
    target_funding := result_id;
    warn_links := false;

  elsif action = 'editFunding' then
    if jsonb_typeof(fields) <> 'array' or jsonb_array_length(fields) < 1 then
      raise exception 'finance:INVALID' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(fields) as field(name)
      where field.name not in (
        'sourceName', 'ownerName', 'fundingType', 'amountOre', 'status', 'confidence',
        'expectedDate', 'receivedDate', 'ownerEmail', 'reportingRequired', 'agreementLink', 'note'
      )
    ) then
      raise exception 'finance:INVALID' using errcode = '22023';
    end if;
    select * into funding_row
    from finance.funding
    where id = (p_command->>'fundingId')::uuid
    for update;
    if not found or funding_row.season_id <> season_id then
      raise exception 'finance:FUNDING_NOT_FOUND' using errcode = 'P0002';
    end if;
    if funding_row.revision <> (p_command->>'expectedRevision')::integer then
      raise exception 'finance:REVISION_CONFLICT' using errcode = '40001';
    end if;
    perform 1 from finance.funding_parts where funding_id = funding_row.id for update;
    source_name := funding_row.source_name;
    owner_name := funding_row.owner_name;
    funding_type := funding_row.funding_type;
    amount_ore := funding_row.amount_ore;
    status := funding_row.status;
    confidence := funding_row.confidence;
    expected_date := funding_row.expected_date;
    received_date := funding_row.received_date;
    owner_email := funding_row.owner_email;
    reporting_required := funding_row.reporting_required;
    agreement_link := funding_row.agreement_link;
    note := funding_row.note;
    if finance.json_has(fields, 'sourceName') then
      source_name := btrim(p_command->'values'->>'sourceName');
    end if;
    if finance.json_has(fields, 'ownerName') then
      owner_name := btrim(p_command->'values'->>'ownerName');
    end if;
    if finance.json_has(fields, 'fundingType') then
      funding_type := p_command->'values'->>'fundingType';
    end if;
    if finance.json_has(fields, 'amountOre') then
      if coalesce(p_command->'values'->>'amountOre', '') !~ '^[0-9]+$' then
        raise exception 'finance:INVALID' using errcode = '22023';
      end if;
      amount_ore := (p_command->'values'->>'amountOre')::bigint;
    end if;
    if finance.json_has(fields, 'status') then
      status := p_command->'values'->>'status';
    end if;
    if finance.json_has(fields, 'confidence') then
      confidence := p_command->'values'->>'confidence';
    end if;
    if finance.json_has(fields, 'expectedDate') then
      if p_command->'values'->>'expectedDate' is null then
        expected_date := null;
      else
        expected_date := (p_command->'values'->>'expectedDate')::date;
        if to_char(expected_date, 'YYYY-MM-DD') is distinct from p_command->'values'->>'expectedDate' then
          raise exception 'finance:INVALID' using errcode = '22023';
        end if;
      end if;
    end if;
    if finance.json_has(fields, 'receivedDate') then
      if p_command->'values'->>'receivedDate' is null then
        received_date := null;
      else
        received_date := (p_command->'values'->>'receivedDate')::date;
        if to_char(received_date, 'YYYY-MM-DD') is distinct from p_command->'values'->>'receivedDate' then
          raise exception 'finance:INVALID' using errcode = '22023';
        end if;
      end if;
    end if;
    if finance.json_has(fields, 'ownerEmail') then
      owner_email := nullif(btrim(p_command->'values'->>'ownerEmail'), '');
    end if;
    if finance.json_has(fields, 'reportingRequired') then
      if jsonb_typeof(p_command->'values'->'reportingRequired') <> 'boolean' then
        raise exception 'finance:INVALID' using errcode = '22023';
      end if;
      reporting_required := (p_command->'values'->>'reportingRequired')::boolean;
    end if;
    if finance.json_has(fields, 'agreementLink') then
      agreement_link := nullif(btrim(p_command->'values'->>'agreementLink'), '');
    end if;
    if finance.json_has(fields, 'note') then
      note := nullif(btrim(p_command->'values'->>'note'), '');
    end if;
    if source_name is null or char_length(source_name) not between 1 and 200
      or owner_name is null or char_length(owner_name) not between 1 and 200
      or funding_type not in ('sponsor_cash', 'grant', 'membership', 'other')
      or status not in ('prospect', 'applied', 'secured', 'received', 'rejected', 'deleted')
      or (confidence is not null and confidence not in ('high', 'medium', 'low'))
      or amount_ore <= 0
      or (owner_email is not null and char_length(owner_email) > 200)
      or (note is not null and char_length(note) > 4000)
      or (agreement_link is not null and char_length(agreement_link) > 2000) then
      raise exception 'finance:INVALID' using errcode = '22023';
    end if;
    if status = 'deleted' and funding_row.status <> 'deleted' then
      if source_name is distinct from funding_row.source_name
        or owner_name is distinct from funding_row.owner_name
        or funding_type is distinct from funding_row.funding_type
        or amount_ore is distinct from funding_row.amount_ore
        or confidence is distinct from funding_row.confidence
        or expected_date is distinct from funding_row.expected_date
        or received_date is distinct from funding_row.received_date
        or owner_email is distinct from funding_row.owner_email
        or reporting_required is distinct from funding_row.reporting_required
        or agreement_link is distinct from funding_row.agreement_link
        or note is distinct from funding_row.note
      then
        raise exception 'finance:INVALID Delete on its own, or save your other changes first.' using errcode = '22023';
      end if;
      result_revision := finance.soft_delete_funding(p_actor_member_id, funding_row.id);
      target_funding := funding_row.id;
      result_id := funding_row.id;
      warn_links := true;
    else
      warn_links := false;
      update finance.funding
        set source_name = change.source_name,
            owner_name = change.owner_name,
            funding_type = change.funding_type,
            amount_ore = change.amount_ore,
            status = change.status,
            prior_status = case
              when change.status = 'deleted' and finance.funding.status <> 'deleted' then finance.funding.status
              when change.status <> 'deleted' and finance.funding.status = 'deleted' then null
              else finance.funding.prior_status
            end,
            confidence = change.confidence,
            expected_date = change.expected_date,
            received_date = change.received_date,
            owner_email = change.owner_email,
            reporting_required = change.reporting_required,
            agreement_link = change.agreement_link,
            note = change.note,
            revision = finance.funding.revision + 1,
            updated_at = clock_timestamp(),
            updated_by_member_id = p_actor_member_id
        where id = funding_row.id
        returning revision into result_revision;
      perform finance.audit_change(p_actor_member_id, 'funding', funding_row.id::text, 'source_name', funding_row.source_name, source_name);
      perform finance.audit_change(p_actor_member_id, 'funding', funding_row.id::text, 'owner_name', funding_row.owner_name, owner_name);
      perform finance.audit_change(p_actor_member_id, 'funding', funding_row.id::text, 'funding_type', funding_row.funding_type, funding_type);
      perform finance.audit_change(p_actor_member_id, 'funding', funding_row.id::text, 'amount_nok', finance.format_ore(funding_row.amount_ore), finance.format_ore(amount_ore));
      perform finance.audit_change(p_actor_member_id, 'funding', funding_row.id::text, 'status', funding_row.status, status);
      perform finance.audit_change(p_actor_member_id, 'funding', funding_row.id::text, 'confidence', funding_row.confidence, confidence);
      perform finance.audit_change(p_actor_member_id, 'funding', funding_row.id::text, 'expected_date', to_char(funding_row.expected_date, 'YYYY-MM-DD'), to_char(expected_date, 'YYYY-MM-DD'));
      perform finance.audit_change(p_actor_member_id, 'funding', funding_row.id::text, 'received_date', to_char(funding_row.received_date, 'YYYY-MM-DD'), to_char(received_date, 'YYYY-MM-DD'));
      perform finance.audit_change(p_actor_member_id, 'funding', funding_row.id::text, 'owner_email', funding_row.owner_email, owner_email);
      perform finance.audit_change(p_actor_member_id, 'funding', funding_row.id::text, 'reporting_required', funding_row.reporting_required::text, reporting_required::text);
      perform finance.audit_change(p_actor_member_id, 'funding', funding_row.id::text, 'agreement_link', funding_row.agreement_link, agreement_link);
      perform finance.audit_change(p_actor_member_id, 'funding', funding_row.id::text, 'note', funding_row.note, note);
      target_funding := funding_row.id;
      result_id := funding_row.id;
    end if;

  elsif action = 'deleteFunding' then
    select * into funding_row
    from finance.funding
    where id = (p_command->>'fundingId')::uuid
    for update;
    if not found or funding_row.season_id <> season_id then
      raise exception 'finance:FUNDING_NOT_FOUND' using errcode = 'P0002';
    end if;
    if funding_row.revision <> (p_command->>'expectedRevision')::integer then
      raise exception 'finance:REVISION_CONFLICT' using errcode = '40001';
    end if;
    result_revision := finance.soft_delete_funding(p_actor_member_id, funding_row.id);
    target_funding := funding_row.id;
    result_id := funding_row.id;
    warn_links := true;

  elsif action = 'restoreFunding' then
    select * into funding_row
    from finance.funding
    where id = (p_command->>'fundingId')::uuid
    for update;
    if not found or funding_row.season_id <> season_id then
      raise exception 'finance:FUNDING_NOT_FOUND' using errcode = 'P0002';
    end if;
    if funding_row.revision <> (p_command->>'expectedRevision')::integer then
      raise exception 'finance:REVISION_CONFLICT' using errcode = '40001';
    end if;
    if funding_row.status <> 'deleted' then
      raise exception 'finance:NOT_DELETED' using errcode = 'P0001';
    end if;
    restored := funding_row.prior_status;
    if restored is null or restored not in ('prospect', 'applied', 'secured', 'received', 'rejected') then
      select old_value into restored
      from finance.audit_log
      where entity = 'funding'
        and entity_id = funding_row.id::text
        and field_name = 'status'
        and new_value = 'deleted'
        and old_value in ('prospect', 'applied', 'secured', 'received', 'rejected')
      order by occurred_at desc
      limit 1;
    end if;
    if restored is null or restored not in ('prospect', 'applied', 'secured', 'received', 'rejected') then
      restored := 'applied';
    end if;
    update finance.funding
      set status = restored,
          prior_status = null,
          revision = revision + 1,
          updated_at = clock_timestamp(),
          updated_by_member_id = p_actor_member_id
      where id = funding_row.id
      returning revision into result_revision;
    perform finance.audit_change(p_actor_member_id, 'funding', funding_row.id::text, 'status', 'deleted', restored);
    target_funding := funding_row.id;
    result_id := funding_row.id;
    warn_links := false;

  elsif action = 'addEarmark' then
    select * into funding_row
    from finance.funding
    where id = (p_command->>'fundingId')::uuid
    for update;
    if not found or funding_row.season_id <> season_id then
      raise exception 'finance:FUNDING_NOT_FOUND' using errcode = 'P0002';
    end if;
    if funding_row.revision <> (p_command->>'expectedRevision')::integer then
      raise exception 'finance:REVISION_CONFLICT' using errcode = '40001';
    end if;
    perform 1 from finance.funding_parts where funding_id = funding_row.id for update;
    purpose := btrim(p_command->>'purpose');
    conditions := nullif(btrim(p_command->>'conditions'), '');
    if purpose is null or char_length(purpose) not between 1 and 300
      or coalesce(p_command->>'amountOre', '') !~ '^[0-9]+$'
      or (conditions is not null and char_length(conditions) > 4000) then
      raise exception 'finance:INVALID' using errcode = '22023';
    end if;
    amount_ore := (p_command->>'amountOre')::bigint;
    if amount_ore <= 0 then
      raise exception 'finance:INVALID' using errcode = '22023';
    end if;
    if p_command->>'spendBy' is null then
      spend_by := null;
    else
      spend_by := (p_command->>'spendBy')::date;
      if to_char(spend_by, 'YYYY-MM-DD') is distinct from p_command->>'spendBy' then
        raise exception 'finance:INVALID' using errcode = '22023';
      end if;
    end if;
    issued := finance.issue_counter('earmark', p_actor_member_id);
    public_ref := 'FE-' || lpad(issued::text, 3, '0');
    insert into finance.funding_parts (
      funding_id, public_ref, purpose, amount_ore, spend_by, conditions, created_by_member_id, updated_by_member_id
    ) values (
      funding_row.id, public_ref, purpose, amount_ore, spend_by, conditions, p_actor_member_id, p_actor_member_id
    ) returning id, revision into result_id, result_revision;
    perform finance.audit_change(p_actor_member_id, 'funding_part', result_id::text, 'purpose', null, purpose);
    perform finance.audit_change(p_actor_member_id, 'funding_part', result_id::text, 'amount_nok', null, finance.format_ore(amount_ore));
    perform finance.audit_change(p_actor_member_id, 'funding_part', result_id::text, 'spend_by', null, to_char(spend_by, 'YYYY-MM-DD'));
    perform finance.audit_change(p_actor_member_id, 'funding_part', result_id::text, 'conditions', null, conditions);
    update finance.funding
      set revision = revision + 1,
          updated_at = clock_timestamp(),
          updated_by_member_id = p_actor_member_id
      where id = funding_row.id;
    target_funding := funding_row.id;
    warn_links := false;

  elsif action = 'editEarmark' then
    if jsonb_typeof(fields) <> 'array' or jsonb_array_length(fields) < 1 then
      raise exception 'finance:INVALID' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_array_elements_text(fields) as field(name)
      where field.name not in ('purpose', 'amountOre', 'spendBy', 'conditions')
    ) then
      raise exception 'finance:INVALID' using errcode = '22023';
    end if;
    select * into part_row from finance.funding_parts where id = (p_command->>'partId')::uuid;
    if not found then
      raise exception 'finance:PART_NOT_FOUND' using errcode = 'P0002';
    end if;
    select * into funding_row from finance.funding where id = part_row.funding_id for update;
    if not found or funding_row.season_id <> season_id then
      raise exception 'finance:PART_NOT_FOUND' using errcode = 'P0002';
    end if;
    select * into part_row from finance.funding_parts where id = part_row.id for update;
    if part_row.revision <> (p_command->>'expectedRevision')::integer then
      raise exception 'finance:REVISION_CONFLICT' using errcode = '40001';
    end if;
    perform 1 from finance.funding_parts where funding_id = funding_row.id for update;
    purpose := part_row.purpose;
    amount_ore := part_row.amount_ore;
    spend_by := part_row.spend_by;
    conditions := part_row.conditions;
    if finance.json_has(fields, 'purpose') then
      purpose := btrim(p_command->'values'->>'purpose');
    end if;
    if finance.json_has(fields, 'amountOre') then
      if coalesce(p_command->'values'->>'amountOre', '') !~ '^[0-9]+$' then
        raise exception 'finance:INVALID' using errcode = '22023';
      end if;
      amount_ore := (p_command->'values'->>'amountOre')::bigint;
    end if;
    if finance.json_has(fields, 'spendBy') then
      if p_command->'values'->>'spendBy' is null then
        spend_by := null;
      else
        spend_by := (p_command->'values'->>'spendBy')::date;
        if to_char(spend_by, 'YYYY-MM-DD') is distinct from p_command->'values'->>'spendBy' then
          raise exception 'finance:INVALID' using errcode = '22023';
        end if;
      end if;
    end if;
    if finance.json_has(fields, 'conditions') then
      conditions := nullif(btrim(p_command->'values'->>'conditions'), '');
    end if;
    if purpose is null or char_length(purpose) not between 1 and 300
      or amount_ore <= 0
      or (conditions is not null and char_length(conditions) > 4000) then
      raise exception 'finance:INVALID' using errcode = '22023';
    end if;
    update finance.funding_parts
      set purpose = change.purpose,
          amount_ore = change.amount_ore,
          spend_by = change.spend_by,
          conditions = change.conditions,
          revision = finance.funding_parts.revision + 1,
          updated_at = clock_timestamp(),
          updated_by_member_id = p_actor_member_id
      where id = part_row.id
      returning revision into result_revision;
    perform finance.audit_change(p_actor_member_id, 'funding_part', part_row.id::text, 'purpose', part_row.purpose, purpose);
    perform finance.audit_change(p_actor_member_id, 'funding_part', part_row.id::text, 'amount_nok', finance.format_ore(part_row.amount_ore), finance.format_ore(amount_ore));
    perform finance.audit_change(p_actor_member_id, 'funding_part', part_row.id::text, 'spend_by', to_char(part_row.spend_by, 'YYYY-MM-DD'), to_char(spend_by, 'YYYY-MM-DD'));
    perform finance.audit_change(p_actor_member_id, 'funding_part', part_row.id::text, 'conditions', part_row.conditions, conditions);
    update finance.funding
      set revision = revision + 1,
          updated_at = clock_timestamp(),
          updated_by_member_id = p_actor_member_id
      where id = funding_row.id;
    target_funding := funding_row.id;
    result_id := part_row.id;
    warn_links := false;

  else
    raise exception 'finance:INVALID' using errcode = '22023';
  end if;

  select funding.amount_ore into funding_amount from finance.funding as funding where funding.id = target_funding;
  select coalesce(sum(parts.amount_ore), 0) into earmarked from finance.funding_parts as parts where parts.funding_id = target_funding;
  select count(*)::integer into active_count
  from finance.budget_items i
  join finance.budgets b on b.id = i.budget_id
  join finance.funding_parts p on p.id = i.earmark_id
  where p.funding_id = target_funding
    and i.status <> 'cancelled'
    and (p_include_draft or b.status <> 'draft');
  next_version := finance.bump_view_version();
  change_response := jsonb_build_object(
    'id', result_id,
    'revision', result_revision,
    'viewVersion', next_version,
    'excessOre', (earmarked - funding_amount)::text,
    'activeLinkedItems', active_count,
    'warnActiveLinks', warn_links
  );
  insert into finance.idempotency_keys (member_id, request_id, action, payload_hash, response)
  values (p_actor_member_id, p_request_id, change.action, p_payload_hash, change_response);
  return change_response;
exception
  when unique_violation then
    get stacked diagnostics constraint_name = CONSTRAINT_NAME;
    if constraint_name = 'idempotency_keys_pkey' then
      raise exception 'finance:IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    raise;
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
