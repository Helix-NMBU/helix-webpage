begin;
-- One registered actual per allocation, with recorded approval/funding provenance.
-- The effective approved plan remains solely finance.effective_budget_entries.
create view finance.registered_allocation_facts as
select a.id as allocation_id,a.budget_item_id,l.id as line_id,p.id as purchase_id,p.season_id,p.purchase_date,a.amount_ore,
  e.system_id,l.system_id as purchase_system_id,e.protected as unbudgeted,
  coalesce(e.project_id,p.project_id) as project_id,
  coalesce(e.responsible_department_id,p.responsible_department_id) as responsible_department_id,
  e.project_budget_id,l.approved_version_id,
  case when l.approved_version_id is not null then recorded.earmark_id else anchor.earmark_id end as recorded_earmark_id
from finance.allocations a join finance.purchase_lines l on l.id=a.line_id
join finance.purchases p on p.id=l.purchase_id and p.status='registered'
join finance.budget_items anchor on anchor.id=a.budget_item_id
join finance.effective_budget_entries e on e.id=a.budget_item_id
left join finance.project_budget_version_entries recorded on recorded.version_id=l.approved_version_id and recorded.entry_id=a.budget_item_id;
revoke all on finance.registered_allocation_facts from public;
do $$ declare role_name text; begin
  foreach role_name in array array['anon','authenticated','anonymous'] loop
    if exists(select 1 from pg_roles where rolname=role_name) then execute format('revoke all on finance.registered_allocation_facts from %I',role_name); end if;
  end loop;
end $$;

-- Patch only the owning legacy core's eligibility clauses. Its request/anchor/ledger
-- locks, quota, uploads, payments, idempotency and exceptions remain unchanged.
do $migration$
declare definition text; needle text; replacement text; matches integer;
begin
  definition:=pg_get_functiondef('finance.register_purchase_before_project_tracking(uuid,uuid,text,jsonb)'::regprocedure);
  needle:=$old0$  if current_budget.status <> 'approved' then
    raise exception 'FINANCE|conflict|The season budget must be approved before registering purchases.';
  end if;$old0$;
  replacement:=$new0$  if current_budget.status <> 'approved'
    and not exists(select 1 from finance.project_budgets h where h.season_id=current_budget.season_id and h.approved_version_id is not null)
    and (jsonb_array_length(coalesce(p_body->'lines','[]'::jsonb))=0 or exists(
      select 1 from jsonb_array_elements(coalesce(p_body->'lines','[]'::jsonb)) eligibility_line where coalesce((eligibility_line->>'unbudgeted')::boolean,false) is not true)) then
    raise exception 'FINANCE|conflict|Choose an effective approved entry or explicitly register an incurred unbudgeted cost.';
  end if;$new0$;
  matches:=(length(definition)-length(replace(definition,needle,'')))/length(needle);
  if matches<>1 then raise exception '073 expected exactly one purchase eligibility clause 0; found %',matches; end if;
  definition:=replace(definition,needle,replacement);
  needle:=$old1$    select i.id, i.status
    from finance.budget_items i$old1$;
  replacement:=$new1$    select i.id, effective.status
    from finance.budget_items i join finance.effective_budget_entries effective on effective.id=i.id$new1$;
  matches:=(length(definition)-length(replace(definition,needle,'')))/length(needle);
  if matches<>1 then raise exception '073 expected exactly one purchase eligibility clause 1; found %',matches; end if;
  definition:=replace(definition,needle,replacement);
  needle:=$old2$        select 1 from finance.budget_items i
        where i.id = target_item_id$old2$;
  replacement:=$new2$        select 1 from finance.effective_budget_entries i
        where i.id = target_item_id$new2$;
  matches:=(length(definition)-length(replace(definition,needle,'')))/length(needle);
  if matches<>1 then raise exception '073 expected exactly one purchase eligibility clause 2; found %',matches; end if;
  definition:=replace(definition,needle,replacement);
  needle:=$old3$          and i.protected is not true
$old3$;
  replacement:=$new3$          and i.protected is not true
          and (i.approved_version_id is not null or i.legacy_budget_status='approved')
$new3$;
  matches:=(length(definition)-length(replace(definition,needle,'')))/length(needle);
  if matches<>1 then raise exception '073 expected exactly one purchase eligibility clause 3; found %',matches; end if;
  definition:=replace(definition,needle,replacement);
  execute definition;
end $migration$;

-- Optional requests use the same approved entry eligibility, keeping their existing
-- request -> ordered anchor -> ledger lock order and immutable revision history.
do $migration$
declare definition text; needle text; replacement text; matches integer;
begin
  definition:=pg_get_functiondef('finance.fetch_current_season_budget_row(text)'::regprocedure);
  needle:=$old$  if budget_row.status <> 'approved' then$old$;
  replacement:=$new$  if budget_row.status <> 'approved' and not exists(
    select 1 from finance.project_budgets h where h.season_id=budget_row.season_id and h.approved_version_id is not null) then$new$;
  matches:=(length(definition)-length(replace(definition,needle,'')))/length(needle);
  if matches<>1 then raise exception '073 expected exactly one request season eligibility clause; found %',matches; end if;
  execute replace(definition,needle,replacement);

  definition:=pg_get_functiondef('finance.lock_request_line_items_share(jsonb,uuid)'::regprocedure);
  needle:=$old$    from finance.budget_items i
    where i.id = item_id
      and i.budget_id = p_budget_id
      and i.status <> 'cancelled'
    for share;$old$;
  replacement:=$new$    from finance.budget_items i
    where i.id = item_id and i.budget_id = p_budget_id
    for share of i;$new$;
  matches:=(length(definition)-length(replace(definition,needle,'')))/length(needle);
  if matches<>1 then raise exception '073 expected exactly one request item lock clause; found %',matches; end if;
  definition:=replace(definition,needle,replacement);
  needle:=$old$  end loop;
end;$old$;
  replacement:=$new$  end loop;
  -- A promotion can change its header pointer without changing the locked anchor
  -- tuple. Read canonical eligibility in a NEW statement after all waits finish.
  if exists(select 1 from jsonb_array_elements(p_lines) elem
    left join finance.effective_budget_entries current_entry on current_entry.id=(elem->>'budgetItemId')::uuid
    where current_entry.id is null or current_entry.budget_id<>p_budget_id or current_entry.status='cancelled'
      or current_entry.protected or (current_entry.approved_version_id is null and current_entry.legacy_budget_status<>'approved')) then
    raise exception 'FINANCE|invalid|Choose valid budget lines with positive estimates.|lines';
  end if;
end;$new$;
  matches:=(length(definition)-length(replace(definition,needle,'')))/length(needle);
  if matches<>1 then raise exception '073 expected exactly one request post-lock validation clause; found %',matches; end if;
  execute replace(definition,needle,replacement);

  definition:=pg_get_functiondef('finance.apply_request_change(uuid,uuid,text,jsonb,date)'::regprocedure);
  needle:=$old$        from finance.budget_items i
        where i.id = (line_row->>'budgetItemId')::uuid$old$;
  replacement:=$new$        from finance.effective_budget_entries i
        where (i.approved_version_id is not null or i.legacy_budget_status='approved') and i.protected is not true
          and i.id = (line_row->>'budgetItemId')::uuid$new$;
  matches:=(length(definition)-length(replace(definition,needle,'')))/length(needle);
  if matches<>1 then raise exception '073 expected exactly one submitted request item clause; found %',matches; end if;
  definition:=replace(definition,needle,replacement);
  needle:=$old$      for line_rec in
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
      end loop;$old$;
  replacement:=$new$      perform i.id from finance.request_lines l
        join finance.budget_items i on i.id=l.budget_item_id
        where l.revision_id=revision_id order by i.id for share of i;
      -- Do not project effective status in the locking statement: an unchanged
      -- anchor can resume with a pre-promotion joined status after a lock wait.
      if exists(select 1 from finance.request_lines l
        left join finance.effective_budget_entries current_entry on current_entry.id=l.budget_item_id
        where l.revision_id=revision_id and (current_entry.id is null or current_entry.status='cancelled'
          or current_entry.protected or (current_entry.approved_version_id is null and current_entry.legacy_budget_status<>'approved'))) then
        raise exception 'FINANCE|conflict|A budget line on this request was cancelled or is no longer approved. Ask the requester to revise it.';
      end if;$new$;
  matches:=(length(definition)-length(replace(definition,needle,'')))/length(needle);
  if matches<>1 then raise exception '073 expected exactly one request decision lock clause; found %',matches; end if;
  execute replace(definition,needle,replacement);
end $migration$;
commit;
