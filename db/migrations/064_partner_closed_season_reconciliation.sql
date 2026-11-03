-- Review closed-season history without changing protected financial or task records.
begin;
alter table partner_deals.finance_reviews add column closed_change_id uuid references partner_deals.agreement_changes(id);
alter table partner_deals.finance_reviews add column closed_review_snapshot jsonb;
alter table partner_deals.manual_reconciliation_items add column task_snapshot jsonb;
create function partner_deals.closed_change_for_cash(p_contribution uuid) returns uuid language sql stable set search_path=pg_catalog as $$
 select ac.id from partner_deals.contributions c join finance.seasons s on s.id=c.season_id
 join partner_deals.agreement_changes ac on ac.deal_id=c.deal_id
 where c.id=p_contribution and c.kind='cash' and c.retired_at is null and c.pending_change_id is null and s.status='closed'
 and ac.status='pending' and ac.withdrawn_at is null and ac.kind in ('cancellation','reopening')
 order by ac.created_at desc,ac.id desc limit 1
$$;
create function partner_deals.closed_funding_snapshot(p_contribution uuid) returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('changeId',partner_deals.closed_change_for_cash(c.id),'contribution',to_jsonb(c),'funding',to_jsonb(f))
 from partner_deals.contributions c join partner_deals.funding_links l on l.contribution_id=c.id
 join finance.funding f on f.id=l.funding_id where c.id=p_contribution
$$;
alter function partner_deals.request_finance_review(uuid,text,text,uuid,integer) rename to request_finance_review_before_closed_reconciliation;
create function partner_deals.request_finance_review(p_member uuid,p_sub text,p_email text,p_deal uuid,p_revision integer)
returns integer language plpgsql set search_path=pg_catalog as $$
declare d partner_deals.deals%rowtype; c partner_deals.contributions%rowtype; change_id uuid; n integer:=0; previous_count integer:=0; org text;
begin
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 select * into d from partner_deals.deals where id=p_deal for update;
 if not found then raise exception 'deal_not_found' using errcode='P0002'; end if;
 if d.revision is distinct from p_revision then raise exception 'deal_conflict' using errcode='40001'; end if;
 for c in select * from partner_deals.contributions where deal_id=d.id order by season_id,id for update loop
  select name into org from partner.organizations where id=coalesce(c.organization_id,d.organization_id) for share;
  change_id:=partner_deals.closed_change_for_cash(c.id);
  if change_id is null then continue; end if;
  insert into partner_deals.finance_reviews(contribution_id,organization_name,season_id,amount_ore,status,requested_by,closed_change_id)
   values(c.id,org,c.season_id,c.amount_ore,'pending',p_member,change_id)
   on conflict(contribution_id) do update set organization_name=excluded.organization_name,season_id=excluded.season_id,amount_ore=excluded.amount_ore,
    status='pending',requested_by=excluded.requested_by,requested_at=now(),resolved_by=null,resolved_at=null,closed_change_id=change_id,closed_review_snapshot=null
   where partner_deals.finance_reviews.closed_change_id is distinct from change_id
    or partner_deals.finance_reviews.closed_review_snapshot is distinct from partner_deals.closed_funding_snapshot(c.id);
  n:=n+1;
 end loop;
 -- Existing open-season discrepancy requests retain their existing authorization and behavior.
 begin
  previous_count:=partner_deals.request_finance_review_before_closed_reconciliation(p_member,p_sub,p_email,p_deal,p_revision);
 exception when sqlstate '22023' then
  if sqlerrm not in ('deal_review_no_matches','deal_review_invalid') or n=0 then raise; end if;
 end;
 -- A contribution can later need ordinary mismatch/manual review. Historical
 -- classification belongs to one pending closed change, not to its lifetime.
 if previous_count>0 then
  update partner_deals.finance_reviews r set closed_change_id=null,closed_review_snapshot=null
  from partner_deals.contributions contribution0 where contribution0.id=r.contribution_id and contribution0.deal_id=d.id
   and r.status='pending' and r.closed_change_id is not null
   and partner_deals.closed_change_for_cash(contribution0.id) is null;
 end if;
 if n>0 then insert into partner_deals.audit(deal_id,actor_member_id,action,after_snapshot) values(d.id,p_member,'closed_season_finance_review_requested',jsonb_build_object('count',n)); end if;
 return n+previous_count;
end $$;
alter function partner_deals.finance_review_queue(uuid,text,text) rename to finance_review_queue_before_closed_reconciliation;
create function partner_deals.finance_review_queue(p_member uuid,p_sub text,p_email text) returns jsonb language plpgsql stable set search_path=pg_catalog as $$
declare result jsonb; historical jsonb;
begin
 if not partner_deals.finance_reviewer(p_member,p_sub,p_email) then raise exception 'deal_funding_forbidden' using errcode='42501'; end if;
 result:=partner_deals.finance_review_queue_before_closed_reconciliation(p_member,p_sub,p_email);
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'partner',o.name,'season',s.code,'amountOre',c.amount_ore::text,
  'manualFunding',true,'candidates','[]'::jsonb,'linkedFunding',(select jsonb_build_object('id',f.id,'revision',f.revision,'reference',f.public_ref,'status',f.status,'amountOre',f.amount_ore::text,
   'matchesAgreement',f.season_id=c.season_id and f.funding_type='sponsor_cash' and lower(btrim(f.source_name))=lower(btrim(o.name)),'canUnlink',false)
   from partner_deals.funding_links l join finance.funding f on f.id=l.funding_id where l.contribution_id=c.id)) order by r.requested_at,r.id),'[]'::jsonb)
 into historical from partner_deals.finance_reviews r join partner_deals.contributions c on c.id=r.contribution_id
 join partner_deals.deals d on d.id=c.deal_id join partner.organizations o on o.id=coalesce(c.organization_id,d.organization_id) join finance.seasons s on s.id=c.season_id
 where r.status='pending' and r.closed_change_id=partner_deals.closed_change_for_cash(c.id);
 return historical||coalesce((select jsonb_agg(x) from jsonb_array_elements(result) x where not exists(select 1 from jsonb_array_elements(historical) h where h->>'id'=x->>'id')),'[]'::jsonb);
end $$;
alter function partner_deals.resolve_finance_review(uuid,text,text,uuid,text,uuid,integer,jsonb) rename to resolve_finance_review_before_closed_reconciliation;
create function partner_deals.resolve_finance_review(p_member uuid,p_sub text,p_email text,p_review uuid,p_action text,p_funding uuid,p_revision integer,p_snapshot jsonb)
returns void language plpgsql set search_path=pg_catalog as $$
declare r partner_deals.finance_reviews%rowtype; c partner_deals.contributions%rowtype; f finance.funding%rowtype; d partner_deals.deals%rowtype; snapshot jsonb; org text;
begin
 perform partner_deals.lock_actor(p_member);
 perform 1 from finance.member_grants where member_id=p_member for share;
 if not partner_deals.finance_reviewer(p_member,p_sub,p_email) then raise exception 'deal_funding_forbidden' using errcode='42501'; end if;
 -- Company-transfer reviews use a distinct table and the preceding resolver.
 if exists(select 1 from partner_deals.company_finance_reviews where id=p_review) then
  perform partner_deals.resolve_finance_review_before_closed_reconciliation(p_member,p_sub,p_email,p_review,p_action,p_funding,p_revision,p_snapshot);return;
 end if;
 select c0.* into c from partner_deals.finance_reviews r0 join partner_deals.contributions c0 on c0.id=r0.contribution_id where r0.id=p_review;
 if c.id is null then raise exception 'deal_review_invalid' using errcode='22023'; end if;
 select * into d from partner_deals.deals where id=c.deal_id for update;
 select * into c from partner_deals.contributions where id=c.id for update;
 select * into r from partner_deals.finance_reviews where id=p_review for update;
 if r.closed_change_id is null then
  perform partner_deals.resolve_finance_review_before_closed_reconciliation(p_member,p_sub,p_email,p_review,p_action,p_funding,p_revision,p_snapshot);return;
 end if;
 if r.closed_change_id is distinct from partner_deals.closed_change_for_cash(c.id) or p_action<>'verified' then raise exception 'deal_review_changed' using errcode='40001'; end if;
 perform pg_advisory_xact_lock(75982,hashtext(c.season_id::text));
 perform 1 from finance.seasons where id=c.season_id and status='closed' for share;
 if not found then raise exception 'deal_review_changed' using errcode='40001'; end if;
 select name into org from partner.organizations where id=coalesce(c.organization_id,d.organization_id) for share;
 select f0.* into f from partner_deals.funding_links l join finance.funding f0 on f0.id=l.funding_id where l.contribution_id=c.id for update of f0;
 if not found or f.id is distinct from p_funding or f.revision is distinct from p_revision or f.season_id<>c.season_id or f.funding_type<>'sponsor_cash' or lower(btrim(f.source_name))<>lower(btrim(org)) then raise exception 'deal_review_changed' using errcode='40001'; end if;
 snapshot:=partner_deals.closed_funding_snapshot(c.id);
 if r.status='linked' and r.closed_review_snapshot=snapshot then return; end if;
 if r.status<>'pending' then raise exception 'deal_review_changed' using errcode='40001'; end if;
 update partner_deals.finance_reviews set status='linked',resolved_by=p_member,resolved_at=now(),closed_review_snapshot=snapshot where id=r.id;
 insert into partner_deals.audit(deal_id,actor_member_id,action,after_snapshot) values(d.id,p_member,'closed_season_funding_reviewed',jsonb_build_object('changeId',r.closed_change_id,'snapshot',snapshot));
end $$;
alter function partner_deals.resolve_agreement_change(uuid,text,text,uuid,text,boolean) rename to resolve_agreement_change_before_closed_reconciliation;
create function partner_deals.resolve_agreement_change(p_member uuid,p_sub text,p_email text,p_change uuid,p_note text,p_manual boolean)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare ac partner_deals.agreement_changes%rowtype; d partner_deals.deals%rowtype; c partner_deals.contributions%rowtype; v partner_deals.deliverables%rowtype; f finance.funding%rowtype; task project_management.tasks%rowtype; closed boolean; has_closed boolean; org text; prior jsonb; task_snap jsonb;
begin
 perform pg_advisory_xact_lock(72704,12);
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 select * into ac from partner_deals.agreement_changes where id=p_change;
 if not found then raise exception 'deal_not_found' using errcode='P0002'; end if;
 select * into d from partner_deals.deals where id=ac.deal_id for update;
 select * into ac from partner_deals.agreement_changes where id=p_change for update;
 if ac.withdrawn_at is not null then raise exception 'deal_change_conflict' using errcode='40001'; end if;
 if ac.status='resolved' then return ac.id; end if;
 select exists(select 1 from partner_deals.contributions c0 join finance.seasons s on s.id=c0.season_id where c0.deal_id=d.id and c0.kind='cash' and c0.retired_at is null and c0.pending_change_id is null and s.status='closed')
 or exists(select 1 from partner_deals.task_links l join project_management.tasks t on t.id=l.task_id join finance.seasons s on s.code=t.season where l.deal_id=d.id and s.status='closed') into has_closed;
 if ac.kind='amendment' or not has_closed then return partner_deals.resolve_agreement_change_before_closed_reconciliation(p_member,p_sub,p_email,p_change,p_note,p_manual); end if;
 if p_note is null or length(btrim(p_note)) not between 1 and 2000 then raise exception 'deal_change_invalid' using errcode='22023'; end if;
 if not coalesce(p_manual,false) then raise exception 'deal_change_manual_required' using errcode='40001'; end if;
 prior:=to_jsonb(d);
 for c in select * from partner_deals.contributions where deal_id=d.id and kind='cash' and retired_at is null and pending_change_id is null order by season_id,id for update loop
  select name into org from partner.organizations where id=coalesce(c.organization_id,d.organization_id) for share;
  perform pg_advisory_xact_lock(75982,hashtext(c.season_id::text));
  select status='closed' into closed from finance.seasons where id=c.season_id for share;
  select f0.* into f from partner_deals.funding_links l join finance.funding f0 on f0.id=l.funding_id where l.contribution_id=c.id for update of f0;
  if not found or f.season_id<>c.season_id or f.funding_type<>'sponsor_cash' or lower(btrim(f.source_name))<>lower(btrim(org)) then raise exception 'deal_change_finance_review' using errcode='40001'; end if;
  if closed then
   if not exists(select 1 from partner_deals.finance_reviews r where r.contribution_id=c.id and r.closed_change_id=ac.id and r.status='linked' and r.closed_review_snapshot=partner_deals.closed_funding_snapshot(c.id)) then raise exception 'deal_change_closed_finance_pending' using errcode='40001'; end if;
  else
   if partner_deals.manual_funding_needs_review(c.id) and not partner_deals.manual_finance_review_ready(c.id) then raise exception 'deal_change_manual_finance_pending' using errcode='40001'; end if;
   if ac.kind='cancellation' and f.status not in ('deleted','rejected','received') and f.received_date is null then raise exception 'deal_change_cancel_finance' using errcode='40001'; end if;
   if ac.kind='reopening' and (f.status not in ('secured','received') or (partner_deals.linked_funding_mismatch(c.id) and not exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=c.id))) then raise exception 'deal_change_reopen_finance' using errcode='40001'; end if;
  end if;
  select t.* into task from partner_deals.task_links l join project_management.tasks t on t.id=l.task_id where l.contribution_id=c.id and l.kind='invoice' for update of t;
  task_snap:=case when found then to_jsonb(task) else null end;
  if task.id is not null and not exists(select 1 from finance.seasons s where s.code=task.season and s.status='closed') then
   if ac.kind='cancellation' and task.status not in ('done','cancelled') then raise exception 'deal_change_cancel_invoice' using errcode='40001'; end if;
   if ac.kind='reopening' and task.status='cancelled' then raise exception 'deal_change_reopen_invoice' using errcode='40001'; end if;
  end if;
  if closed or f.status='received' or f.received_date is not null or task.status='done' or (task.id is not null and exists(select 1 from finance.seasons s where s.code=task.season and s.status='closed')) then
   insert into partner_deals.manual_reconciliation_items(change_id,kind,item_id,funding_snapshot,task_snapshot) values(ac.id,'cash',c.id,partner_deals.manual_funding_snapshot(c.id),task_snap) on conflict do nothing;
  end if;
 end loop;
 for v in select * from partner_deals.deliverables where deal_id=d.id and retired_at is null and pending_change_id is null order by id for update loop
  select t.* into task from partner_deals.task_links l join project_management.tasks t on t.id=l.task_id where l.deliverable_id=v.id and l.kind='marketing' for update of t;
  if not found then raise exception 'deal_change_task_review' using errcode='40001'; end if;
  select status='closed' into closed from finance.seasons where code=task.season for share;
  if not coalesce(closed,false) then
   if ac.kind='cancellation' and task.status not in ('done','cancelled') then raise exception 'deal_change_cancel_task' using errcode='40001'; end if;
   if ac.kind='reopening' and task.status='cancelled' then raise exception 'deal_change_reopen_task' using errcode='40001'; end if;
  end if;
  if closed or task.status='done' then insert into partner_deals.manual_reconciliation_items(change_id,kind,item_id,task_snapshot) values(ac.id,'deliverable',v.id,to_jsonb(task)) on conflict do nothing; end if;
 end loop;
 update partner_deals.deals set revision=revision+1,updated_by_member_id=p_member,updated_at=now() where id=d.id returning * into d;
 update partner_deals.agreement_changes set status='resolved',resolved_by=p_member,resolved_at=now(),resolution_note=btrim(p_note) where id=ac.id;
 insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot) values(d.id,p_member,'agreement_change_reconciled',prior,jsonb_build_object('deal',to_jsonb(d),'changeId',ac.id,'note',btrim(p_note),'manualConfirmed',true,'closedSeasonHistoryPreserved',true));
 return ac.id;
end $$;
-- Historical review events use their per-change snapshot rather than discrepancy rules.
alter function partner_deals.review_notifications(uuid,text,text) rename to review_notifications_before_closed_reconciliation;
create function partner_deals.review_notifications(p_member uuid,p_sub text,p_email text)
returns jsonb language sql stable set search_path=pg_catalog as $$
 with historical as (
  select n.id,n.event_time,jsonb_build_object('id',n.id,'createdAt',n.event_time,
   'title',case when n.kind='requested' then 'Sponsor funding review requested' else 'Sponsor funding review completed' end,
   'description',case when n.kind='requested' then 'Business requested review of protected closed-season funding.' else 'Finance reviewed the protected funding. Return to the agreement to continue.' end,
   'href',case when n.kind='requested' then '/finance/sponsor-reviews' else '/partner-deals?deal='||d.id::text end,'variant','info') as notification
  from partner_deals.review_notification_events n join partner_deals.finance_reviews r on r.id=n.review_id
  join partner_deals.contributions c on c.id=r.contribution_id join partner_deals.deals d on d.id=c.deal_id
  join partner.organizations o on o.id=coalesce(c.organization_id,d.organization_id)
  where r.closed_change_id=partner_deals.closed_change_for_cash(c.id)
   and (r.organization_name,r.season_id,r.amount_ore)=(o.name,c.season_id,c.amount_ore)
   and not exists(select 1 from partner_deals.review_notification_reads seen where seen.notification_id=n.id and seen.member_id=p_member)
   and ((n.kind='requested' and r.status='pending' and n.event_time=r.requested_at and partner_deals.finance_reviewer(p_member,p_sub,p_email))
    or (n.kind='resolved' and r.status='linked' and n.event_time=r.resolved_at
     and coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false)
     and r.closed_review_snapshot=partner_deals.closed_funding_snapshot(c.id)))
 ), ordinary as (
  select (x->>'id')::uuid as id,(x->>'createdAt')::timestamptz as event_time,x as notification
  from jsonb_array_elements(partner_deals.review_notifications_before_closed_reconciliation(p_member,p_sub,p_email)) x
  where not exists(select 1 from partner_deals.review_notification_events n join partner_deals.finance_reviews r on r.id=n.review_id where n.id=(x->>'id')::uuid and r.closed_change_id is not null)
 )
 select coalesce(jsonb_agg(notification order by event_time desc,id),'[]'::jsonb) from (select * from historical union all select * from ordinary) events
$$;
revoke all on function partner_deals.review_notifications_before_closed_reconciliation(uuid,text,text) from public;

-- Wrapper predecessors are implementation details, never browser-callable RPCs.
revoke all on function partner_deals.request_finance_review_before_closed_reconciliation(uuid,text,text,uuid,integer) from public;
revoke all on function partner_deals.finance_review_queue_before_closed_reconciliation(uuid,text,text) from public;
revoke all on function partner_deals.resolve_finance_review_before_closed_reconciliation(uuid,text,text,uuid,text,uuid,integer,jsonb) from public;
revoke all on function partner_deals.resolve_agreement_change_before_closed_reconciliation(uuid,text,text,uuid,text,boolean) from public;
revoke all on all functions in schema partner_deals from public;
commit;
