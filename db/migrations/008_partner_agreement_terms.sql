-- Retain the sponsor agreement tier and dates for partner access invitations.
-- Existing memberships receive a start date when this migration is applied.
begin;

alter table partner.organizations
  add column if not exists agreement_tier text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'partner_organizations_agreement_tier_check'
      and conrelid = 'partner.organizations'::regclass
  ) then
    alter table partner.organizations
      add constraint partner_organizations_agreement_tier_check
      check (agreement_tier is null or agreement_tier in (
        'partner', 'service', 'bronze', 'silver', 'gold', 'platinum', 'main'
      ));
  end if;
end;
$$;

alter table partner.memberships
  add column if not exists starts_at timestamptz not null default now();

create or replace function partner.can_request_otp(p_email text)
returns boolean
language sql stable security invoker set search_path = pg_catalog
as $$
  select exists (
    select 1 from partner.memberships m
    join partner.organizations o on o.id = m.organization_id
    where m.invited_email = lower(btrim(p_email))
      and m.status = 'active' and m.approved_at <= now() and m.starts_at <= now() and m.revoked_at is null
      and (m.expires_at is null or m.expires_at > now())
      and o.active is true and o.revoked_at is null
      and (m.auth_user_id is null or exists (
        select 1 from neon_auth."user" u where u.id = m.auth_user_id
          and lower(btrim(u.email)) = m.invited_email and u.banned is not true
      ))
      and not exists (
        select 1 from neon_auth."user" u
        where lower(btrim(u.email)) = m.invited_email and u.banned is true
      )
  );
$$;

create or replace function partner.authorized_memberships(p_auth_user_id uuid)
returns table (organization_id uuid, organization_name text, email text, full_name text)
language sql stable security invoker set search_path = pg_catalog
as $$
  select o.id, o.name, u.email, u.name
  from neon_auth."user" u
  join partner.memberships m on m.invited_email = lower(btrim(u.email))
    and (m.auth_user_id is null or m.auth_user_id = u.id)
  join partner.organizations o on o.id = m.organization_id
  where u.id = p_auth_user_id and u."emailVerified" is true and u.banned is not true
    and m.status = 'active' and m.approved_at <= now() and m.starts_at <= now() and m.revoked_at is null
    and (m.expires_at is null or m.expires_at > now())
    and o.active is true and o.revoked_at is null
  order by o.name, o.id;
$$;

commit;
