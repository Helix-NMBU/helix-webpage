begin;
alter table partner_deals.finance_reviews add column manual_reviewed_snapshot jsonb;
create function partner_deals.manual_funding_original_id(p_contribution uuid) returns uuid language sql stable set search_path=pg_catalog as $$
 select (snapshot->>'id')::uuid from (
  select mr.funding_snapshot as snapshot,ac.resolved_at as reviewed_at,ac.id as id from partner_deals.manual_reconciliation_items mr join partner_deals.agreement_changes ac on ac.id=mr.change_id where mr.kind='cash' and mr.item_id=p_contribution and ac.status='resolved' and mr.funding_snapshot is not null
  union all select r.funding_snapshot,r.reviewed_at,r.id from partner_deals.manual_funding_reviews r where r.contribution_id=p_contribution
 ) snapshots order by reviewed_at desc nulls last,id desc limit 1
$$;
-- Legacy manual reviews may predate funding snapshots. In that case only a
-- previously audited link for this deal and season can be selected by Finance.
create function partner_deals.manual_funding_is_original(p_contribution uuid,p_funding uuid) returns boolean language sql stable set search_path=pg_catalog as $$
 select case when partner_deals.manual_funding_original_id(p_contribution) is not null then partner_deals.manual_funding_original_id(p_contribution)=p_funding
 else exists(select 1 from partner_deals.contributions c join finance.funding f on f.id=p_funding and f.season_id=c.season_id join finance.audit_log a on a.entity='funding' and a.entity_id=f.id::text and a.field_name='partner_deal_link' and a.new_value=c.deal_id::text where c.id=p_contribution) end
$$;
create function partner_deals.manual_finance_review_ready(p_contribution uuid) returns boolean language sql stable set search_path=pg_catalog as $$
 select exists(select 1 from partner_deals.finance_reviews r where r.contribution_id=p_contribution and r.status='linked' and r.manual_reviewed_snapshot is not null and r.manual_reviewed_snapshot=partner_deals.manual_funding_snapshot(p_contribution))
$$;
create function partner_deals.manual_funding_record_valid(p_contribution uuid,p_funding uuid) returns boolean language sql stable set search_path=pg_catalog as $$
 select exists(select 1 from partner_deals.contributions c join partner_deals.deals d on d.id=c.deal_id join partner.organizations o on o.id=d.organization_id join finance.funding f on f.id=p_funding where c.id=p_contribution and f.season_id=c.season_id and f.funding_type='sponsor_cash' and f.status in ('secured','received') and lower(btrim(f.source_name))=lower(btrim(o.name)))
$$;
create or replace function partner_deals.request_finance_review(p_member uuid,p_sub text,p_email text,p_deal uuid,p_revision integer)
returns integer language plpgsql set search_path=pg_catalog as $$
declare d partner_deals.deals%rowtype; c partner_deals.contributions%rowtype; org text; count_requested integer:=0; changed integer:=0; affected integer:=0;
begin
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 select * into d from partner_deals.deals where id=p_deal for update;
 if not found then raise exception 'deal_not_found' using errcode='P0002'; end if;
 if d.revision is distinct from p_revision then raise exception 'deal_conflict' using errcode='40001'; end if;
 if d.stage='lost' or (d.stage='won' and d.cancelled_at is not null) then raise exception 'deal_review_invalid' using errcode='22023'; end if;
 select name into org from partner.organizations where id=d.organization_id for share;
 for c in select * from partner_deals.contributions where deal_id=d.id and kind='cash' and retired_at is null and (d.stage<>'won' or pending_change_id is null or exists(select 1 from partner_deals.agreement_changes ac where ac.id=pending_change_id and ac.deal_id=d.id and ac.status='pending')) order by season_id,id for update loop
  perform pg_advisory_xact_lock(75982,hashtext(c.season_id::text));
  if partner_deals.manual_funding_needs_review(c.id) or (not exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=c.id) and ((not exists(select 1 from partner_deals.funding_links where contribution_id=c.id) and jsonb_array_length(partner_deals.funding_candidate_snapshot(c.id))>0) or partner_deals.linked_funding_mismatch(c.id))) then
   insert into partner_deals.finance_reviews(contribution_id,organization_name,season_id,amount_ore,status,requested_by)
   values(c.id,org,c.season_id,c.amount_ore,'pending',p_member)
   on conflict(contribution_id) do update set organization_name=excluded.organization_name,season_id=excluded.season_id,amount_ore=excluded.amount_ore,status='pending',requested_by=excluded.requested_by,requested_at=now(),resolved_by=null,resolved_at=null,last_unlinked_funding_id=null,manual_reviewed_snapshot=null
    where (partner_deals.finance_reviews.organization_name,partner_deals.finance_reviews.season_id,partner_deals.finance_reviews.amount_ore) is distinct from (excluded.organization_name,excluded.season_id,excluded.amount_ore)
       or (partner_deals.finance_reviews.status='linked' and partner_deals.manual_funding_needs_review(excluded.contribution_id))
       or partner_deals.finance_reviews.status='unlinked'
       or (partner_deals.finance_reviews.status='linked' and partner_deals.linked_funding_mismatch(excluded.contribution_id))
       or (partner_deals.finance_reviews.status='separate' and (select a.candidate_snapshot from partner_deals.separate_funding_approvals a where a.contribution_id=excluded.contribution_id) is distinct from partner_deals.funding_candidate_snapshot(excluded.contribution_id));
   get diagnostics affected = row_count;
   changed:=changed+affected;
   count_requested:=count_requested+1;
  end if;
 end loop;
 if count_requested=0 then raise exception 'deal_review_no_matches' using errcode='22023'; end if;
 if changed>0 then insert into partner_deals.audit(deal_id,actor_member_id,action,after_snapshot) values(d.id,p_member,'finance_review_requested',jsonb_build_object('count',changed)); end if;
 return count_requested;
end $$;
create or replace function partner_deals.finance_review_queue(p_member uuid,p_sub text,p_email text) returns jsonb language plpgsql stable set search_path=pg_catalog as $$
declare result jsonb;
begin
 if not partner_deals.finance_reviewer(p_member,p_sub,p_email) then raise exception 'deal_funding_forbidden' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'partner',r.organization_name,'season',s.code,'amountOre',r.amount_ore::text,
   'manualFunding',exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=c.id),
   'candidates',case when exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=c.id) then coalesce((select jsonb_agg(x) from jsonb_array_elements(partner_deals.funding_candidate_snapshot(c.id)) x where partner_deals.manual_funding_is_original(c.id,(x->>'id')::uuid)),'[]'::jsonb) else partner_deals.funding_candidate_snapshot(c.id) end,
   'linkedFunding',(select jsonb_build_object('id',f.id,'revision',f.revision,'reference',f.public_ref,'status',f.status,'amountOre',f.amount_ore::text,'matchesAgreement',case when exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=c.id) then partner_deals.manual_funding_record_valid(c.id,f.id) else not partner_deals.linked_funding_mismatch(c.id) end,'canUnlink',(not exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=c.id) and (d.stage<>'won' or c.pending_change_id is not null or (f.status in ('deleted','rejected') and f.received_date is null)))) from partner_deals.funding_links l join finance.funding f on f.id=l.funding_id where l.contribution_id=c.id)) order by r.requested_at,r.id),'[]'::jsonb) into result
 from partner_deals.finance_reviews r join partner_deals.contributions c on c.id=r.contribution_id
 join partner_deals.deals d on d.id=c.deal_id join partner.organizations o on o.id=d.organization_id
 join finance.seasons s on s.id=c.season_id
 where r.status='pending' and (d.stage not in ('won','lost') or (d.stage='won' and d.cancelled_at is null and (c.pending_change_id is null or exists(select 1 from partner_deals.agreement_changes ac where ac.id=c.pending_change_id and ac.deal_id=d.id and ac.status='pending')))) and c.kind='cash' and c.retired_at is null
 and (r.organization_name,r.season_id,r.amount_ore)=(o.name,c.season_id,c.amount_ore);
 return result;
end $$;
create or replace function partner_deals.resolve_finance_review(p_member uuid,p_sub text,p_email text,p_review uuid,p_action text,p_funding uuid,p_revision integer,p_snapshot jsonb)
returns void language plpgsql set search_path=pg_catalog as $$
declare r partner_deals.finance_reviews%rowtype; c partner_deals.contributions%rowtype; d partner_deals.deals%rowtype; f finance.funding%rowtype; org text; state text; snapshot jsonb; target_deal_id uuid; target_contribution_id uuid;
begin
 perform partner_deals.lock_actor(p_member);
 perform 1 from finance.member_grants where member_id=p_member for share;
 if not partner_deals.finance_reviewer(p_member,p_sub,p_email) then raise exception 'deal_funding_forbidden' using errcode='42501'; end if;
 select c0.deal_id,c0.id into target_deal_id,target_contribution_id from partner_deals.finance_reviews r0 join partner_deals.contributions c0 on c0.id=r0.contribution_id where r0.id=p_review;
 if target_deal_id is null then raise exception 'deal_review_invalid' using errcode='22023'; end if;
 select * into d from partner_deals.deals where id=target_deal_id for update;
 select name into org from partner.organizations where id=d.organization_id for share;
 select * into c from partner_deals.contributions where id=target_contribution_id and deal_id=d.id for update;
 if not found then raise exception 'deal_review_changed' using errcode='40001'; end if;
 select * into r from partner_deals.finance_reviews where id=p_review and contribution_id=c.id for update;
 if not found or (d.stage='lost' or (d.stage='won' and not (d.cancelled_at is null and (c.pending_change_id is null or exists(select 1 from partner_deals.agreement_changes ac where ac.id=c.pending_change_id and ac.deal_id=d.id and ac.status='pending'))))) or c.retired_at is not null or c.kind<>'cash' or (r.organization_name,r.season_id,r.amount_ore) is distinct from (org,c.season_id,c.amount_ore) then raise exception 'deal_review_changed' using errcode='40001'; end if;
 if exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=c.id) then
  if d.stage<>'won' or c.pending_change_id is not null or p_action not in ('verified','link') then raise exception 'deal_review_changed' using errcode='40001'; end if;
  perform pg_advisory_xact_lock(75982,hashtext(c.season_id::text));
  select status into state from finance.seasons where id=c.season_id for update;
  if r.status='linked' and r.manual_reviewed_snapshot=partner_deals.manual_funding_snapshot(c.id) and exists(select 1 from partner_deals.funding_links l join finance.funding f0 on f0.id=l.funding_id where l.contribution_id=c.id and f0.id=p_funding and f0.revision=p_revision) then return; end if;
  if p_action='verified' then
   select f0.* into f from partner_deals.funding_links l join finance.funding f0 on f0.id=l.funding_id where l.contribution_id=c.id for update of f0;
   if not found or f.id is distinct from p_funding or f.revision is distinct from p_revision or not partner_deals.manual_funding_record_valid(c.id,f.id) then raise exception 'deal_review_changed' using errcode='40001'; end if;
  else
   if state='closed' or exists(select 1 from partner_deals.funding_links where contribution_id=c.id) then raise exception 'deal_review_changed' using errcode='40001'; end if;
   select * into f from finance.funding where id=p_funding for update;
   if not found or not partner_deals.manual_funding_is_original(c.id,f.id) or f.revision is distinct from p_revision or not partner_deals.manual_funding_record_valid(c.id,f.id) or exists(select 1 from partner_deals.funding_links where funding_id=f.id) then raise exception 'deal_review_changed' using errcode='40001'; end if;
   insert into partner_deals.funding_links(contribution_id,funding_id,linked_by_member_id) values(c.id,f.id,p_member);
   perform finance.audit_change(p_member,'funding',f.id::text,'partner_deal_link',null,d.id::text);
  end if;
  snapshot:=partner_deals.manual_funding_snapshot(c.id);
  if r.status='linked' and r.manual_reviewed_snapshot=snapshot then return; end if;
  if r.status<>'pending' then raise exception 'deal_review_changed' using errcode='40001'; end if;
  update partner_deals.finance_reviews set status='linked',resolved_by=p_member,resolved_at=now(),manual_reviewed_snapshot=snapshot where id=r.id;
  insert into partner_deals.audit(deal_id,actor_member_id,action,after_snapshot) values(d.id,p_member,'finance_manual_funding_reviewed',jsonb_build_object('contributionId',c.id,'fundingId',f.id,'fundingRevision',f.revision));
  return;
 end if;
 if r.last_unlinked_funding_id=p_funding and p_action='unlink' and not exists(select 1 from partner_deals.funding_links where contribution_id=c.id) then return; end if;
 if r.status='linked' and p_action='link' and exists(select 1 from partner_deals.funding_links where contribution_id=c.id and funding_id=p_funding) then return; end if;
 if r.status='separate' and p_action='separate' and exists(select 1 from partner_deals.separate_funding_approvals where contribution_id=c.id and candidate_snapshot=p_snapshot) then return; end if;
 if r.status='linked' and p_action='verified' then
  select f0.* into f from partner_deals.funding_links l join finance.funding f0 on f0.id=l.funding_id where l.contribution_id=c.id for update of f0;
  if found and f.id=p_funding and f.revision=p_revision and not partner_deals.linked_funding_mismatch(c.id) then return; end if;
  raise exception 'deal_review_changed' using errcode='40001';
 end if;
 if r.status<>'pending' then raise exception 'deal_review_changed' using errcode='40001'; end if;
 perform pg_advisory_xact_lock(75982,hashtext(c.season_id::text));
 select status into state from finance.seasons where id=c.season_id for update;
 if p_action='verified' then
  select f0.* into f from partner_deals.funding_links l join finance.funding f0 on f0.id=l.funding_id where l.contribution_id=c.id for update of f0;
  if not found or f.id is distinct from p_funding or f.revision is distinct from p_revision or partner_deals.linked_funding_mismatch(c.id) then raise exception 'deal_review_changed' using errcode='40001'; end if;
  update partner_deals.finance_reviews set status='linked',resolved_by=p_member,resolved_at=now() where id=r.id;
  insert into partner_deals.audit(deal_id,actor_member_id,action,after_snapshot) values(d.id,p_member,'finance_review_verified',jsonb_build_object('contributionId',c.id,'fundingId',f.id,'fundingRevision',f.revision));
  return;
 end if;
 if state='closed' then raise exception 'deal_funding_closed' using errcode='42501'; end if;
 if p_action='unlink' then
  select f0.* into f from partner_deals.funding_links l join finance.funding f0 on f0.id=l.funding_id where l.contribution_id=c.id for update of f0;
  if not found or f.id is distinct from p_funding or f.revision is distinct from p_revision or not partner_deals.linked_funding_mismatch(c.id) then raise exception 'deal_review_changed' using errcode='40001'; end if;
  if d.stage='won' and c.pending_change_id is null and (f.status not in ('deleted','rejected') or f.received_date is not null) then
   raise exception 'deal_won_funding_correct_first' using errcode='40001'; end if;
  delete from partner_deals.funding_links where contribution_id=c.id and funding_id=f.id;
  perform finance.audit_change(p_member,'funding',f.id::text,'partner_deal_link',d.id::text,null);
  snapshot:=partner_deals.funding_candidate_snapshot(c.id);
  if jsonb_array_length(snapshot)>0 then
   update partner_deals.finance_reviews set status='pending',last_unlinked_funding_id=f.id,resolved_by=null,resolved_at=null where id=r.id;
  else
   if d.stage='won' and c.pending_change_id is null then
    perform partner_deals.attach_one_cash(p_member,d.id,c.id);
    update partner_deals.finance_reviews set status='linked',last_unlinked_funding_id=f.id,resolved_by=p_member,resolved_at=now() where id=r.id;
   else
    update partner_deals.finance_reviews set status='unlinked',last_unlinked_funding_id=f.id,resolved_by=p_member,resolved_at=now() where id=r.id;
   end if;
  end if;
  insert into partner_deals.audit(deal_id,actor_member_id,action,after_snapshot) values(d.id,p_member,'finance_review_unlinked',jsonb_build_object('contributionId',c.id,'fundingId',f.id));
  return;
 end if;
 if exists(select 1 from partner_deals.funding_links where contribution_id=c.id) then raise exception 'deal_review_changed' using errcode='40001'; end if;
 perform 1 from finance.funding x where x.season_id=c.season_id and x.funding_type='sponsor_cash' and x.status not in ('deleted','rejected') and lower(btrim(x.source_name))=lower(btrim(org)) and not exists(select 1 from partner_deals.funding_links l where l.funding_id=x.id) order by x.id for update;
 snapshot:=partner_deals.funding_candidate_snapshot(c.id);
 if p_action='link' then
  select * into f from finance.funding where id=p_funding;
  if not found or f.revision is distinct from p_revision or f.season_id<>c.season_id or f.amount_ore<>c.amount_ore or f.funding_type<>'sponsor_cash' or f.status not in ('secured','received') or lower(btrim(f.source_name))<>lower(btrim(org)) or not exists(select 1 from jsonb_array_elements(snapshot) x where x->>'id'=f.id::text) then raise exception 'deal_funding_mismatch' using errcode='40001'; end if;
  insert into partner_deals.funding_links(contribution_id,funding_id,linked_by_member_id) values(c.id,f.id,p_member);
  perform finance.audit_change(p_member,'funding',f.id::text,'partner_deal_link',null,d.id::text);
 elsif p_action='separate' then
  if jsonb_typeof(p_snapshot)<>'array' or jsonb_array_length(snapshot)=0 or snapshot is distinct from p_snapshot then raise exception 'deal_funding_candidates_changed' using errcode='40001'; end if;
  insert into partner_deals.separate_funding_approvals(contribution_id,candidate_snapshot,approved_by_member_id) values(c.id,snapshot,p_member)
   on conflict(contribution_id) do update set candidate_snapshot=excluded.candidate_snapshot,approved_by_member_id=excluded.approved_by_member_id,approved_at=now();
 else raise exception 'deal_review_invalid' using errcode='22023'; end if;
 if p_action='separate' and d.stage='won' and c.pending_change_id is null then
  perform partner_deals.attach_one_cash(p_member,d.id,c.id);
 end if;
 update partner_deals.finance_reviews set status=case when p_action='link' or (p_action='separate' and d.stage='won' and c.pending_change_id is null) then 'linked' else 'separate' end,resolved_by=p_member,resolved_at=now() where id=r.id;
 insert into partner_deals.audit(deal_id,actor_member_id,action,after_snapshot) values(d.id,p_member,'finance_review_resolved',jsonb_build_object('contributionId',c.id,'resolution',p_action));
end $$;
create or replace function partner_deals.review_notifications(p_member uuid,p_sub text,p_email text)
returns jsonb language sql stable set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'createdAt',n.event_time,
   'title',case when n.kind='requested' then 'Sponsor funding review requested' else 'Sponsor funding review completed' end,
   'description',case when n.kind='requested' then 'Business requested a funding review.' else case when d.stage='won' then 'Finance reviewed the funding. Return to the agreement to continue.' else 'Finance reviewed the funding. Return to the sponsor pipeline to continue.' end end,
   'href',case when n.kind='requested' then '/finance/sponsor-reviews' else case when d.stage='won' then '/partner-deals?deal='||d.id::text else '/sponsor-pipeline' end end,
   'variant','info') order by n.event_time desc,n.id),'[]'::jsonb)
 from partner_deals.review_notification_events n
 join partner_deals.finance_reviews r on r.id=n.review_id
 join partner_deals.contributions c on c.id=r.contribution_id
 join partner_deals.deals d on d.id=c.deal_id
 join partner.organizations o on o.id=d.organization_id
 where (d.stage not in ('won','lost') or (d.stage='won' and d.cancelled_at is null and (c.pending_change_id is null or exists(select 1 from partner_deals.agreement_changes ac where ac.id=c.pending_change_id and ac.deal_id=d.id and ac.status='pending')))) and c.kind='cash' and c.retired_at is null
   and (r.organization_name,r.season_id,r.amount_ore)=(o.name,c.season_id,c.amount_ore)
   and not exists(select 1 from partner_deals.review_notification_reads seen where seen.notification_id=n.id and seen.member_id=p_member)
   and (
    (n.kind='requested' and r.status='pending' and n.event_time=r.requested_at and partner_deals.finance_reviewer(p_member,p_sub,p_email)
      and (partner_deals.manual_funding_needs_review(c.id) or jsonb_array_length(partner_deals.funding_candidate_snapshot(c.id))>0 or partner_deals.linked_funding_mismatch(c.id)))
    or
    (n.kind='resolved' and n.event_time=r.resolved_at
       and coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false)
       and ((r.status='linked' and ((r.manual_reviewed_snapshot is not null and r.manual_reviewed_snapshot=partner_deals.manual_funding_snapshot(c.id) and partner_deals.manual_funding_needs_review(c.id)) or (not exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=c.id) and not partner_deals.linked_funding_mismatch(c.id))))
         or (r.status='separate' and (select a.candidate_snapshot from partner_deals.separate_funding_approvals a where a.contribution_id=c.id)=partner_deals.funding_candidate_snapshot(c.id))
         or (r.status='unlinked' and not exists(select 1 from partner_deals.funding_links l where l.contribution_id=c.id) and jsonb_array_length(partner_deals.funding_candidate_snapshot(c.id))=0)))
   )
$$;
create or replace function partner_deals.acknowledge_manual_funding(p_member uuid,p_sub text,p_email text,p_deal uuid,p_revision integer,p_contribution uuid,p_token text,p_note text) returns uuid language plpgsql set search_path=pg_catalog as $$
declare d partner_deals.deals%rowtype; c partner_deals.contributions%rowtype; f finance.funding%rowtype; org text; snap jsonb; result uuid;
begin
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 select * into d from partner_deals.deals where id=p_deal for update;
 if not found or d.stage<>'won' or d.cancelled_at is not null then raise exception 'deal_not_found' using errcode='P0002'; end if;
 if d.revision is distinct from p_revision then raise exception 'deal_conflict' using errcode='40001'; end if;
 if p_note is null or length(btrim(p_note)) not between 1 and 2000 then raise exception 'deal_change_invalid' using errcode='22023'; end if;
 select name into org from partner.organizations where id=d.organization_id for share;
 select * into c from partner_deals.contributions where id=p_contribution and deal_id=d.id and kind='cash' and retired_at is null and pending_change_id is null for update;
 if not found or not exists(select 1 from partner_deals.manual_reconciliation_items where kind='cash' and item_id=c.id) then raise exception 'deal_change_invalid' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(75982,hashtext(c.season_id::text));
 select f0.* into f from partner_deals.funding_links fl join finance.funding f0 on f0.id=fl.funding_id where fl.contribution_id=c.id for update of f0;
 if not found or f.season_id<>c.season_id or f.funding_type<>'sponsor_cash' or f.status not in ('secured','received') or lower(btrim(f.source_name))<>lower(btrim(org)) then raise exception 'deal_change_finance_review' using errcode='40001'; end if;
 snap:=partner_deals.manual_funding_snapshot(c.id);
 if p_token is null or p_token<>md5(snap::text) then raise exception 'deal_change_conflict' using errcode='40001'; end if;
 if not exists(select 1 from partner_deals.finance_reviews r where r.contribution_id=c.id and r.status='linked' and r.manual_reviewed_snapshot=snap) then raise exception 'deal_change_manual_finance_pending' using errcode='40001'; end if;
 if not partner_deals.manual_funding_needs_review(c.id) then raise exception 'deal_change_conflict' using errcode='40001'; end if;
 insert into partner_deals.manual_funding_reviews(contribution_id,reviewed_by,note,funding_snapshot) values(c.id,p_member,btrim(p_note),snap) returning id into result;
 update partner_deals.deals set revision=revision+1,updated_by_member_id=p_member,updated_at=now() where id=d.id;
 insert into partner_deals.audit(deal_id,actor_member_id,action,after_snapshot) values(d.id,p_member,'manual_funding_reviewed',jsonb_build_object('contributionId',c.id,'reviewId',result,'fundingId',f.id,'fundingRevision',f.revision,'note',btrim(p_note)));
 return result;
end $$;
revoke all on all functions in schema partner_deals from public;
commit;
