-- A narrow transactional bridge from a confirmed sponsor deal to finance funding.
-- It is called only by the authorized Won transition, in its transaction.
begin;
create table partner_deals.funding_links (
  contribution_id uuid primary key references partner_deals.contributions(id) on delete restrict,
  funding_id uuid not null unique references finance.funding(id) on delete restrict,
  linked_by_member_id uuid not null references identity.members(id),
  linked_at timestamptz not null default now()
);
alter table partner_deals.funding_links enable row level security;
revoke all on partner_deals.funding_links from public;

-- Explicit linking does not change financial state and requires existing finance authority.
-- Actor, deal and funding are locked and checked at the database boundary.
create function partner_deals.prepare_funding_link(p_member uuid,p_sub text,p_email text,p_contribution uuid,p_funding uuid)
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
 select name into org from partner.organizations where id=d.organization_id;
 select * into f from finance.funding where id=p_funding for update;
 if not found or f.season_id<>c.season_id or f.amount_ore<>c.amount_ore or f.funding_type<>'sponsor_cash'
   or f.status not in ('secured','received') or lower(btrim(f.source_name))<>lower(btrim(org))
 then raise exception 'deal_funding_mismatch' using errcode='22023'; end if;
 if exists(select 1 from partner_deals.funding_links where contribution_id=c.id and funding_id=f.id) then return; end if;
 insert into partner_deals.funding_links(contribution_id,funding_id,linked_by_member_id) values(c.id,f.id,p_member);
 perform finance.audit_change(p_member,'funding',f.id::text,'partner_deal_link',null,d.id::text);
end $$;

-- A mistaken draft association can be removed without modifying finance.
create function partner_deals.remove_funding_link(p_member uuid,p_sub text,p_email text,p_contribution uuid)
returns void language plpgsql set search_path=pg_catalog as $$
declare c partner_deals.contributions%rowtype; d partner_deals.deals%rowtype; target uuid;
begin
 perform partner_deals.lock_actor(p_member);
 perform 1 from finance.member_grants where member_id=p_member for share;
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false)
   or not coalesce((finance.capability_flags(p_member)->>'manageFunding')::boolean,false)
 then raise exception 'deal_funding_forbidden' using errcode='42501'; end if;
 select * into c from partner_deals.contributions where id=p_contribution;
 if not found then raise exception 'deal_funding_invalid' using errcode='22023'; end if;
 select * into d from partner_deals.deals where id=c.deal_id for update;
 if d.stage='won' then raise exception 'deal_funding_won_locked' using errcode='22023'; end if;
 delete from partner_deals.funding_links where contribution_id=p_contribution returning funding_id into target;
 if target is not null then perform finance.audit_change(p_member,'funding',target::text,'partner_deal_link',d.id::text,null); end if;
end $$;

-- Attach all season cash entries or raise, so the caller's Won update and tasks
-- roll back together. Products and services never become money.
create function partner_deals.attach_won_funding(p_member uuid,p_deal uuid)
returns void language plpgsql set search_path=pg_catalog as $$
declare d partner_deals.deals%rowtype; c partner_deals.contributions%rowtype; f finance.funding%rowtype;
 org text; owner_name text; season_code text; season_state text; refnum bigint; ref text; target uuid; changed boolean:=false;
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
   if exists(select 1 from finance.funding x where x.season_id=c.season_id and x.funding_type='sponsor_cash'
       and x.status not in ('deleted','rejected') and lower(btrim(x.source_name))=lower(btrim(org))
       and not exists(select 1 from partner_deals.funding_links linked where linked.funding_id=x.id)) then
     raise exception 'deal_funding_possible_duplicate' using errcode='23505';
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
revoke all on function partner_deals.prepare_funding_link(uuid,text,text,uuid,uuid) from public;
revoke all on function partner_deals.remove_funding_link(uuid,text,text,uuid) from public;
revoke all on function partner_deals.attach_won_funding(uuid,uuid) from public;
commit;
