begin;

create table finance.income_receipts (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references finance.seasons(id),
  category text not null check (category in ('membership_dues', 'sales', 'donations', 'other_income')),
  source text not null check (char_length(btrim(source)) between 1 and 120),
  amount_ore bigint not null check (amount_ore > 0),
  received_on date not null,
  method text not null check (method in ('bank_transfer', 'vipps', 'card', 'cash', 'other')),
  reference text check (char_length(btrim(reference)) between 1 and 100),
  created_by uuid not null references identity.members(id),
  created_at timestamptz not null default now(),
  voided_by uuid references identity.members(id),
  voided_at timestamptz,
  void_reason text,
  check (
    (voided_at is null and voided_by is null and void_reason is null)
    or (voided_at is not null and voided_by is not null and void_reason is not null and char_length(btrim(void_reason)) between 1 and 300)
  )
);

alter table finance.income_receipts enable row level security;
revoke all on table finance.income_receipts from public;
create index income_receipts_season_date_idx on finance.income_receipts (season_id, received_on desc, created_at desc);
create unique index income_receipts_active_reference_key
  on finance.income_receipts (season_id, method, lower(btrim(reference)))
  where voided_at is null and reference is not null;

create function finance.lock_income_payment_match(p_season uuid, p_source text, p_amount bigint)
returns void language sql set search_path = pg_catalog as $$
  select pg_advisory_xact_lock(hashtextextended('finance-income-similarity:' ||
    jsonb_build_array(p_season, lower(btrim(p_source)), p_amount)::text, 0));
$$;

-- Scope the check to the manual financing surface. The sponsor invoice flow
-- keeps its own task and payment gates.
alter function finance.apply_funding_change(uuid, uuid, text, jsonb, boolean) rename to apply_funding_change_before_income;
create function finance.apply_funding_change(p_actor uuid, p_request uuid, p_hash text, p_command jsonb, p_include_draft boolean)
returns jsonb language plpgsql set search_path = pg_catalog as $$
declare
  previous_guard text := coalesce(current_setting('finance.income_duplicate_guard', true), '');
  result jsonb;
begin
  perform set_config('finance.income_duplicate_guard',
    case when p_command->'acceptSimilarIncome' = 'true'::jsonb then 'confirmed' else 'check' end, true);
  result := finance.apply_funding_change_before_income(p_actor, p_request, p_hash, p_command, p_include_draft);
  perform set_config('finance.income_duplicate_guard', previous_guard, true);
  return result;
end;
$$;

create function finance.guard_funding_income_match()
returns trigger language plpgsql set search_path = pg_catalog as $$
declare
  guard_mode text := coalesce(current_setting('finance.income_duplicate_guard', true), '');
begin
  if guard_mode not in ('check', 'confirmed') or new.status <> 'received' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'received' and old.season_id = new.season_id
    and lower(btrim(old.source_name)) = lower(btrim(new.source_name))
    and old.amount_ore = new.amount_ore and old.received_date is not distinct from new.received_date then
    return new;
  end if;
  perform finance.lock_income_payment_match(new.season_id, new.source_name, new.amount_ore);
  if exists (
    select 1 from finance.income_receipts r where r.season_id = new.season_id and r.voided_at is null
      and (new.received_date is null or r.received_on = new.received_date) and r.amount_ore = new.amount_ore
      and lower(r.source) = lower(btrim(new.source_name))
  ) then
    if guard_mode <> 'confirmed' then raise exception 'finance:INCOME_SIMILAR_PAYMENT'; end if;
    perform finance.append_audit(new.updated_by_member_id, 'funding', new.id::text,
      'income_match_confirmation', null, 'confirmed', 'Similar payment confirmed');
  end if;
  return new;
end;
$$;

create trigger finance_funding_income_match before insert or update on finance.funding
for each row execute function finance.guard_funding_income_match();

revoke all on function finance.lock_income_payment_match(uuid, text, bigint),
  finance.apply_funding_change(uuid, uuid, text, jsonb, boolean),
  finance.apply_funding_change_before_income(uuid, uuid, text, jsonb, boolean),
  finance.guard_funding_income_match() from public;

create function finance.apply_income_change(p_actor uuid, p_request uuid, p_hash text, p_input jsonb)
returns jsonb language plpgsql security invoker set search_path = pg_catalog as $fn$
declare
  action text := p_input->>'action';
  current_code text;
  season finance.seasons%rowtype;
  receipt finance.income_receipts%rowtype;
  replay jsonb;
  violated_constraint text;
  payment_date date;
  payment_source text;
  payment_amount bigint;
  payment_method text;
  payment_reference text;
  similar_payment boolean;
begin
  if action is null or action not in ('registerIncome', 'voidIncome') then
    raise exception 'finance:INVALID_INCOME';
  end if;
  -- Keep the explicit Financials role stable through the receipt transaction.
  perform 1 from identity.member_roles where member_id = p_actor and role_key = 'financials' for key share;
  if not found then raise exception 'FINANCE|denied|Finance access is required.'; end if;

  -- Serialize retries even before the first request has an idempotency row.
  perform pg_advisory_xact_lock(hashtextextended('finance-income:' || p_actor::text || ':' || p_request::text, 0));
  replay := finance.begin_purchase_mutation(p_actor, p_request, action, p_hash, 'purchaseRegister');
  if replay is not null then return replay; end if;

  select setting_value #>> '{}' into current_code
    from finance.settings where setting_key = 'current_season' for share;
  if current_code is null or current_code is distinct from p_input->>'seasonCode' then
    raise exception 'finance:INCOME_SEASON_CHANGED';
  end if;
  select * into season from finance.seasons where code = current_code for share;
  if not found or season.status = 'closed' then raise exception 'finance:INCOME_SEASON_CLOSED'; end if;

  if action = 'registerIncome' then
    payment_date := (p_input->>'receivedOn')::date;
    payment_source := btrim(p_input->>'source');
    payment_amount := (p_input->>'amountOre')::bigint;
    payment_method := p_input->>'method';
    payment_reference := nullif(btrim(p_input->>'reference'), '');
    if payment_date > (statement_timestamp() at time zone 'Europe/Oslo')::date then
      raise exception 'finance:INCOME_FUTURE_DATE';
    end if;

    -- Lock by source and amount so a legacy record with no date can match either writer.
    perform finance.lock_income_payment_match(season.id, payment_source, payment_amount);
    if exists (
      select 1 from finance.income_receipts r where r.season_id = season.id and r.voided_at is null
        and r.method = payment_method and lower(btrim(r.reference)) = lower(payment_reference)
    ) then
      raise exception 'finance:INCOME_DUPLICATE_REFERENCE';
    end if;
    select exists (
      select 1 from finance.income_receipts r where r.season_id = season.id and r.voided_at is null
        and r.method = payment_method and r.received_on = payment_date and r.amount_ore = payment_amount
        and lower(r.source) = lower(payment_source) and (r.reference is null or payment_reference is null)
    ) or exists (
      select 1 from finance.funding f where f.season_id = season.id and f.status = 'received'
        and (f.received_date is null or f.received_date = payment_date) and f.amount_ore = payment_amount
        and lower(btrim(f.source_name)) = lower(payment_source)
    ) into similar_payment;
    if similar_payment and p_input->'acceptSimilarIncome' is distinct from 'true'::jsonb then
      raise exception 'finance:INCOME_SIMILAR_PAYMENT';
    end if;

    insert into finance.income_receipts (season_id, category, source, amount_ore, received_on, method, reference, created_by)
    values (season.id, p_input->>'category', payment_source, payment_amount, payment_date, payment_method, payment_reference, p_actor)
    returning * into receipt;
    perform finance.append_audit(p_actor, 'income_receipt', receipt.id::text, 'status', null, 'recorded',
      case when similar_payment then 'Similar payment confirmed' else null end);
  else
    update finance.income_receipts
      set voided_by = p_actor, voided_at = now(), void_reason = btrim(p_input->>'reason')
      where id = (p_input->>'receiptId')::uuid and season_id = season.id and voided_at is null
      returning * into receipt;
    if not found then raise exception 'finance:INCOME_ALREADY_VOIDED'; end if;
    perform finance.append_audit(p_actor, 'income_receipt', receipt.id::text, 'status', 'recorded', 'voided', receipt.void_reason);
  end if;

  return finance.finish_purchase_mutation(p_actor, p_request, action, p_hash, receipt.id, '[]'::jsonb);
exception when unique_violation then
  get stacked diagnostics violated_constraint = constraint_name;
  if violated_constraint = 'income_receipts_active_reference_key' then
    raise exception 'finance:INCOME_DUPLICATE_REFERENCE';
  end if;
  if violated_constraint = 'idempotency_keys_pkey' then
    return finance.replay_purchase_mutation(p_actor, p_request, action, p_hash);
  end if;
  raise;
end;
$fn$;

revoke all on function finance.apply_income_change(uuid, uuid, text, jsonb) from public;

commit;
