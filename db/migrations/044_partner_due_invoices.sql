-- The scheduled runner and Won handoff remain server-only. No schedule is installed here.
begin;
create or replace function partner_deals.confirm_won(p_member uuid,p_sub text,p_email text,p_deal uuid,p_expected integer)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare
 d partner_deals.deals%rowtype; current_season finance.seasons%rowtype; item partner_deals.deliverables%rowtype;
 contribution partner_deals.contributions%rowtype; org_name text; project_id uuid; milestone_id uuid; task_id uuid;
 prior jsonb; finance_dept text; marketing_dept text;
begin
 -- Project task triggers use the same advisory lock, before locking actor rows.
 perform pg_advisory_xact_lock(72704,12);
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 select * into d from partner_deals.deals where id=p_deal for update;
 if not found then raise exception 'deal_not_found' using errcode='P0002'; end if;
 if d.stage='won' then return d.id; end if;
 if p_expected is null or d.revision<>p_expected then raise exception 'deal_conflict' using errcode='40001'; end if;
 if d.stage='lost' then raise exception 'deal_invalid_stage' using errcode='22023'; end if;
 select s.* into current_season from finance.seasons s join finance.settings st on st.setting_key='current_season' and s.code=st.setting_value #>> '{}';
 if current_season.id is null or current_season.status='closed' then raise exception 'deal_no_current_season' using errcode='22023'; end if;
 select name into org_name from partner.organizations where id=d.organization_id;
 select name into marketing_dept from project_management.departments where season=current_season.code and name='Business & Marketing';
 select name into finance_dept from project_management.departments where season=current_season.code and name='Finance';
 if exists(select 1 from partner_deals.deliverables where deal_id=d.id) and marketing_dept is null then raise exception 'deal_marketing_department_missing' using errcode='22023'; end if;
 select * into contribution from partner_deals.contributions where deal_id=d.id and season_id=current_season.id and kind='cash';
 if contribution.id is not null and finance_dept is null then raise exception 'deal_finance_department_missing' using errcode='22023'; end if;
 if exists(select 1 from partner_deals.deliverables v where v.deal_id=d.id and v.owner_member_id is not null and not exists(
  select 1 from project_management.department_members dm join project_management.departments dep on dep.id=dm.department_id
  join identity.members m on m.id=dm.member_id join neon_auth."user" u on u.id=m.auth_user_id
  where dep.name=marketing_dept and dep.season=current_season.code and dm.member_id=v.owner_member_id and dm.access_level in ('member','lead')
   and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
   and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub)
 )) then raise exception 'deal_invalid_marketing_owner' using errcode='22023'; end if;
 -- The funding module must be installed; do not mark the deal Won without it.
 if to_regprocedure('partner_deals.attach_won_funding(uuid,uuid)') is null then raise exception 'deal_funding_unavailable' using errcode='55000'; end if;
 execute 'select partner_deals.attach_won_funding($1,$2)' using p_member,d.id;
 prior:=to_jsonb(d);
 if exists(select 1 from partner_deals.deliverables where deal_id=d.id) then
  project_id:=gen_random_uuid(); milestone_id:=gen_random_uuid();
  insert into project_management.projects(id,season,name,description,category,departments,deadline)
  values(project_id,current_season.code,left(org_name||' partnership',200),'Sponsor agreement deliverables','partnership-deliverables',array[marketing_dept],current_season.end_date);
  insert into project_management.tasks(id,season,title,description,category,project_id,deadline,status,priority,kind,partner_name)
  values(milestone_id,current_season.code,'Sponsor deliverables','Deliver the agreed commitments','partnership-deliverables',project_id,current_season.end_date,'todo','normal','milestone',org_name);
  for item in select * from partner_deals.deliverables where deal_id=d.id order by id loop
   task_id:=gen_random_uuid();
   insert into project_management.tasks(id,season,title,description,category,project_id,milestone_id,deadline,status,priority,kind,partner_name)
   values(task_id,current_season.code,item.title,item.description,'partnership-deliverables',project_id,milestone_id,item.due_date,'todo','normal','task',org_name);
   if item.owner_member_id is not null then insert into project_management.task_assignees(task_id,member_id) values(task_id,item.owner_member_id); end if;
   insert into partner_deals.task_links(deal_id,task_id,deliverable_id,kind) values(d.id,task_id,item.id,'marketing');
  end loop;
 end if;
 if contribution.id is not null then
  project_id:=gen_random_uuid(); milestone_id:=gen_random_uuid(); task_id:=gen_random_uuid();
  insert into project_management.projects(id,season,name,description,category,departments,deadline)
  values(project_id,current_season.code,left(org_name||' invoicing',200),'Sponsor agreement invoicing','operations',array[finance_dept],current_season.end_date);
  insert into project_management.tasks(id,season,title,description,category,project_id,deadline,status,priority,kind,partner_name)
  values(milestone_id,current_season.code,'Sponsor invoicing','Invoice the agreed contribution','operations',project_id,current_season.end_date,'todo','normal','milestone',org_name);
  insert into project_management.tasks(id,season,title,description,category,project_id,milestone_id,deadline,status,priority,kind,partner_name)
  values(task_id,current_season.code,left('Invoice '||org_name,200),'Review the agreement and invoice the partner.','operations',project_id,milestone_id,contribution.invoice_date,'todo','normal','task',org_name);
  insert into partner_deals.task_links(deal_id,task_id,season_id,kind) values(d.id,task_id,current_season.id,'invoice');
 end if;
 update partner_deals.deals set stage='won',won_at=now(),won_by_member_id=p_member,revision=revision+1,updated_at=now(),updated_by_member_id=p_member where id=d.id returning * into d;
 insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot) values(d.id,p_member,'won',prior,to_jsonb(d));
 return d.id;
end $$;


-- Operator-only provisioning leaves the configured current season unchanged.
create function finance.provision_future_season(p_operator uuid,p_code text,p_name text,p_start date,p_end date)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare current_end date; existing finance.seasons%rowtype; target uuid;
begin
 perform finance.require_operator(p_operator);
 if not exists(select 1 from identity.member_roles where member_id=p_operator and role_key='platform_administrator') then raise exception 'deal_operator_forbidden' using errcode='42501'; end if;
 select s.end_date into current_end from finance.settings st join finance.seasons s on s.code=st.setting_value #>> '{}'
 where st.setting_key='current_season';
 if current_end is null or p_code !~ '^S[0-9]{2}$' or length(btrim(p_name)) not between 1 and 80
   or p_start is null or p_end is null or p_start<=current_end or p_end<p_start then raise exception 'finance:INVALID' using errcode='22023'; end if;
 select * into existing from finance.seasons where code=p_code for update;
 if found then
  if existing.start_date is distinct from p_start or existing.end_date is distinct from p_end or existing.name is distinct from btrim(p_name) or existing.status='closed'
   then raise exception 'finance:SEASON_CONFLICT' using errcode='23505'; end if;
  return existing.id;
 end if;
 insert into finance.seasons(code,name,start_date,end_date,created_by_member_id,updated_by_member_id)
 values(p_code,btrim(p_name),p_start,p_end,p_operator,p_operator) returning id into target;
 perform finance.append_audit(p_operator,'season',target::text,'future_season',null,p_code,null);
 perform finance.bump_view_version();
 return target;
end $$;

-- Explicitly creates empty current-season departments; it never carries members forward.
create function project_management.provision_current_departments(p_operator uuid) returns void language plpgsql set search_path=pg_catalog as $$
declare target_code text;
begin
 perform finance.require_operator(p_operator);
 if not exists(select 1 from identity.member_roles where member_id=p_operator and role_key='platform_administrator') then raise exception 'deal_operator_forbidden' using errcode='42501'; end if;
 target_code:=project_management.current_season();
 if not exists(select 1 from finance.seasons where finance.seasons.code=target_code and status<>'closed') then
  raise exception 'deal_invoice_current_season_unavailable'; end if;
 insert into project_management.departments(id,season,name)
 select gen_random_uuid(),target_code,name from unnest(array['Management','Mechanical & Production','Electronics','Software & Autonomous','Business & Marketing','Logistics','Finance']) as names(name)
 on conflict (season,lower(name)) do nothing;
end $$;

-- Private test seam accepts a date; production calls only the clock-backed wrapper.
create function partner_deals.materialize_invoices_on(p_day date) returns jsonb
language plpgsql set search_path=pg_catalog as $$
declare current_season finance.seasons%rowtype; rec record; task_id uuid; project_id uuid; milestone_id uuid;
 created integer:=0; failed integer:=0; failure_details jsonb:='[]'::jsonb; finance_dept text;
begin
 if p_day is null then raise exception 'deal_invoice_invalid_date'; end if;
 perform pg_advisory_xact_lock(72704,12);
 select s.* into current_season from finance.settings st join finance.seasons s on s.code=st.setting_value #>> '{}'
 where st.setting_key='current_season' and s.status<>'closed' and p_day between s.start_date and s.end_date;
 if current_season.id is null then raise exception 'deal_invoice_current_season_unavailable'; end if;
 select name into finance_dept from project_management.departments where season=current_season.code and name='Finance';
 if finance_dept is null then raise exception 'deal_invoice_finance_department_missing'; end if;
 for rec in
  select c.id as contribution_id,c.season_id,c.amount_ore,c.invoice_date,s.name as season_name,
   d.id as deal_id,o.name as organization_name
  from partner_deals.contributions c join partner_deals.deals d on d.id=c.deal_id
  join finance.seasons s on s.id=c.season_id join partner.organizations o on o.id=d.organization_id
  where d.stage='won' and c.kind='cash' and s.start_date<=p_day
  and not exists(select 1 from partner_deals.task_links l where l.deal_id=d.id and l.season_id=c.season_id and l.kind='invoice')
  order by s.start_date,d.id,c.id
 loop
  begin
   -- Recheck after taking the deal lock; task links are unique even under retry.
   perform 1 from partner_deals.deals d where d.id=rec.deal_id and d.stage='won' for update;
   if not found then continue; end if;
   if exists(select 1 from partner_deals.task_links l where l.deal_id=rec.deal_id and l.season_id=rec.season_id and l.kind='invoice') then continue; end if;
   project_id:=gen_random_uuid(); milestone_id:=gen_random_uuid(); task_id:=gen_random_uuid();
   insert into project_management.projects(id,season,name,description,category,departments,deadline)
    values(project_id,current_season.code,left(rec.organization_name||' invoicing',200),'Sponsor agreement invoicing','operations',array[finance_dept],current_season.end_date);
   insert into project_management.tasks(id,season,title,description,category,project_id,deadline,status,priority,kind,partner_name)
    values(milestone_id,current_season.code,'Sponsor invoicing','Invoice the agreed contribution','operations',project_id,current_season.end_date,'todo','normal','milestone',rec.organization_name);
   insert into project_management.tasks(id,season,title,description,category,project_id,milestone_id,deadline,status,priority,kind,partner_name)
    values(task_id,current_season.code,left('Invoice '||rec.organization_name,200),
     left('Invoice for '||rec.season_name||': '||finance.format_ore(rec.amount_ore)||' NOK. Review the partner agreement.',2000),
     'operations',project_id,milestone_id,rec.invoice_date,'todo','normal','task',rec.organization_name);
   insert into partner_deals.task_links(deal_id,task_id,season_id,kind) values(rec.deal_id,task_id,rec.season_id,'invoice');
   created:=created+1;
  exception when others then
   failed:=failed+1;
   failure_details:=failure_details||jsonb_build_array(jsonb_build_object('contributionId',rec.contribution_id,'code',sqlstate));
  end;
 end loop;
 return jsonb_build_object('created',created,'failed',failed,'failures',failure_details);
end $$;
create function partner_deals.run_due_invoices() returns jsonb language sql set search_path=pg_catalog as $$
 select partner_deals.materialize_invoices_on((clock_timestamp() at time zone 'Europe/Oslo')::date)
$$;
revoke all on function finance.provision_future_season(uuid,text,text,date,date) from public;
revoke all on function project_management.provision_current_departments(uuid) from public;
revoke all on function partner_deals.materialize_invoices_on(date) from public;
revoke all on function partner_deals.run_due_invoices() from public;
revoke all on function partner_deals.confirm_won(uuid,text,text,uuid,integer) from public;
commit;
