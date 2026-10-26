-- Incremental sponsor access data. Member identity, private CVs and Neon Auth remain unchanged.
begin;
create schema if not exists sponsor;

create table if not exists sponsor.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists sponsor.contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references sponsor.organizations(id),
  email text not null unique check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  name text not null default '' check (length(name) <= 160),
  active boolean not null default true,
  auth_user_id uuid unique references neon_auth."user"(id) on delete set null,
  created_at timestamptz not null default now()
);

-- One current agreement per organization; updates retain the same stable organization identity.
-- Starts are inclusive and ends exclusive. Date inputs are converted to UTC instants by the server.
create table if not exists sponsor.agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references sponsor.organizations(id),
  tier text not null check (tier in ('partner', 'service', 'bronze', 'silver', 'gold', 'platinum', 'main')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  revoked_at timestamptz,
  check (ends_at > starts_at)
);

-- Bootstrap only through an authorized migration/operations step. Member onboarding never writes staff.
create table if not exists sponsor.staff (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  role text not null check (role in ('developer', 'admin')),
  active boolean not null default true,
  auth_user_id uuid unique references neon_auth."user"(id) on delete set null,
  created_at timestamptz not null default now()
);

revoke all on schema sponsor from public;
revoke all on all tables in schema sponsor from public;
grant usage on schema sponsor to current_user;
grant select, insert, update, delete on all tables in schema sponsor to current_user;
commit;
