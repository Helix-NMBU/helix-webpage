-- Internal deal tracking. No people, data or partner portal access are seeded.
begin;
create schema if not exists partner_deals;
create table partner_deals.member_grants (
  member_id uuid not null references identity.members(id) on delete restrict,
  capability text not null check (capability in ('business','marketing','finance')),
  active boolean not null default true,
  primary key(member_id, capability)
);
create table partner_deals.deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references partner.organizations(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 200),
  probability integer check (probability between 0 and 100),
  follow_up_on date,
  sponsor_level text check (sponsor_level in ('partner','service','bronze','silver','gold','platinum','main')),
  stage text not null default 'lead' check (stage in ('lead','contacted','discussion','proposal','won','lost')),
  owner_member_id uuid references identity.members(id) on delete restrict,
  contact_name text not null default '' check (length(contact_name) <= 160),
  contact_email text not null default '' check (length(contact_email) <= 254),
  starts_on date, ends_on date,
  agreement_link text not null default '' check (length(agreement_link) <= 2000),
  negotiation_notes text not null default '' check (length(negotiation_notes) <= 10000),
  revision integer not null default 0 check (revision >= 0),
  won_at timestamptz, won_by_member_id uuid references identity.members(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by_member_id uuid not null references identity.members(id), updated_by_member_id uuid not null references identity.members(id),
  check (ends_on is null or starts_on is null or ends_on >= starts_on),
  check ((stage = 'won') = (won_at is not null and won_by_member_id is not null))
);
create table partner_deals.contributions (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references partner_deals.deals(id) on delete restrict,
  season_id uuid not null references finance.seasons(id) on delete restrict,
  kind text not null check (kind in ('cash','product','service')),
  description text not null default '' check (length(description) <= 2000),
  amount_ore bigint check (amount_ore > 0), invoice_date date,
  check ((kind = 'cash' and amount_ore is not null and invoice_date is not null) or (kind <> 'cash' and invoice_date is null))
);
create unique index partner_deals_one_cash_per_season on partner_deals.contributions(deal_id,season_id) where kind='cash';
create table partner_deals.deliverables (
  id uuid primary key default gen_random_uuid(), deal_id uuid not null references partner_deals.deals(id) on delete restrict,
  title text not null check (length(btrim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 2000),
  due_date date, owner_member_id uuid references identity.members(id) on delete restrict
);
create table partner_deals.audit (
  id bigint generated always as identity primary key,
  deal_id uuid not null references partner_deals.deals(id) on delete restrict,
  actor_member_id uuid not null references identity.members(id) on delete restrict,
  action text not null, before_snapshot jsonb, after_snapshot jsonb not null, created_at timestamptz not null default now()
);
create index partner_deals_deals_org on partner_deals.deals(organization_id);
create index partner_deals_contributions_deal on partner_deals.contributions(deal_id);
create index partner_deals_deliverables_deal on partner_deals.deliverables(deal_id);
create index partner_deals_audit_deal on partner_deals.audit(deal_id,id);

-- Revalidate a linked Google account with every read and write. Project manager is
-- an explicit role; neither an admin wildcard nor the combined department suffices.
create function partner_deals.capabilities(p_member uuid,p_sub text,p_email text)
returns table (pipeline boolean, shared boolean) language sql stable set search_path=pg_catalog as $$
 select
   exists(select 1 from identity.member_roles r where r.member_id=m.id and r.role_key='project_manager')
     or exists(select 1 from partner_deals.member_grants g where g.member_id=m.id and g.active and g.capability='business'),
   exists(select 1 from identity.member_roles r where r.member_id=m.id and r.role_key='project_manager')
     or exists(select 1 from partner_deals.member_grants g where g.member_id=m.id and g.active and g.capability in ('business','finance','marketing'))
 from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
 where m.id=p_member and m.google_sub=p_sub and m.email=lower(p_email)
   and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
   and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub)
$$;

-- Lock the authentication link and existing grants while a mutation runs. A
-- concurrent revocation waits until the mutation ends; a revocation that wins
-- first is observed by the following capabilities check.
create function partner_deals.lock_actor(p_member uuid) returns void language plpgsql set search_path=pg_catalog as $$
begin
 perform m.id from identity.members m join neon_auth."user" u on u.id=m.auth_user_id where m.id=p_member for share of m,u;
 perform a."userId" from neon_auth.account a join identity.members m on m.auth_user_id=a."userId" where m.id=p_member for share of a;
 perform r.member_id from identity.member_roles r where r.member_id=p_member for share;
 perform g.member_id from partner_deals.member_grants g where g.member_id=p_member for share;
end $$;

-- Only pre-won edits are allowed here. The separate Won transition must perform
-- the task and finance handoff atomically or recoverably; this function cannot bypass it.
create function partner_deals.save_deal(p_member uuid,p_sub text,p_email text,p_command jsonb)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare d partner_deals.deals%rowtype; target uuid; old_snapshot jsonb; new_snapshot jsonb; c jsonb; item jsonb;
begin
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 if jsonb_typeof(p_command)<>'object' or jsonb_typeof(p_command->'contributions')<>'array' or jsonb_typeof(p_command->'deliverables')<>'array' then raise exception 'deal_invalid' using errcode='22023'; end if;
 if p_command->>'stage' not in ('lead','contacted','discussion','proposal','lost') then raise exception 'deal_invalid_stage' using errcode='22023'; end if;
 if p_command->>'id' is null then
   insert into partner_deals.deals(organization_id,title,stage,owner_member_id,contact_name,contact_email,starts_on,ends_on,agreement_link,negotiation_notes,created_by_member_id,updated_by_member_id)
   values ((p_command->>'organizationId')::uuid, btrim(p_command->>'title'),p_command->>'stage',nullif(p_command->>'ownerMemberId','')::uuid,coalesce(p_command->>'contactName',''),coalesce(p_command->>'contactEmail',''),nullif(p_command->>'startsOn','')::date,nullif(p_command->>'endsOn','')::date,coalesce(p_command->>'agreementLink',''),coalesce(p_command->>'negotiationNotes',''),p_member,p_member) returning * into d;
 else
   target := (p_command->>'id')::uuid;
   select * into d from partner_deals.deals where id=target for update;
   if not found then raise exception 'deal_not_found' using errcode='P0002'; end if;
   if d.stage='won' then raise exception 'deal_won_locked' using errcode='55000'; end if;
   if d.revision is distinct from (p_command->>'expectedRevision')::integer then raise exception 'deal_conflict' using errcode='40001'; end if;
   old_snapshot:=jsonb_build_object('deal',to_jsonb(d),'contributions',coalesce((select jsonb_agg(to_jsonb(x)) from partner_deals.contributions x where x.deal_id=d.id),'[]'::jsonb),'deliverables',coalesce((select jsonb_agg(to_jsonb(x)) from partner_deals.deliverables x where x.deal_id=d.id),'[]'::jsonb));
   update partner_deals.deals set organization_id=(p_command->>'organizationId')::uuid,title=btrim(p_command->>'title'),stage=p_command->>'stage',owner_member_id=nullif(p_command->>'ownerMemberId','')::uuid,contact_name=coalesce(p_command->>'contactName',''),contact_email=coalesce(p_command->>'contactEmail',''),starts_on=nullif(p_command->>'startsOn','')::date,ends_on=nullif(p_command->>'endsOn','')::date,agreement_link=coalesce(p_command->>'agreementLink',''),negotiation_notes=coalesce(p_command->>'negotiationNotes',''),revision=revision+1,updated_by_member_id=p_member,updated_at=now() where id=target returning * into d;
   delete from partner_deals.contributions where deal_id=target;
   delete from partner_deals.deliverables where deal_id=target;
 end if;
 for c in select value from jsonb_array_elements(p_command->'contributions') loop
   insert into partner_deals.contributions(deal_id,season_id,kind,description,amount_ore,invoice_date) values (d.id,(c->>'seasonId')::uuid,c->>'kind',coalesce(c->>'description',''),nullif(c->>'amountOre','')::bigint,nullif(c->>'invoiceDate','')::date);
 end loop;
 for item in select value from jsonb_array_elements(p_command->'deliverables') loop
   insert into partner_deals.deliverables(deal_id,title,description,due_date,owner_member_id) values (d.id,btrim(item->>'title'),coalesce(item->>'description',''),nullif(item->>'dueDate','')::date,nullif(item->>'ownerMemberId','')::uuid);
 end loop;
 new_snapshot:=jsonb_build_object('deal',to_jsonb(d),'contributions',coalesce((select jsonb_agg(to_jsonb(x)) from partner_deals.contributions x where x.deal_id=d.id),'[]'::jsonb),'deliverables',coalesce((select jsonb_agg(to_jsonb(x)) from partner_deals.deliverables x where x.deal_id=d.id),'[]'::jsonb));
 insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot) values(d.id,p_member,case when old_snapshot is null then 'created' else 'updated' end,old_snapshot,new_snapshot);
 return d.id;
end $$;

create table partner_deals.organization_audit (
 id bigint generated always as identity primary key,
 organization_id uuid not null references partner.organizations(id),
 actor_member_id uuid not null references identity.members(id),
 action text not null, snapshot jsonb not null, created_at timestamptz not null default now()
);
create table partner_deals.organization_versions (
 organization_id uuid primary key references partner.organizations(id) on delete restrict,
 revision integer not null default 0 check (revision >= 0)
);
create function partner_deals.create_organization(p_member uuid,p_sub text,p_email text,p_name text)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare target uuid;
begin
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 200 then raise exception 'deal_invalid' using errcode='22023'; end if;
 insert into partner.organizations(name,active) values(btrim(p_name),false) returning id into target;
 insert into partner_deals.organization_versions(organization_id) values(target);
 insert into partner_deals.organization_audit(organization_id,actor_member_id,action,snapshot) values(target,p_member,'created',jsonb_build_object('name',btrim(p_name)));
 return target;
end $$;
create function partner_deals.rename_organization(p_member uuid,p_sub text,p_email text,p_org uuid,p_revision integer,p_name text)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare version integer; previous text;
begin
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 if p_name is null or length(btrim(p_name)) not between 1 and 200 or p_revision is null or p_revision < 0 then raise exception 'deal_invalid' using errcode='22023'; end if;
 select name into previous from partner.organizations where id=p_org for update;
 if not found then raise exception 'deal_not_found' using errcode='P0002'; end if;
 insert into partner_deals.organization_versions(organization_id) values(p_org) on conflict do nothing;
 select revision into version from partner_deals.organization_versions where organization_id=p_org for update;
 if version <> p_revision then raise exception 'deal_conflict' using errcode='40001'; end if;
 update partner.organizations set name=btrim(p_name) where id=p_org;
 update partner_deals.organization_versions set revision=revision+1 where organization_id=p_org;
 insert into partner_deals.organization_audit(organization_id,actor_member_id,action,snapshot) values(p_org,p_member,'renamed',jsonb_build_object('before',previous,'after',btrim(p_name)));
 return p_org;
end $$;
alter table partner_deals.organization_versions enable row level security;
alter table partner_deals.organization_audit enable row level security;
alter table partner_deals.member_grants enable row level security;
alter table partner_deals.deals enable row level security;
alter table partner_deals.contributions enable row level security;
alter table partner_deals.deliverables enable row level security;
alter table partner_deals.audit enable row level security;
revoke all on schema partner_deals from public;
revoke all on all tables in schema partner_deals from public;
revoke all on all functions in schema partner_deals from public;
alter default privileges in schema partner_deals revoke all on tables from public;
alter default privileges in schema partner_deals revoke execute on functions from public;
commit;
