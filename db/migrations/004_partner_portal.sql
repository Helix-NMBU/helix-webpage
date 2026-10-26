-- Partner access is granted explicitly by an administrator using a server role.
-- No users, organizations, invitations, or memberships are seeded here.
-- Apply after 001_member_cv.sql using the trusted server database owner.
begin;

create schema if not exists partner;

create table if not exists partner.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 200),
  active boolean not null default false,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

-- A NULL auth_user_id is an email invitation. Only explicitly approved active
-- rows authorize a verified email. Signing in never inserts or updates a row.
-- Binding an invitation to an auth user is an administrator-only operation.
create table if not exists partner.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references partner.organizations(id) on delete cascade,
  auth_user_id uuid references neon_auth."user"(id) on delete cascade,
  invited_email text not null check (
    invited_email = lower(btrim(invited_email))
    and length(invited_email) <= 254
    and invited_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  ),
  status text not null default 'invited' check (status in ('invited', 'active', 'revoked')),
  approved_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, invited_email),
  check (status <> 'active' or approved_at is not null),
  check (status <> 'revoked' or revoked_at is not null)
);

create index if not exists partner_memberships_user_idx on partner.memberships(auth_user_id);
create index if not exists partner_memberships_email_idx on partner.memberships(invited_email);

-- No browser/Data API policies. Only the trusted database owner may read/write.
alter table partner.organizations enable row level security;
alter table partner.memberships enable row level security;
revoke all on schema partner from public;
revoke all on all tables in schema partner from public;
alter default privileges in schema partner revoke all on tables from public;
alter default privileges in schema partner revoke execute on functions from public;

-- Sending a code is not approval. Even an existing unverified account may
-- request one, but only for an explicitly approved, current invitation.
-- The backend returns the same response whether this returns true or false.
create or replace function partner.can_request_otp(p_email text)
returns boolean
language sql stable security invoker set search_path = pg_catalog
as $$
  select exists (
    select 1 from partner.memberships m
    join partner.organizations o on o.id = m.organization_id
    where m.invited_email = lower(btrim(p_email))
      and m.status = 'active' and m.approved_at <= now() and m.revoked_at is null
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
    and m.status = 'active' and m.approved_at <= now() and m.revoked_at is null
    and (m.expires_at is null or m.expires_at > now())
    and o.active is true and o.revoked_at is null
  order by o.name, o.id;
$$;

-- Both listing and signing a download read this function. Its access check is
-- repeated for every request, including requests after an earlier successful login.
-- It reads publication metadata only. Private cv.documents.draft is never read.
create or replace function partner.published_cvs(p_auth_user_id uuid, p_organization_id uuid)
returns table (
  member_id uuid, full_name text, field_of_study text, graduation_year integer,
  contact_email text, phone text, pdf_path text
)
language plpgsql stable security invoker set search_path = pg_catalog
as $$
begin
  if not exists (
    select 1 from partner.authorized_memberships(p_auth_user_id) m
    where m.organization_id = p_organization_id
  ) then
    raise exception 'Partner access denied' using errcode = '42501';
  end if;
  return query
    select e.member_id, e.full_name, e.field_of_study, e.graduation_year,
      case when e.share_email and (p.sharing->>'email')::boolean then e.contact_email end,
      case when e.share_phone and (p.sharing->>'phone')::boolean then e.phone end,
      case when e.share_cv is true and (p.sharing->>'cv')::boolean is true
        and e.cv_path = d.published_path and e.cv_path = p.path then e.cv_path end
    from cv.directory_entries e
    join cv.documents d on d.member_id = e.member_id and d.published_revision = e.published_revision
    join cv.publications p on p.member_id = e.member_id and p.revision = d.published_revision
    where e.visible is true and p.snapshot is not null
      and d.published_path is not distinct from e.cv_path and p.path is not distinct from e.cv_path
    order by e.full_name, e.member_id;
end;
$$;

revoke all on all functions in schema partner from public;
-- Explicitly remove inherited deployment defaults for common browser roles.
do $$
declare browser_role text;
begin
  for browser_role in select rolname from pg_roles where rolname in ('anon', 'anonymous', 'authenticated') loop
    execute format('revoke all on schema partner from %I', browser_role);
    execute format('revoke all on all tables in schema partner from %I', browser_role);
    execute format('revoke all on all functions in schema partner from %I', browser_role);
  end loop;
end;
$$;
grant usage on schema partner to current_user;
grant select, insert, update, delete on all tables in schema partner to current_user;
grant execute on all functions in schema partner to current_user;

commit;
