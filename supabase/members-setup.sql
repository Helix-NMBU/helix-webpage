-- Members of the student org + recruiter access — run AFTER applications-setup.sql.
-- Supersedes the earlier recruiters-setup.sql (this script cleans up after it
-- if it was ever run).
--
-- Model: `members` stores everyone in the org. `status` tracks whether they
-- are an active, inactive or retired member. `has_recruitment_access` marks
-- who may read applications in the recruitment portal — checked through
-- is_recruiter(), which also requires the member to be active.

-- Clean up the superseded recruiters table, if present.
drop table if exists public.recruiters;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  full_name text not null,
  email text not null unique,          -- must match their Google login email
  status text not null default 'active'
    check (status in ('active', 'inactive', 'retired')),
  has_recruitment_access boolean not null default false
);

alter table public.members enable row level security;
-- Intentionally no policies: the table is managed from the dashboard and
-- only consulted via is_recruiter(). Add policies later if members should
-- read their own row from the app.

create or replace function public.is_recruiter()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.members
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and has_recruitment_access
      and status = 'active'
  );
$$;

revoke execute on function public.is_recruiter() from public;
grant execute on function public.is_recruiter() to authenticated;

-- Read access to applications for recruiters (idempotent: drops the versions
-- recruiters-setup.sql may have created).
drop policy if exists "recruiters can read applications" on public.applications;
create policy "recruiters can read applications"
  on public.applications
  for select
  to authenticated
  using (public.is_recruiter());

-- If this statement fails with "must be owner of table objects", create the
-- same policy via Storage → applications bucket → Policies in the dashboard.
drop policy if exists "recruiters can read application files" on storage.objects;
create policy "recruiters can read application files"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'applications' and public.is_recruiter());

-- Rejecting a candidate deletes their application and files from the portal.
drop policy if exists "recruiters can delete applications" on public.applications;
create policy "recruiters can delete applications"
  on public.applications
  for delete
  to authenticated
  using (public.is_recruiter());

drop policy if exists "recruiters can delete application files" on storage.objects;
create policy "recruiters can delete application files"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'applications' and public.is_recruiter());

-- ── Manage members ──────────────────────────────────────────────────────
-- Add members (email must match their Google login; repeat per person):
insert into public.members (full_name, email, status, has_recruitment_access) values
  ('Admin User', 'admin@helixnmbu.no', 'active', true);

-- Grant or revoke recruitment access:
-- update public.members set has_recruitment_access = true  where email = 'someone@helixnmbu.no';
-- update public.members set has_recruitment_access = false where email = 'someone@helixnmbu.no';

-- Change membership status:
-- update public.members set status = 'retired' where email = 'someone@helixnmbu.no';
