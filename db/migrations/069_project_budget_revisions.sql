-- Candidate revisions and imports never mutate the last approved contents.
begin;

-- Project settings cannot detach retained budget/actual history. Do not lock headers after a project row lock.
create function finance.assert_project_financial_assignment(target_project uuid,next_season text,next_departments text[]) returns void
language plpgsql stable security invoker set search_path=pg_catalog as $$
begin
  if exists(select 1 from finance.project_budgets h join finance.seasons season on season.id=h.season_id
    join project_management.departments responsible on responsible.id=h.responsible_department_id
    where h.project_id=target_project and (season.code<>next_season or not responsible.name=any(next_departments)))
    or exists(select 1 from finance.project_budgets h join finance.project_budget_versions v on v.project_budget_id=h.id
      join finance.project_budget_version_entries e on e.version_id=v.id join finance.systems sys on sys.id=e.system_id
      join identity.departments d on d.department_key=sys.department_key where h.project_id=target_project and not project_management.canonical_department(d.name)=any(next_departments)) then
    raise exception 'project_financial_history_assignment' using errcode='23514';
  end if;
end;
$$;
create function finance.enforce_project_financial_assignment() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if old.season is distinct from new.season or old.departments is distinct from new.departments then
    perform finance.assert_project_financial_assignment(new.id,new.season,new.departments);
  end if;
  return new;
end;
$$;
create trigger project_financial_assignment before update of season,departments on project_management.projects
for each row execute function finance.enforce_project_financial_assignment();

-- PBA-07 may extend this one guard. All writes, including imported omission and SQL deletes, call it.
create function finance.assert_project_budget_entry_obligation(target_entry uuid, proposed jsonb) returns void
language plpgsql stable security invoker set search_path=pg_catalog as $$
declare baseline finance.project_budget_version_entries%rowtype;
begin
  if not exists(select 1 from finance.budget_obligations o join finance.funding_applications a on a.id=o.application_id where o.entry_id=target_entry and o.released_at is null and a.awarded_at is not null) then return; end if;
  select ve.* into baseline from finance.project_budget_entries e join finance.project_budgets h on h.id=e.project_budget_id
    join finance.project_budget_version_entries ve on ve.entry_id=e.id and ve.version_id=coalesce(h.approved_version_id,h.pending_version_id) where e.id=target_entry;
  if coalesce((proposed->>'removed')::boolean,false) or proposed->>'status'='cancelled'
    or (baseline.entry_id is not null and ((proposed->>'planned_ore')::bigint<baseline.planned_ore or (proposed->>'system_id')::uuid<>baseline.system_id
      or proposed->>'ordinary_priority'>baseline.ordinary_priority)) then raise exception 'finance:PROJECT_OBLIGATION_ACTIVE' using errcode='23514'; end if;
end;
$$;
create function finance.enforce_project_entry_obligation() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
begin
  perform finance.assert_project_budget_entry_obligation(case when tg_op='DELETE' then old.entry_id else new.entry_id end,
    case when tg_op='DELETE' then to_jsonb(old)||jsonb_build_object('removed',true) else to_jsonb(new) end);
  if tg_op='DELETE' then return old; end if; return new;
end;
$$;
create trigger project_entry_obligation before insert or update or delete on finance.project_budget_version_entries
for each row execute function finance.enforce_project_entry_obligation();

-- The snapshot includes related reference data so a stale preview cannot silently change its meaning.
create function finance.project_budget_import_snapshot_token(target_header uuid) returns text
language sql stable security invoker set search_path=pg_catalog as $$
select md5(jsonb_build_object('headerRevision',h.revision,'entries',finance.project_budget_snapshot(h.pending_version_id),
  'systems',(select jsonb_agg(to_jsonb(s) order by s.id) from finance.systems s),
  'parts',(select jsonb_agg(jsonb_build_object('id',p.id,'reference',p.public_ref,'season',f.season_id,'status',f.status) order by p.id) from finance.funding_parts p join finance.funding f on f.id=p.funding_id where f.season_id=h.season_id))::text)
from finance.project_budgets h where h.id=target_header
$$;
create or replace function finance.mutate_project_budget(actor uuid, google_sub text, email text, request_id uuid, payload_hash text, body jsonb)
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare action text:=body->>'action'; h finance.project_budgets%rowtype; v finance.project_budget_versions%rowtype;
  project_row project_management.projects%rowtype; season_row finance.seasons%rowtype;
  scope jsonb; caps jsonb; replay finance.idempotency_keys%rowtype; response jsonb; entry jsonb:=body->'entry';
  target_entry_id uuid; old_snapshot jsonb; current_snapshot jsonb; next_view bigint; reason text:=nullif(btrim(body->>'reason'),'');
  event_type text; prior_status text; recipient_ids uuid[]:='{}'; legacy finance.budgets%rowtype; material record; reference text; ref_next bigint;
begin
  if action not in ('createProjectBudget','saveProjectBudgetEntry','removeProjectBudgetEntry','submitProjectBudget','approveDepartmentBudget','approveProjectBudget','returnProjectBudget','withdrawProjectBudget','requestProjectBudgetChanges','importProjectBudgetEntries','adoptProjectBudgetEntries')
    or request_id is null or payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'finance:PROJECT_INVALID' using errcode='23514'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||request_id::text,0));
  if action='createProjectBudget' then
    -- Serialize initial creation per project; existing-budget writes lock the header first.
    perform pg_advisory_xact_lock(hashtextextended('project-budget:'||(body->>'projectId'),0));
    select * into project_row from project_management.projects where id=(body->>'projectId')::uuid for share;
    if not found then raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002'; end if;
    select * into h from finance.project_budgets where project_id=project_row.id for update;
  else
    select * into h from finance.project_budgets where id=(body->>'projectBudgetId')::uuid for update;
    if not found then raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002'; end if;
    select * into project_row from project_management.projects where id=h.project_id for share;
  end if;
  -- Locks hold the verified account and current assignments/grants throughout this write.
  perform 1 from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
    join neon_auth.account a on a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub
    where m.id=actor for share of m,u,a;
  perform 1 from project_management.department_members where member_id=actor for share;
  perform 1 from identity.member_roles where member_id=actor for share;
  perform 1 from finance.member_grants where member_id=actor for share;
  select * into season_row from finance.seasons where code=project_row.season for share;
  scope:=finance.project_budget_scope(actor,$2,$3,project_row.id,case when action='createProjectBudget' then (body->>'responsibleDepartmentId')::uuid else h.responsible_department_id end);
  caps:=scope->'capabilities';
  if season_row.status='closed' then raise exception 'finance:PROJECT_FORBIDDEN' using errcode='42501'; end if;
  if (action in ('createProjectBudget','saveProjectBudgetEntry','removeProjectBudgetEntry','submitProjectBudget','withdrawProjectBudget','importProjectBudgetEntries','adoptProjectBudgetEntries') and not (caps->>'canDraft')::boolean)
    or (action='requestProjectBudgetChanges' and not (caps->>'canRequestChanges')::boolean)
    or (action='approveDepartmentBudget' and not (caps->>'canReviewDepartment')::boolean)
    or (action='approveProjectBudget' and not (caps->>'canApproveFinance')::boolean) then
    raise exception 'finance:PROJECT_FORBIDDEN' using errcode='42501';
  end if;
  if action='requestProjectBudgetChanges' and h.approved_version_id is null then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
  select * into replay from finance.idempotency_keys where member_id=actor and finance.idempotency_keys.request_id=$4 for update;
  if found then
    if replay.action<>action or replay.payload_hash<>$5 or replay.response is null then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
    return replay.response||jsonb_build_object('replayed',true);
  end if;
  if coalesce((body->>'replayOnly')::boolean,false) then return null; end if;
  if action='createProjectBudget' then
    if h.id is not null then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
    insert into finance.project_budgets(season_id,project_id,responsible_department_id,created_by_member_id,updated_by_member_id)
      values(season_row.id,project_row.id,(body->>'responsibleDepartmentId')::uuid,actor,actor) returning * into h;
    insert into finance.project_budget_versions(project_budget_id,version_number,created_by_member_id) values(h.id,1,actor) returning * into v;
    update finance.project_budgets set pending_version_id=v.id where id=h.id returning * into h;
  else
    if h.revision<>(body->>'expectedRevision')::integer then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
    if action='requestProjectBudgetChanges' and h.pending_version_id is null and h.approved_version_id is not null then
      insert into finance.project_budget_versions(project_budget_id,version_number,created_by_member_id)
        select h.id,coalesce(max(version_number),0)+1,actor from finance.project_budget_versions where project_budget_id=h.id returning * into v;
      insert into finance.project_budget_version_entries(version_id,entry_id,system_id,description,category,planned_ore,ordinary_priority,reuse_status,expected_purchase_date,owner_member_id,owner_email,status,note,earmark_id,removed)
        select v.id,entry_id,system_id,description,category,planned_ore,ordinary_priority,reuse_status,expected_purchase_date,owner_member_id,owner_email,status,note,earmark_id,removed
        from finance.project_budget_version_entries where version_id=h.approved_version_id;
      update finance.project_budgets set pending_version_id=v.id where id=h.id;
    else
      select * into v from finance.project_budget_versions where id=h.pending_version_id and project_budget_id=h.id for update;
    end if;
    if not found then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
  end if;
  old_snapshot:=finance.project_budget_snapshot(v.id); prior_status:=v.status;
  if action='requestProjectBudgetChanges' then
    if reason is null or char_length(reason)>500 then raise exception 'finance:PROJECT_REASON_REQUIRED' using errcode='23514'; end if;
    update finance.project_budget_versions set status='draft',submitted_at=null,submitted_snapshot=null,department_approved_by=null,department_approved_at=null,approved_by=null,approved_at=null,revision=revision+1 where id=v.id returning * into v;
    event_type:='project_budget.returned'; recipient_ids:=project_row.lead_ids;
  elsif action='adoptProjectBudgetEntries' then
    if v.status<>'draft' then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
    -- Adoption retains genuine legacy plan/identity until this Draft receives both real decisions.
    perform 1 from finance.budget_items i where i.id in (select (value->>'budgetItemId')::uuid from jsonb_array_elements(body->'entries')) order by i.id for update;
    for entry in select value from jsonb_array_elements(body->'entries') loop
      target_entry_id:=(entry->>'budgetItemId')::uuid;
      select i.* into material from finance.budget_items i join finance.budgets b on b.id=i.budget_id
        where i.id=target_entry_id and b.season_id=h.season_id and not i.protected;
      if not found or exists(select 1 from finance.project_budget_entries e where e.id=target_entry_id and e.project_budget_id<>h.id) then raise exception 'finance:PROJECT_ENTRY_MISMATCH' using errcode='23514'; end if;
      if material.priority='EM' and entry->>'ordinaryPriority' is null then raise exception 'finance:PROJECT_PRIORITY_REQUIRED' using errcode='23514'; end if;
      insert into finance.project_budget_entries(id,project_budget_id,budget_item_id,created_by_member_id) values(target_entry_id,h.id,target_entry_id,actor) on conflict(id) do nothing;
      insert into finance.project_budget_version_entries(version_id,entry_id,system_id,description,category,planned_ore,ordinary_priority,reuse_status,expected_purchase_date,owner_member_id,owner_email,status,note,earmark_id,removed)
        values(v.id,target_entry_id,material.system_id,material.description,material.category,material.planned_ore,coalesce(entry->>'ordinaryPriority',material.priority),material.reuse_status,material.expected_purchase_date,material.owner_member_id,material.owner_email,material.status,material.note,material.earmark_id,false)
        on conflict(version_id,entry_id) do nothing;
    end loop;
  elsif action='importProjectBudgetEntries' then
    if v.status<>'draft' then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
    perform 1 from finance.systems where id in(select (item->>'systemId')::uuid from jsonb_array_elements(body->'entries') item) order by id for share;
    perform 1 from finance.funding where id in(select funding_id from finance.funding_parts where id in(select nullif(item->>'earmarkId','')::uuid from jsonb_array_elements(body->'entries') item)) order by id for share;
    perform 1 from finance.funding_parts where id in(select nullif(item->>'earmarkId','')::uuid from jsonb_array_elements(body->'entries') item) order by id for share;
    if exists(select 1 from jsonb_array_elements(body->'entries') item left join finance.systems sys on sys.id=(item->>'systemId')::uuid where not coalesce(sys.active,false)) then raise exception 'finance:PROJECT_ENTRY_MISMATCH' using errcode='23514'; end if;
    -- Prepared against an exact candidate snapshot and related reference data, rechecked under its header lock.
    if body->>'snapshotToken' is distinct from finance.project_budget_import_snapshot_token(h.id) then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
    update finance.project_budget_version_entries ve set removed=true where ve.version_id=v.id and not ve.removed
      and not exists(select 1 from jsonb_array_elements(body->'entries') item where item->>'entryId'=ve.entry_id::text);
    for entry in select value from jsonb_array_elements(body->'entries') loop
      target_entry_id:=nullif(entry->>'entryId','')::uuid;
      if target_entry_id is null then insert into finance.project_budget_entries(project_budget_id,created_by_member_id) values(h.id,actor) returning id into target_entry_id;
      elsif not exists(select 1 from finance.project_budget_entries where id=target_entry_id and project_budget_id=h.id) then raise exception 'finance:PROJECT_ENTRY_MISMATCH' using errcode='23514'; end if;
      insert into finance.project_budget_version_entries(version_id,entry_id,system_id,description,category,planned_ore,ordinary_priority,reuse_status,expected_purchase_date,owner_member_id,owner_email,status,note,earmark_id,removed)
        values(v.id,target_entry_id,(entry->>'systemId')::uuid,entry->>'description',entry->>'category',(entry->>'plannedOre')::bigint,entry->>'ordinaryPriority',entry->>'reuseStatus',
          nullif(entry->>'expectedPurchaseDate','')::date,nullif(entry->>'ownerMemberId','')::uuid,nullif(entry->>'ownerEmail',''),entry->>'status',nullif(entry->>'note',''),nullif(entry->>'earmarkId','')::uuid,false)
        on conflict(version_id,entry_id) do update set system_id=excluded.system_id,description=excluded.description,category=excluded.category,planned_ore=excluded.planned_ore,
          ordinary_priority=excluded.ordinary_priority,reuse_status=excluded.reuse_status,expected_purchase_date=excluded.expected_purchase_date,owner_member_id=excluded.owner_member_id,
          owner_email=excluded.owner_email,status=excluded.status,note=excluded.note,earmark_id=excluded.earmark_id,removed=false;
    end loop;
  elsif action='saveProjectBudgetEntry' then
    if v.status<>'draft' then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
    if not exists(select 1 from finance.systems where id=(entry->>'systemId')::uuid and active) then raise exception 'finance:PROJECT_ENTRY_MISMATCH' using errcode='23514'; end if;
    target_entry_id:=nullif(entry->>'entryId','')::uuid;
    if target_entry_id is null then
      insert into finance.project_budget_entries(project_budget_id,created_by_member_id) values(h.id,actor) returning id into target_entry_id;
    elsif not exists(select 1 from finance.project_budget_entries where id=target_entry_id and project_budget_id=h.id) then
      raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002';
    end if;
    if exists(select 1 from finance.budget_obligations o join finance.funding_applications a on a.id=o.application_id
      where o.entry_id=target_entry_id and o.released_at is null and a.awarded_at is not null) and coalesce((entry->>'removed')::boolean,false) then
      raise exception 'finance:PROJECT_OBLIGATION_ACTIVE' using errcode='23514';
    end if;
    insert into finance.project_budget_version_entries(version_id,entry_id,system_id,description,category,planned_ore,ordinary_priority,reuse_status,expected_purchase_date,owner_member_id,owner_email,status,note,earmark_id,removed)
      values(v.id,target_entry_id,(entry->>'systemId')::uuid,entry->>'description',entry->>'category',(entry->>'plannedOre')::bigint,entry->>'ordinaryPriority',entry->>'reuseStatus',
        nullif(entry->>'expectedPurchaseDate','')::date,nullif(entry->>'ownerMemberId','')::uuid,nullif(entry->>'ownerEmail',''),entry->>'status',nullif(entry->>'note',''),nullif(entry->>'earmarkId','')::uuid,false)
      on conflict(version_id,entry_id) do update set system_id=excluded.system_id,description=excluded.description,category=excluded.category,planned_ore=excluded.planned_ore,
        ordinary_priority=excluded.ordinary_priority,reuse_status=excluded.reuse_status,expected_purchase_date=excluded.expected_purchase_date,owner_member_id=excluded.owner_member_id,
        owner_email=excluded.owner_email,status=excluded.status,note=excluded.note,earmark_id=excluded.earmark_id,removed=false;
  elsif action='removeProjectBudgetEntry' then
    if v.status<>'draft' then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
    target_entry_id:=(body->>'entryId')::uuid;
    if exists(select 1 from finance.budget_obligations o join finance.funding_applications a on a.id=o.application_id
      where o.entry_id=target_entry_id and o.released_at is null and a.awarded_at is not null) then raise exception 'finance:PROJECT_OBLIGATION_ACTIVE' using errcode='23514'; end if;
    update finance.project_budget_version_entries set removed=true where version_id=v.id and finance.project_budget_version_entries.entry_id=target_entry_id;
    if not found then raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002'; end if;
  elsif action='submitProjectBudget' then
    if v.status<>'draft' or (h.approved_version_id is null and not exists(select 1 from finance.project_budget_version_entries where version_id=v.id and not removed and status<>'cancelled')) then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
    if not exists(select 1 from project_management.department_members dm join identity.members m on m.id=dm.member_id where dm.department_id=h.responsible_department_id and dm.is_lead and finance.project_budget_verified_member(m.id,m.google_sub,m.email)) then raise exception 'finance:PROJECT_REVIEWER_MISSING' using errcode='23514'; end if;
    update finance.project_budget_versions set status='department_pending',submitted_at=clock_timestamp(),submitted_snapshot=old_snapshot,
      department_approved_by=null,department_approved_at=null,approved_by=null,approved_at=null,revision=revision+1 where id=v.id returning * into v;
    event_type:='project_budget.department_pending';
    select coalesce(array_agg(m.id),'{}') into recipient_ids from project_management.department_members dm join identity.members m on m.id=dm.member_id where dm.department_id=h.responsible_department_id and dm.is_lead and finance.project_budget_verified_member(m.id,m.google_sub,m.email);
  elsif action='approveDepartmentBudget' then
    if v.status<>'department_pending' or v.submitted_snapshot is distinct from old_snapshot then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
    update finance.project_budget_versions set status='finance_pending',department_approved_by=actor,department_approved_at=clock_timestamp(),revision=revision+1 where id=v.id returning * into v;
    event_type:='project_budget.finance_pending';
    select coalesce(array_agg(m.id),'{}') into recipient_ids from identity.members m where coalesce((finance.capability_flags(m.id)->>'approveBudget')::boolean,false) and finance.project_budget_verified_member(m.id,m.google_sub,m.email);
  elsif action in ('returnProjectBudget','withdrawProjectBudget') then
    if reason is null or char_length(reason)>500 then raise exception 'finance:PROJECT_REASON_REQUIRED' using errcode='23514'; end if;
    if action='returnProjectBudget' then
      if not ((v.status='department_pending' and (caps->>'canReviewDepartment')::boolean) or (v.status='finance_pending' and (caps->>'canApproveFinance')::boolean)) then raise exception 'finance:PROJECT_FORBIDDEN' using errcode='42501'; end if;
    elsif v.status not in ('department_pending','finance_pending') then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
    update finance.project_budget_versions set status='draft',submitted_at=null,submitted_snapshot=null,department_approved_by=null,department_approved_at=null,approved_by=null,approved_at=null,revision=revision+1 where id=v.id returning * into v;
    event_type:='project_budget.returned'; recipient_ids:=project_row.lead_ids;
  elsif action='approveProjectBudget' then
    if v.status<>'finance_pending' or v.department_approved_by is null or v.submitted_snapshot is distinct from old_snapshot then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
    -- An award may have activated after a draft was edited. Validate again while holding the same header lock.
    for material in select ve.entry_id,to_jsonb(ve) as proposed from finance.project_budget_version_entries ve where ve.version_id=v.id loop
      perform finance.assert_project_budget_entry_obligation(material.entry_id,material.proposed);
    end loop;
    for material in select approved.entry_id,to_jsonb(approved)||jsonb_build_object('removed',true) as proposed from finance.project_budget_version_entries approved
      where approved.version_id=h.approved_version_id and not exists(select 1 from finance.project_budget_version_entries pending where pending.version_id=v.id and pending.entry_id=approved.entry_id) loop
      perform finance.assert_project_budget_entry_obligation(material.entry_id,material.proposed);
    end loop;
    -- Legacy registration locks items before its season budget. Do not invert that order.
    perform 1 from finance.budget_items i join finance.project_budget_entries e on e.budget_item_id=i.id
      where e.project_budget_id=h.id order by i.id for update of i;
    select * into legacy from finance.budgets where season_id=h.season_id for update;
    if not found then
      insert into finance.budgets(season_id,public_ref,status,created_by_member_id,updated_by_member_id)
        values(h.season_id,'B-'||season_row.code,'draft',actor,actor) on conflict do nothing returning * into legacy;
      if not found then select * into legacy from finance.budgets where season_id=h.season_id for update; end if;
      if legacy.id is null then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
    end if;
    perform 1 from finance.funding f where f.id in(select funding_id from finance.funding_parts where id in(select earmark_id from finance.project_budget_version_entries where version_id=v.id and not removed)) order by f.id for share;
    perform 1 from finance.funding_parts fp where fp.id in(select earmark_id from finance.project_budget_version_entries where version_id=v.id and not removed) order by fp.id for share;
    if exists(
      select earmark_id from (
        select e.earmark_id,e.system_id from finance.effective_budget_entries e where e.season_id=h.season_id and e.project_budget_id is distinct from h.id and e.status<>'cancelled'
        union all select e.earmark_id,e.system_id from finance.project_budget_version_entries e where e.version_id=v.id and not e.removed and e.status<>'cancelled'
      ) links where earmark_id is not null group by earmark_id having count(distinct system_id)>1
    ) then raise exception 'finance:PROJECT_EARMARK_MISMATCH' using errcode='23514'; end if;
    select coalesce(max(substring(i.public_ref from '([0-9]+)$')::bigint),0)+1 into ref_next from finance.budget_items i join finance.budgets b on b.id=i.budget_id
      where b.season_id=h.season_id and i.public_ref ~ ('^BI-'||season_row.code||'-[0-9]+$');
    insert into finance.reference_counters(counter_key,configured_next,updated_by_member_id)
      values('budget_item:'||season_row.code,ref_next,actor) on conflict(counter_key) do nothing;
    for material in select e.*,ve.* from finance.project_budget_entries e join finance.project_budget_version_entries ve on ve.entry_id=e.id and ve.version_id=v.id
      where e.project_budget_id=h.id and not ve.removed order by e.id loop
      if material.earmark_id is not null and not exists(select 1 from finance.funding_parts fp join finance.funding f on f.id=fp.funding_id where fp.id=material.earmark_id and f.season_id=h.season_id
        and (f.status<>'deleted' or exists(select 1 from finance.project_budget_version_entries approved where approved.version_id=h.approved_version_id and approved.entry_id=material.entry_id and approved.earmark_id=material.earmark_id) or (h.approved_version_id is null and exists(select 1 from finance.budget_items anchor where anchor.id=material.budget_item_id and anchor.earmark_id=material.earmark_id)))) then
        raise exception 'finance:PROJECT_EARMARK_MISMATCH' using errcode='23514';
      end if;
      if material.budget_item_id is null then
        loop
          reference:=finance.budget_item_reference(season_row.code,finance.issue_budget_item_ordinal(actor,season_row.code));
          exit when not exists(select 1 from finance.budget_items where public_ref=reference);
        end loop;
        insert into finance.budget_items(id,budget_id,system_id,public_ref,description,category,planned_ore,priority,reuse_status,expected_purchase_date,owner_member_id,owner_email,status,note,earmark_id,created_by_member_id,updated_by_member_id)
          values(material.id,legacy.id,material.system_id,reference,material.description,material.category,material.planned_ore,
            case when material.earmark_id is not null then 'EM' else material.ordinary_priority end,material.reuse_status,material.expected_purchase_date,material.owner_member_id,material.owner_email,
            material.status,material.note,material.earmark_id,actor,actor);
        update finance.project_budget_entries set budget_item_id=id where id=material.id;
      end if;
    end loop;
    update finance.project_budget_versions set status='approved',approved_by=actor,approved_at=clock_timestamp(),revision=revision+1 where id=v.id returning * into v;
    update finance.project_budgets set approved_version_id=v.id,pending_version_id=null where id=h.id;
    event_type:='project_budget.approved';
    select coalesce(array_agg(distinct id),'{}') into recipient_ids from (
      select unnest(project_row.lead_ids) as id union select member_id from project_management.department_members where department_id=h.responsible_department_id and is_lead) recipients;
  end if;
  current_snapshot:=finance.project_budget_snapshot(v.id);
  insert into finance.project_budget_decisions(project_budget_id,version_id,action,actor_member_id,reason,snapshot,request_id,created_at)
    values(h.id,v.id,action,actor,reason,jsonb_build_object('before',old_snapshot,'after',current_snapshot,'stageBefore',prior_status,'stageAfter',v.status,'responsibleDepartmentId',h.responsible_department_id),$4,clock_timestamp());
  insert into finance.audit_log(actor_member_id,entity,entity_id,field_name,old_value,new_value,reason)
    values(actor,'project_budget',h.id::text,action,old_snapshot::text,current_snapshot::text,reason);
  update finance.project_budgets set revision=revision+1,updated_by_member_id=actor,updated_at=clock_timestamp() where id=h.id returning * into h;
  if event_type is not null then
    insert into finance.outbox(event_type,entity,entity_id,recipient_member_id,dedupe_key,payload)
      select event_type,'project_budget',h.id,recipient,event_type||':'||request_id::text||':'||recipient::text,
        jsonb_build_object('versionId',v.id,'decisionAction',action,'headerRevision',h.revision)
      from unnest(recipient_ids) recipient on conflict(dedupe_key) do nothing;
  end if;
  next_view:=finance.bump_view_version();
  response:=jsonb_build_object('ok',true,'id',h.id,'revision',h.revision,'viewVersion',next_view,'warnings','[]'::jsonb,'errors','[]'::jsonb);
  insert into finance.idempotency_keys(member_id,request_id,action,payload_hash,response) values(actor,$4,action,$5,response);
  return response;
end;
$$;
revoke all on function finance.assert_project_financial_assignment(uuid,text,text[]),finance.enforce_project_financial_assignment(),finance.assert_project_budget_entry_obligation(uuid,jsonb),finance.enforce_project_entry_obligation(),finance.project_budget_import_snapshot_token(uuid) from public;
commit;
