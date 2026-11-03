-- Reviewed Won card edits preserve the original party of each historical contribution.
begin;
alter table partner_deals.contributions add column organization_id uuid references partner.organizations(id);
update partner_deals.contributions c set organization_id=d.organization_id from partner_deals.deals d where d.id=c.deal_id and d.stage='won';
create function partner_deals.capture_contribution_organization() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if new.stage='won' and old.stage<>'won' then update partner_deals.contributions set organization_id=new.organization_id where deal_id=new.id and organization_id is null; end if;
 return null;
end $$;
create trigger capture_contribution_organization after update of stage on partner_deals.deals for each row execute function partner_deals.capture_contribution_organization();
create function partner_deals.capture_inserted_contribution_organization() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if new.organization_id is null then select organization_id into new.organization_id from partner_deals.deals where id=new.deal_id and stage='won';end if;
 return new;
end $$;
create trigger capture_inserted_contribution_organization before insert on partner_deals.contributions for each row execute function partner_deals.capture_inserted_contribution_organization();
-- Proposed replacements do not count as effective contributions until reconciliation.
drop index partner_deals.partner_deals_one_cash_per_season;
create unique index partner_deals_one_cash_per_season on partner_deals.contributions(deal_id,season_id) where kind='cash' and retired_at is null and pending_change_id is null;
create unique index partner_deals_one_pending_cash_per_season on partner_deals.contributions(deal_id,season_id,pending_change_id) where kind='cash' and retired_at is null and pending_change_id is not null;


create or replace function partner_deals.prepare_funding_link(p_member uuid,p_sub text,p_email text,p_contribution uuid,p_funding uuid,p_expected_revision integer)
returns void language plpgsql set search_path=pg_catalog as $$
declare c partner_deals.contributions%rowtype; d partner_deals.deals%rowtype; f finance.funding%rowtype; org text; season_state text;
begin
 perform partner_deals.lock_actor(p_member);
 perform 1 from finance.member_grants where member_id=p_member for share;
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false)
   or not coalesce((finance.capability_flags(p_member)->>'manageFunding')::boolean,false)
 then raise exception 'deal_funding_forbidden' using errcode='42501'; end if;
 select * into c from partner_deals.contributions where id=p_contribution;
 if not found or c.kind <> 'cash' then raise exception 'deal_funding_invalid' using errcode='22023'; end if;
 select * into d from partner_deals.deals where id=c.deal_id for update;
 select * into c from partner_deals.contributions where id=p_contribution and deal_id=d.id for update;
 if not found or d.stage='won' then raise exception 'deal_funding_invalid' using errcode='22023'; end if;
 select status into season_state from finance.seasons where id=c.season_id for update;
 if season_state='closed' then raise exception 'deal_funding_closed' using errcode='42501'; end if;
 select name into org from partner.organizations where id=coalesce(c.organization_id,d.organization_id) for share;

 select * into f from finance.funding where id=p_funding for update;
 if not found then raise exception 'deal_funding_mismatch' using errcode='22023'; end if;
 if p_expected_revision is null or f.revision is distinct from p_expected_revision then raise exception 'deal_funding_stale_link' using errcode='40001'; end if;
 if not found or f.season_id<>c.season_id or f.amount_ore<>c.amount_ore or f.funding_type<>'sponsor_cash'
   or f.status not in ('secured','received') or lower(btrim(f.source_name))<>lower(btrim(org))
 then raise exception 'deal_funding_mismatch' using errcode='22023'; end if;
 if exists(select 1 from partner_deals.funding_links where contribution_id=c.id and funding_id=f.id) then return; end if;
 insert into partner_deals.funding_links(contribution_id,funding_id,linked_by_member_id) values(c.id,f.id,p_member);
 perform finance.audit_change(p_member,'funding',f.id::text,'partner_deal_link',null,d.id::text);
end $$;

create or replace function partner_deals.attach_won_funding(p_member uuid,p_deal uuid)
returns void language plpgsql set search_path=pg_catalog as $$
declare d partner_deals.deals%rowtype; c partner_deals.contributions%rowtype; f finance.funding%rowtype;
 org text; owner_name text; season_code text; season_state text; refnum bigint; ref text; target uuid; changed boolean:=false; candidates jsonb; approved jsonb;
begin
 select * into d from partner_deals.deals where id=p_deal for update;
 if not found or d.stage not in ('lead','contacted','discussion','proposal','won') then raise exception 'deal_funding_invalid' using errcode='22023'; end if;

 select full_name into owner_name from identity.members where id=coalesce(d.owner_member_id,p_member);
 if nullif(btrim(owner_name),'') is null then raise exception 'deal_funding_invalid_owner' using errcode='22023'; end if;
 for c in select * from partner_deals.contributions where deal_id=p_deal and kind='cash' and retired_at is null and not exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=partner_deals.contributions.id) order by season_id,id for update loop
  select name into org from partner.organizations where id=coalesce(c.organization_id,d.organization_id) for share;
   perform pg_advisory_xact_lock(75982,hashtext(c.season_id::text));
   select code,status into season_code,season_state from finance.seasons where id=c.season_id for update;
   if season_state='closed' then raise exception 'deal_funding_closed' using errcode='42501'; end if;
   select funding_id into target from partner_deals.funding_links where contribution_id=c.id;
   if target is not null then
     select * into f from finance.funding where id=target for update;
     if not found or f.season_id<>c.season_id or f.amount_ore<>c.amount_ore or f.funding_type<>'sponsor_cash'
       or f.status not in ('secured','received') or lower(btrim(f.source_name))<>lower(btrim(org))
     then raise exception 'deal_funding_mismatch' using errcode='22023'; end if;
     continue;
   end if;
   -- Counter locking serializes against normal finance creation for this season.
   refnum:=finance.issue_counter('funding:'||season_code,p_member);
   -- Hold existing candidate rows while comparing the finance-approved snapshot.
   perform 1 from finance.funding x where x.season_id=c.season_id and x.funding_type='sponsor_cash'
     and x.status not in ('deleted','rejected') and lower(btrim(x.source_name))=lower(btrim(org))
     and not exists(select 1 from partner_deals.funding_links linked where linked.funding_id=x.id) order by x.id for update;
   candidates:=partner_deals.funding_candidate_snapshot(c.id);
   if jsonb_array_length(candidates)>0 then
     select candidate_snapshot into approved from partner_deals.separate_funding_approvals where contribution_id=c.id;
     if approved is distinct from candidates then raise exception 'deal_funding_possible_duplicate' using errcode='23505'; end if;
   end if;
   ref:='F-'||season_code||'-'||case when refnum<1000 then lpad(refnum::text,3,'0') else refnum::text end;
   insert into finance.funding(season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,expected_date,agreement_link,created_by_member_id,updated_by_member_id)
   values(c.season_id,ref,org,owner_name,'sponsor_cash',c.amount_ore,'secured',null,nullif(d.agreement_link,''),p_member,p_member)
   returning id into target;
   insert into partner_deals.funding_links(contribution_id,funding_id,linked_by_member_id) values(c.id,target,p_member);
   perform finance.audit_change(p_member,'funding',target::text,'source_name',null,org);
   perform finance.audit_change(p_member,'funding',target::text,'owner_name',null,owner_name);
   perform finance.audit_change(p_member,'funding',target::text,'funding_type',null,'sponsor_cash');
   perform finance.audit_change(p_member,'funding',target::text,'amount_nok',null,finance.format_ore(c.amount_ore));
   perform finance.audit_change(p_member,'funding',target::text,'status',null,'secured');
   perform finance.audit_change(p_member,'funding',target::text,'agreement_link',null,nullif(d.agreement_link,''));
   perform finance.audit_change(p_member,'funding',target::text,'partner_deal_link',null,d.id::text);
   changed:=true;
 end loop;
 if changed then perform finance.bump_view_version(); end if;
end $$;

create or replace function partner_deals.funding_candidate_snapshot(p_contribution uuid) returns jsonb language sql stable set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'revision',f.revision,'reference',f.public_ref,
   'status',f.status,'amountOre',f.amount_ore::text,'expectedDate',f.expected_date) order by f.id),'[]'::jsonb)
 from partner_deals.contributions c join partner_deals.deals d on d.id=c.deal_id
 join partner.organizations o on o.id=coalesce(c.organization_id,d.organization_id)
 join finance.funding f on f.season_id=c.season_id and f.funding_type='sponsor_cash'
  and f.status not in ('deleted','rejected') and lower(btrim(f.source_name))=lower(btrim(o.name))
 where c.id=p_contribution and c.kind='cash'
 and not exists(select 1 from partner_deals.funding_links l where l.funding_id=f.id)
$$;

create or replace function partner_deals.approve_separate_funding(p_member uuid,p_sub text,p_email text,p_contribution uuid,p_snapshot jsonb)
returns void language plpgsql set search_path=pg_catalog as $$
declare c partner_deals.contributions%rowtype; d partner_deals.deals%rowtype; state text; current_snapshot jsonb;
begin
 perform partner_deals.lock_actor(p_member);
 perform 1 from finance.member_grants where member_id=p_member for share;
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false)
   or not coalesce((finance.capability_flags(p_member)->>'manageFunding')::boolean,false)
 then raise exception 'deal_funding_forbidden' using errcode='42501'; end if;
 select * into c from partner_deals.contributions where id=p_contribution;
 if not found or c.kind<>'cash' then raise exception 'deal_funding_invalid' using errcode='22023'; end if;
 select * into d from partner_deals.deals where id=c.deal_id for update;
 select * into c from partner_deals.contributions where id=p_contribution and deal_id=d.id for update;
 if not found or d.stage='won' then raise exception 'deal_funding_won_locked' using errcode='22023'; end if;
 select status into state from finance.seasons where id=c.season_id for update;
 if state='closed' then raise exception 'deal_funding_closed' using errcode='42501'; end if;
 if exists(select 1 from partner_deals.funding_links where contribution_id=c.id) then raise exception 'deal_funding_invalid' using errcode='22023'; end if;
 perform 1 from finance.funding f join partner.organizations o on o.id=coalesce(c.organization_id,d.organization_id)
 where f.season_id=c.season_id and f.funding_type='sponsor_cash' and f.status not in ('deleted','rejected')
 and lower(btrim(f.source_name))=lower(btrim(o.name))
 and not exists(select 1 from partner_deals.funding_links l where l.funding_id=f.id) order by f.id for update of f;
 current_snapshot:=partner_deals.funding_candidate_snapshot(c.id);
 if jsonb_array_length(current_snapshot)=0 or current_snapshot is distinct from p_snapshot then
   raise exception 'deal_funding_candidates_changed' using errcode='40001'; end if;
 insert into partner_deals.separate_funding_approvals(contribution_id,candidate_snapshot,approved_by_member_id)
 values(c.id,current_snapshot,p_member) on conflict(contribution_id) do update set candidate_snapshot=excluded.candidate_snapshot,
 approved_by_member_id=excluded.approved_by_member_id,approved_at=now();
 insert into partner_deals.audit(deal_id,actor_member_id,action,after_snapshot)
 values(d.id,p_member,'separate_funding_approved',jsonb_build_object('contributionId',c.id,'reviewedCandidates',current_snapshot));
end $$;

create or replace function partner_deals.request_finance_review(p_member uuid,p_sub text,p_email text,p_deal uuid,p_revision integer)
returns integer language plpgsql set search_path=pg_catalog as $$
declare d partner_deals.deals%rowtype; c partner_deals.contributions%rowtype; org text; count_requested integer:=0; changed integer:=0; affected integer:=0;
begin
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 select * into d from partner_deals.deals where id=p_deal for update;
 if not found then raise exception 'deal_not_found' using errcode='P0002'; end if;
 if d.revision is distinct from p_revision then raise exception 'deal_conflict' using errcode='40001'; end if;
 if d.stage='lost' or (d.stage='won' and d.cancelled_at is not null and not exists(select 1 from partner_deals.agreement_changes ac where ac.deal_id=d.id and ac.kind='cancellation' and ac.status='pending')) then raise exception 'deal_review_invalid' using errcode='22023'; end if;

 for c in select * from partner_deals.contributions where deal_id=d.id and kind='cash' and retired_at is null and (d.cancelled_at is null or partner_deals.manual_cancellation_reviewable(d.id,partner_deals.contributions.id) ) and (d.stage<>'won' or pending_change_id is null or exists(select 1 from partner_deals.agreement_changes ac where ac.id=pending_change_id and ac.deal_id=d.id and ac.status='pending')) order by season_id,id for update loop
  select name into org from partner.organizations where id=coalesce(c.organization_id,d.organization_id) for share;
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
 join partner_deals.deals d on d.id=c.deal_id join partner.organizations o on o.id=coalesce(c.organization_id,d.organization_id)
 join finance.seasons s on s.id=c.season_id
 where r.status='pending' and (d.stage not in ('won','lost') or (d.stage='won' and (d.cancelled_at is null or partner_deals.manual_cancellation_reviewable(d.id,c.id)) and (c.pending_change_id is null or exists(select 1 from partner_deals.agreement_changes ac where ac.id=c.pending_change_id and ac.deal_id=d.id and ac.status='pending')))) and c.kind='cash' and c.retired_at is null
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

 select * into c from partner_deals.contributions where id=target_contribution_id and deal_id=d.id for update;
 if not found then raise exception 'deal_review_changed' using errcode='40001'; end if;
 select name into org from partner.organizations where id=coalesce(c.organization_id,d.organization_id) for share;
 select * into r from partner_deals.finance_reviews where id=p_review and contribution_id=c.id for update;
 if not found or (d.stage='lost' or (d.stage='won' and not ((d.cancelled_at is null or partner_deals.manual_cancellation_reviewable(d.id,c.id)) and (c.pending_change_id is null or exists(select 1 from partner_deals.agreement_changes ac where ac.id=c.pending_change_id and ac.deal_id=d.id and ac.status='pending'))))) or c.retired_at is not null or c.kind<>'cash' or (r.organization_name,r.season_id,r.amount_ore) is distinct from (org,c.season_id,c.amount_ore) then raise exception 'deal_review_changed' using errcode='40001'; end if;
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
   if not found or f.status not in ('secured','received') or not partner_deals.manual_funding_is_original(c.id,f.id) or f.revision is distinct from p_revision or not partner_deals.manual_funding_record_valid(c.id,f.id) or exists(select 1 from partner_deals.funding_links where funding_id=f.id) then raise exception 'deal_review_changed' using errcode='40001'; end if;
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

create or replace function partner_deals.linked_funding_mismatch(p_contribution uuid) returns boolean language sql stable set search_path=pg_catalog as $$
 select exists(select 1 from partner_deals.funding_links l join partner_deals.contributions c on c.id=l.contribution_id
 join partner_deals.deals d on d.id=c.deal_id join partner.organizations o on o.id=coalesce(c.organization_id,d.organization_id)
 join finance.funding f on f.id=l.funding_id where c.id=p_contribution and
 (f.season_id<>c.season_id or f.amount_ore<>c.amount_ore or f.funding_type<>'sponsor_cash' or f.status not in ('secured','received') or lower(btrim(f.source_name))<>lower(btrim(o.name))))
$$;

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
 join partner.organizations o on o.id=coalesce(c.organization_id,d.organization_id)
 where (d.stage not in ('won','lost') or (d.stage='won' and (d.cancelled_at is null or partner_deals.manual_cancellation_reviewable(d.id,c.id)) and (c.pending_change_id is null or exists(select 1 from partner_deals.agreement_changes ac where ac.id=c.pending_change_id and ac.deal_id=d.id and ac.status='pending')))) and c.kind='cash' and c.retired_at is null
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

create or replace function partner_deals.attach_one_cash(p_member uuid,p_deal uuid,p_contribution uuid)
returns void language plpgsql set search_path=pg_catalog as $$
declare d partner_deals.deals%rowtype; c partner_deals.contributions%rowtype; f finance.funding%rowtype;
 org text; owner_name text; season_code text; season_state text; refnum bigint; ref text; target uuid; changed boolean:=false; candidates jsonb; approved jsonb;
begin
 select * into d from partner_deals.deals where id=p_deal for update;
 if not found or d.stage not in ('lead','contacted','discussion','proposal','won') then raise exception 'deal_funding_invalid' using errcode='22023'; end if;

 select full_name into owner_name from identity.members where id=coalesce(d.owner_member_id,p_member);
 if nullif(btrim(owner_name),'') is null then raise exception 'deal_funding_invalid_owner' using errcode='22023'; end if;
 for c in select * from partner_deals.contributions where deal_id=p_deal and id=p_contribution and kind='cash' and retired_at is null and not exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=partner_deals.contributions.id) order by season_id,id for update loop
  select name into org from partner.organizations where id=coalesce(c.organization_id,d.organization_id) for share;
   perform pg_advisory_xact_lock(75982,hashtext(c.season_id::text));
   select code,status into season_code,season_state from finance.seasons where id=c.season_id for update;
   if season_state='closed' then raise exception 'deal_funding_closed' using errcode='42501'; end if;
   select funding_id into target from partner_deals.funding_links where contribution_id=c.id;
   if target is not null then
     select * into f from finance.funding where id=target for update;
     if not found or f.season_id<>c.season_id or f.amount_ore<>c.amount_ore or f.funding_type<>'sponsor_cash'
       or f.status not in ('secured','received') or lower(btrim(f.source_name))<>lower(btrim(org))
     then raise exception 'deal_funding_mismatch' using errcode='22023'; end if;
     continue;
   end if;
   -- Counter locking serializes against normal finance creation for this season.
   refnum:=finance.issue_counter('funding:'||season_code,p_member);
   -- Hold existing candidate rows while comparing the finance-approved snapshot.
   perform 1 from finance.funding x where x.season_id=c.season_id and x.funding_type='sponsor_cash'
     and x.status not in ('deleted','rejected') and lower(btrim(x.source_name))=lower(btrim(org))
     and not exists(select 1 from partner_deals.funding_links linked where linked.funding_id=x.id) order by x.id for update;
   candidates:=partner_deals.funding_candidate_snapshot(c.id);
   if jsonb_array_length(candidates)>0 then
     select candidate_snapshot into approved from partner_deals.separate_funding_approvals where contribution_id=c.id;
     if approved is distinct from candidates then raise exception 'deal_funding_possible_duplicate' using errcode='23505'; end if;
   end if;
   ref:='F-'||season_code||'-'||case when refnum<1000 then lpad(refnum::text,3,'0') else refnum::text end;
   insert into finance.funding(season_id,public_ref,source_name,owner_name,funding_type,amount_ore,status,expected_date,agreement_link,created_by_member_id,updated_by_member_id)
   values(c.season_id,ref,org,owner_name,'sponsor_cash',c.amount_ore,'secured',null,nullif(d.agreement_link,''),p_member,p_member)
   returning id into target;
   insert into partner_deals.funding_links(contribution_id,funding_id,linked_by_member_id) values(c.id,target,p_member);
   perform finance.audit_change(p_member,'funding',target::text,'source_name',null,org);
   perform finance.audit_change(p_member,'funding',target::text,'owner_name',null,owner_name);
   perform finance.audit_change(p_member,'funding',target::text,'funding_type',null,'sponsor_cash');
   perform finance.audit_change(p_member,'funding',target::text,'amount_nok',null,finance.format_ore(c.amount_ore));
   perform finance.audit_change(p_member,'funding',target::text,'status',null,'secured');
   perform finance.audit_change(p_member,'funding',target::text,'agreement_link',null,nullif(d.agreement_link,''));
   perform finance.audit_change(p_member,'funding',target::text,'partner_deal_link',null,d.id::text);
   changed:=true;
 end loop;
 if changed then perform finance.bump_view_version(); end if;
end $$;

create or replace function partner_deals.acknowledge_manual_funding(p_member uuid,p_sub text,p_email text,p_deal uuid,p_revision integer,p_contribution uuid,p_token text,p_note text) returns uuid language plpgsql set search_path=pg_catalog as $$
declare d partner_deals.deals%rowtype; c partner_deals.contributions%rowtype; f finance.funding%rowtype; org text; snap jsonb; result uuid;
begin
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 select * into d from partner_deals.deals where id=p_deal for update;
 if not found or d.stage<>'won' or d.cancelled_at is not null then raise exception 'deal_not_found' using errcode='P0002'; end if;
 if d.revision is distinct from p_revision then raise exception 'deal_conflict' using errcode='40001'; end if;
 if p_note is null or length(btrim(p_note)) not between 1 and 2000 then raise exception 'deal_change_invalid' using errcode='22023'; end if;

 select * into c from partner_deals.contributions where id=p_contribution and deal_id=d.id and kind='cash' and retired_at is null and pending_change_id is null for update;
 if not found or not exists(select 1 from partner_deals.manual_reconciliation_items where kind='cash' and item_id=c.id) then raise exception 'deal_change_invalid' using errcode='22023'; end if;
 select name into org from partner.organizations where id=coalesce(c.organization_id,d.organization_id) for share;
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

create or replace function partner_deals.manual_funding_record_valid(p_contribution uuid,p_funding uuid) returns boolean language sql stable set search_path=pg_catalog as $$
 select exists(select 1 from partner_deals.contributions c join partner_deals.deals d on d.id=c.deal_id join partner.organizations o on o.id=coalesce(c.organization_id,d.organization_id) join finance.funding f on f.id=p_funding where c.id=p_contribution and f.season_id=c.season_id and f.funding_type='sponsor_cash' and (f.status in ('secured','received') or (d.cancelled_at is not null and partner_deals.manual_cancellation_reviewable(d.id,c.id) and f.status in ('deleted','rejected') and f.received_date is null)) and lower(btrim(f.source_name))=lower(btrim(o.name)))
$$;

create or replace function partner_deals.record_agreement_change_before_card_fields(p_member uuid,p_sub text,p_email text,p_deal uuid,p_revision integer,p_kind text,p_reason text,p_terms jsonb)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare d partner_deals.deals%rowtype; before_terms jsonb; target uuid; start_date date; end_date date; link text; item jsonb; item_id uuid; seen uuid[];
begin
 perform pg_advisory_xact_lock(72704,12);
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 select * into d from partner_deals.deals where id=p_deal for update;
 if not found or d.stage<>'won' then raise exception 'deal_not_found' using errcode='P0002'; end if;
 if p_revision is null or d.revision<>p_revision then raise exception 'deal_conflict' using errcode='40001'; end if;
 if p_kind not in ('amendment','cancellation','reopening') or p_reason is null or length(btrim(p_reason)) not between 1 and 2000 then raise exception 'deal_change_invalid' using errcode='22023'; end if;
 if exists(select 1 from partner_deals.agreement_changes where deal_id=d.id and status='pending') then raise exception 'deal_change_pending' using errcode='40001'; end if;
 if p_kind='amendment' then
  if d.cancelled_at is not null or jsonb_typeof(p_terms)<>'object' then raise exception 'deal_change_invalid' using errcode='22023'; end if;
  if exists(select 1 from partner_deals.agreement_changes where deal_id=d.id and status='pending' and kind='amendment') then raise exception 'deal_change_pending' using errcode='40001'; end if;
  if (select array_agg(key order by key) from jsonb_object_keys(p_terms - array['newCash','newInKind','newDeliverables']) key) is distinct from array['agreementLink','cashChanges','contactEmail','contactName','deliverableChanges','endsOn','inKindChanges','startsOn','title']::text[] then raise exception 'deal_change_invalid' using errcode='22023'; end if;
  if length(btrim(coalesce(p_terms->>'title',''))) not between 1 and 200 or length(coalesce(p_terms->>'contactName',''))>160 or length(coalesce(p_terms->>'contactEmail',''))>254 or length(coalesce(p_terms->>'agreementLink',''))>2000 then raise exception 'deal_change_invalid' using errcode='22023'; end if;
  start_date:=nullif(p_terms->>'startsOn','')::date; end_date:=nullif(p_terms->>'endsOn','')::date; link:=coalesce(p_terms->>'agreementLink','');
  if start_date is not null and end_date is not null and end_date<start_date then raise exception 'deal_change_invalid' using errcode='22023'; end if;
  if link<>'' and link !~* '^https?://' then raise exception 'deal_change_invalid' using errcode='22023'; end if;
  if jsonb_typeof(p_terms->'cashChanges')<>'array' or jsonb_typeof(p_terms->'inKindChanges')<>'array' or jsonb_typeof(p_terms->'deliverableChanges')<>'array' then raise exception 'deal_change_invalid' using errcode='22023'; end if;
  if jsonb_array_length(p_terms->'cashChanges')<>(select count(*) from partner_deals.contributions where deal_id=d.id and kind='cash' and retired_at is null and pending_change_id is null) or jsonb_array_length(p_terms->'inKindChanges')<>(select count(*) from partner_deals.contributions where deal_id=d.id and kind in ('product','service') and retired_at is null and pending_change_id is null) or jsonb_array_length(p_terms->'deliverableChanges')<>(select count(*) from partner_deals.deliverables where deal_id=d.id and retired_at is null and pending_change_id is null) then raise exception 'deal_change_invalid' using errcode='22023'; end if;
  seen:='{}'::uuid[];
  for item in select value from jsonb_array_elements(p_terms->'cashChanges') loop
   item_id:=(item->>'id')::uuid;
   if item_id is null or item_id=any(seen) or not exists(select 1 from partner_deals.contributions c where c.id=item_id and c.deal_id=d.id and c.kind='cash' and c.retired_at is null and c.pending_change_id is null) or coalesce(item->>'amountOre','') !~ '^[1-9][0-9]{0,17}$' or nullif(item->>'invoiceDate','') is null then raise exception 'deal_change_invalid' using errcode='22023'; end if;
   perform (item->>'invoiceDate')::date; seen:=array_append(seen,item_id);
  end loop;
  seen:='{}'::uuid[];
  for item in select value from jsonb_array_elements(p_terms->'inKindChanges') loop
   item_id:=(item->>'id')::uuid;
   if item_id is null or item_id=any(seen) or not exists(select 1 from partner_deals.contributions c where c.id=item_id and c.deal_id=d.id and c.kind in ('product','service') and c.retired_at is null and c.pending_change_id is null) or length(coalesce(item->>'description',''))>2000 or (nullif(item->>'amountOre','') is not null and (item->>'amountOre') !~ '^[1-9][0-9]{0,17}$') then raise exception 'deal_change_invalid' using errcode='22023'; end if;
   seen:=array_append(seen,item_id);
  end loop;
  seen:='{}'::uuid[];
  for item in select value from jsonb_array_elements(p_terms->'deliverableChanges') loop
   item_id:=(item->>'id')::uuid;
   if item_id is null or item_id=any(seen) or not exists(select 1 from partner_deals.deliverables v where v.id=item_id and v.deal_id=d.id and v.retired_at is null and v.pending_change_id is null) or length(btrim(coalesce(item->>'title',''))) not between 1 and 200 or length(coalesce(item->>'description',''))>2000 then raise exception 'deal_change_invalid' using errcode='22023'; end if;
   perform nullif(item->>'dueDate','')::date; seen:=array_append(seen,item_id);
  end loop;

  if jsonb_typeof(coalesce(p_terms->'newCash','[]'::jsonb))<>'array' or jsonb_typeof(coalesce(p_terms->'newInKind','[]'::jsonb))<>'array' or jsonb_typeof(coalesce(p_terms->'newDeliverables','[]'::jsonb))<>'array' or jsonb_array_length(coalesce(p_terms->'newCash','[]'::jsonb))>100 or jsonb_array_length(coalesce(p_terms->'newInKind','[]'::jsonb))>100 or jsonb_array_length(coalesce(p_terms->'newDeliverables','[]'::jsonb))>100 then raise exception 'deal_change_invalid' using errcode='22023'; end if;
  seen:='{}'::uuid[];
  for item in select value from jsonb_array_elements(coalesce(p_terms->'newCash','[]'::jsonb)) loop
   item_id:=(item->>'id')::uuid;
   if item_id is null or item_id=any(seen) or coalesce(item->>'amountOre','') !~ '^[1-9][0-9]{0,17}$' or nullif(item->>'invoiceDate','') is null or not exists(select 1 from finance.seasons where id=(item->>'seasonId')::uuid and status<>'closed') or exists(select 1 from partner_deals.contributions where deal_id=d.id and season_id=(item->>'seasonId')::uuid and kind='cash' and retired_at is null and not exists(select 1 from jsonb_array_elements(p_terms->'cashChanges') x where x->>'id'=partner_deals.contributions.id::text and coalesce((x->>'retire')::boolean,false))) then raise exception 'deal_change_invalid' using errcode='22023'; end if;
   perform (item->>'invoiceDate')::date; seen:=array_append(seen,item_id);
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_terms->'newInKind','[]'::jsonb)) loop
   if (item->>'id')::uuid is null or item->>'kind' not in ('product','service') or not exists(select 1 from finance.seasons where id=(item->>'seasonId')::uuid and status<>'closed') or length(coalesce(item->>'description',''))>2000 or (nullif(item->>'amountOre','') is not null and item->>'amountOre' !~ '^[1-9][0-9]{0,17}$') then raise exception 'deal_change_invalid' using errcode='22023'; end if;
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_terms->'newDeliverables','[]'::jsonb)) loop
   if (item->>'id')::uuid is null or length(btrim(coalesce(item->>'title',''))) not between 1 and 200 or length(coalesce(item->>'description',''))>2000 then raise exception 'deal_change_invalid' using errcode='22023'; end if;
   perform nullif(item->>'dueDate','')::date;
  end loop;
 elsif (p_kind='cancellation' and d.cancelled_at is not null) or (p_kind='reopening' and d.cancelled_at is null) then raise exception 'deal_change_conflict' using errcode='40001';
 end if;
 before_terms:=jsonb_build_object('title',d.title,'contactName',d.contact_name,'contactEmail',d.contact_email,'startsOn',d.starts_on,'endsOn',d.ends_on,'agreementLink',d.agreement_link,'cancelledAt',d.cancelled_at,
 'cashChanges',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'amountOre',c.amount_ore::text,'invoiceDate',c.invoice_date) order by c.id) from partner_deals.contributions c where c.deal_id=d.id and c.kind='cash' and c.retired_at is null and c.pending_change_id is null),'[]'::jsonb),
 'inKindChanges',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'description',c.description,'amountOre',c.amount_ore::text) order by c.id) from partner_deals.contributions c where c.deal_id=d.id and c.kind in ('product','service') and c.retired_at is null and c.pending_change_id is null),'[]'::jsonb),
 'deliverableChanges',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'title',v.title,'description',v.description,'dueDate',v.due_date) order by v.id) from partner_deals.deliverables v where v.deal_id=d.id and v.retired_at is null and v.pending_change_id is null),'[]'::jsonb));
 if p_kind='cancellation' then update partner_deals.deals set cancelled_at=now(),cancelled_by_member_id=p_member,revision=revision+1,updated_by_member_id=p_member,updated_at=now() where id=d.id;
 elsif p_kind='reopening' then update partner_deals.deals set cancelled_at=null,cancelled_by_member_id=null,revision=revision+1,updated_by_member_id=p_member,updated_at=now() where id=d.id;
 else update partner_deals.deals set revision=revision+1,updated_by_member_id=p_member,updated_at=now() where id=d.id; end if;
 insert into partner_deals.agreement_changes(deal_id,kind,reason,before_terms,proposed_terms,created_by) values(d.id,p_kind,btrim(p_reason),before_terms,case when p_kind='amendment' then p_terms else jsonb_build_object('cancelled',p_kind='cancellation') end,p_member) returning id into target;

 if p_kind='amendment' then
  for item in select value from jsonb_array_elements(coalesce(p_terms->'newCash','[]'::jsonb)) loop
   insert into partner_deals.contributions(id,deal_id,season_id,kind,amount_ore,invoice_date,pending_change_id) values((item->>'id')::uuid,d.id,(item->>'seasonId')::uuid,'cash',(item->>'amountOre')::bigint,(item->>'invoiceDate')::date,target);
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_terms->'newInKind','[]'::jsonb)) loop
   insert into partner_deals.contributions(id,deal_id,season_id,kind,description,amount_ore,pending_change_id) values((item->>'id')::uuid,d.id,(item->>'seasonId')::uuid,item->>'kind',coalesce(item->>'description',''),nullif(item->>'amountOre','')::bigint,target);
  end loop;
  for item in select value from jsonb_array_elements(coalesce(p_terms->'newDeliverables','[]'::jsonb)) loop
   insert into partner_deals.deliverables(id,deal_id,title,description,due_date,pending_change_id) values((item->>'id')::uuid,d.id,btrim(item->>'title'),coalesce(item->>'description',''),nullif(item->>'dueDate','')::date,target);
  end loop;
 end if;
 insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot) values(d.id,p_member,'agreement_change_recorded',before_terms,jsonb_build_object('changeId',target,'kind',p_kind,'proposedTerms',p_terms));
 return target;
end $$;

create or replace function partner_deals.resolve_agreement_change_before_card_fields(p_member uuid,p_sub text,p_email text,p_change uuid,p_note text,p_manual boolean)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare change_row partner_deals.agreement_changes%rowtype; d partner_deals.deals%rowtype; target_deal uuid; prior jsonb; item jsonb; c partner_deals.contributions%rowtype; v partner_deals.deliverables%rowtype; f finance.funding%rowtype; task project_management.tasks%rowtype; new_amount bigint; new_date date; org text; current_season finance.seasons%rowtype; project_id uuid; milestone_id uuid; task_id uuid; finance_dept text; marketing_dept text; season_state text;
begin
 perform pg_advisory_xact_lock(72704,12);
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 select deal_id into target_deal from partner_deals.agreement_changes where id=p_change;
 if target_deal is null then raise exception 'deal_not_found' using errcode='P0002'; end if;
 select * into d from partner_deals.deals where id=target_deal for update;
 select * into change_row from partner_deals.agreement_changes where id=p_change and deal_id=d.id for update;
 if change_row.withdrawn_at is not null then raise exception 'deal_change_conflict' using errcode='40001'; end if;
 if change_row.status='resolved' then return change_row.id; end if;
 if p_note is null or length(btrim(p_note)) not between 1 and 2000 then raise exception 'deal_change_invalid' using errcode='22023'; end if;
 if change_row.kind='amendment' and d.cancelled_at is not null then raise exception 'deal_change_cancelled' using errcode='40001'; end if;
 prior:=to_jsonb(d);
 if change_row.kind='amendment' then
  select name into org from partner.organizations where id=d.organization_id for share;
  for c in select * from partner_deals.contributions where deal_id=d.id and kind='cash' and retired_at is null and pending_change_id is null order by season_id,id for update loop
   select name into org from partner.organizations where id=coalesce(c.organization_id,d.organization_id) for share;
   select value into item from jsonb_array_elements(change_row.proposed_terms->'cashChanges') where value->>'id'=c.id::text;
   if item is null then raise exception 'deal_change_conflict' using errcode='40001'; end if;
   new_amount:=(item->>'amountOre')::bigint; new_date:=(item->>'invoiceDate')::date;
   perform pg_advisory_xact_lock(75982,hashtext(c.season_id::text));
   select f0.* into f from partner_deals.funding_links fl join finance.funding f0 on f0.id=fl.funding_id where fl.contribution_id=c.id for update of f0;
   if not found or f.season_id<>c.season_id or f.funding_type<>'sponsor_cash' or lower(btrim(f.source_name))<>lower(btrim(org)) then raise exception 'deal_change_finance_review' using errcode='40001'; end if;
   if partner_deals.manual_funding_needs_review(c.id) and not partner_deals.manual_finance_review_ready(c.id) then raise exception 'deal_change_manual_finance_pending' using errcode='40001'; end if;
   select t.* into task from partner_deals.task_links l join project_management.tasks t on t.id=l.task_id where l.contribution_id=c.id and l.kind='invoice' for update of t;
   if coalesce((item->>'retire')::boolean,false) then
    if (f.status='received' or f.received_date is not null) or (found and task.status='done') then
     if found and task.status not in ('done','cancelled') then raise exception 'deal_change_retire_invoice' using errcode='40001'; end if;
     if p_manual is not true then raise exception 'deal_change_manual_required' using errcode='40001'; end if;
     insert into partner_deals.manual_reconciliation_items(change_id,kind,item_id,funding_snapshot) values(change_row.id,'cash',c.id,jsonb_build_object('id',f.id,'revision',f.revision,'amountOre',f.amount_ore::text,'status',f.status,'receivedDate',f.received_date,'sourceName',f.source_name,'seasonId',f.season_id)) on conflict do nothing;
    else
     if f.status not in ('deleted','rejected') then raise exception 'deal_change_retire_finance' using errcode='40001'; end if;
     if found and task.status<>'cancelled' then raise exception 'deal_change_retire_invoice' using errcode='40001'; end if;
    end if;
    update partner_deals.contributions set retired_at=now() where id=c.id;
    continue;
   end if;
   if f.status not in ('secured','received') then raise exception 'deal_change_finance_review' using errcode='40001'; end if;
   if (c.amount_ore,c.invoice_date) is distinct from (new_amount,new_date) and ((f.status='received' or f.received_date is not null) or (found and task.status='done')) then
    if found and task.status not in ('done','cancelled') then raise exception 'deal_change_invoice_review' using errcode='40001'; end if;
    if p_manual is not true then raise exception 'deal_change_manual_required' using errcode='40001'; end if;
    insert into partner_deals.manual_reconciliation_items(change_id,kind,item_id,funding_snapshot) values(change_row.id,'cash',c.id,jsonb_build_object('id',f.id,'revision',f.revision,'amountOre',f.amount_ore::text,'status',f.status,'receivedDate',f.received_date,'sourceName',f.source_name,'seasonId',f.season_id)) on conflict do nothing;
    update partner_deals.contributions set amount_ore=new_amount,invoice_date=new_date where id=c.id;
    continue;
   end if;
   -- A prior manual reconciliation deliberately keeps received funding or a
   -- completed invoice unchanged. Unrelated later amendments must not force
   -- that historical record to match the already accepted agreement terms.
   if (c.amount_ore,c.invoice_date) is not distinct from (new_amount,new_date)
      and exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=c.id) then
    if partner_deals.manual_funding_needs_review(c.id) then
     if not coalesce(p_manual,false) then raise exception 'deal_change_manual_required' using errcode='40001'; end if;
     insert into partner_deals.manual_reconciliation_items(change_id,kind,item_id,funding_snapshot) values(change_row.id,'cash',c.id,jsonb_build_object('id',f.id,'revision',f.revision,'amountOre',f.amount_ore::text,'status',f.status,'receivedDate',f.received_date,'sourceName',f.source_name,'seasonId',f.season_id)) on conflict do nothing;
    end if;
    continue;
   end if;
   if f.amount_ore<>new_amount then raise exception 'deal_change_finance_review' using errcode='40001'; end if;
   if found and c.invoice_date is distinct from new_date and task.deadline is distinct from new_date then raise exception 'deal_change_invoice_review' using errcode='40001'; end if;
   update partner_deals.contributions set amount_ore=new_amount,invoice_date=new_date where id=c.id;
  end loop;
  for c in select * from partner_deals.contributions where deal_id=d.id and kind in ('product','service') and retired_at is null and pending_change_id is null order by id for update loop
   select value into item from jsonb_array_elements(change_row.proposed_terms->'inKindChanges') where value->>'id'=c.id::text;
   if item is null then raise exception 'deal_change_conflict' using errcode='40001'; end if;
   if coalesce((item->>'retire')::boolean,false) then update partner_deals.contributions set retired_at=now() where id=c.id;
   else update partner_deals.contributions set description=coalesce(item->>'description',''),amount_ore=nullif(item->>'amountOre','')::bigint where id=c.id; end if;
  end loop;
  for v in select * from partner_deals.deliverables where deal_id=d.id and retired_at is null and pending_change_id is null order by id for update loop
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
    update partner_deals.deliverables set title=btrim(item->>'title'),description=coalesce(item->>'description',''),due_date=nullif(item->>'dueDate','')::date where id=v.id;
    continue;
   end if;
   if (v.title,v.description,v.due_date) is distinct from (btrim(item->>'title'),coalesce(item->>'description',''),nullif(item->>'dueDate','')::date) and (task.title,task.description,task.deadline) is distinct from (btrim(item->>'title'),coalesce(item->>'description',''),nullif(item->>'dueDate','')::date) then raise exception 'deal_change_task_review' using errcode='40001'; end if;
   update partner_deals.deliverables set title=btrim(item->>'title'),description=coalesce(item->>'description',''),due_date=nullif(item->>'dueDate','')::date where id=v.id;
  end loop;

  select name into org from partner.organizations where id=d.organization_id for share;
  if exists(select 1 from partner_deals.contributions where pending_change_id=change_row.id) or exists(select 1 from partner_deals.deliverables where pending_change_id=change_row.id) then
   select s.* into current_season from finance.seasons s join finance.settings st on st.setting_key='current_season' and s.code=st.setting_value #>> '{}' for share of st,s;
   if current_season.id is null or current_season.status='closed' then raise exception 'deal_no_current_season' using errcode='22023'; end if;
   perform partner_deals.attach_change_funding(p_member,d.id,change_row.id);
   if exists(select 1 from partner_deals.deliverables where pending_change_id=change_row.id) then
    select name into marketing_dept from project_management.departments where season=current_season.code and name='Business & Marketing';
    if marketing_dept is null then raise exception 'deal_marketing_department_missing' using errcode='22023'; end if;
    perform dm.member_id from project_management.department_members dm join project_management.departments dep on dep.id=dm.department_id join identity.members m on m.id=dm.member_id join neon_auth."user" u on u.id=m.auth_user_id join neon_auth.account a on a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub where dep.season=current_season.code and dep.name=marketing_dept and dm.access_level='lead' and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true for share of dm,m,u,a;
    if not found then raise exception 'deal_marketing_lead_missing' using errcode='22023'; end if;
    project_id:=gen_random_uuid(); milestone_id:=gen_random_uuid();
    insert into project_management.projects(id,season,name,description,category,departments,deadline) values(project_id,current_season.code,left(org||' partnership',200),'Sponsor agreement deliverables','partnership-deliverables',array[marketing_dept],current_season.end_date);
    insert into project_management.tasks(id,season,title,description,category,project_id,deadline,status,priority,kind,partner_name) values(milestone_id,current_season.code,'Sponsor deliverables','Deliver the agreed commitments','partnership-deliverables',project_id,current_season.end_date,'todo','normal','milestone',org);
    for v in select * from partner_deals.deliverables where pending_change_id=change_row.id order by id loop
     task_id:=gen_random_uuid();
     insert into project_management.tasks(id,season,title,description,category,project_id,milestone_id,deadline,status,priority,kind,partner_name) values(task_id,current_season.code,v.title,v.description,'partnership-deliverables',project_id,milestone_id,v.due_date,'todo','normal','task',org);
     insert into partner_deals.task_links(deal_id,task_id,deliverable_id,kind) values(d.id,task_id,v.id,'marketing');
    end loop;
   end if;
   for c in select * from partner_deals.contributions where pending_change_id=change_row.id and kind='cash' and season_id=current_season.id order by id loop
    select name into finance_dept from project_management.departments where season=current_season.code and name='Finance';
    if finance_dept is null then raise exception 'deal_finance_department_missing' using errcode='22023'; end if;
    perform dm.member_id from project_management.department_members dm join project_management.departments dep on dep.id=dm.department_id join identity.members m on m.id=dm.member_id join neon_auth."user" u on u.id=m.auth_user_id join neon_auth.account a on a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub where dep.season=current_season.code and dep.name=finance_dept and dm.access_level='lead' and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true for share of dm,m,u,a;
    if not found then raise exception 'deal_finance_lead_missing' using errcode='22023'; end if;
    project_id:=gen_random_uuid();milestone_id:=gen_random_uuid();task_id:=gen_random_uuid();
    insert into project_management.projects(id,season,name,description,category,departments,deadline) values(project_id,current_season.code,left(org||' invoicing',200),'Sponsor agreement invoicing','operations',array[finance_dept],current_season.end_date);
    insert into project_management.tasks(id,season,title,description,category,project_id,deadline,status,priority,kind,partner_name) values(milestone_id,current_season.code,'Sponsor invoicing','Invoice the agreed contribution','operations',project_id,current_season.end_date,'todo','normal','milestone',org);
    insert into project_management.tasks(id,season,title,description,category,project_id,milestone_id,deadline,status,priority,kind,partner_name) values(task_id,current_season.code,left('Invoice '||org,200),'Review the agreement and invoice the partner.','operations',project_id,milestone_id,c.invoice_date,'todo','normal','task',org);
    insert into partner_deals.task_links(deal_id,task_id,season_id,contribution_id,kind) values(d.id,task_id,c.season_id,c.id,'invoice');
   end loop;
   update partner_deals.contributions set pending_change_id=null where pending_change_id=change_row.id;
   update partner_deals.deliverables set pending_change_id=null where pending_change_id=change_row.id;
  end if;
  update partner_deals.deals set title=btrim(change_row.proposed_terms->>'title'),contact_name=coalesce(change_row.proposed_terms->>'contactName',''),contact_email=coalesce(change_row.proposed_terms->>'contactEmail',''),starts_on=nullif(change_row.proposed_terms->>'startsOn','')::date,ends_on=nullif(change_row.proposed_terms->>'endsOn','')::date,agreement_link=coalesce(change_row.proposed_terms->>'agreementLink',''),revision=revision+1,updated_by_member_id=p_member,updated_at=now() where id=d.id returning * into d;
 else
  -- Finance and Marketing must handle the work before a cancellation is
  -- reconciled; reopening requires the records to be made active again.
  select name into org from partner.organizations where id=d.organization_id for share;
  for c in select * from partner_deals.contributions where deal_id=d.id and kind='cash' and retired_at is null and pending_change_id is null order by season_id,id for update loop
   select name into org from partner.organizations where id=coalesce(c.organization_id,d.organization_id) for share;
   perform pg_advisory_xact_lock(75982,hashtext(c.season_id::text));
   select status into season_state from finance.seasons where id=c.season_id for share;
   select f0.* into f from partner_deals.funding_links fl join finance.funding f0 on f0.id=fl.funding_id where fl.contribution_id=c.id for update of f0;
   if not found then raise exception 'deal_change_finance_review' using errcode='40001'; end if;
   if change_row.kind='cancellation' then
    if partner_deals.manual_funding_needs_review(c.id) and not partner_deals.manual_finance_review_ready(c.id) then raise exception 'deal_change_manual_finance_pending' using errcode='40001'; end if;
    if season_state='closed' and f.status not in ('deleted','rejected','received') and f.received_date is null then raise exception 'deal_change_closed_season' using errcode='40001'; end if;
    if f.status='received' or f.received_date is not null then
     if not coalesce(p_manual,false) then raise exception 'deal_change_manual_required' using errcode='40001'; end if;
     insert into partner_deals.manual_reconciliation_items(change_id,kind,item_id,funding_snapshot) values(change_row.id,'cash',c.id,jsonb_build_object('id',f.id,'revision',f.revision,'amountOre',f.amount_ore::text,'status',f.status,'receivedDate',f.received_date,'sourceName',f.source_name,'seasonId',f.season_id)) on conflict do nothing;
    elsif f.status not in ('deleted','rejected') then raise exception 'deal_change_cancel_finance' using errcode='40001'; end if;
   else
    if partner_deals.manual_funding_needs_review(c.id) and not partner_deals.manual_finance_review_ready(c.id) then raise exception 'deal_change_manual_finance_pending' using errcode='40001'; end if;
    if f.status not in ('secured','received') then raise exception 'deal_change_reopen_finance' using errcode='40001'; end if;
    if partner_deals.linked_funding_mismatch(c.id) and not exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=c.id) then raise exception 'deal_change_reopen_finance' using errcode='40001'; end if;
    if (f.status='received' or f.received_date is not null) and not coalesce(p_manual,false) then raise exception 'deal_change_manual_required' using errcode='40001'; end if;
   end if;
   select t.* into task from partner_deals.task_links l join project_management.tasks t on t.id=l.task_id where l.contribution_id=c.id and l.kind='invoice' for update of t;
   if found then
    if exists(select 1 from finance.seasons fs where fs.code=task.season and fs.status='closed') and ((change_row.kind='cancellation' and task.status not in ('done','cancelled')) or (change_row.kind='reopening' and task.status='cancelled')) then raise exception 'deal_change_closed_season' using errcode='40001'; end if;
    if task.status='done' then
     if not coalesce(p_manual,false) then raise exception 'deal_change_manual_required' using errcode='40001'; end if;
     insert into partner_deals.manual_reconciliation_items(change_id,kind,item_id,funding_snapshot) values(change_row.id,'cash',c.id,jsonb_build_object('id',f.id,'revision',f.revision,'amountOre',f.amount_ore::text,'status',f.status,'receivedDate',f.received_date,'sourceName',f.source_name,'seasonId',f.season_id)) on conflict do nothing;
    elsif change_row.kind='cancellation' and task.status<>'cancelled' then raise exception 'deal_change_cancel_invoice' using errcode='40001';
    elsif change_row.kind='reopening' and task.status='cancelled' then raise exception 'deal_change_reopen_invoice' using errcode='40001'; end if;
   end if;
  end loop;
  for v in select * from partner_deals.deliverables where deal_id=d.id and retired_at is null and pending_change_id is null order by id for update loop
   select t.* into task from partner_deals.task_links l join project_management.tasks t on t.id=l.task_id where l.deliverable_id=v.id and l.kind='marketing' for update of t;
   if not found then raise exception 'deal_change_task_review' using errcode='40001'; end if;
   if exists(select 1 from finance.seasons fs where fs.code=task.season and fs.status='closed') and ((change_row.kind='cancellation' and task.status not in ('done','cancelled')) or (change_row.kind='reopening' and task.status='cancelled')) then raise exception 'deal_change_closed_season' using errcode='40001'; end if;
   if task.status='done' then
    if not coalesce(p_manual,false) then raise exception 'deal_change_manual_required' using errcode='40001'; end if;
    insert into partner_deals.manual_reconciliation_items(change_id,kind,item_id) values(change_row.id,'deliverable',v.id) on conflict do nothing;
   elsif change_row.kind='cancellation' and task.status<>'cancelled' then raise exception 'deal_change_cancel_task' using errcode='40001';
   elsif change_row.kind='reopening' and task.status='cancelled' then raise exception 'deal_change_reopen_task' using errcode='40001'; end if;
  end loop;
  update partner_deals.deals set revision=revision+1,updated_by_member_id=p_member,updated_at=now() where id=d.id returning * into d;
 end if;
 update partner_deals.agreement_changes set status='resolved',resolved_by=p_member,resolved_at=now(),resolution_note=btrim(p_note) where id=change_row.id;
 insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot) values(d.id,p_member,'agreement_change_reconciled',prior,jsonb_build_object('deal',to_jsonb(d),'changeId',change_row.id,'note',btrim(p_note),'manualConfirmed',coalesce(p_manual,false)));
 return change_row.id;
end $$;

create or replace function partner_deals.record_agreement_change(p_member uuid,p_sub text,p_email text,p_deal uuid,p_revision integer,p_kind text,p_reason text,p_terms jsonb)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare d partner_deals.deals%rowtype; fields jsonb; before_fields jsonb; target uuid; item jsonb; changed_company boolean; metadata_only boolean;
begin
 perform pg_advisory_xact_lock(72704,12);
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 select * into d from partner_deals.deals where id=p_deal for update;
 if not found or d.stage<>'won' then raise exception 'deal_not_found' using errcode='P0002'; end if;
 if d.revision is distinct from p_revision then raise exception 'deal_conflict' using errcode='40001'; end if;
 fields:=coalesce(p_terms->'cardFields','{}'::jsonb);
 if p_kind='amendment' then
  if jsonb_typeof(fields)<>'object' or (fields-array['organizationId','ownerMemberId','seasonId','sponsorLevel','probability','followUpOn'])<>'{}'::jsonb then raise exception 'deal_change_invalid' using errcode='22023'; end if;
  if fields ? 'organizationId' and not exists(select 1 from partner.organizations where id=(fields->>'organizationId')::uuid) then raise exception 'deal_change_invalid' using errcode='22023'; end if;
  if fields ? 'ownerMemberId' and fields->>'ownerMemberId' is not null and not exists(select 1 from identity.members where id=(fields->>'ownerMemberId')::uuid) then raise exception 'deal_change_invalid' using errcode='22023'; end if;
  if fields ? 'seasonId' and fields->>'seasonId' is not null and (fields->>'seasonId')::uuid is distinct from d.primary_season_id and not exists(select 1 from finance.seasons where id=(fields->>'seasonId')::uuid and status<>'closed') then raise exception 'deal_change_invalid' using errcode='22023'; end if;
  if fields->>'sponsorLevel' is not null and fields->>'sponsorLevel' not in ('partner','service','bronze','silver','gold','platinum','main') then raise exception 'deal_change_invalid' using errcode='22023'; end if;
  if fields->>'probability' is not null and (jsonb_typeof(fields->'probability')<>'number' or fields->>'probability' !~ '^([0-9]|[1-9][0-9]|100)$') then raise exception 'deal_change_invalid' using errcode='22023'; end if;
  perform nullif(fields->>'followUpOn','')::date;
  for item in select value from jsonb_array_elements(coalesce(p_terms->'newCash','[]'::jsonb)) loop
   if item ? 'replacementOf' then
    if not exists(select 1 from partner_deals.contributions c where c.id=(item->>'replacementOf')::uuid and c.deal_id=d.id and c.kind='cash' and c.retired_at is null and exists(select 1 from jsonb_array_elements(p_terms->'cashChanges') old where old->>'id'=c.id::text and coalesce((old->>'retire')::boolean,false))) then raise exception 'deal_change_invalid' using errcode='22023';end if;
    if exists(select 1 from partner_deals.contributions c join partner_deals.funding_links l on l.contribution_id=c.id join finance.funding f on f.id=l.funding_id where c.id=(item->>'replacementOf')::uuid and c.season_id<>(item->>'seasonId')::uuid and (f.status='received' or f.received_date is not null)) then raise exception 'deal_change_received_season' using errcode='40001';end if;
   end if;
  end loop;
  changed_company:=fields ? 'organizationId' and (fields->>'organizationId')::uuid is distinct from d.organization_id;
  -- Company correction keeps economic cash identities. Finance must explicitly
  -- approve keeping each original funding source before the new company is applied.
  if changed_company and (jsonb_array_length(coalesce(p_terms->'newCash','[]'::jsonb))>0 or exists(select 1 from jsonb_array_elements(p_terms->'cashChanges') x join partner_deals.contributions c on c.id=(x->>'id')::uuid where (x->>'amountOre')::bigint is distinct from c.amount_ore or nullif(x->>'invoiceDate','')::date is distinct from c.invoice_date or coalesce((x->>'retire')::boolean,false))) then raise exception 'deal_change_company_cash' using errcode='22023'; end if;
 end if;
 metadata_only:=p_kind='amendment' and fields<>'{}'::jsonb
 and (select array_agg(key order by key) from jsonb_object_keys(p_terms-array['cardFields','newCash','newInKind','newDeliverables']) key)=array['agreementLink','cashChanges','contactEmail','contactName','deliverableChanges','endsOn','inKindChanges','startsOn','title']::text[]
 and (p_terms->>'title',p_terms->>'contactName',p_terms->>'contactEmail',nullif(p_terms->>'startsOn','')::date,nullif(p_terms->>'endsOn','')::date,p_terms->>'agreementLink') is not distinct from (d.title,d.contact_name,d.contact_email,d.starts_on,d.ends_on,d.agreement_link)
 and jsonb_array_length(coalesce(p_terms->'newCash','[]'::jsonb))=0 and jsonb_array_length(coalesce(p_terms->'newInKind','[]'::jsonb))=0 and jsonb_array_length(coalesce(p_terms->'newDeliverables','[]'::jsonb))=0
 and jsonb_array_length(p_terms->'cashChanges')=(select count(*) from partner_deals.contributions where deal_id=d.id and kind='cash' and retired_at is null and pending_change_id is null)
 and jsonb_array_length(p_terms->'inKindChanges')=(select count(*) from partner_deals.contributions where deal_id=d.id and kind<>'cash' and retired_at is null and pending_change_id is null)
 and jsonb_array_length(p_terms->'deliverableChanges')=(select count(*) from partner_deals.deliverables where deal_id=d.id and retired_at is null and pending_change_id is null)
 and not exists(select 1 from partner_deals.contributions c where c.deal_id=d.id and c.retired_at is null and c.pending_change_id is null and not exists(select 1 from jsonb_array_elements(case when c.kind='cash' then p_terms->'cashChanges' else p_terms->'inKindChanges' end) x where x->>'id'=c.id::text and not coalesce((x->>'retire')::boolean,false) and nullif(x->>'amountOre','')::bigint is not distinct from c.amount_ore and (case when c.kind='cash' then nullif(x->>'invoiceDate','')::date is not distinct from c.invoice_date else coalesce(x->>'description','')=c.description end)))
 and not exists(select 1 from partner_deals.deliverables v where v.deal_id=d.id and v.retired_at is null and v.pending_change_id is null and not exists(select 1 from jsonb_array_elements(p_terms->'deliverableChanges') x where x->>'id'=v.id::text and not coalesce((x->>'retire')::boolean,false) and (x->>'title',coalesce(x->>'description',''),nullif(x->>'dueDate','')::date) is not distinct from (v.title,v.description,v.due_date)));
 if changed_company and exists(select 1 from partner_deals.contributions c where c.deal_id=d.id and c.kind='cash' and c.retired_at is null and c.pending_change_id is null and not exists(select 1 from partner_deals.funding_links l where l.contribution_id=c.id)) then raise exception 'deal_change_company_missing_funding' using errcode='40001';end if;
 before_fields:=jsonb_build_object('organizationId',d.organization_id,'ownerMemberId',d.owner_member_id,'seasonId',d.primary_season_id,'sponsorLevel',d.sponsor_level,'probability',d.probability,'followUpOn',d.follow_up_on,'organizationName',(select name from partner.organizations where id=d.organization_id),'ownerName',(select full_name from identity.members where id=d.owner_member_id),'seasonCode',(select code from finance.seasons where id=d.primary_season_id));
 if metadata_only then
  if d.cancelled_at is not null or p_reason is null or length(btrim(p_reason)) not between 1 and 2000 then raise exception 'deal_change_invalid' using errcode='22023';end if;
  if exists(select 1 from partner_deals.agreement_changes where deal_id=d.id and status='pending') then raise exception 'deal_change_pending' using errcode='40001';end if;
  insert into partner_deals.agreement_changes(deal_id,kind,reason,before_terms,proposed_terms,created_by)
  values(d.id,'amendment',btrim(p_reason),p_terms-'cardFields',p_terms||jsonb_build_object('metadataOnly',true),p_member) returning id into target;
  update partner_deals.deals set revision=revision+1,updated_by_member_id=p_member,updated_at=now() where id=d.id;
  insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot) values(d.id,p_member,'agreement_change_recorded',p_terms-'cardFields',jsonb_build_object('changeId',target,'kind',p_kind,'proposedTerms',p_terms));
 else
  target:=partner_deals.record_agreement_change_before_card_fields(p_member,p_sub,p_email,p_deal,p_revision,p_kind,p_reason,p_terms-'cardFields');
 end if;
 if p_kind='amendment' and fields<>'{}'::jsonb then
  update partner_deals.agreement_changes set before_terms=before_terms||jsonb_build_object('cardFields',before_fields),proposed_terms=proposed_terms||jsonb_build_object('cardFields',fields||jsonb_build_object('organizationName',(select name from partner.organizations where id=coalesce((fields->>'organizationId')::uuid,d.organization_id)),'ownerName',(select full_name from identity.members where id=(fields->>'ownerMemberId')::uuid),'seasonCode',(select code from finance.seasons where id=(fields->>'seasonId')::uuid))) where id=target;
  if changed_company then insert into partner_deals.company_finance_reviews(change_id,contribution_id,requested_snapshot) select target,c.id,partner_deals.manual_funding_snapshot(c.id) from partner_deals.contributions c where c.deal_id=d.id and c.kind='cash' and c.retired_at is null and c.pending_change_id is null; end if;
  update partner_deals.contributions set organization_id=coalesce((fields->>'organizationId')::uuid,d.organization_id) where pending_change_id=target;
 end if;
 return target;
end $$;
create or replace function partner_deals.resolve_agreement_change(p_member uuid,p_sub text,p_email text,p_change uuid,p_note text,p_manual boolean)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare ac partner_deals.agreement_changes%rowtype; d partner_deals.deals%rowtype; fields jsonb; target uuid;
begin
 perform pg_advisory_xact_lock(72704,12);
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 select * into ac from partner_deals.agreement_changes where id=p_change;
 if not found then raise exception 'deal_not_found' using errcode='P0002'; end if;
 select * into d from partner_deals.deals where id=ac.deal_id for update;
 select * into ac from partner_deals.agreement_changes where id=p_change for update;
 if ac.status='resolved' then return ac.id; end if;
 fields:=coalesce(ac.proposed_terms->'cardFields','{}'::jsonb);
 perform pg_advisory_xact_lock(75982,hashtext(c.season_id::text)) from partner_deals.company_finance_reviews r join partner_deals.contributions c on c.id=r.contribution_id where r.change_id=ac.id order by c.season_id;
 perform f.id from partner_deals.company_finance_reviews r join partner_deals.funding_links l on l.contribution_id=r.contribution_id join finance.funding f on f.id=l.funding_id where r.change_id=ac.id order by f.id for update of f;
 if ac.kind='amendment' and fields ? 'organizationId' then
  if (fields->>'organizationId')::uuid is distinct from d.organization_id and exists(select 1 from partner_deals.company_finance_reviews r where r.change_id=ac.id and (r.reviewed_snapshot is null or r.reviewed_snapshot is distinct from partner_deals.manual_funding_snapshot(r.contribution_id))) then raise exception 'deal_change_company_finance_pending' using errcode='40001';end if;
  update partner_deals.deals set organization_id=(fields->>'organizationId')::uuid where id=d.id;
 end if;
 if ac.proposed_terms->>'metadataOnly'='true' then
  if ac.withdrawn_at is not null or d.cancelled_at is not null then raise exception 'deal_change_conflict' using errcode='40001';end if;
  if p_note is null or length(btrim(p_note)) not between 1 and 2000 then raise exception 'deal_change_invalid' using errcode='22023';end if;
  update partner_deals.agreement_changes set status='resolved',resolved_by=p_member,resolved_at=now(),resolution_note=btrim(p_note) where id=ac.id;
  update partner_deals.deals set revision=revision+1,updated_by_member_id=p_member,updated_at=now() where id=d.id;
  target:=ac.id;
 else
  target:=partner_deals.resolve_agreement_change_before_card_fields(p_member,p_sub,p_email,p_change,p_note,p_manual);
 end if;
 if exists(select 1 from partner_deals.company_finance_reviews r where r.change_id=ac.id and (r.reviewed_snapshot is null or r.reviewed_snapshot is distinct from partner_deals.manual_funding_snapshot(r.contribution_id))) then raise exception 'deal_change_company_finance_pending' using errcode='40001';end if;
 if ac.kind='amendment' then
  update partner_deals.deals set owner_member_id=case when fields ? 'ownerMemberId' then (fields->>'ownerMemberId')::uuid else owner_member_id end,
   primary_season_id=case when fields ? 'seasonId' then (fields->>'seasonId')::uuid else primary_season_id end,
   sponsor_level=case when fields ? 'sponsorLevel' then fields->>'sponsorLevel' else sponsor_level end,
   probability=case when fields ? 'probability' then (fields->>'probability')::integer else probability end,
   follow_up_on=case when fields ? 'followUpOn' then (fields->>'followUpOn')::date else follow_up_on end where id=d.id;
  if fields<>'{}'::jsonb then insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot) values(d.id,p_member,'won_card_fields_reconciled',ac.before_terms->'cardFields',fields); end if;
 end if;
 return target;
end $$;
create table partner_deals.company_finance_reviews (
 id uuid primary key default gen_random_uuid(), change_id uuid not null references partner_deals.agreement_changes(id),
 contribution_id uuid not null references partner_deals.contributions(id), requested_snapshot jsonb not null,
 reviewed_snapshot jsonb, reviewed_by uuid references identity.members(id), reviewed_at timestamptz,
 unique(change_id,contribution_id)
);
alter table partner_deals.company_finance_reviews enable row level security;
revoke all on partner_deals.company_finance_reviews from public;

alter function partner_deals.finance_review_queue(uuid,text,text) rename to finance_review_queue_before_company;
create function partner_deals.finance_review_queue(p_member uuid,p_sub text,p_email text) returns jsonb language plpgsql stable set search_path=pg_catalog as $$
declare result jsonb; extra jsonb;
begin
 result:=partner_deals.finance_review_queue_before_company(p_member,p_sub,p_email);
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'partner',o.name||' → '||target.name,'season',s.code,'amountOre',c.amount_ore::text,'manualFunding',true,'companyChange',true,'candidates','[]'::jsonb,
 'linkedFunding',jsonb_build_object('id',f.id,'revision',f.revision,'reference',f.public_ref,'status',f.status,'amountOre',f.amount_ore::text,'matchesAgreement',true,'canUnlink',false))),'[]'::jsonb) into extra
 from partner_deals.company_finance_reviews r join partner_deals.agreement_changes ac on ac.id=r.change_id
 join partner_deals.contributions c on c.id=r.contribution_id join partner_deals.deals d on d.id=c.deal_id
 join partner.organizations o on o.id=coalesce(c.organization_id,d.organization_id)
 join partner.organizations target on target.id=(ac.proposed_terms->'cardFields'->>'organizationId')::uuid
 join finance.seasons s on s.id=c.season_id join partner_deals.funding_links l on l.contribution_id=c.id join finance.funding f on f.id=l.funding_id
 where ac.status='pending' and ac.withdrawn_at is null and (r.reviewed_snapshot is null or r.reviewed_snapshot is distinct from partner_deals.manual_funding_snapshot(c.id));
 return result||extra;
end $$;
alter function partner_deals.resolve_finance_review(uuid,text,text,uuid,text,uuid,integer,jsonb) rename to resolve_finance_review_before_company;
create function partner_deals.resolve_finance_review(p_member uuid,p_sub text,p_email text,p_review uuid,p_action text,p_funding uuid,p_revision integer,p_snapshot jsonb)
returns void language plpgsql set search_path=pg_catalog as $$
declare r partner_deals.company_finance_reviews%rowtype; ac partner_deals.agreement_changes%rowtype; f finance.funding%rowtype; snap jsonb;
begin
 select * into r from partner_deals.company_finance_reviews where id=p_review;
 if not found then perform partner_deals.resolve_finance_review_before_company(p_member,p_sub,p_email,p_review,p_action,p_funding,p_revision,p_snapshot);return;end if;
 perform pg_advisory_xact_lock(72704,12);
 perform partner_deals.lock_actor(p_member);
 if not partner_deals.finance_reviewer(p_member,p_sub,p_email) then raise exception 'deal_funding_forbidden' using errcode='42501'; end if;
 select * into ac from partner_deals.agreement_changes where id=r.change_id;
 perform 1 from partner_deals.deals where id=ac.deal_id for update;
 select * into ac from partner_deals.agreement_changes where id=r.change_id for update;
 select * into r from partner_deals.company_finance_reviews where id=p_review for update;
 select x.* into f from partner_deals.funding_links l join finance.funding x on x.id=l.funding_id where l.contribution_id=r.contribution_id for update of x;
 if not found or ac.status<>'pending' or ac.withdrawn_at is not null or p_action<>'verified' or f.id is distinct from p_funding or f.revision is distinct from p_revision then raise exception 'deal_review_changed' using errcode='40001';end if;
 snap:=partner_deals.manual_funding_snapshot(r.contribution_id);
 if not partner_deals.manual_funding_record_valid(r.contribution_id,f.id) then raise exception 'deal_review_changed' using errcode='40001';end if;
 update partner_deals.company_finance_reviews set reviewed_snapshot=snap,reviewed_by=p_member,reviewed_at=now() where id=r.id;
 insert into partner_deals.audit(deal_id,actor_member_id,action,after_snapshot) values(ac.deal_id,p_member,'company_funding_reviewed',jsonb_build_object('changeId',ac.id,'contributionId',r.contribution_id,'fundingSnapshot',snap));
end $$;

create or replace function partner_deals.rename_organization(p_member uuid,p_sub text,p_email text,p_org uuid,p_revision integer,p_name text)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare version integer; previous text;
begin
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 200 or p_revision is null or p_revision < 0 then raise exception 'deal_invalid' using errcode='22023'; end if;
 select name into previous from partner.organizations where id=p_org for update;
 if not found then raise exception 'deal_not_found' using errcode='P0002'; end if;
 if previous is distinct from btrim(p_name) and exists(select 1 from partner_deals.deals d join partner_deals.contributions c on c.deal_id=d.id join partner_deals.funding_links l on l.contribution_id=c.id where coalesce(c.organization_id,d.organization_id)=p_org) then raise exception 'deal_linked_organization' using errcode='55000'; end if;
 insert into partner_deals.organization_versions(organization_id) values(p_org) on conflict do nothing;
 select revision into version from partner_deals.organization_versions where organization_id=p_org for update;
 if version <> p_revision then raise exception 'deal_conflict' using errcode='40001'; end if;
 update partner.organizations set name=btrim(p_name) where id=p_org;
 update partner_deals.organization_versions set revision=revision+1 where organization_id=p_org;
 insert into partner_deals.organization_audit(organization_id,actor_member_id,action,snapshot) values(p_org,p_member,'renamed',jsonb_build_object('before',previous,'after',btrim(p_name)));
 return p_org;
end $$;
alter table partner_deals.company_finance_reviews add column requested_at timestamptz not null default now();
alter table partner_deals.review_notification_events alter column review_id drop not null;
alter table partner_deals.review_notification_events add column company_review_id uuid references partner_deals.company_finance_reviews(id);
alter table partner_deals.review_notification_events add constraint review_notification_one_source check ((review_id is not null)::integer+(company_review_id is not null)::integer=1);
create unique index company_review_notification_event_unique on partner_deals.review_notification_events(company_review_id,kind,event_time) where company_review_id is not null;
create function partner_deals.emit_company_review_notification() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 if tg_op='INSERT' or old.requested_at is distinct from new.requested_at then
  insert into partner_deals.review_notification_events(company_review_id,kind,event_time) values(new.id,'requested',new.requested_at) on conflict do nothing;
 end if;
 if new.reviewed_at is not null and (tg_op='INSERT' or old.reviewed_at is distinct from new.reviewed_at) then
  insert into partner_deals.review_notification_events(company_review_id,kind,event_time) values(new.id,'resolved',new.reviewed_at) on conflict do nothing;
 end if;
 return new;
end $$;
create trigger emit_company_review_notification after insert or update on partner_deals.company_finance_reviews for each row execute function partner_deals.emit_company_review_notification();
alter function partner_deals.review_notifications(uuid,text,text) rename to review_notifications_before_company;
create function partner_deals.review_notifications(p_member uuid,p_sub text,p_email text) returns jsonb language sql stable set search_path=pg_catalog as $$
 select partner_deals.review_notifications_before_company(p_member,p_sub,p_email)||coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'createdAt',n.event_time,
  'title',case when n.kind='requested' then 'Sponsor company review requested' else 'Sponsor company review completed' end,
  'description',case when n.kind='requested' then 'Business requested review of the original funding for a company correction.' else 'Finance reviewed the original funding. Return to the agreement to continue.' end,
  'href',case when n.kind='requested' then '/finance/sponsor-reviews' else '/partner-deals?deal='||ac.deal_id::text end,'variant','info') order by n.event_time desc,n.id)
 from partner_deals.review_notification_events n join partner_deals.company_finance_reviews r on r.id=n.company_review_id
 join partner_deals.agreement_changes ac on ac.id=r.change_id
 where ac.status='pending' and ac.withdrawn_at is null and not exists(select 1 from partner_deals.review_notification_reads seen where seen.notification_id=n.id and seen.member_id=p_member)
 and ((n.kind='requested' and n.event_time=r.requested_at and (r.reviewed_snapshot is null or r.reviewed_snapshot is distinct from partner_deals.manual_funding_snapshot(r.contribution_id)) and partner_deals.finance_reviewer(p_member,p_sub,p_email))
 or (n.kind='resolved' and n.event_time=r.reviewed_at and r.reviewed_snapshot=partner_deals.manual_funding_snapshot(r.contribution_id) and coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false)))),'[]'::jsonb)
$$;
alter function partner_deals.request_finance_review(uuid,text,text,uuid,integer) rename to request_finance_review_before_company;
create function partner_deals.request_finance_review(p_member uuid,p_sub text,p_email text,p_deal uuid,p_revision integer) returns integer language plpgsql set search_path=pg_catalog as $$
declare total integer:=0; normal integer:=0; d partner_deals.deals%rowtype;
begin
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501';end if;
 select * into d from partner_deals.deals where id=p_deal for update;
 if not found then raise exception 'deal_not_found' using errcode='P0002';end if;
 if d.revision is distinct from p_revision then raise exception 'deal_conflict' using errcode='40001';end if;
 update partner_deals.company_finance_reviews r set requested_at=now(),reviewed_snapshot=null,reviewed_at=null,reviewed_by=null
 from partner_deals.agreement_changes ac where ac.id=r.change_id and ac.deal_id=d.id and ac.status='pending' and ac.withdrawn_at is null
 and (r.reviewed_snapshot is null or r.reviewed_snapshot is distinct from partner_deals.manual_funding_snapshot(r.contribution_id));
 get diagnostics total=row_count;
 begin
  normal:=partner_deals.request_finance_review_before_company(p_member,p_sub,p_email,p_deal,p_revision);
 exception when sqlstate '22023' then if sqlerrm<>'deal_review_no_matches' or total=0 then raise;end if;
 end;
 return total+normal;
end $$;

revoke all on all functions in schema partner_deals from public;
commit;
