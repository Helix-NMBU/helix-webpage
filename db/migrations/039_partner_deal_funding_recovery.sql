-- Finance-authorized duplicate reconciliation, without exposing the finance register to pipeline readers.
begin;
create table partner_deals.separate_funding_approvals (
 contribution_id uuid primary key references partner_deals.contributions(id) on delete cascade,
 candidate_snapshot jsonb not null check (jsonb_typeof(candidate_snapshot)='array'),
 approved_by_member_id uuid not null references identity.members(id), approved_at timestamptz not null default now()
);
alter table partner_deals.separate_funding_approvals enable row level security;
revoke all on partner_deals.separate_funding_approvals from public;

-- An explicit link or unlink supersedes a previous create-separate decision.
create function partner_deals.clear_separate_approval_on_link() returns trigger language plpgsql set search_path=pg_catalog as $$
begin
 delete from partner_deals.separate_funding_approvals where contribution_id=case when tg_op='DELETE' then old.contribution_id else new.contribution_id end;
 return null;
end $$;
create trigger partner_deals_clear_separate_approval after insert or delete on partner_deals.funding_links
for each row execute function partner_deals.clear_separate_approval_on_link();

-- Internal helper; candidate revisions make any later finance edit invalidate approval.
create function partner_deals.funding_candidate_snapshot(p_contribution uuid) returns jsonb language sql stable set search_path=pg_catalog as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'revision',f.revision,'reference',f.public_ref,
   'status',f.status,'amountOre',f.amount_ore::text,'expectedDate',f.expected_date) order by f.id),'[]'::jsonb)
 from partner_deals.contributions c join partner_deals.deals d on d.id=c.deal_id
 join partner.organizations o on o.id=d.organization_id
 join finance.funding f on f.season_id=c.season_id and f.funding_type='sponsor_cash'
  and f.status not in ('deleted','rejected') and lower(btrim(f.source_name))=lower(btrim(o.name))
 where c.id=p_contribution and c.kind='cash'
 and not exists(select 1 from partner_deals.funding_links l where l.funding_id=f.id)
$$;

create function partner_deals.funding_candidates(p_member uuid,p_sub text,p_email text,p_contribution uuid)
returns jsonb language plpgsql set search_path=pg_catalog as $$
declare c partner_deals.contributions%rowtype; d partner_deals.deals%rowtype; linked uuid;
begin
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false)
   or not coalesce((finance.capability_flags(p_member)->>'manageFunding')::boolean,false)
 then raise exception 'deal_funding_forbidden' using errcode='42501'; end if;
 select * into c from partner_deals.contributions where id=p_contribution;
 if not found or c.kind<>'cash' then raise exception 'deal_funding_invalid' using errcode='22023'; end if;
 select * into d from partner_deals.deals where id=c.deal_id;
 if d.stage='won' then raise exception 'deal_funding_won_locked' using errcode='22023'; end if;
 select funding_id into linked from partner_deals.funding_links where contribution_id=c.id;
 return jsonb_build_object('contributionId',c.id,'amountOre',c.amount_ore::text,'linkedFundingId',linked,
   'candidates',partner_deals.funding_candidate_snapshot(c.id));
end $$;

create function partner_deals.approve_separate_funding(p_member uuid,p_sub text,p_email text,p_contribution uuid,p_snapshot jsonb)
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
 perform 1 from finance.funding f join partner.organizations o on o.id=d.organization_id
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
create or replace function partner_deals.attach_won_funding(p_member uuid,p_deal uuid)
returns void language plpgsql set search_path=pg_catalog as $$
declare d partner_deals.deals%rowtype; c partner_deals.contributions%rowtype; f finance.funding%rowtype;
 org text; owner_name text; season_code text; season_state text; refnum bigint; ref text; target uuid; changed boolean:=false; candidates jsonb; approved jsonb;
begin
 select * into d from partner_deals.deals where id=p_deal for update;
 if not found or d.stage not in ('lead','contacted','discussion','proposal','won') then raise exception 'deal_funding_invalid' using errcode='22023'; end if;
 select name into org from partner.organizations where id=d.organization_id;
 select full_name into owner_name from identity.members where id=coalesce(d.owner_member_id,p_member);
 if nullif(btrim(owner_name),'') is null then raise exception 'deal_funding_invalid_owner' using errcode='22023'; end if;
 for c in select * from partner_deals.contributions where deal_id=p_deal and kind='cash' order by season_id,id for update loop
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
revoke all on function partner_deals.clear_separate_approval_on_link() from public;
revoke all on function partner_deals.funding_candidate_snapshot(uuid) from public;
revoke all on function partner_deals.funding_candidates(uuid,text,text,uuid) from public;
revoke all on function partner_deals.approve_separate_funding(uuid,text,text,uuid,jsonb) from public;
revoke all on function partner_deals.attach_won_funding(uuid,uuid) from public;
commit;
