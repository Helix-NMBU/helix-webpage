-- Serialize application finance changes with duplicate checks and protect linked records.
begin;
-- Every funding mutation enters the same season lock before taking funding rows.
-- The original function remains an implementation detail of this wrapper.
alter function finance.apply_funding_change(uuid,uuid,text,jsonb,boolean) rename to apply_funding_change_unserialized;
create function finance.apply_funding_change(p_actor_member_id uuid,p_request_id uuid,p_payload_hash text,p_command jsonb,p_include_draft boolean)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare season_id uuid; locked_season_id uuid;
begin
 select s.id into season_id from finance.settings st join finance.seasons s on s.code=st.setting_value #>> '{}' where st.setting_key='current_season';
 if season_id is not null then
   perform pg_advisory_xact_lock(75982,hashtext(season_id::text));
   -- Pin the current setting only after taking the season lock. This prevents
   -- a concurrent switch from moving the underlying mutation to another season.
   select s.id into locked_season_id from finance.settings st join finance.seasons s on s.code=st.setting_value #>> '{}'
     where st.setting_key='current_season' for share of st;
   if locked_season_id is distinct from season_id then raise exception 'finance:SEASON_CHANGED' using errcode='40001'; end if;
 end if;
 return finance.apply_funding_change_unserialized(p_actor_member_id,p_request_id,p_payload_hash,p_command,p_include_draft);
end $$;
revoke all on function finance.apply_funding_change(uuid,uuid,text,jsonb,boolean) from public;
revoke all on function finance.apply_funding_change_unserialized(uuid,uuid,text,jsonb,boolean) from public;
-- Matching and insertion must share the season lock with finance updates.
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
 for c in select * from partner_deals.contributions where deal_id=p_deal and kind='cash' order by season_id,id for update loop
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
drop function partner_deals.prepare_funding_link(uuid,text,text,uuid,uuid);
create function partner_deals.prepare_funding_link(p_member uuid,p_sub text,p_email text,p_contribution uuid,p_funding uuid,p_expected_revision integer)
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
 select name into org from partner.organizations where id=d.organization_id for share;
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

revoke all on function partner_deals.prepare_funding_link(uuid,text,text,uuid,uuid,integer) from public;
create or replace function partner_deals.rename_organization(p_member uuid,p_sub text,p_email text,p_org uuid,p_revision integer,p_name text)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare version integer; previous text;
begin
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 200 or p_revision is null or p_revision < 0 then raise exception 'deal_invalid' using errcode='22023'; end if;
 select name into previous from partner.organizations where id=p_org for update;
 if not found then raise exception 'deal_not_found' using errcode='P0002'; end if;
 if previous is distinct from btrim(p_name) and exists(select 1 from partner_deals.deals d join partner_deals.contributions c on c.deal_id=d.id join partner_deals.funding_links l on l.contribution_id=c.id where d.organization_id=p_org) then raise exception 'deal_linked_organization' using errcode='55000'; end if;
 insert into partner_deals.organization_versions(organization_id) values(p_org) on conflict do nothing;
 select revision into version from partner_deals.organization_versions where organization_id=p_org for update;
 if version <> p_revision then raise exception 'deal_conflict' using errcode='40001'; end if;
 update partner.organizations set name=btrim(p_name) where id=p_org;
 update partner_deals.organization_versions set revision=revision+1 where organization_id=p_org;
 insert into partner_deals.organization_audit(organization_id,actor_member_id,action,snapshot) values(p_org,p_member,'renamed',jsonb_build_object('before',previous,'after',btrim(p_name)));
 return p_org;
end $$;
commit;
