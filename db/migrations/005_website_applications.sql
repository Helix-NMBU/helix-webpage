-- Apply with the trusted server role after 001_member_cv.sql.
-- New Neon application data only. No legacy records or files are copied.
-- Recruiter access is an explicit server-admin grant, separate from Google
-- member authentication. Signing in never creates an allowlist row.
-- For local setup, the administrator may explicitly grant the existing Helix
-- admin by inserting (email, active) into website.recruiters. No users or
-- recruiter permissions are seeded automatically.
begin;
create schema if not exists website;

create table if not exists website.applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  season text not null,
  full_name text not null,
  email text not null,
  phone text not null,
  study_program text not null,
  study_program_other text,
  year_of_study smallint not null check (year_of_study between 1 and 5),
  motivation text not null check (char_length(motivation) <= 250),
  position_id text not null,
  position_title text not null,
  interested_departments text[] not null default '{}',
  cv_path text not null,
  photo_path text,
  consent boolean not null default false
);
create unique index if not exists applications_one_per_email_per_season
  on website.applications (lower(email), season);
create index if not exists applications_created_idx on website.applications (created_at desc, id);

create table if not exists website.recruiters (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email))),
  active boolean not null default false
);

-- Tracks uploads BEFORE writing S3. Retain on uncertain failures. A parent
-- maintenance job may remove only old keys not referenced by applications.
create table if not exists website.application_uploads (
  path text primary key,
  created_at timestamptz not null default now()
);
-- Delete the row and enqueue its exact keys in one SQL statement; S3 failures
-- remain retryable without exposing the deleted application again.
create table if not exists website.file_cleanup (
  path text primary key,
  created_at timestamptz not null default now()
);
create table if not exists website.email_events (
  application_id uuid not null,
  kind text not null check (kind in ('confirmation', 'rejection')),
  status text not null check (status in ('skipped', 'sending', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  primary key (application_id, kind)
);

alter table website.applications enable row level security;
alter table website.recruiters enable row level security;
alter table website.application_uploads enable row level security;
alter table website.file_cleanup enable row level security;
alter table website.email_events enable row level security;
revoke all on schema website from public;
revoke all on all tables in schema website from public;
alter default privileges in schema website revoke all on tables from public;
alter default privileges in schema website revoke execute on functions from public;
do $$
declare browser_role text;
begin
  for browser_role in select rolname from pg_roles where rolname in ('anon', 'anonymous', 'authenticated') loop
    execute format('revoke all on schema website from %I', browser_role);
    execute format('revoke all on all tables in schema website from %I', browser_role);
  end loop;
end;
$$;
grant usage on schema website to current_user;
grant select, insert, update, delete on all tables in schema website to current_user;
commit;
