-- Manually recorded combined bank balance. A missing snapshot is distinct from zero.
begin;
create table finance.bank_snapshot (
  singleton boolean primary key default true check (singleton),
  amount_ore bigint,
  as_of_date date,
  updated_at timestamptz,
  updated_by uuid references identity.members(id),
  revision integer not null default 0 check (revision >= 0),
  check ((amount_ore is null and as_of_date is null and updated_at is null and updated_by is null)
      or (amount_ore is not null and as_of_date is not null and updated_at is not null and updated_by is not null))
);
insert into finance.bank_snapshot (singleton) values (true);
alter table finance.bank_snapshot enable row level security;

create or replace function finance.set_bank_snapshot(p_actor uuid, p_request uuid, p_hash text, p_amount bigint, p_as_of date, p_revision integer)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, finance as $fn$
declare
  old finance.bank_snapshot%rowtype;
  prior finance.idempotency_keys%rowtype;
  result jsonb;
  next_version bigint;
begin
  if not coalesce((finance.capability_flags(p_actor)->>'draftBudgetItems')::boolean, false) then
    raise exception 'finance:FORBIDDEN';
  end if;
  if p_actor is null or p_request is null or p_hash is null or p_amount is null or p_as_of is null or p_revision is null or p_revision < 0 then
    raise exception 'finance:INVALID';
  end if;
  -- Serialize first writes too, and check idempotency after acquiring the lock.
  select * into old from finance.bank_snapshot where singleton for update;
  select * into prior from finance.idempotency_keys where member_id = p_actor and request_id = p_request;
  if found then
    if prior.action = 'setBankSnapshot' and prior.payload_hash = p_hash and prior.response is not null then return prior.response; end if;
    raise exception 'finance:IDEMPOTENCY_CONFLICT';
  end if;
  if old.revision <> p_revision then raise exception 'finance:REVISION_CONFLICT'; end if;
  update finance.bank_snapshot set amount_ore = p_amount, as_of_date = p_as_of,
    updated_at = now(), updated_by = p_actor, revision = revision + 1 where singleton;
  perform finance.append_audit(p_actor, 'bank_snapshot', 'combined', 'amount_ore', old.amount_ore::text, p_amount::text, null);
  perform finance.append_audit(p_actor, 'bank_snapshot', 'combined', 'as_of_date', old.as_of_date::text, p_as_of::text, null);
  next_version := finance.bump_view_version();
  result := jsonb_build_object('ok', true, 'viewVersion', next_version, 'revision', old.revision + 1, 'warnings', '[]'::jsonb, 'errors', '[]'::jsonb);
  insert into finance.idempotency_keys(member_id, request_id, action, payload_hash, response) values (p_actor, p_request, 'setBankSnapshot', p_hash, result);
  return result;
end;
$fn$;
commit;
