-- A historical cash agreement needs a Finance review, not an assumed invoice.
begin;
alter table partner_deals.task_links drop constraint task_links_kind_check;
alter table partner_deals.task_links drop constraint task_links_check;
alter table partner_deals.task_links add constraint task_links_kind_check check (kind in ('marketing','invoice','finance_review','follow_up'));
alter table partner_deals.task_links add constraint task_links_check check (
 (kind='marketing' and deliverable_id is not null and season_id is null) or
 (kind='follow_up' and deliverable_id is null and season_id is null and contribution_id is null) or
 (kind in ('invoice','finance_review') and deliverable_id is null and season_id is not null)
);
create unique index partner_deals_finance_review_task_unique on partner_deals.task_links(contribution_id) where kind='finance_review';
create or replace function partner_deals.bind_invoice_contribution() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if new.kind in ('invoice','finance_review') then
  if new.contribution_id is null then select id into new.contribution_id from partner_deals.contributions where deal_id=new.deal_id and season_id=new.season_id and kind='cash' and retired_at is null; end if;
  if new.contribution_id is null or not exists(select 1 from partner_deals.contributions where id=new.contribution_id and deal_id=new.deal_id and season_id=new.season_id and kind='cash') then raise exception 'deal_invoice_contribution_invalid' using errcode='23514'; end if;
 elsif new.contribution_id is not null then raise exception 'deal_invoice_contribution_invalid' using errcode='23514'; end if;
 return new;
end $$;

create or replace function partner_deals.materialize_invoices_on(p_day date) returns jsonb
language plpgsql set search_path=pg_catalog as $$
declare current_season finance.seasons%rowtype; rec record; task_id uuid; project_id uuid; milestone_id uuid;
 created integer:=0; failed integer:=0; failure_details jsonb:='[]'::jsonb; finance_dept text;
begin
 if p_day is null then raise exception 'deal_invoice_invalid_date'; end if;
 perform pg_advisory_xact_lock(72704,12);
 select s.* into current_season from finance.settings st join finance.seasons s on s.code=st.setting_value #>> '{}'
 where st.setting_key='current_season' and s.status<>'closed' and p_day between s.start_date and s.end_date for share of st,s;
 if current_season.id is null then raise exception 'deal_invoice_current_season_unavailable'; end if;
 select count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('contributionId',c.id,'code','agreement_change_pending') order by c.id),'[]'::jsonb)
 into failed,failure_details from partner_deals.contributions c join partner_deals.deals d on d.id=c.deal_id join finance.seasons season on season.id=c.season_id
 where d.stage='won' and d.cancelled_at is null and c.kind='cash' and c.retired_at is null and season.start_date<=p_day
 and not exists(select 1 from partner_deals.task_links l where l.contribution_id=c.id and l.kind in ('invoice','finance_review'))
 and exists(select 1 from partner_deals.agreement_changes ac where ac.deal_id=d.id and ac.status='pending')
 and not exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=c.id);
 if not exists(select 1 from partner_deals.contributions c join partner_deals.deals d on d.id=c.deal_id
   join finance.seasons s on s.id=c.season_id where d.stage='won' and d.cancelled_at is null and not exists(select 1 from partner_deals.agreement_changes ac where ac.deal_id=d.id and ac.status='pending') and c.kind='cash' and c.retired_at is null and not exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=c.id) and s.start_date<=p_day
   and not exists(select 1 from partner_deals.task_links l where l.contribution_id=c.id and l.kind in ('invoice','finance_review'))) then
   return jsonb_build_object('created',0,'failed',failed,'failures',failure_details);
 end if;
 select name into finance_dept from project_management.departments where season=current_season.code and name='Finance';
 if finance_dept is null then raise exception 'deal_invoice_finance_department_missing'; end if;
 perform dm.member_id from project_management.department_members dm
  join project_management.departments dep on dep.id=dm.department_id
  join identity.members m on m.id=dm.member_id join neon_auth."user" u on u.id=m.auth_user_id
  join neon_auth.account a on a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub
  where dep.season=current_season.code and dep.name=finance_dept and dm.access_level='lead'
   and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
  for share of dm,m,u,a;
 if not found then raise exception 'deal_invoice_finance_lead_missing'; end if;
 for rec in
  select c.id as contribution_id,c.season_id,c.amount_ore,c.invoice_date,s.name as season_name,
   d.id as deal_id,o.name as organization_name
  from partner_deals.contributions c join partner_deals.deals d on d.id=c.deal_id
  join finance.seasons s on s.id=c.season_id join partner.organizations o on o.id=d.organization_id
  where d.stage='won' and d.cancelled_at is null and not exists(select 1 from partner_deals.agreement_changes ac where ac.deal_id=d.id and ac.status='pending') and c.kind='cash' and c.retired_at is null and not exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=c.id) and s.start_date<=p_day
  and not exists(select 1 from partner_deals.task_links l where l.contribution_id=c.id and l.kind in ('invoice','finance_review'))
  order by s.start_date,d.id,c.id
 loop
  begin
   -- Recheck after taking the deal lock; task links are unique even under retry.
   perform 1 from partner_deals.deals d where d.id=rec.deal_id and d.stage='won' and d.cancelled_at is null and not exists(select 1 from partner_deals.agreement_changes ac where ac.deal_id=d.id and ac.status='pending') for update;
   if not found then continue; end if;
   if exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=rec.contribution_id) or exists(select 1 from partner_deals.contributions cc where cc.id=rec.contribution_id and cc.retired_at is not null) then continue; end if;
   if exists(select 1 from partner_deals.task_links l where l.contribution_id=rec.contribution_id and l.kind in ('invoice','finance_review')) then continue; end if;
   if not exists(select 1 from partner_deals.funding_links where contribution_id=rec.contribution_id) or partner_deals.linked_funding_mismatch(rec.contribution_id) then raise exception 'deal_funding_mismatch'; end if;
   project_id:=gen_random_uuid(); milestone_id:=gen_random_uuid(); task_id:=gen_random_uuid();
   insert into project_management.projects(id,season,name,description,category,departments,deadline)
    values(project_id,current_season.code,left(rec.organization_name||' invoicing',200),'Sponsor agreement invoicing','operations',array[finance_dept],current_season.end_date);
   insert into project_management.tasks(id,season,title,description,category,project_id,deadline,status,priority,kind,partner_name)
    values(milestone_id,current_season.code,'Sponsor invoicing','Invoice the agreed contribution','operations',project_id,current_season.end_date,'todo','normal','milestone',rec.organization_name);
   insert into project_management.tasks(id,season,title,description,category,project_id,milestone_id,deadline,status,priority,kind,partner_name)
    values(task_id,current_season.code,left('Invoice '||rec.organization_name,200),
     left('Invoice for '||rec.season_name||': '||finance.format_ore(rec.amount_ore)||' NOK. Review the partner agreement.',2000),
     'operations',project_id,milestone_id,rec.invoice_date,'todo','normal','task',rec.organization_name);
   insert into partner_deals.task_links(deal_id,task_id,season_id,contribution_id,kind) values(rec.deal_id,task_id,rec.season_id,rec.contribution_id,'invoice');
   created:=created+1;
  exception when others then
   failed:=failed+1;
   failure_details:=failure_details||jsonb_build_array(jsonb_build_object('contributionId',rec.contribution_id,'code',sqlstate));
  end;
 end loop;
 return jsonb_build_object('created',created,'failed',failed,'failures',failure_details);
end $$;

commit;
