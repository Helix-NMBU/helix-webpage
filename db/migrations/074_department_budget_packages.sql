begin;
alter table finance.project_budget_decisions drop constraint project_budget_decisions_actor_member_id_request_id_action_key;
alter table finance.project_budget_decisions add constraint project_budget_decision_once_per_project unique(actor_member_id,request_id,action,project_budget_id);
create function finance.budget_nok(amount_ore numeric) returns text
language sql immutable strict security invoker set search_path=pg_catalog as $$
 select case when amount_ore<0 then '-' else '' end||trunc(abs(amount_ore)/100)::text||'.'||lpad(trunc(mod(abs(amount_ore),100))::text,2,'0')
$$;
create function finance.budget_department_key(department uuid) returns text
language sql stable security invoker set search_path=pg_catalog as $$
 select i.department_key from project_management.departments d join identity.departments i
 on project_management.canonical_department(i.name)=d.name where d.id=$1
$$;
-- This is an allocation adapter over the one effective plan, never a second plan.
create view finance.department_plan_allocation as
select e.id as entry_id,e.season_id,e.system_id,
 case when e.source='project' then finance.budget_department_key(e.responsible_department_id) else sys.department_key end as department_key,
 case when e.source='project' then e.project_id else null end as project_id,
 e.planned_ore,e.source='legacy' as legacy
from finance.effective_budget_entries e join finance.systems sys on sys.id=e.system_id;
create view finance.department_actual_allocation as
select a.*,case when e.source='project' or (a.unbudgeted and a.project_id is not null)
 then finance.budget_department_key(a.responsible_department_id) else sys.department_key end as department_key
from finance.registered_allocation_facts a join finance.effective_budget_entries e on e.id=a.budget_item_id
join finance.systems sys on sys.id=a.system_id;

-- All read totals use these per-entry accounting partitions. Protected anchors may
-- hold incurred costs from several projects; each allocation belongs to one group.
create view finance.department_entry_financials as
select e.id as entry_id,e.season_id,e.system_id,plan.department_key,e.planned_ore,
 coalesce((select sum(a.amount_ore) from finance.department_actual_allocation a where a.budget_item_id=e.id),0) as actual_ore,
 (select count(distinct a.purchase_id)::integer from finance.department_actual_allocation a where a.budget_item_id=e.id) as purchase_count,
 finance.budget_item_open_commitment_ore(e.id) as commitment_ore
from finance.effective_budget_entries e join finance.department_plan_allocation plan on plan.entry_id=e.id where not e.protected
union all
select e.id,e.season_id,e.system_id,partition.department_key,0::bigint,partition.actual_ore,partition.purchase_count,
 case when partition.department_key=sys.department_key then finance.budget_item_open_commitment_ore(e.id) else 0 end
from finance.effective_budget_entries e join finance.systems sys on sys.id=e.system_id
cross join lateral(
 select actual.department_key,sum(actual.amount_ore) as actual_ore,count(distinct actual.purchase_id)::integer as purchase_count
 from finance.department_actual_allocation actual where actual.budget_item_id=e.id group by actual.department_key
 union all select sys.department_key,0::numeric,0 where not exists(select 1 from finance.department_actual_allocation actual where actual.budget_item_id=e.id and actual.department_key=sys.department_key)
) partition where e.protected;

create table finance.department_budget_packages(
 id uuid primary key default gen_random_uuid(),department_id uuid not null references project_management.departments(id),season_id uuid not null references finance.seasons(id),
 status text not null check(status in ('finance_pending','approved','returned','withdrawn')),revision integer not null default 0,
 snapshot jsonb not null,submitted_by uuid not null references identity.members(id),submitted_at timestamptz not null default clock_timestamp(),
 decided_by uuid references identity.members(id),decided_at timestamptz,reason text,
 check((status='finance_pending' and decided_by is null and decided_at is null) or(status<>'finance_pending' and decided_by is not null and decided_at is not null)),
 check(status not in ('returned','withdrawn') or length(btrim(reason)) between 1 and 500)
);
create unique index department_budget_one_active on finance.department_budget_packages(department_id,season_id) where status='finance_pending';
create table finance.department_budget_package_members(
 package_id uuid not null references finance.department_budget_packages(id),project_id uuid not null references project_management.projects(id),
 project_budget_id uuid references finance.project_budgets(id),candidate_version_id uuid references finance.project_budget_versions(id),baseline_version_id uuid references finance.project_budget_versions(id),
 owner_department_id uuid references project_management.departments(id),project_season text not null,plan_hash text,
 primary key(package_id,project_id)
);
create unique index department_budget_candidate_once on finance.department_budget_package_members(package_id,candidate_version_id) where candidate_version_id is not null;
create table finance.department_budget_package_decisions(
 id uuid primary key default gen_random_uuid(),package_id uuid not null references finance.department_budget_packages(id),action text not null,
 actor_member_id uuid not null references identity.members(id),reason text,request_id uuid not null,created_at timestamptz not null default clock_timestamp(),
 unique(actor_member_id,request_id,action)
);
create function finance.immutable_department_budget_package() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if tg_op='DELETE' then raise exception 'finance:PACKAGE_HISTORY_IMMUTABLE' using errcode='23514'; end if;
 if old.snapshot is distinct from new.snapshot or old.department_id<>new.department_id or old.season_id<>new.season_id or old.submitted_by<>new.submitted_by or old.submitted_at<>new.submitted_at then
 raise exception 'finance:PACKAGE_HISTORY_IMMUTABLE' using errcode='23514'; end if;return new;
end $$;
create trigger department_budget_package_immutable before update or delete on finance.department_budget_packages for each row execute function finance.immutable_department_budget_package();

create function finance.department_budget_scope(actor uuid,sub text,email text,department uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $$
declare d project_management.departments%rowtype;s finance.seasons%rowtype;lead boolean;head boolean;fin boolean;
begin
 if not finance.project_budget_verified_member(actor,sub,email) then raise exception 'finance:PROJECT_FORBIDDEN' using errcode='42501';end if;
 select * into d from project_management.departments where id=department;
 if not found then raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002';end if;
 select * into s from finance.seasons where code=d.season;
 if not found then raise exception 'FINANCE|invalid|Finance must configure this season before department submission.' using errcode='23514';end if;
 lead:=exists(select 1 from project_management.department_members dm where dm.department_id=d.id and dm.member_id=actor and dm.is_lead);
 head:=coalesce((finance.capability_flags(actor)->>'approveBudget')::boolean,false);
 fin:=coalesce((finance.capability_flags(actor)->>'purchaseRegister')::boolean,false);
 if not lead and not fin then raise exception 'finance:PROJECT_FORBIDDEN' using errcode='42501';end if;
 return jsonb_build_object('departmentId',d.id,'departmentName',d.name,'departmentKey',finance.budget_department_key(d.id),'seasonId',s.id,'seasonCode',s.code,
 'capabilities',jsonb_build_object('canSubmit',lead and s.status<>'closed','canApproveFinance',head and s.status<>'closed','canReturn',head and s.status<>'closed','canWithdraw',lead and s.status<>'closed'));
end $$;
create function finance.department_budget_plan_version(target_version uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$
select jsonb_build_object('id',v.id,'versionNumber',v.version_number,'revision',v.revision,'status',v.status,'submittedAt',v.submitted_at,
 'departmentApprovedBy',v.department_approved_by,'departmentApprovedAt',v.department_approved_at,'approvedBy',v.approved_by,'approvedAt',v.approved_at,
 'totalNok',finance.budget_nok(coalesce((select sum(ve.planned_ore) from finance.project_budget_version_entries ve where ve.version_id=v.id and not ve.removed and ve.status<>'cancelled'),0)),
 'entries',coalesce((select jsonb_agg(jsonb_build_object('entryId',ve.entry_id,'budgetItemId',pe.budget_item_id,'publicRef',anchor.public_ref,'systemId',ve.system_id,'systemName',sys.name,'systemCode',sys.code,'description',ve.description,'category',ve.category,
 'plannedNok',finance.budget_nok(ve.planned_ore),'ordinaryPriority',ve.ordinary_priority,
 'priority',case when exists(select 1 from finance.budget_obligations o join finance.funding_applications a on a.id=o.application_id where o.entry_id=ve.entry_id and o.released_at is null and a.awarded_at is not null) then 'P0' else ve.ordinary_priority end,
 'reuseStatus',ve.reuse_status,'expectedPurchaseDate',ve.expected_purchase_date,'ownerMemberId',ve.owner_member_id,'ownerEmail',ve.owner_email,'status',ve.status,'note',ve.note,'earmarkId',ve.earmark_id,'removed',ve.removed) order by ve.entry_id)
 from finance.project_budget_version_entries ve join finance.project_budget_entries pe on pe.id=ve.entry_id join finance.systems sys on sys.id=ve.system_id left join finance.budget_items anchor on anchor.id=pe.budget_item_id where ve.version_id=v.id),'[]'::jsonb))
from finance.project_budget_versions v where v.id=target_version
$$;

create function finance.department_budget_legacy_entries(department uuid,included_headers uuid[]) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$
select coalesce(jsonb_agg(jsonb_build_object('entryId',e.id,'publicRef',e.public_ref,'description',e.description,'systemId',e.system_id,'systemName',sys.name,
 'plannedNok',finance.budget_nok(a.planned_ore),'proposedNok',finance.budget_nok(case when replacement.project_id is null then a.planned_ore else 0 end),'replacementProjectId',replacement.project_id) order by e.public_ref,e.id),'[]'::jsonb)
from finance.department_plan_allocation a join finance.effective_budget_entries e on e.id=a.entry_id join finance.systems sys on sys.id=a.system_id
join project_management.departments department on department.id=$1 join finance.seasons season on season.code=department.season and season.id=a.season_id
left join lateral(select h.project_id from finance.project_budget_entries pe join finance.project_budgets h on h.id=pe.project_budget_id where pe.id=e.id and h.id=any(included_headers)) replacement on true
where a.department_key=finance.budget_department_key($1) and a.legacy and not e.protected and e.legacy_budget_status='approved'
$$;

create function finance.department_budget_snapshot(department uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog as $$
declare d project_management.departments%rowtype;s finance.seasons%rowtype;r record;projects jsonb:='[]';legacy_rows jsonb;old_version jsonb;new_version jsonb;
 ready boolean;readiness text;old_amount numeric;new_amount numeric;old_total numeric:=0;new_total numeric:=0;legacy_total numeric;proposed_legacy numeric;
begin
 select * into d from project_management.departments where id=department;select * into s from finance.seasons where code=d.season;
 for r in select p.*,h.id as header_id,h.responsible_department_id,h.approved_version_id,h.pending_version_id,v.status as pending_status,owner.name as owner_name
 from project_management.projects p left join finance.project_budgets h on h.project_id=p.id and h.season_id=s.id
 left join finance.project_budget_versions v on v.id=h.pending_version_id left join project_management.departments owner on owner.id=h.responsible_department_id
 where p.season=d.season and d.name=any(p.departments) order by p.name,p.id loop
  ready:=r.responsible_department_id=d.id and r.pending_status in('department_pending','finance_pending');
  ready:=coalesce(ready,false);old_version:=null;new_version:=null;old_amount:=0;new_amount:=0;
  readiness:=case when r.header_id is null then case when cardinality(r.departments)>1 then 'unallocated' else 'no_budget' end
   when r.responsible_department_id<>d.id then 'other_department' when r.pending_status is not null then r.pending_status else 'approved' end;
  if r.responsible_department_id=d.id then
   old_version:=finance.department_budget_plan_version(r.approved_version_id);old_amount:=coalesce((old_version->>'totalNok')::numeric,0);
   if ready then new_version:=finance.department_budget_plan_version(r.pending_version_id);end if;
   new_amount:=case when ready then coalesce((new_version->>'totalNok')::numeric,0) else old_amount end;
  end if;
  old_total:=old_total+old_amount;new_total:=new_total+new_amount;
  projects:=projects||jsonb_build_array(jsonb_build_object('projectId',r.id,'projectName',r.name,'projectLeadIds',to_jsonb(r.lead_ids),
   'projectBudgetId',r.header_id,'responsibleDepartmentId',r.responsible_department_id,'responsibleDepartmentName',r.owner_name,'readiness',readiness,'included',ready,
   'approvedVersion',old_version,'proposedVersion',new_version,'approvedTotalNok',finance.budget_nok((old_amount)*100),'proposedTotalNok',finance.budget_nok((new_amount)*100),'deltaNok',finance.budget_nok((new_amount-old_amount)*100)));
 end loop;
 legacy_rows:=finance.department_budget_legacy_entries(d.id,array(select (project->>'projectBudgetId')::uuid from jsonb_array_elements(projects) project where (project->>'included')::boolean));
 select coalesce(sum((entry->>'plannedNok')::numeric),0),coalesce(sum((entry->>'proposedNok')::numeric),0) into legacy_total,proposed_legacy from jsonb_array_elements(legacy_rows) entry;
 return jsonb_build_object('departmentId',d.id,'departmentName',d.name,'departmentKey',finance.budget_department_key(d.id),'seasonId',s.id,'seasonCode',s.code,
 'projects',projects,'legacyEntries',legacy_rows,'legacyTotalNok',finance.budget_nok((legacy_total)*100),'proposedLegacyTotalNok',finance.budget_nok((proposed_legacy)*100),
 'approvedTotalNok',finance.budget_nok((old_total+legacy_total)*100),'proposedTotalNok',finance.budget_nok((new_total+proposed_legacy)*100),'deltaNok',finance.budget_nok((new_total+proposed_legacy-old_total-legacy_total)*100));
end $$;

create function finance.lock_department_budget_actor(actor uuid) returns void
language plpgsql volatile security invoker set search_path=pg_catalog as $$
begin
 perform m.id from identity.members m join neon_auth."user" u on u.id=m.auth_user_id join neon_auth.account a on a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub where m.id=actor for share of m,u,a;
 perform 1 from project_management.department_members where member_id=actor for share;
 perform 1 from identity.member_roles where member_id=actor for share;
 perform 1 from finance.member_grants where member_id=actor for share;
end $$;
create function finance.department_budget_reset_package(target_package uuid,actor uuid,action text,reason text,request uuid) returns void
language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare p finance.department_budget_packages%rowtype;m record;
begin
 select * into p from finance.department_budget_packages where id=target_package for update;
 if p.status<>'finance_pending' then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001';end if;
 if reason is null or length(btrim(reason)) not between 1 and 500 then raise exception 'finance:PROJECT_REASON_REQUIRED' using errcode='23514';end if;
 for m in select member.* from finance.department_budget_package_members member where member.package_id=p.id and member.candidate_version_id is not null order by member.project_budget_id loop
  if not exists(select 1 from finance.project_budgets h where h.id=m.project_budget_id and h.pending_version_id=m.candidate_version_id) then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001';end if;
  update finance.project_budget_versions set status='draft',submitted_at=null,submitted_snapshot=null,department_approved_by=null,department_approved_at=null,approved_by=null,approved_at=null,revision=revision+1 where id=m.candidate_version_id;
  update finance.project_budgets set revision=revision+1,updated_by_member_id=actor,updated_at=clock_timestamp() where id=m.project_budget_id;
  insert into finance.project_budget_decisions(project_budget_id,version_id,action,actor_member_id,reason,snapshot,request_id,created_at) values(m.project_budget_id,m.candidate_version_id,action,actor,reason,jsonb_build_object('packageId',p.id,'stageAfter','draft'),request,clock_timestamp());
 end loop;
 update finance.department_budget_packages set status=case when action='withdrawDepartmentBudgetPackage' then 'withdrawn' else 'returned' end,revision=revision+1,decided_by=actor,decided_at=clock_timestamp(),reason=btrim($4) where id=p.id;
 insert into finance.department_budget_package_decisions(package_id,action,actor_member_id,reason,request_id) values(p.id,action,actor,btrim(reason),request);
 insert into finance.audit_log(actor_member_id,entity,entity_id,field_name,old_value,new_value,reason) values(actor,'department_budget_package',p.id::text,action,'finance_pending',case when action='withdrawDepartmentBudgetPackage' then 'withdrawn' else 'returned' end,btrim(reason));
 insert into finance.outbox(event_type,entity,entity_id,recipient_member_id,dedupe_key,payload)
 select 'department_package.returned','department_budget_package',p.id,recipient,'department_package.returned:'||request::text||':'||recipient::text,jsonb_build_object('packageId',p.id)
 from (select distinct unnest(project.lead_ids) as recipient from finance.department_budget_package_members member join project_management.projects project on project.id=member.project_id where member.package_id=p.id and member.candidate_version_id is not null
 union select member_id from project_management.department_members where department_id=p.department_id and is_lead) recipients on conflict(dedupe_key) do nothing;
end $$;

create function finance.mutate_department_budget_package(actor uuid,sub text,email text,request uuid,payload_hash text,body jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare action text:=body->>'action';p finance.department_budget_packages%rowtype;scope jsonb;snapshot jsonb;headers uuid[];current_headers uuid[];r record;v finance.project_budget_versions%rowtype;
 legacy finance.budgets%rowtype;material record;reference text;ref_next bigint;existing finance.idempotency_keys%rowtype;response jsonb;reason text:=nullif(btrim(body->>'reason'),'');event text;next_view bigint;
begin
 if action not in('sendDepartmentBudgetPackage','approveDepartmentBudgetPackage','returnDepartmentBudgetPackage','withdrawDepartmentBudgetPackage') or request is null or payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'finance:PROJECT_INVALID' using errcode='23514';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||request::text,0));
 if action='sendDepartmentBudgetPackage' then
  perform pg_advisory_xact_lock(hashtextextended('department-package:'||(body->>'departmentId'),0));
  select coalesce(array_agg(h.id order by h.id),'{}') into headers from finance.project_budgets h join project_management.projects project on project.id=h.project_id join project_management.departments d on d.id=(body->>'departmentId')::uuid where project.season=d.season and d.name=any(project.departments);
 else
  select * into p from finance.department_budget_packages where id=(body->>'packageId')::uuid;
  if not found then raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002';end if;
  select coalesce(array_agg(project_budget_id order by project_budget_id),'{}') into headers from finance.department_budget_package_members where package_id=p.id and project_budget_id is not null;
 end if;
 perform id from finance.project_budgets where id=any(headers) order by id for update;
 -- Never acquire another header after this point. Recheck discovered scope below.
 if action='sendDepartmentBudgetPackage' then
  perform project.id from project_management.projects project join project_management.departments department on department.id=(body->>'departmentId')::uuid where project.season=department.season and department.name=any(project.departments) order by project.id for share of project;
 else
  perform project.id from project_management.projects project join finance.department_budget_package_members member on member.project_id=project.id where member.package_id=p.id order by project.id for share of project;
 end if;
 perform finance.lock_department_budget_actor(actor);
 scope:=finance.department_budget_scope(actor,sub,email,case when action='sendDepartmentBudgetPackage' then (body->>'departmentId')::uuid else p.department_id end);
 perform 1 from finance.seasons where id=(scope->>'seasonId')::uuid and status<>'closed' for share;
 if not found then raise exception 'finance:PROJECT_FORBIDDEN' using errcode='42501';end if;
 if (action='sendDepartmentBudgetPackage' and not(scope->'capabilities'->>'canSubmit')::boolean)
 or(action in('approveDepartmentBudgetPackage','returnDepartmentBudgetPackage') and not(scope->'capabilities'->>'canApproveFinance')::boolean)
 or(action='withdrawDepartmentBudgetPackage' and not(scope->'capabilities'->>'canWithdraw')::boolean) then raise exception 'finance:PROJECT_FORBIDDEN' using errcode='42501';end if;
 select * into existing from finance.idempotency_keys where member_id=actor and request_id=request for update;
 if found then
  if existing.action<>action or existing.payload_hash<>$5 or existing.response is null then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001';end if;return existing.response||jsonb_build_object('replayed',true);
 end if;
 if action='sendDepartmentBudgetPackage' then
  select coalesce(array_agg(h.id order by h.id),'{}') into current_headers from finance.project_budgets h join project_management.projects project on project.id=h.project_id join project_management.departments d on d.id=(body->>'departmentId')::uuid where project.season=d.season and d.name=any(project.departments);
  if current_headers is distinct from headers then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001';end if;
  snapshot:=finance.department_budget_snapshot((body->>'departmentId')::uuid);
  select coalesce(array_agg((project->>'projectBudgetId')::uuid order by (project->>'projectBudgetId')::uuid),'{}') into current_headers from jsonb_array_elements(snapshot->'projects') project where project->>'projectBudgetId' is not null;
  if current_headers is distinct from headers then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001';end if;
  if md5(snapshot::text) is distinct from body->>'previewToken' then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001';end if;
  if exists(select 1 from finance.department_budget_packages where department_id=(scope->>'departmentId')::uuid and status='finance_pending') then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001';end if;
  perform version.id from finance.project_budget_versions version join finance.project_budgets header on header.pending_version_id=version.id where header.id=any(headers) order by version.id for update of version;
  insert into finance.department_budget_packages(department_id,season_id,status,snapshot,submitted_by) values((scope->>'departmentId')::uuid,(scope->>'seasonId')::uuid,'finance_pending',snapshot,actor) returning * into p;
  for r in select project.* from jsonb_to_recordset(snapshot->'projects') as project("projectId" uuid,"projectBudgetId" uuid,"responsibleDepartmentId" uuid,included boolean,"approvedVersion" jsonb,"proposedVersion" jsonb) loop
   insert into finance.department_budget_package_members(package_id,project_id,project_budget_id,candidate_version_id,baseline_version_id,owner_department_id,project_season,plan_hash)
   values(p.id,r."projectId",r."projectBudgetId",case when r.included then (r."proposedVersion"->>'id')::uuid end,(r."approvedVersion"->>'id')::uuid,r."responsibleDepartmentId",scope->>'seasonCode',case when r.included then md5(finance.project_budget_snapshot((r."proposedVersion"->>'id')::uuid)::text) end);
   if r.included then
    select * into v from finance.project_budget_versions where id=(r."proposedVersion"->>'id')::uuid;
    if v.status not in('department_pending','finance_pending') or v.submitted_snapshot is distinct from finance.project_budget_snapshot(v.id) then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001';end if;
    update finance.project_budget_versions set status='finance_pending',department_approved_by=actor,department_approved_at=clock_timestamp(),revision=revision+1 where id=v.id;
    insert into finance.project_budget_decisions(project_budget_id,version_id,action,actor_member_id,snapshot,request_id,created_at) values(r."projectBudgetId",v.id,action,actor,jsonb_build_object('packageId',p.id,'before',v.submitted_snapshot,'after',v.submitted_snapshot),request,clock_timestamp());
    update finance.project_budgets set revision=revision+1,updated_by_member_id=actor,updated_at=clock_timestamp() where id=r."projectBudgetId";
   end if;
  end loop;
  event:='department_package.submitted';
 else
  select * into p from finance.department_budget_packages where id=p.id for update;
  if p.status<>'finance_pending' or p.revision<>(body->>'expectedRevision')::integer then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001';end if;
  perform version.id from finance.project_budget_versions version join finance.department_budget_package_members member on member.candidate_version_id=version.id where member.package_id=p.id order by version.id for update of version;
  if action in('returnDepartmentBudgetPackage','withdrawDepartmentBudgetPackage') then
   perform finance.department_budget_reset_package(p.id,actor,action,reason,request);event:='department_package.returned';
  else
   for r in select member.*,project.season as current_season,project.departments,header.responsible_department_id,header.approved_version_id,header.pending_version_id
   from finance.department_budget_package_members member join project_management.projects project on project.id=member.project_id left join finance.project_budgets header on header.project_id=member.project_id and header.season_id=p.season_id where member.package_id=p.id order by member.project_id loop
    if r.current_season<>r.project_season or not exists(select 1 from project_management.departments where id=p.department_id and name=any(r.departments)) or r.responsible_department_id is distinct from r.owner_department_id then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001';end if;
    if r.owner_department_id=p.department_id and r.approved_version_id is distinct from r.baseline_version_id then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001';end if;
    if r.candidate_version_id is not null then
     select * into v from finance.project_budget_versions where id=r.candidate_version_id;
     if r.pending_version_id is distinct from v.id or v.status<>'finance_pending' or v.department_approved_by is null or md5(finance.project_budget_snapshot(v.id)::text)<>r.plan_hash or v.submitted_snapshot is distinct from finance.project_budget_snapshot(v.id) then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001';end if;
     for material in select ve.entry_id,to_jsonb(ve) as proposed from finance.project_budget_version_entries ve where ve.version_id=v.id loop perform finance.assert_project_budget_entry_obligation(material.entry_id,material.proposed);end loop;
     for material in select old.entry_id,to_jsonb(old)||jsonb_build_object('removed',true) as proposed from finance.project_budget_version_entries old where old.version_id=r.baseline_version_id and not exists(select 1 from finance.project_budget_version_entries proposed where proposed.version_id=v.id and proposed.entry_id=old.entry_id) loop perform finance.assert_project_budget_entry_obligation(material.entry_id,material.proposed);end loop;
    end if;
   end loop;
   -- Pin every remaining legacy baseline anchor as well as candidate anchors.
   -- A different department may retire a physical legacy plan into its own project.
   perform anchor.id from finance.budget_items anchor where anchor.id in(
    select entry.budget_item_id from finance.project_budget_entries entry join finance.department_budget_package_members member on member.project_budget_id=entry.project_budget_id where member.package_id=p.id and member.candidate_version_id is not null
    union select (entry->>'entryId')::uuid from jsonb_array_elements(p.snapshot->'legacyEntries') entry
   ) order by anchor.id for update;
   if finance.department_budget_legacy_entries(p.department_id,array(select project_budget_id from finance.department_budget_package_members where package_id=p.id and candidate_version_id is not null)) is distinct from p.snapshot->'legacyEntries' then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001';end if;
   if exists(select 1 from finance.department_budget_package_members where package_id=p.id and candidate_version_id is not null) then
   select * into legacy from finance.budgets where season_id=p.season_id for update;
   if not found then
    insert into finance.budgets(season_id,public_ref,status,created_by_member_id,updated_by_member_id) values(p.season_id,'B-'||(scope->>'seasonCode'),'draft',actor,actor) on conflict do nothing;
    select * into legacy from finance.budgets where season_id=p.season_id for update;
    if not found then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001';end if;
   end if;
   perform funding.id from finance.funding funding where funding.id in(select part.funding_id from finance.funding_parts part join finance.project_budget_version_entries ve on ve.earmark_id=part.id join finance.department_budget_package_members member on member.candidate_version_id=ve.version_id where member.package_id=p.id and not ve.removed) order by funding.id for share;
   perform part.id from finance.funding_parts part join finance.project_budget_version_entries ve on ve.earmark_id=part.id join finance.department_budget_package_members member on member.candidate_version_id=ve.version_id where member.package_id=p.id and not ve.removed order by part.id for share of part;
   if exists(select earmark_id from(
    select e.earmark_id,e.system_id from finance.effective_budget_entries e where e.season_id=p.season_id and e.status<>'cancelled' and not exists(select 1 from finance.department_budget_package_members member where member.package_id=p.id and member.candidate_version_id is not null and member.project_budget_id=e.project_budget_id)
    union all select ve.earmark_id,ve.system_id from finance.project_budget_version_entries ve join finance.department_budget_package_members member on member.candidate_version_id=ve.version_id where member.package_id=p.id and not ve.removed and ve.status<>'cancelled'
   ) links where earmark_id is not null group by earmark_id having count(distinct system_id)>1) then raise exception 'finance:PROJECT_EARMARK_MISMATCH' using errcode='23514';end if;
   select coalesce(max(substring(i.public_ref from '([0-9]+)$')::bigint),0)+1 into ref_next from finance.budget_items i where i.budget_id=legacy.id and i.public_ref~('^BI-'||(scope->>'seasonCode')||'-[0-9]+$');
   insert into finance.reference_counters(counter_key,configured_next,updated_by_member_id) values('budget_item:'||(scope->>'seasonCode'),ref_next,actor) on conflict(counter_key) do nothing;
   for r in select * from finance.department_budget_package_members where package_id=p.id and candidate_version_id is not null order by project_budget_id loop
    for material in select pe.budget_item_id,ve.* from finance.project_budget_entries pe join finance.project_budget_version_entries ve on ve.entry_id=pe.id where ve.version_id=r.candidate_version_id and not ve.removed order by ve.entry_id loop
     if material.earmark_id is not null and not exists(select 1 from finance.funding_parts part join finance.funding funding on funding.id=part.funding_id where part.id=material.earmark_id and funding.season_id=p.season_id and(funding.status<>'deleted' or exists(select 1 from finance.project_budget_version_entries old where old.version_id=r.baseline_version_id and old.entry_id=material.entry_id and old.earmark_id=material.earmark_id) or(r.baseline_version_id is null and exists(select 1 from finance.budget_items old where old.id=material.budget_item_id and old.earmark_id=material.earmark_id)))) then raise exception 'finance:PROJECT_EARMARK_MISMATCH' using errcode='23514';end if;
     if material.budget_item_id is null then
      loop reference:=finance.budget_item_reference(scope->>'seasonCode',finance.issue_budget_item_ordinal(actor,scope->>'seasonCode'));exit when not exists(select 1 from finance.budget_items where public_ref=reference);end loop;
      insert into finance.budget_items(id,budget_id,system_id,public_ref,description,category,planned_ore,priority,reuse_status,expected_purchase_date,owner_member_id,owner_email,status,note,earmark_id,created_by_member_id,updated_by_member_id)
      values(material.entry_id,legacy.id,material.system_id,reference,material.description,material.category,material.planned_ore,case when material.earmark_id is not null then 'EM' else material.ordinary_priority end,material.reuse_status,material.expected_purchase_date,material.owner_member_id,material.owner_email,material.status,material.note,material.earmark_id,actor,actor);
      update finance.project_budget_entries set budget_item_id=id where id=material.entry_id;
     end if;
    end loop;
    update finance.project_budget_versions set status='approved',approved_by=actor,approved_at=clock_timestamp(),revision=revision+1 where id=r.candidate_version_id;
    update finance.project_budgets set approved_version_id=r.candidate_version_id,pending_version_id=null,revision=revision+1,updated_by_member_id=actor,updated_at=clock_timestamp() where id=r.project_budget_id;
    insert into finance.project_budget_decisions(project_budget_id,version_id,action,actor_member_id,snapshot,request_id,created_at) values(r.project_budget_id,r.candidate_version_id,action,actor,jsonb_build_object('packageId',p.id,'after',finance.project_budget_snapshot(r.candidate_version_id)),request,clock_timestamp());
   end loop;
   end if;
   update finance.department_budget_packages set status='approved',revision=revision+1,decided_by=actor,decided_at=clock_timestamp() where id=p.id;event:='department_package.approved';
  end if;
 end if;
 if event<>'department_package.returned' then
  insert into finance.department_budget_package_decisions(package_id,action,actor_member_id,reason,request_id) values(p.id,action,actor,reason,request);
  insert into finance.audit_log(actor_member_id,entity,entity_id,field_name,old_value,new_value,reason) values(actor,'department_budget_package',p.id::text,action,null,event,reason);
  insert into finance.outbox(event_type,entity,entity_id,recipient_member_id,dedupe_key,payload)
  select event,'department_budget_package',p.id,recipient,event||':'||request::text||':'||recipient::text,jsonb_build_object('packageId',p.id) from(
   select member.id as recipient from identity.members member where event='department_package.submitted' and finance.project_budget_verified_member(member.id,member.google_sub,member.email) and coalesce((finance.capability_flags(member.id)->>'approveBudget')::boolean,false)
   union select unnest(project.lead_ids) from finance.department_budget_package_members member join project_management.projects project on project.id=member.project_id where member.package_id=p.id and member.candidate_version_id is not null and event='department_package.approved'
   union select member_id from project_management.department_members where department_id=p.department_id and is_lead and event='department_package.approved') recipients on conflict(dedupe_key) do nothing;
 end if;
 next_view:=finance.bump_view_version();response:=jsonb_build_object('ok',true,'id',p.id,'revision',(select revision from finance.department_budget_packages where id=p.id),'viewVersion',next_view,'warnings','[]'::jsonb,'errors','[]'::jsonb);
 insert into finance.idempotency_keys(member_id,request_id,action,payload_hash,response) values(actor,request,action,payload_hash,response);return response;
end $$;

alter function finance.mutate_project_budget(uuid,text,text,uuid,text,jsonb) rename to mutate_project_budget_before_packages;

-- Retire the old core's approval actions too. It remains reusable only for scoped
-- authoring/revision actions; no SQL caller can promote one packet member through it.
do $guard$
declare definition text; needle text; matches integer;
begin
 definition:=pg_get_functiondef('finance.mutate_project_budget_before_packages(uuid,text,text,uuid,text,jsonb)'::regprocedure);
 needle:=$old$  if action not in ('createProjectBudget','saveProjectBudgetEntry','removeProjectBudgetEntry','submitProjectBudget','approveDepartmentBudget','approveProjectBudget','returnProjectBudget','withdrawProjectBudget','requestProjectBudgetChanges','importProjectBudgetEntries','adoptProjectBudgetEntries')$old$;
 matches:=(length(definition)-length(replace(definition,needle,'')))/length(needle);
 if matches<>1 then raise exception '074 expected exactly one project action guard; found %',matches;end if;
 execute replace(definition,needle,$new$  if action in('approveDepartmentBudget','approveProjectBudget') then raise exception 'FINANCE|invalid|Submit and approve the complete department budget package instead.' using errcode='23514';end if;
$new$||needle);
end $guard$;

create function finance.mutate_project_budget(actor uuid,sub text,email text,request uuid,payload_hash text,body jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare active_package uuid;owner_department uuid;headers uuid[];result jsonb;existing finance.idempotency_keys%rowtype;action text:=body->>'action';
begin
 if action in('approveDepartmentBudget','approveProjectBudget') then raise exception 'FINANCE|invalid|Submit and approve the complete department budget package instead.' using errcode='23514';end if;
 if action not in('returnProjectBudget','withdrawProjectBudget','requestProjectBudgetChanges') then return finance.mutate_project_budget_before_packages(actor,sub,email,request,payload_hash,body);end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||request::text,0));
 select responsible_department_id into owner_department from finance.project_budgets where id=(body->>'projectBudgetId')::uuid;
 if owner_department is not null then perform pg_advisory_xact_lock(hashtextextended('department-package:'||owner_department::text,0));end if;
 select package.id into active_package from finance.department_budget_packages package join finance.department_budget_package_members member on member.package_id=package.id
 join finance.project_budgets header on header.id=member.project_budget_id and header.pending_version_id=member.candidate_version_id
 where header.id=(body->>'projectBudgetId')::uuid and package.status='finance_pending';
 if active_package is null then return finance.mutate_project_budget_before_packages(actor,sub,email,request,payload_hash,body);end if;
 select coalesce(array_agg(project_budget_id order by project_budget_id),'{}') into headers from finance.department_budget_package_members where package_id=active_package and project_budget_id is not null;
 perform id from finance.project_budgets where id=any(headers) order by id for update;
 perform 1 from finance.department_budget_packages where id=active_package for update;
 -- The original scoped action authenticates and authorizes this project lead/reviewer.
 result:=finance.mutate_project_budget_before_packages(actor,sub,email,request,payload_hash,body);
 if coalesce((result->>'replayed')::boolean,false) then return result;end if;
 perform finance.department_budget_reset_package(active_package,actor,'returnDepartmentBudgetPackage',nullif(btrim(body->>'reason'),''),request);
 result:=result||jsonb_build_object('departmentPackageId',active_package,'viewVersion',finance.bump_view_version());
 update finance.idempotency_keys set response=result where member_id=actor and request_id=request;
 return result;
end $$;

revoke all on finance.department_plan_allocation,finance.department_actual_allocation,finance.department_entry_financials,finance.department_budget_packages,finance.department_budget_package_members,finance.department_budget_package_decisions from public;
do $$ declare routine record;role_name text;begin
 for routine in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='finance' and p.proname in('budget_nok','budget_department_key','department_budget_scope','department_budget_plan_version','department_budget_snapshot','department_budget_legacy_entries','lock_department_budget_actor','department_budget_reset_package','mutate_department_budget_package','mutate_project_budget','mutate_project_budget_before_packages','immutable_department_budget_package') loop execute format('revoke all on function %s from public',routine.signature);end loop;
 foreach role_name in array array['anon','authenticated','anonymous'] loop if exists(select 1 from pg_roles where rolname=role_name) then execute format('revoke all on finance.department_plan_allocation,finance.department_actual_allocation,finance.department_entry_financials,finance.department_budget_packages,finance.department_budget_package_members,finance.department_budget_package_decisions from %I',role_name);end if;end loop;
end $$;
commit;
