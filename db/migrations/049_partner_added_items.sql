begin;
alter table partner_deals.agreement_changes add column withdrawn_at timestamptz;
alter table partner_deals.contributions add column pending_change_id uuid references partner_deals.agreement_changes(id);
alter table partner_deals.deliverables add column pending_change_id uuid references partner_deals.agreement_changes(id);
create or replace function partner_deals.record_agreement_change(p_member uuid,p_sub text,p_email text,p_deal uuid,p_revision integer,p_kind text,p_reason text,p_terms jsonb)
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
   if item_id is null or item_id=any(seen) or coalesce(item->>'amountOre','') !~ '^[1-9][0-9]{0,17}$' or nullif(item->>'invoiceDate','') is null or not exists(select 1 from finance.seasons where id=(item->>'seasonId')::uuid and status<>'closed') or exists(select 1 from partner_deals.contributions where deal_id=d.id and season_id=(item->>'seasonId')::uuid and kind='cash' and retired_at is null) then raise exception 'deal_change_invalid' using errcode='22023'; end if;
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

create or replace function partner_deals.attach_won_funding(p_member uuid,p_deal uuid)
returns void language plpgsql set search_path=pg_catalog as $$
declare d partner_deals.deals%rowtype; c partner_deals.contributions%rowtype; f finance.funding%rowtype;
 org text; owner_name text; season_code text; season_state text; refnum bigint; ref text; target uuid; changed boolean:=false; candidates jsonb; approved jsonb;
begin
 select * into d from partner_deals.deals where id=p_deal for update;
 if not found or d.stage not in ('lead','contacted','discussion','proposal','won') then raise exception 'deal_funding_invalid' using errcode='22023'; end if;
 select name into org from partner.organizations where id=d.organization_id for share;
 select full_name into owner_name from identity.members where id=coalesce(d.owner_member_id,p_member);
 if nullif(btrim(owner_name),'') is null then raise exception 'deal_funding_invalid_owner' using errcode='22023'; end if;
 for c in select * from partner_deals.contributions where deal_id=p_deal and kind='cash' and retired_at is null and not exists(select 1 from partner_deals.manual_reconciliation_items mr where mr.kind='cash' and mr.item_id=partner_deals.contributions.id) order by season_id,id for update loop
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
 for c in select * from partner_deals.contributions where deal_id=d.id and kind='cash' and (d.stage<>'won' or (pending_change_id is not null and exists(select 1 from partner_deals.agreement_changes ac where ac.id=pending_change_id and ac.deal_id=d.id and ac.status='pending'))) order by season_id,id for update loop
  perform pg_advisory_xact_lock(75982,hashtext(c.season_id::text));
  if (not exists(select 1 from partner_deals.funding_links where contribution_id=c.id) and jsonb_array_length(partner_deals.funding_candidate_snapshot(c.id))>0) or partner_deals.linked_funding_mismatch(c.id) then
   insert into partner_deals.finance_reviews(contribution_id,organization_name,season_id,amount_ore,status,requested_by)
   values(c.id,org,c.season_id,c.amount_ore,'pending',p_member)
   on conflict(contribution_id) do update set organization_name=excluded.organization_name,season_id=excluded.season_id,amount_ore=excluded.amount_ore,status='pending',requested_by=excluded.requested_by,requested_at=now(),resolved_by=null,resolved_at=null,last_unlinked_funding_id=null
    where (partner_deals.finance_reviews.organization_name,partner_deals.finance_reviews.season_id,partner_deals.finance_reviews.amount_ore) is distinct from (excluded.organization_name,excluded.season_id,excluded.amount_ore)
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
   'candidates',partner_deals.funding_candidate_snapshot(c.id),
   'linkedFunding',case when partner_deals.linked_funding_mismatch(c.id) then
     (select jsonb_build_object('id',f.id,'revision',f.revision,'reference',f.public_ref,'status',f.status,'amountOre',f.amount_ore::text) from partner_deals.funding_links l join finance.funding f on f.id=l.funding_id where l.contribution_id=c.id) else null end) order by r.requested_at,r.id),'[]'::jsonb) into result
 from partner_deals.finance_reviews r join partner_deals.contributions c on c.id=r.contribution_id
 join partner_deals.deals d on d.id=c.deal_id join partner.organizations o on o.id=d.organization_id
 join finance.seasons s on s.id=c.season_id
 where r.status='pending' and (d.stage not in ('won','lost') or (d.stage='won' and d.cancelled_at is null and c.pending_change_id is not null and exists(select 1 from partner_deals.agreement_changes ac where ac.id=c.pending_change_id and ac.deal_id=d.id and ac.status='pending'))) and c.kind='cash'
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
 if not found or (d.stage='lost' or (d.stage='won' and not (d.cancelled_at is null and c.pending_change_id is not null and exists(select 1 from partner_deals.agreement_changes ac where ac.id=c.pending_change_id and ac.deal_id=d.id and ac.status='pending')))) or c.kind<>'cash' or (r.organization_name,r.season_id,r.amount_ore) is distinct from (org,c.season_id,c.amount_ore) then raise exception 'deal_review_changed' using errcode='40001'; end if;
 if r.last_unlinked_funding_id=p_funding and p_action='unlink' and not exists(select 1 from partner_deals.funding_links where contribution_id=c.id) then return; end if;
 if r.status='linked' and p_action='link' and exists(select 1 from partner_deals.funding_links where contribution_id=c.id and funding_id=p_funding) then return; end if;
 if r.status='separate' and p_action='separate' and exists(select 1 from partner_deals.separate_funding_approvals where contribution_id=c.id and candidate_snapshot=p_snapshot) then return; end if;
 if r.status<>'pending' then raise exception 'deal_review_changed' using errcode='40001'; end if;
 perform pg_advisory_xact_lock(75982,hashtext(c.season_id::text));
 select status into state from finance.seasons where id=c.season_id for update;
 if state='closed' then raise exception 'deal_funding_closed' using errcode='42501'; end if;
 if p_action='unlink' then
  select f0.* into f from partner_deals.funding_links l join finance.funding f0 on f0.id=l.funding_id where l.contribution_id=c.id for update of f0;
  if not found or f.id is distinct from p_funding or f.revision is distinct from p_revision or not partner_deals.linked_funding_mismatch(c.id) then raise exception 'deal_review_changed' using errcode='40001'; end if;
  delete from partner_deals.funding_links where contribution_id=c.id and funding_id=f.id;
  perform finance.audit_change(p_member,'funding',f.id::text,'partner_deal_link',d.id::text,null);
  snapshot:=partner_deals.funding_candidate_snapshot(c.id);
  if jsonb_array_length(snapshot)>0 then
   update partner_deals.finance_reviews set status='pending',last_unlinked_funding_id=f.id,resolved_by=null,resolved_at=null where id=r.id;
  else
   update partner_deals.finance_reviews set status='unlinked',last_unlinked_funding_id=f.id,resolved_by=p_member,resolved_at=now() where id=r.id;
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
 update partner_deals.finance_reviews set status=case when p_action='link' then 'linked' else 'separate' end,resolved_by=p_member,resolved_at=now() where id=r.id;
 insert into partner_deals.audit(deal_id,actor_member_id,action,after_snapshot) values(d.id,p_member,'finance_review_resolved',jsonb_build_object('contributionId',c.id,'resolution',p_action));
end $$;
create or replace function partner_deals.resolve_agreement_change(p_member uuid,p_sub text,p_email text,p_change uuid,p_note text,p_manual boolean)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare change_row partner_deals.agreement_changes%rowtype; d partner_deals.deals%rowtype; target_deal uuid; prior jsonb; item jsonb; c partner_deals.contributions%rowtype; v partner_deals.deliverables%rowtype; f finance.funding%rowtype; task project_management.tasks%rowtype; new_amount bigint; new_date date; org text; current_season finance.seasons%rowtype; project_id uuid; milestone_id uuid; task_id uuid; finance_dept text; marketing_dept text;
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
    continue;
   end if;
   if (v.title,v.description,v.due_date) is distinct from (btrim(item->>'title'),coalesce(item->>'description',''),nullif(item->>'dueDate','')::date) and (task.title,task.description,task.deadline) is distinct from (btrim(item->>'title'),coalesce(item->>'description',''),nullif(item->>'dueDate','')::date) then raise exception 'deal_change_task_review' using errcode='40001'; end if;
   update partner_deals.deliverables set title=btrim(item->>'title'),description=coalesce(item->>'description',''),due_date=nullif(item->>'dueDate','')::date where id=v.id;
  end loop;

  if exists(select 1 from partner_deals.contributions where pending_change_id=change_row.id) or exists(select 1 from partner_deals.deliverables where pending_change_id=change_row.id) then
   select s.* into current_season from finance.seasons s join finance.settings st on st.setting_key='current_season' and s.code=st.setting_value #>> '{}' for share of st,s;
   if current_season.id is null or current_season.status='closed' then raise exception 'deal_no_current_season' using errcode='22023'; end if;
   perform partner_deals.attach_won_funding(p_member,d.id);
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
  if exists(select 1 from partner_deals.contributions cc where cc.deal_id=d.id and cc.kind='cash' and cc.retired_at is null and (not exists(select 1 from partner_deals.funding_links fl where fl.contribution_id=cc.id) or partner_deals.linked_funding_mismatch(cc.id))) then raise exception 'deal_funding_mismatch' using errcode='40001'; end if;
  update partner_deals.deals set revision=revision+1,updated_by_member_id=p_member,updated_at=now() where id=d.id returning * into d;
 end if;
 update partner_deals.agreement_changes set status='resolved',resolved_by=p_member,resolved_at=now(),resolution_note=btrim(p_note) where id=change_row.id;
 insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot) values(d.id,p_member,'agreement_change_reconciled',prior,jsonb_build_object('deal',to_jsonb(d),'changeId',change_row.id,'note',btrim(p_note),'manualConfirmed',coalesce(p_manual,false)));
 return change_row.id;
end $$;
create function partner_deals.withdraw_agreement_change(p_member uuid,p_sub text,p_email text,p_change uuid,p_note text)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare change_row partner_deals.agreement_changes%rowtype; d partner_deals.deals%rowtype; target uuid; c partner_deals.contributions%rowtype; f uuid;
begin
 perform pg_advisory_xact_lock(72704,12);
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 select deal_id into target from partner_deals.agreement_changes where id=p_change;
 if target is null then raise exception 'deal_not_found' using errcode='P0002'; end if;
 select * into d from partner_deals.deals where id=target for update;
 select * into change_row from partner_deals.agreement_changes where id=p_change and deal_id=d.id for update;
 if change_row.withdrawn_at is not null then return change_row.id; end if;
 if change_row.kind<>'amendment' or change_row.status<>'pending' then raise exception 'deal_change_conflict' using errcode='40001'; end if;
 if p_note is null or length(btrim(p_note)) not between 1 and 2000 then raise exception 'deal_change_invalid' using errcode='22023'; end if;
 perform 1 from partner.organizations where id=d.organization_id for share;
 for c in select * from partner_deals.contributions where pending_change_id=change_row.id order by season_id,id for update loop
  perform pg_advisory_xact_lock(75982,hashtext(c.season_id::text));
  select funding_id into f from partner_deals.funding_links where contribution_id=c.id;
  if f is not null then
   perform 1 from finance.funding where id=f for update;
   delete from partner_deals.funding_links where contribution_id=c.id and funding_id=f;
   perform finance.audit_change(p_member,'funding',f::text,'partner_deal_link',d.id::text,null);
  end if;
  update partner_deals.contributions set retired_at=now() where id=c.id;
 end loop;
 update partner_deals.deliverables set retired_at=now() where pending_change_id=change_row.id;
 update partner_deals.agreement_changes set status='resolved',withdrawn_at=now(),resolved_by=p_member,resolved_at=now(),resolution_note=btrim(p_note) where id=change_row.id;
 update partner_deals.deals set revision=revision+1,updated_by_member_id=p_member,updated_at=now() where id=d.id;
 insert into partner_deals.audit(deal_id,actor_member_id,action,after_snapshot) values(d.id,p_member,'agreement_change_withdrawn',jsonb_build_object('changeId',change_row.id,'note',btrim(p_note)));
 return change_row.id;
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
 where (d.stage not in ('won','lost') or (d.stage='won' and d.cancelled_at is null and c.pending_change_id is not null and exists(select 1 from partner_deals.agreement_changes ac where ac.id=c.pending_change_id and ac.deal_id=d.id and ac.status='pending'))) and c.kind='cash'
   and (r.organization_name,r.season_id,r.amount_ore)=(o.name,c.season_id,c.amount_ore)
   and not exists(select 1 from partner_deals.review_notification_reads seen where seen.notification_id=n.id and seen.member_id=p_member)
   and (
    (n.kind='requested' and r.status='pending' and n.event_time=r.requested_at and partner_deals.finance_reviewer(p_member,p_sub,p_email)
      and (jsonb_array_length(partner_deals.funding_candidate_snapshot(c.id))>0 or partner_deals.linked_funding_mismatch(c.id)))
    or
    (n.kind='resolved' and n.event_time=r.resolved_at
       and coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false)
       and ((r.status='linked' and not partner_deals.linked_funding_mismatch(c.id))
         or (r.status='separate' and (select a.candidate_snapshot from partner_deals.separate_funding_approvals a where a.contribution_id=c.id)=partner_deals.funding_candidate_snapshot(c.id))
         or (r.status='unlinked' and not exists(select 1 from partner_deals.funding_links l where l.contribution_id=c.id) and jsonb_array_length(partner_deals.funding_candidate_snapshot(c.id))=0)))
   )
$$;

revoke all on all functions in schema partner_deals from public;
commit;
