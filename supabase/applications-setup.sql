-- Recruitment applications — run once in the Supabase SQL editor.
--
-- Security model:
--   * Anyone hitting the apply form — signed out (anon) or signed in
--     elsewhere on the site as a team member/recruiter (authenticated) —
--     can INSERT applications and UPLOAD files, nothing else. Both roles
--     are covered because the Supabase session is shared across the whole
--     site, so a logged-in team member or recruiter applying would
--     otherwise get an RLS violation on the anon-only policy.
--   * Nobody can read applications with the anon key; grant SELECT to the
--     recruiter role when the recruiter review page is built (see bottom).
--   * One application per email per season, enforced by a unique index.

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  season text not null,                -- e.g. 'S27' = academic year ending 2027; stamped from July onwards
  full_name text not null,
  email text not null,
  phone text not null,
  study_program text not null,
  study_program_other text,            -- filled when study_program = 'Not listed / other'
  year_of_study smallint not null check (year_of_study between 1 and 5),
  motivation text not null check (char_length(motivation) <= 250),
  position_id text not null,           -- id from public/positions.json
  position_title text not null,
  interested_departments text[] not null default '{}',
  cv_path text not null,               -- object path in the 'applications' bucket
  photo_path text,
  consent boolean not null default false
);

create unique index applications_one_per_email_per_season
  on public.applications (lower(email), season);

alter table public.applications enable row level security;

create policy "anon can submit applications"
  on public.applications
  for insert
  to anon, authenticated
  with check (consent = true);

-- Private bucket for CVs and photos, capped at 10 MB per file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'applications',
  'applications',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
);

create policy "anon can upload application files"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'applications');

-- ── Later, for the recruiter review page ────────────────────────────────
-- create policy "authenticated can read applications"
--   on public.applications for select to authenticated using (true);
--
-- create policy "authenticated can read application files"
--   on storage.objects for select to authenticated
--   using (bucket_id = 'applications');
