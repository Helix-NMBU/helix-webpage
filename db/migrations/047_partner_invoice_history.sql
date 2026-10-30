-- Preserve invoice task history separately for every cash contribution.
begin;
alter table partner_deals.task_links add column contribution_id uuid references partner_deals.contributions(id) on delete restrict;
update partner_deals.task_links l set contribution_id=c.id from partner_deals.contributions c where l.kind='invoice' and c.deal_id=l.deal_id and c.season_id=l.season_id and c.kind='cash';
-- Refuse to migrate inconsistent historical data instead of guessing a link.
do $$ begin if exists(select 1 from partner_deals.task_links where kind='invoice' and contribution_id is null) then raise exception 'deal_invoice_history_unmapped'; end if; end $$;
drop index partner_deals.partner_deals_invoice_task_unique;
create unique index partner_deals_invoice_contribution_unique on partner_deals.task_links(contribution_id) where kind='invoice';
drop index partner_deals.partner_deals_one_cash_per_season;
create unique index partner_deals_one_cash_per_season on partner_deals.contributions(deal_id,season_id) where kind='cash' and retired_at is null;
create function partner_deals.bind_invoice_contribution() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if new.kind='invoice' then
  if new.contribution_id is null then select id into new.contribution_id from partner_deals.contributions where deal_id=new.deal_id and season_id=new.season_id and kind='cash' and retired_at is null; end if;
  if new.contribution_id is null or not exists(select 1 from partner_deals.contributions where id=new.contribution_id and deal_id=new.deal_id and season_id=new.season_id and kind='cash') then raise exception 'deal_invoice_contribution_invalid' using errcode='23514'; end if;
 elsif new.contribution_id is not null then raise exception 'deal_invoice_contribution_invalid' using errcode='23514'; end if;
 return new;
end $$;
create trigger partner_deals_bind_invoice_contribution before insert or update on partner_deals.task_links for each row execute function partner_deals.bind_invoice_contribution();
create or replace function partner_deals.resolve_agreement_change(p_member uuid,p_sub text,p_email text,p_change uuid,p_note text,p_manual boolean)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare change_row partner_deals.agreement_changes%rowtype; d partner_deals.deals%rowtype; target_deal uuid; prior jsonb; item jsonb; c partner_deals.contributions%rowtype; v partner_deals.deliverables%rowtype; f finance.funding%rowtype; task project_management.tasks%rowtype; new_amount bigint; new_date date; org text;
begin
 perform pg_advisory_xact_lock(72704,12);
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 select deal_id into target_deal from partner_deals.agreement_changes where id=p_change;
 if target_deal is null then raise exception 'deal_not_found' using errcode='P0002'; end if;
 select * into d from partner_deals.deals where id=target_deal for update;
 select * into change_row from partner_deals.agreement_changes where id=p_change and deal_id=d.id for update;
 if change_row.status='resolved' then return change_row.id; end if;
 if p_note is null or length(btrim(p_note)) not between 1 and 2000 then raise exception 'deal_change_invalid' using errcode='22023'; end if;
 if change_row.kind='amendment' and d.cancelled_at is not null then raise exception 'deal_change_cancelled' using errcode='40001'; end if;
 prior:=to_jsonb(d);
 if change_row.kind='amendment' then
  select name into org from partner.organizations where id=d.organization_id for share;
  for c in select * from partner_deals.contributions where deal_id=d.id and kind='cash' and retired_at is null order by season_id,id for update loop
   select value into item from jsonb_array_elements(change_row.proposed_terms->'cashChanges') where value->>'id'=c.id::text;
   if item is null then raise exception 'deal_change_conflict' using errcode='40001'; end if;
   new_amount:=(item->>'amountOre')::bigint; new_date:=(item->>'invoiceDate')::date;
   perform pg_advisory_xact_lock(75982,hashtext(c.season_id::text));
   select f0.* into f from partner_deals.funding_links fl join finance.funding f0 on f0.id=fl.funding_id where fl.contribution_id=c.id for update of f0;
   if not found or f.season_id<>c.season_id or f.funding_type<>'sponsor_cash' or lower(btrim(f.source_name))<>lower(btrim(org)) then raise exception 'deal_change_finance_review' using errcode='40001'; end if;
   select t.* into task from partner_deals.task_links l join project_management.tasks t on t.id=l.task_id where l.contribution_id=c.id and l.kind='invoice' for update of t;
   if coalesce((item->>'retire')::boolean,false) then
    if (f.status='received' or f.received_date is not null) or (found and task.status='done') then
     if p_manual is not true then raise exception 'deal_change_manual_required' using errcode='40001'; end if;
     insert into partner_deals.manual_reconciliation_items(change_id,kind,item_id) values(change_row.id,'cash',c.id) on conflict do nothing;
    else
     if f.status not in ('deleted','rejected') then raise exception 'deal_change_retire_finance' using errcode='40001'; end if;
     if found and task.status<>'cancelled' then raise exception 'deal_change_retire_invoice' using errcode='40001'; end if;
    end if;
    update partner_deals.contributions set retired_at=now() where id=c.id;
    continue;
   end if;
   if f.status not in ('secured','received') then raise exception 'deal_change_finance_review' using errcode='40001'; end if;
   if (c.amount_ore,c.invoice_date) is distinct from (new_amount,new_date) and ((f.status='received' or f.received_date is not null) or (found and task.status='done')) then
    if p_manual is not true then raise exception 'deal_change_manual_required' using errcode='40001'; end if;
    insert into partner_deals.manual_reconciliation_items(change_id,kind,item_id) values(change_row.id,'cash',c.id) on conflict do nothing;
    continue;
   end if;
   if f.amount_ore<>new_amount then raise exception 'deal_change_finance_review' using errcode='40001'; end if;
   if found and c.invoice_date is distinct from new_date and task.deadline is distinct from new_date then raise exception 'deal_change_invoice_review' using errcode='40001'; end if;
   update partner_deals.contributions set amount_ore=new_amount,invoice_date=new_date where id=c.id;
  end loop;
  for c in select * from partner_deals.contributions where deal_id=d.id and kind in ('product','service') and retired_at is null order by id for update loop
   select value into item from jsonb_array_elements(change_row.proposed_terms->'inKindChanges') where value->>'id'=c.id::text;
   if item is null then raise exception 'deal_change_conflict' using errcode='40001'; end if;
   if coalesce((item->>'retire')::boolean,false) then update partner_deals.contributions set retired_at=now() where id=c.id;
   else update partner_deals.contributions set description=coalesce(item->>'description',''),amount_ore=nullif(item->>'amountOre','')::bigint where id=c.id; end if;
  end loop;
  for v in select * from partner_deals.deliverables where deal_id=d.id and retired_at is null order by id for update loop
   select value into item from jsonb_array_elements(change_row.proposed_terms->'deliverableChanges') where value->>'id'=v.id::text;
   if item is null then raise exception 'deal_change_conflict' using errcode='40001'; end if;
   select t.* into task from partner_deals.task_links l join project_management.tasks t on t.id=l.task_id where l.deliverable_id=v.id and l.kind='marketing' for update of t;
   if not found then raise exception 'deal_change_task_review' using errcode='40001'; end if;
   if coalesce((item->>'retire')::boolean,false) then
    if task.status='done' then
     if p_manual is not true then raise exception 'deal_change_manual_required' using errcode='40001'; end if;
     insert into partner_deals.manual_reconciliation_items(change_id,kind,item_id) values(change_row.id,'deliverable',v.id) on conflict do nothing;
    elsif task.status<>'cancelled' then raise exception 'deal_change_retire_task' using errcode='40001'; end if;
    update partner_deals.deliverables set retired_at=now() where id=v.id;
    continue;
   end if;
   if (v.title,v.description,v.due_date) is distinct from (btrim(item->>'title'),coalesce(item->>'description',''),nullif(item->>'dueDate','')::date) and task.status='done' then
    if p_manual is not true then raise exception 'deal_change_manual_required' using errcode='40001'; end if;
    insert into partner_deals.manual_reconciliation_items(change_id,kind,item_id) values(change_row.id,'deliverable',v.id) on conflict do nothing;
    continue;
   end if;
   if (v.title,v.description,v.due_date) is distinct from (btrim(item->>'title'),coalesce(item->>'description',''),nullif(item->>'dueDate','')::date) and (task.title,task.description,task.deadline) is distinct from (btrim(item->>'title'),coalesce(item->>'description',''),nullif(item->>'dueDate','')::date) then raise exception 'deal_change_task_review' using errcode='40001'; end if;
   update partner_deals.deliverables set title=btrim(item->>'title'),description=coalesce(item->>'description',''),due_date=nullif(item->>'dueDate','')::date where id=v.id;
  end loop;
  update partner_deals.deals set title=btrim(change_row.proposed_terms->>'title'),contact_name=coalesce(change_row.proposed_terms->>'contactName',''),contact_email=coalesce(change_row.proposed_terms->>'contactEmail',''),starts_on=nullif(change_row.proposed_terms->>'startsOn','')::date,ends_on=nullif(change_row.proposed_terms->>'endsOn','')::date,agreement_link=coalesce(change_row.proposed_terms->>'agreementLink',''),revision=revision+1,updated_by_member_id=p_member,updated_at=now() where id=d.id returning * into d;
 else
  if exists(select 1 from partner_deals.contributions cc where cc.deal_id=d.id and cc.kind='cash' and cc.retired_at is null and (not exists(select 1 from partner_deals.funding_links fl where fl.contribution_id=cc.id) or partner_deals.linked_funding_mismatch(cc.id))) then raise exception 'deal_funding_mismatch' using errcode='40001'; end if;
  update partner_deals.deals set revision=revision+1,updated_by_member_id=p_member,updated_at=now() where id=d.id returning * into d;
 end if;
 update partner_deals.agreement_changes set status='resolved',resolved_by=p_member,resolved_at=now(),resolution_note=btrim(p_note) where id=change_row.id;
 insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot) values(d.id,p_member,'agreement_change_reconciled',prior,jsonb_build_object('deal',to_jsonb(d),'changeId',change_row.id,'note',btrim(p_note),'manualConfirmed',coalesce(p_manual,false)));
 return change_row.id;
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
 if not exists(select 1 from partner_deals.contributions c join partner_deals.deals d on d.id=c.deal_id
   join finance.seasons s on s.id=c.season_id where d.stage='won' and d.cancelled_at is null and not exists(select 1 from partner_deals.agreement_changes ac where ac.deal_id=d.id and ac.status='pending') and c.kind='cash' and c.retired_at is null and not exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=c.id) and s.start_date<=p_day
   and not exists(select 1 from partner_deals.task_links l where l.contribution_id=c.id and l.kind='invoice')) then
   return jsonb_build_object('created',0,'failed',0,'failures','[]'::jsonb);
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
  and not exists(select 1 from partner_deals.task_links l where l.contribution_id=c.id and l.kind='invoice')
  order by s.start_date,d.id,c.id
 loop
  begin
   -- Recheck after taking the deal lock; task links are unique even under retry.
   perform 1 from partner_deals.deals d where d.id=rec.deal_id and d.stage='won' and d.cancelled_at is null and not exists(select 1 from partner_deals.agreement_changes ac where ac.deal_id=d.id and ac.status='pending') for update;
   if not found then continue; end if;
   if exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=rec.contribution_id) or exists(select 1 from partner_deals.contributions cc where cc.id=rec.contribution_id and cc.retired_at is not null) then continue; end if;
   if exists(select 1 from partner_deals.task_links l where l.contribution_id=rec.contribution_id and l.kind='invoice') then continue; end if;
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
revoke all on all functions in schema partner_deals from public;
commit;
