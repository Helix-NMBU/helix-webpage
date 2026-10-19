-- Member CV portal for the shared Helix Neon project.
-- Apply on the provisioned database (direct/unpooled connection). Safe to re-run.
--
-- Managed Better Auth on this project owns neon_auth."user" (uuid id) and
-- neon_auth.account. The legacy Stack Auth table neon_auth.users_sync is not
-- present, so member identity links to neon_auth."user" instead of copying it.
-- This file does not create or alter the neon_auth schema.
--
-- CV data lives in schema cv. Shared member identity lives in schema identity
-- so later Helix features can reuse it. The browser never receives DATABASE_URL.
-- Publication writes cv.directory_entries for a future Talent Directory; it does
-- not depend on the unfinished sponsor-portal tables.

begin;

create schema if not exists identity;
create schema if not exists cv;

create table if not exists identity.members (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references neon_auth."user"(id) on delete cascade,
  google_sub text not null unique,
  email text not null unique check (email = lower(email) and email ~ '^[^[:space:]@]+@helixnmbu[.]no$'),
  full_name text not null,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists cv.documents (
  member_id uuid primary key references identity.members(id) on delete cascade,
  draft jsonb not null,
  sharing jsonb not null,
  revision integer not null default 0 check (revision >= 0),
  published_revision integer,
  published_at timestamptz,
  published_path text,
  updated_at timestamptz not null default now()
);

create table if not exists cv.publications (
  member_id uuid not null references identity.members(id) on delete cascade,
  revision integer not null,
  snapshot jsonb not null,
  sharing jsonb not null,
  path text,
  created_at timestamptz not null default now(),
  primary key (member_id, revision)
);

-- Future sponsor Talent Directory reads this projection. Private draft saves do not update it.
create table if not exists cv.directory_entries (
  member_id uuid primary key references identity.members(id) on delete cascade,
  visible boolean not null default false,
  full_name text not null,
  contact_email text,
  phone text,
  linkedin text,
  field_of_study text,
  graduation_year integer,
  cv_path text,
  share_cv boolean not null default false,
  share_email boolean not null default false,
  share_phone boolean not null default false,
  career_entries jsonb not null default '[]'::jsonb,
  helix_roles jsonb not null default '[]'::jsonb,
  published_revision integer,
  updated_at timestamptz not null default now()
);

create table if not exists cv.file_cleanup (
  path text primary key,
  member_id uuid not null references identity.members(id) on delete cascade,
  not_before timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now()
);

-- Record every generated object before upload. A pending candidate has a 15-minute lease.
create table if not exists cv.upload_candidates (
  path text primary key,
  member_id uuid not null references identity.members(id) on delete cascade,
  expected_revision integer not null,
  status text not null default 'pending' check (status in ('pending', 'current', 'retired', 'deleted')),
  expires_at timestamptz not null default clock_timestamp() + interval '15 minutes',
  cleanup_after timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp()
);

revoke all on schema identity, cv from public;
revoke all on all tables in schema identity, cv from public;
grant usage on schema identity, cv to current_user;
grant select, insert, update, delete on all tables in schema identity, cv to current_user;

-- Confirms the Neon Auth user is still the linked Google account with a verified Helix email.
-- The Google ID token itself is verified in the application before the first insert.
create or replace function identity.onboard_member(
  p_auth_user_id uuid,
  p_google_sub text,
  p_email text,
  p_name text,
  p_draft jsonb,
  p_sharing jsonb
) returns uuid
language plpgsql
set search_path = identity, cv, pg_temp
as $$
declare
  saved_id uuid;
begin
  if p_email is null or p_email <> lower(p_email) or p_email !~ '^[^[:space:]@]+@helixnmbu[.]no$'
    or p_google_sub is null or length(p_google_sub) < 1
    then raise exception 'Identity mismatch' using errcode = '42501'; end if;
  if not exists (
    select 1
    from neon_auth."user" u
    join neon_auth.account a on a."userId" = u.id
    where u.id = p_auth_user_id
      and lower(u.email) = p_email
      and u."emailVerified" is true
      and coalesce(u.banned, false) = false
      and a."providerId" = 'google'
      and a."accountId" = p_google_sub
  ) then raise exception 'Identity mismatch' using errcode = '42501'; end if;
  if exists (
    select 1 from identity.members
    where auth_user_id = p_auth_user_id and google_sub <> p_google_sub
  ) then raise exception 'Identity mismatch' using errcode = '42501'; end if;
  insert into identity.members (auth_user_id, google_sub, email, full_name)
  values (p_auth_user_id, p_google_sub, p_email, coalesce(p_name, ''))
  on conflict (auth_user_id) do update
    set email = excluded.email, full_name = excluded.full_name, verified_at = now()
  returning id into saved_id;
  insert into cv.documents (member_id, draft, sharing)
  values (saved_id, p_draft, p_sharing)
  on conflict (member_id) do nothing;
  return saved_id;
end
$$;

create or replace function cv.prepare_upload(p_member_id uuid, p_path text, p_expected_revision integer)
returns void
language plpgsql
set search_path = cv, pg_temp
as $$
declare item cv.documents%rowtype;
begin
  select * into item from cv.documents where member_id = p_member_id for update;
  if item.member_id is null then raise exception 'Member profile not found' using errcode = '42501'; end if;
  if p_expected_revision is null or p_expected_revision <> item.revision then raise exception 'Revision conflict' using errcode = '40001'; end if;
  if p_path is null or p_path !~ ('^' || p_member_id::text || '/[0-9a-f-]{36}[.]pdf$') then raise exception 'Invalid generated PDF path' using errcode = '22023'; end if;
  insert into cv.upload_candidates (path, member_id, expected_revision)
  values (p_path, p_member_id, p_expected_revision);
end
$$;

-- Same document lock as commit. Retiring a candidate makes a delayed commit fail.
create or replace function cv.settle_upload(p_member_id uuid, p_path text default null, p_upload_uncertain boolean default false)
returns jsonb
language plpgsql
set search_path = cv, pg_temp
as $$
declare item cv.documents%rowtype;
begin
  select * into item from cv.documents where member_id = p_member_id for update;
  if item.member_id is null then raise exception 'Member profile not found' using errcode = '42501'; end if;
  update cv.upload_candidates c set status = 'retired',
    cleanup_after = case
      when p_upload_uncertain then greatest(c.expires_at, clock_timestamp() + interval '15 minutes')
      else c.cleanup_after
    end
  where c.member_id = p_member_id
    and c.status in ('pending', 'current')
    and c.path is distinct from item.published_path
    and (c.path = p_path or (p_path is null and (c.status = 'current' or c.expires_at <= clock_timestamp())));
  insert into cv.file_cleanup (path, member_id, not_before)
  select c.path, c.member_id, c.cleanup_after
  from cv.upload_candidates c
  where c.member_id = p_member_id and c.status = 'retired' and c.path is distinct from item.published_path
  on conflict (path) do update
    set not_before = greatest(cv.file_cleanup.not_before, excluded.not_before);
  delete from cv.file_cleanup where member_id = p_member_id and path = item.published_path;
  return to_jsonb(item);
end
$$;

create or replace function cv.commit_member_cv(
  p_member_id uuid,
  p_action text,
  p_expected_revision integer,
  p_draft jsonb default null,
  p_sharing jsonb default null,
  p_path text default null
) returns jsonb
language plpgsql
set search_path = cv, pg_temp
as $$
declare
  item cv.documents%rowtype;
  next_revision integer;
  old_directory_path text;
  snapshot jsonb;
begin
  select * into item from cv.documents where member_id = p_member_id for update;
  if item.member_id is null then raise exception 'Member profile not found' using errcode = '42501'; end if;
  if p_expected_revision is null or p_expected_revision <> item.revision then raise exception 'Revision conflict' using errcode = '40001'; end if;
  if p_action is null or p_action not in ('save', 'publish', 'withdraw') then raise exception 'Invalid action' using errcode = '22023'; end if;
  next_revision := item.revision + 1;
  if p_action in ('save', 'publish') then
    if jsonb_typeof(p_draft) is distinct from 'object' or jsonb_typeof(p_sharing) is distinct from 'object'
      or jsonb_typeof(p_sharing->'cv') is distinct from 'boolean'
      or jsonb_typeof(p_sharing->'email') is distinct from 'boolean'
      or jsonb_typeof(p_sharing->'phone') is distinct from 'boolean'
      then raise exception 'Invalid CV' using errcode = '22023'; end if;
    update cv.documents set draft = p_draft, sharing = p_sharing where member_id = p_member_id;
  end if;
  if p_action in ('publish', 'withdraw') then
    select cv_path into old_directory_path from cv.directory_entries where member_id = p_member_id;
    if item.published_path is not null then
      insert into cv.file_cleanup (path, member_id) values (item.published_path, p_member_id) on conflict do nothing;
    end if;
    if old_directory_path is not null and old_directory_path is distinct from item.published_path then
      insert into cv.file_cleanup (path, member_id) values (old_directory_path, p_member_id) on conflict do nothing;
    end if;
  end if;
  if p_action = 'publish' then
    if coalesce(trim(p_draft->>'fullName'), '') = '' or not exists (
      select 1 from jsonb_array_elements(p_draft->'education') e
      where coalesce(trim(e->>'institution'), '') <> '' and coalesce(trim(e->>'degree'), '') <> ''
    ) then raise exception 'Incomplete publication' using errcode = '22023'; end if;
    if (p_sharing->>'cv')::boolean then
      if p_path is null or p_path !~ ('^' || p_member_id::text || '/[0-9a-f-]{36}[.]pdf$') or p_path = item.published_path
        then raise exception 'Invalid generated PDF path' using errcode = '22023'; end if;
      if not exists (
        select 1 from cv.upload_candidates c
        where c.path = p_path and c.member_id = p_member_id and c.expected_revision = p_expected_revision
          and c.status = 'pending' and c.expires_at > clock_timestamp()
      ) then raise exception 'Upload candidate cancelled or expired' using errcode = '40001'; end if;
    elsif p_path is not null then raise exception 'CV sharing disabled' using errcode = '22023'; end if;
    snapshot := p_draft || jsonb_build_object(
      'contactEmail', case when (p_sharing->>'email')::boolean then p_draft->>'contactEmail' else '' end,
      'phone', case when (p_sharing->>'phone')::boolean then p_draft->>'phone' else '' end
    );
    insert into cv.publications (member_id, revision, snapshot, sharing, path)
    values (p_member_id, next_revision, snapshot, p_sharing, p_path);
    insert into cv.directory_entries (
      member_id, visible, full_name, contact_email, phone, linkedin, field_of_study, graduation_year,
      cv_path, share_cv, share_email, share_phone, career_entries, helix_roles, published_revision
    ) values (
      p_member_id, true, snapshot->>'fullName',
      nullif(snapshot->>'contactEmail', ''), nullif(snapshot->>'phone', ''),
      (select l->>'url' from jsonb_array_elements(snapshot->'links') l where lower(l->>'label') = 'linkedin' limit 1),
      nullif(snapshot->>'fieldOfStudy', ''),
      case when snapshot->>'graduationYear' ~ '^[0-9]{4}$' then (snapshot->>'graduationYear')::integer else null end,
      p_path, (p_sharing->>'cv')::boolean, (p_sharing->>'email')::boolean, (p_sharing->>'phone')::boolean,
      coalesce(snapshot->'experience', '[]'::jsonb),
      coalesce((
        select jsonb_agg(jsonb_build_object('season', role.season, 'title', role.title) order by role.season, role.title)
        from (
          select distinct coalesce(nullif(entry.season, ''), 'Helix') as season, entry.title
          from (
            select p->>'season' as season, p->>'role' as title
            from jsonb_array_elements(snapshot->'projects') p
            union all
            select e->>'season' as season, e->>'title' as title
            from jsonb_array_elements(snapshot->'experience') e
            where lower(btrim(regexp_replace(e->>'organization', U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+', ' ', 'g'))) in ('helix', 'helix nmbu')
          ) entry
          where coalesce(entry.title, '') <> ''
        ) role
      ), '[]'::jsonb),
      next_revision
    )
    on conflict (member_id) do update set
      visible = true,
      full_name = excluded.full_name,
      contact_email = excluded.contact_email,
      phone = excluded.phone,
      linkedin = excluded.linkedin,
      field_of_study = excluded.field_of_study,
      graduation_year = excluded.graduation_year,
      cv_path = excluded.cv_path,
      share_cv = excluded.share_cv,
      share_email = excluded.share_email,
      share_phone = excluded.share_phone,
      career_entries = excluded.career_entries,
      helix_roles = excluded.helix_roles,
      published_revision = excluded.published_revision,
      updated_at = now();
    update cv.documents
      set published_revision = next_revision, published_at = now(), published_path = p_path
      where member_id = p_member_id;
    update cv.upload_candidates set status = 'current' where member_id = p_member_id and path = p_path;
  elsif p_action = 'withdraw' then
    update cv.directory_entries set
      visible = false, share_cv = false, share_email = false, share_phone = false,
      contact_email = null, phone = null, cv_path = null, updated_at = now()
    where member_id = p_member_id;
    update cv.documents
      set published_revision = null, published_at = null, published_path = null
      where member_id = p_member_id;
  end if;
  update cv.documents set revision = next_revision, updated_at = now() where member_id = p_member_id
  returning * into item;
  return to_jsonb(item);
end
$$;

revoke all on function identity.onboard_member(uuid, text, text, text, jsonb, jsonb) from public;
revoke all on function cv.prepare_upload(uuid, text, integer) from public;
revoke all on function cv.settle_upload(uuid, text, boolean) from public;
revoke all on function cv.commit_member_cv(uuid, text, integer, jsonb, jsonb, text) from public;

commit;
