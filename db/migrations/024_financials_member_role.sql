-- Financials is an explicit member-access role, independent of department membership.
insert into identity.platform_roles (role_key, label, sort_order)
values ('financials', 'Financials', 5)
on conflict (role_key) do update set label = excluded.label;

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
  if p_member_id is null or not exists (select 1 from identity.members where id = p_member_id)
    or not exists (select 1 from identity.member_roles where member_id = p_member_id and role_key = 'financials') then
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
  from (
    select profile from finance.member_grants
    where member_id = p_member_id and active and revoked_at is null
    union
    select 'finance' where exists (
      select 1 from identity.member_roles where member_id = p_member_id and role_key = 'financials'
    )
  ) granted;
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

-- Changing this role invalidates finance capability and page snapshots atomically.
create or replace function finance.financials_role_changed()
returns trigger language plpgsql security invoker set search_path = pg_catalog, finance as $fn$
begin
  if (tg_op = 'INSERT' and new.role_key = 'financials') or
     (tg_op = 'DELETE' and old.role_key = 'financials') or
     (tg_op = 'UPDATE' and (old.role_key = 'financials' or new.role_key = 'financials')) then
    perform finance.bump_view_version();
  end if;
  return null;
end;
$fn$;
create trigger finance_financials_role_changed after insert or update or delete on identity.member_roles
for each row execute function finance.financials_role_changed();

-- The existing registration function notifies explicit finance grants. Add the
-- same transactional outbox event for separately assigned Financials roles.
create or replace function finance.notify_financials_purchase()
returns trigger language plpgsql security invoker set search_path = pg_catalog, finance, identity as $fn$
begin
  insert into finance.outbox (event_type, entity, entity_id, recipient_member_id, dedupe_key, payload)
    select 'purchase_registered', 'purchase', new.id, mr.member_id,
      'purchase_registered:' || new.id::text || ':' || mr.member_id::text,
      jsonb_build_object('publicRef', new.public_ref, 'supplierName', new.supplier_name,
        'totalOre', (select coalesce(sum(amount_ore), 0)::text from finance.purchase_lines where purchase_id = new.id))
    from identity.member_roles mr where mr.role_key = 'financials'
    on conflict (dedupe_key) do nothing;
  return new;
end;
$fn$;
create constraint trigger finance_notify_financials_purchase after insert on finance.purchases
deferrable initially deferred
for each row execute function finance.notify_financials_purchase();
