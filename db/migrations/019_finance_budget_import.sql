-- Apply one department import atomically against the version used for its preview.
begin;

create or replace function finance.apply_budget_import(
  p_actor uuid, p_request_id uuid, p_payload_hash text, p_expected_version bigint,
  p_budget_id uuid, p_department text, p_operations jsonb, p_reason text
) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, finance, identity as $fn$
declare
  replay jsonb; budget finance.budgets%rowtype; item finance.budget_items%rowtype;
  op jsonb; desired jsonb; existing_version bigint; needs_reason boolean := false;
  reason_text text; new_id uuid; new_ref text; season_code text; pair record;
  old_value text; new_value text; changed boolean := false;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_request_id::text, 0));
  replay := finance.begin_budget_mutation(p_actor, p_request_id, 'importItems', p_payload_hash, 'permittedImports');
  if replay is not null then return replay; end if;
  if jsonb_typeof(p_operations) <> 'array' then raise exception 'FINANCE|invalid|Invalid import.'; end if;
  -- Match the item-before-budget lock order used by item edits and purchase registration.
  perform 1 from finance.budget_items where budget_id = p_budget_id order by id for update;
  budget := finance.lock_current_budget();
  if budget.id <> p_budget_id then raise exception 'FINANCE|stale|The season budget changed. Preview again.'; end if;
  select version into existing_version from finance.view_versions where singleton for update;
  if existing_version <> p_expected_version then raise exception 'FINANCE|stale|Finance changed since the preview. Preview again.'; end if;
  select code into season_code from finance.seasons where id = budget.season_id;
  for op in select value from jsonb_array_elements(p_operations) loop
    if op->>'kind' = 'add' then
      if not exists (select 1 from finance.systems where id = (op->'desired'->>'systemId')::uuid and department_key = p_department and active) then
        raise exception 'FINANCE|invalid|Choose an active system in the selected department.';
      end if;
      needs_reason := true;
    elsif op->>'kind' in ('change', 'remove') then
      select i.* into item from finance.budget_items i join finance.systems s on s.id = i.system_id
      where i.id = (op->>'id')::uuid and i.budget_id = budget.id and s.department_key = p_department and not i.protected;
      if not found or item.revision <> (op->>'revision')::integer then raise exception 'FINANCE|stale|An item changed. Preview again.'; end if;
      desired := op->'desired';
      if op->>'kind' = 'remove' or item.status = 'cancelled'
        or item.planned_ore <> (desired->>'plannedOre')::bigint
        or item.priority <> desired->>'priority'
        or item.earmark_id is distinct from nullif(desired->>'earmarkId','')::uuid then needs_reason := true; end if;
    else raise exception 'FINANCE|invalid|Invalid import operation.';
    end if;
  end loop;
  reason_text := finance.require_budget_reason(p_actor, budget.status = 'approved' and needs_reason, p_reason);
  -- Temporarily remove changed rows from active earmark constraints. These intermediate
  -- values are invisible outside this transaction and are never recorded as user actions.
  update finance.budget_items set status = 'cancelled'
  where id in (select (value->>'id')::uuid from jsonb_array_elements(p_operations) where value->>'kind' in ('change','remove'))
    and status <> 'cancelled';
  for op in select value from jsonb_array_elements(p_operations) loop
    desired := op->'desired';
    if op->>'kind' = 'add' then
      new_ref := finance.budget_item_reference(season_code, finance.issue_budget_item_ordinal(p_actor, season_code));
      insert into finance.budget_items (budget_id, system_id, public_ref, description, category, planned_ore, priority, reuse_status, expected_purchase_date, status, note, earmark_id, protected, created_by_member_id, updated_by_member_id)
      values (budget.id, (desired->>'systemId')::uuid, new_ref, desired->>'description', desired->>'category', (desired->>'plannedOre')::bigint,
        desired->>'priority', desired->>'reuseStatus', nullif(desired->>'expectedPurchaseDate','')::date, 'planned', nullif(desired->>'note',''), nullif(desired->>'earmarkId','')::uuid, false, p_actor, p_actor) returning id into new_id;
      perform finance.append_audit(p_actor,'budget_item',new_id::text,'created',null,new_ref,reason_text);
      perform finance.append_audit(p_actor,'budget_item',new_id::text,'planned_ore',null,desired->>'plannedOre',reason_text);
      perform finance.append_audit(p_actor,'budget_item',new_id::text,'priority',null,desired->>'priority',reason_text);
      perform finance.append_audit(p_actor,'budget_item',new_id::text,'system_id',null,desired->>'systemId',reason_text);
      if desired->>'earmarkId' is not null then perform finance.append_audit(p_actor,'budget_item',new_id::text,'earmark_id',null,desired->>'earmarkId',reason_text); end if;
      changed := true;
    elsif op->>'kind' = 'remove' then
      select * into item from finance.budget_items where id = (op->>'id')::uuid;
      -- Original status is passed from the authoritative preview for audit.
      update finance.budget_items set revision = revision + 1, updated_at = clock_timestamp(), updated_by_member_id = p_actor where id = item.id;
      perform finance.append_audit(p_actor,'budget_item',item.id::text,'status',op->>'oldStatus','cancelled',reason_text);
      changed := true;
    else
      select * into item from finance.budget_items where id = (op->>'id')::uuid;
      -- Compare audit values against the original values captured by the preview.
      for pair in select * from jsonb_each_text(op->'oldValues') loop
        new_value := case pair.key
          when 'system_id' then desired->>'systemId' when 'description' then desired->>'description'
          when 'category' then desired->>'category' when 'planned_ore' then desired->>'plannedOre'
          when 'priority' then desired->>'priority' when 'reuse_status' then desired->>'reuseStatus'
          when 'expected_purchase_date' then desired->>'expectedPurchaseDate' when 'note' then desired->>'note'
          when 'earmark_id' then desired->>'earmarkId' when 'status' then desired->>'status' else pair.value end;
        old_value := pair.value;
        if old_value is distinct from new_value then perform finance.append_audit(p_actor,'budget_item',item.id::text,pair.key,old_value,new_value,reason_text); end if;
      end loop;
      update finance.budget_items set description = desired->>'description', category = desired->>'category',
        planned_ore = (desired->>'plannedOre')::bigint, priority = desired->>'priority', reuse_status = desired->>'reuseStatus',
        expected_purchase_date = nullif(desired->>'expectedPurchaseDate','')::date, note = nullif(desired->>'note',''),
        earmark_id = nullif(desired->>'earmarkId','')::uuid, status = desired->>'status',
        revision = revision + 1, updated_at = clock_timestamp(), updated_by_member_id = p_actor where id = item.id;
      changed := true;
    end if;
  end loop;
  if changed then return finance.finish_budget_mutation(p_actor,p_request_id,'importItems',p_payload_hash,budget.id); end if;
  return finance.store_budget_result(p_actor,p_request_id,'importItems',p_payload_hash,budget.id);
end;
$fn$;
revoke all on function finance.apply_budget_import(uuid,uuid,text,bigint,uuid,text,jsonb,text) from public;
grant execute on function finance.apply_budget_import(uuid,uuid,text,bigint,uuid,text,jsonb,text) to current_user;
commit;
