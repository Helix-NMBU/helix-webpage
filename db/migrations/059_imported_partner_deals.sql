-- Preserve source season and cash values before invoice dates are known.
begin;
alter table partner_deals.deals add column if not exists primary_season_id uuid references finance.seasons(id);
alter table partner_deals.contributions drop constraint contributions_check;
alter table partner_deals.contributions add constraint contributions_check
 check ((kind='cash' and amount_ore is not null) or (kind<>'cash' and invoice_date is null));
-- External identifiers make imports traceable and safe to retry.
create table partner_deals.import_sources (
  provider text not null,
  external_id text not null,
  deal_id uuid not null unique references partner_deals.deals(id) on delete restrict,
  source_data jsonb not null,
  imported_at timestamptz not null default now(),
  imported_by uuid not null references identity.members(id),
  primary key(provider,external_id)
);
alter table partner_deals.import_sources enable row level security;
revoke all on partner_deals.import_sources from public;

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
 if exists(select 1 from partner_deals.contributions where deal_id=d.id and kind='cash' and retired_at is null and invoice_date is null) then raise exception 'deal_invoice_date_required' using errcode='22023'; end if;
 select s.* into current_season from finance.seasons s join finance.settings st on st.setting_key='current_season' and s.code=st.setting_value #>> '{}' for share of st,s;
 if current_season.id is null or current_season.status='closed' then raise exception 'deal_no_current_season' using errcode='22023'; end if;
 select name into org_name from partner.organizations where id=d.organization_id;
 select name into marketing_dept from project_management.departments where season=current_season.code and name='Business & Marketing';
 select name into finance_dept from project_management.departments where season=current_season.code and name='Finance';
 if exists(select 1 from partner_deals.deliverables where deal_id=d.id) and marketing_dept is null then raise exception 'deal_marketing_department_missing' using errcode='22023'; end if;
 if exists(select 1 from partner_deals.deliverables where deal_id=d.id and owner_member_id is null) then
  -- An unassigned task must have a verified department lead who can manage it.
  perform dm.member_id from project_management.department_members dm
   join project_management.departments dep on dep.id=dm.department_id
   join identity.members m on m.id=dm.member_id join neon_auth."user" u on u.id=m.auth_user_id
   join neon_auth.account a on a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub
   where dep.season=current_season.code and dep.name=marketing_dept and dm.access_level='lead'
    and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
   for share of dm,m,u,a;
  if not found then raise exception 'deal_marketing_lead_missing' using errcode='22023'; end if;
 end if;
 select * into contribution from partner_deals.contributions where deal_id=d.id and season_id=current_season.id and kind='cash';
 if contribution.id is not null and finance_dept is null then raise exception 'deal_finance_department_missing' using errcode='22023'; end if;
 if contribution.id is not null then
  perform dm.member_id from project_management.department_members dm
   join project_management.departments dep on dep.id=dm.department_id
   join identity.members m on m.id=dm.member_id join neon_auth."user" u on u.id=m.auth_user_id
   join neon_auth.account a on a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub
   where dep.season=current_season.code and dep.name=finance_dept and dm.access_level='lead'
    and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
   for share of dm,m,u,a;
  if not found then raise exception 'deal_finance_lead_missing' using errcode='22023'; end if;
 end if;
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


create or replace function partner_deals.save_deal(p_member uuid,p_sub text,p_email text,p_command jsonb) returns uuid language plpgsql set search_path=pg_catalog as $$
declare target uuid; previous text; requested text; previous_probability integer; previous_follow_up date; requested_probability integer; requested_follow_up date; requested_season uuid; previous_season uuid;
begin
 if p_command ? 'seasonId' then
   requested_season := nullif(p_command->>'seasonId','')::uuid;
   if requested_season is not null and not exists(select 1 from finance.seasons where id=requested_season) then raise exception 'deal_invalid' using errcode='22023'; end if;
 end if;
 if p_command ? 'sponsorLevel' then
   requested := p_command->>'sponsorLevel';
   if requested is not null and requested not in ('partner','service','bronze','silver','gold','platinum','main') then raise exception 'deal_invalid' using errcode='22023'; end if;
 end if;
 if p_command ? 'probability' then
   if p_command->>'probability' is not null then
     if (p_command->>'probability') !~ '^([0-9]|[1-9][0-9]|100)$' then raise exception 'deal_invalid' using errcode='22023'; end if;
     requested_probability := (p_command->>'probability')::integer;
   end if;
 end if;
 if p_command ? 'followUpOn' then requested_follow_up := nullif(p_command->>'followUpOn','')::date; end if;
 if p_command->>'id' is not null then select sponsor_level,probability,follow_up_on,primary_season_id into previous,previous_probability,previous_follow_up,previous_season from partner_deals.deals where id=(p_command->>'id')::uuid; end if;
 target:=partner_deals.save_deal_before_sponsor_level(p_member,p_sub,p_email,p_command);
 if p_command ? 'sponsorLevel' and previous is distinct from requested then
   update partner_deals.deals set sponsor_level=requested where id=target;
   insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot) values(target,p_member,'sponsor_level_changed',jsonb_build_object('sponsorLevel',previous),jsonb_build_object('sponsorLevel',requested));
 end if;
 if (p_command ? 'probability' and previous_probability is distinct from requested_probability) or (p_command ? 'followUpOn' and previous_follow_up is distinct from requested_follow_up) then
   update partner_deals.deals set probability=case when p_command ? 'probability' then requested_probability else probability end, follow_up_on=case when p_command ? 'followUpOn' then requested_follow_up else follow_up_on end where id=target;
   insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot) values(target,p_member,'pipeline_details_changed',jsonb_build_object('probability',previous_probability,'followUpOn',previous_follow_up),jsonb_build_object('probability',case when p_command ? 'probability' then requested_probability else previous_probability end,'followUpOn',case when p_command ? 'followUpOn' then requested_follow_up else previous_follow_up end));
 end if;
 if p_command ? 'seasonId' and previous_season is distinct from requested_season then
   update partner_deals.deals set primary_season_id=requested_season where id=target;
   insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot) values(target,p_member,'season_changed',jsonb_build_object('seasonId',previous_season),jsonb_build_object('seasonId',requested_season));
 end if;
 return target;
end $$;

commit;
