-- Incremental migration. Apply AFTER sponsor-portal-v2.sql, never instead of it.
-- All writes below are server-only. Authenticated clients receive read policies only.
begin;

create table public.member_workspace_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_sub text not null unique,
  email text not null unique check (email = lower(email) and email ~ '^[^[:space:]@]+@helixnmbu[.]no$'),
  full_name text not null,
  verified_at timestamptz not null default now()
);
create table public.member_cv_documents (
  user_id uuid primary key references public.member_workspace_identities(user_id) on delete cascade,
  draft jsonb not null,
  sharing jsonb not null,
  revision integer not null default 0 check (revision >= 0),
  published_revision integer,
  published_at timestamptz,
  published_path text,
  updated_at timestamptz not null default now()
);
create table public.member_cv_publications (
  user_id uuid not null references public.member_workspace_identities(user_id) on delete cascade,
  revision integer not null,
  snapshot jsonb not null,
  sharing jsonb not null,
  path text,
  created_at timestamptz not null default now(),
  primary key (user_id, revision)
);
-- Removal queue survives a storage outage or function termination after commit.
create table public.member_cv_file_cleanup (
  path text primary key,
  user_id uuid not null references public.member_workspace_identities(user_id) on delete cascade,
  not_before timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default now()
);

-- Every candidate is recorded before upload, so an interrupted HTTP request
-- cannot lose its path. A pending candidate has a bounded publication lease.
create table public.member_cv_upload_candidates (
  path text primary key,
  user_id uuid not null references public.member_workspace_identities(user_id) on delete cascade,
  expected_revision integer not null,
  status text not null default 'pending' check (status in ('pending', 'current', 'retired', 'deleted')),
  expires_at timestamptz not null default clock_timestamp() + interval '15 minutes',
  cleanup_after timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.member_cv_upload_candidates enable row level security;
revoke all on public.member_cv_upload_candidates from anon, authenticated;
grant all on public.member_cv_upload_candidates to service_role;

alter table public.member_workspace_identities enable row level security;
alter table public.member_cv_documents enable row level security;
alter table public.member_cv_publications enable row level security;
alter table public.member_cv_file_cleanup enable row level security;
revoke all on public.member_workspace_identities, public.member_cv_documents, public.member_cv_publications, public.member_cv_file_cleanup from anon, authenticated;
grant select on public.member_workspace_identities, public.member_cv_documents to authenticated;
grant all on public.member_workspace_identities, public.member_cv_documents, public.member_cv_publications, public.member_cv_file_cleanup to service_role;

-- JWT user_metadata and email-domain guesses do not establish membership.
create or replace function public.has_verified_member_workspace()
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.member_workspace_identities w
    join auth.users u on u.id = w.user_id and lower(u.email) = w.email
    join auth.identities i on i.user_id = w.user_id and i.provider = 'google'
      and i.identity_data->>'sub' = w.google_sub
    where w.user_id = auth.uid()
  )
$$;
revoke all on function public.has_verified_member_workspace() from public, anon;
grant execute on function public.has_verified_member_workspace() to authenticated, service_role;
create policy workspace_own_identity on public.member_workspace_identities for select to authenticated
  using (user_id = auth.uid() and public.has_verified_member_workspace());
create policy workspace_own_draft on public.member_cv_documents for select to authenticated
  using (user_id = auth.uid() and public.has_verified_member_workspace());

create or replace function public.onboard_member_cv(p_user_id uuid, p_google_sub text, p_email text, p_name text, p_draft jsonb, p_sharing jsonb)
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if not exists (
    select 1 from auth.users u join auth.identities i on i.user_id = u.id
    where u.id = p_user_id and lower(u.email) = p_email and i.provider = 'google' and i.identity_data->>'sub' = p_google_sub
  ) then raise exception 'Identity mismatch' using errcode = '42501'; end if;
  -- Existing Google sub cannot be reassigned to a different Supabase account.
  if exists(select 1 from public.member_workspace_identities where user_id = p_user_id and google_sub <> p_google_sub)
    then raise exception 'Identity mismatch' using errcode = '42501'; end if;
  insert into public.member_workspace_identities(user_id, google_sub, email, full_name)
  values (p_user_id, p_google_sub, p_email, p_name)
  on conflict (user_id) do update set email = excluded.email, full_name = excluded.full_name, verified_at = now();
  insert into public.member_cv_documents(user_id, draft, sharing) values(p_user_id, p_draft, p_sharing)
  on conflict (user_id) do nothing;
end
$$;
revoke all on function public.onboard_member_cv(uuid, text, text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.onboard_member_cv(uuid, text, text, text, jsonb, jsonb) to service_role;

-- Register before Storage upload. Paths can never be reused after settlement.
create or replace function public.prepare_member_cv_upload(p_user_id uuid, p_path text, p_expected_revision integer)
returns void language plpgsql security definer set search_path = public as $$
declare item public.member_cv_documents%rowtype;
begin
  select * into item from public.member_cv_documents where user_id = p_user_id for update;
  if item.user_id is null then raise exception 'Member profile not found' using errcode = '42501'; end if;
  if p_expected_revision is null or p_expected_revision <> item.revision then raise exception 'Revision conflict' using errcode = '40001'; end if;
  if p_path is null or p_path !~ ('^' || p_user_id::text || '/[0-9a-f-]{36}[.]pdf$') then raise exception 'Invalid generated PDF path' using errcode = '22023'; end if;
  insert into public.member_cv_upload_candidates(path,user_id,expected_revision)
    values(p_path,p_user_id,p_expected_revision);
end
$$;
revoke all on function public.prepare_member_cv_upload(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.prepare_member_cv_upload(uuid,text,integer) to service_role;

-- Settle an uncertain upload/publication using the SAME row lock as commit.
-- If commit already ran, preserve its current path. If commit is queued behind
-- settlement, retiring its candidate makes that later commit fail atomically.
-- With no explicit path, only expired pending or superseded current candidates
-- are retired. Concurrent active uploads keep their publication lease.
create or replace function public.settle_member_cv_upload(p_user_id uuid, p_path text default null, p_upload_uncertain boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare item public.member_cv_documents%rowtype;
begin
  select * into item from public.member_cv_documents where user_id = p_user_id for update;
  if item.user_id is null then raise exception 'Member profile not found' using errcode = '42501'; end if;
  update public.member_cv_upload_candidates c set status = 'retired',
    cleanup_after = case when p_upload_uncertain then greatest(c.expires_at, clock_timestamp() + interval '15 minutes') else c.cleanup_after end
    where c.user_id = p_user_id and c.status in ('pending','current')
      and c.path is distinct from item.published_path
      and (c.path = p_path or (p_path is null and (c.status = 'current' or c.expires_at <= clock_timestamp())));
  -- An uncertain Storage upload may finish after its HTTP error. Cancel its
  -- publication now, but preserve cleanup for a full settlement window.
  insert into public.member_cv_file_cleanup(path,user_id,not_before)
    select c.path,c.user_id,c.cleanup_after from public.member_cv_upload_candidates c
    where c.user_id = p_user_id and c.status = 'retired'
      and c.path is distinct from item.published_path
    on conflict (path) do update set not_before = greatest(public.member_cv_file_cleanup.not_before, excluded.not_before);
  delete from public.member_cv_file_cleanup where user_id = p_user_id and path = item.published_path;
  return to_jsonb(item);
end
$$;
revoke all on function public.settle_member_cv_upload(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.settle_member_cv_upload(uuid,text,boolean) to service_role;

-- Publication and the existing Talent Directory projection commit atomically.
create or replace function public.commit_member_cv(p_user_id uuid, p_action text, p_expected_revision integer, p_draft jsonb default null, p_sharing jsonb default null, p_path text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  item public.member_cv_documents%rowtype;
  next_revision integer;
  old_projection_path text;
  snapshot jsonb;
begin
  select * into item from public.member_cv_documents where user_id = p_user_id for update;
  if item.user_id is null then raise exception 'Member profile not found' using errcode = '42501'; end if;
  if p_expected_revision is null or p_expected_revision <> item.revision then raise exception 'Revision conflict' using errcode = '40001'; end if;
  if p_action is null or p_action not in ('save', 'publish', 'withdraw') then raise exception 'Invalid action' using errcode = '22023'; end if;
  next_revision := item.revision + 1;
  if p_action in ('save', 'publish') then
    if jsonb_typeof(p_draft) is distinct from 'object' or jsonb_typeof(p_sharing) is distinct from 'object'
      or jsonb_typeof(p_sharing->'cv') is distinct from 'boolean'
      or jsonb_typeof(p_sharing->'email') is distinct from 'boolean'
      or jsonb_typeof(p_sharing->'phone') is distinct from 'boolean'
      then raise exception 'Invalid CV' using errcode = '22023'; end if;
    update public.member_cv_documents set draft = p_draft, sharing = p_sharing where user_id = p_user_id;
  end if;
  if p_action in ('publish', 'withdraw') then
    select cv_url into old_projection_path from public.students where id = p_user_id;
    if item.published_path is not null then
      insert into public.member_cv_file_cleanup(path, user_id) values(item.published_path, p_user_id) on conflict do nothing;
    end if;
    if old_projection_path is not null then
      insert into public.member_cv_file_cleanup(path, user_id) values(old_projection_path, p_user_id) on conflict do nothing;
    end if;
  end if;
  if p_action = 'publish' then
    if coalesce(trim(p_draft->>'fullName'), '') = '' or not exists (
      select 1 from jsonb_array_elements(p_draft->'education') e
      where coalesce(trim(e->>'institution'), '') <> '' and coalesce(trim(e->>'degree'), '') <> ''
    ) then raise exception 'Incomplete publication' using errcode = '22023'; end if;
    if (p_sharing->>'cv')::boolean then
      if p_path is null or p_path !~ ('^' || p_user_id::text || '/[0-9a-f-]{36}[.]pdf$') or p_path = item.published_path
        then raise exception 'Invalid generated PDF path' using errcode = '22023'; end if;
      if not exists(select 1 from public.member_cv_upload_candidates c
        where c.path = p_path and c.user_id = p_user_id and c.expected_revision = p_expected_revision
          and c.status = 'pending' and c.expires_at > clock_timestamp())
        then raise exception 'Upload candidate cancelled or expired' using errcode = '40001'; end if;
    elsif p_path is not null then raise exception 'CV sharing disabled' using errcode = '22023'; end if;
    snapshot := p_draft || jsonb_build_object(
      'contactEmail', case when (p_sharing->>'email')::boolean then p_draft->>'contactEmail' else '' end,
      'phone', case when (p_sharing->>'phone')::boolean then p_draft->>'phone' else '' end
    );
    insert into public.member_cv_publications(user_id, revision, snapshot, sharing, path)
      values(p_user_id, next_revision, snapshot, p_sharing, p_path);
    insert into public.students(id, full_name, email, personal_email, personal_phone, linkedin, field_of_study, graduation_year, profile_image_url, cv_url, career_entries, skills, visible_to_sponsors, share_cv, share_email, share_phone)
    values (
      p_user_id, snapshot->>'fullName',
      p_user_id::text || '@profile.invalid',
      nullif(snapshot->>'contactEmail', ''), nullif(snapshot->>'phone', ''),
      (select l->>'url' from jsonb_array_elements(snapshot->'links') l where lower(l->>'label') = 'linkedin' limit 1),
      nullif(snapshot->>'fieldOfStudy',''), nullif(snapshot->>'graduationYear','')::integer, null, p_path,
      coalesce(snapshot->'experience','[]'::jsonb),
      array(select jsonb_array_elements_text(snapshot->'skills')),
      true, (p_sharing->>'cv')::boolean, (p_sharing->>'email')::boolean, (p_sharing->>'phone')::boolean
    ) on conflict (id) do update set
      full_name = excluded.full_name, email = excluded.email, personal_email = excluded.personal_email,
      personal_phone = excluded.personal_phone, linkedin = excluded.linkedin, field_of_study = excluded.field_of_study,
      graduation_year = excluded.graduation_year, cv_url = excluded.cv_url,
      career_entries = excluded.career_entries, skills = excluded.skills, visible_to_sponsors = true,
      share_cv = excluded.share_cv, share_email = excluded.share_email, share_phone = excluded.share_phone, updated_at = now();
    delete from public.positions where student_id = p_user_id;
    insert into public.positions(student_id, season, title)
      select distinct p_user_id, coalesce(nullif(role.season, ''), 'Helix'), role.title
      from (
        -- Keep previously recorded project roles compatible until members move them.
        select p->>'season' as season, p->>'role' as title
        from jsonb_array_elements(snapshot->'projects') p
        union all
        select e->>'season' as season, e->>'title' as title
        from jsonb_array_elements(snapshot->'experience') e
        -- Match JavaScript's whitespace normalization, including pasted nonbreaking spaces.
        where lower(btrim(regexp_replace(e->>'organization', U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+', ' ', 'g'))) in ('helix', 'helix nmbu')
      ) role where coalesce(role.title, '') <> '';
    update public.member_cv_documents set published_revision = next_revision, published_at = now(), published_path = p_path where user_id = p_user_id;
    update public.member_cv_upload_candidates set status = 'current' where user_id = p_user_id and path = p_path;
  elsif p_action = 'withdraw' then
    update public.students set visible_to_sponsors = false, share_cv = false, share_email = false, share_phone = false,
      personal_email = null, personal_phone = null, email = p_user_id::text || '@profile.invalid', cv_url = null, updated_at = now() where id = p_user_id;
    update public.member_cv_documents set published_revision = null, published_at = null, published_path = null where user_id = p_user_id;
  end if;
  update public.member_cv_documents set revision = next_revision, updated_at = now() where user_id = p_user_id returning * into item;
  return to_jsonb(item);
end
$$;
revoke all on function public.commit_member_cv(uuid, text, integer, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.commit_member_cv(uuid, text, integer, jsonb, jsonb, text) to service_role;

-- Remove legacy direct owner writes that bypass draft/snapshot publication.
drop policy if exists member_own_profile on public.students;
drop policy if exists member_positions on public.positions;
revoke insert, update, delete on public.students, public.positions from authenticated, anon;
create policy member_read_published_profile on public.students for select to authenticated
  using (id = auth.uid() and (public.has_verified_member_workspace() or public.current_member_id() is not null));
create policy member_read_published_positions on public.positions for select to authenticated
  using (student_id = auth.uid() and (public.has_verified_member_workspace() or public.current_member_id() is not null));

-- An accidental Bronze/Service entitlement must never grant the directory.
create or replace function public.has_talent_directory_access(org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.sponsorship_agreements
    where organization_id = org_id and tier in ('Main','Gold','Silver') and talent_directory
      and current_date between starts_at and ends_at)
$$;

create or replace function public.list_sponsor_members()
returns table (
  id uuid, full_name text, email text, personal_email text, personal_phone text,
  linkedin text, field_of_study text, graduation_year integer, profile_image_url text,
  cv_url text, share_cv boolean, share_email boolean, share_phone boolean
) language sql stable security definer set search_path = public as $$
  select s.id, s.full_name,
    case when s.share_email then coalesce(nullif(s.personal_email,''), case when s.email not like '%@profile.invalid' then s.email end) end,
    null::text, case when s.share_phone then s.personal_phone end,
    s.linkedin, s.field_of_study, s.graduation_year, s.profile_image_url,
    case when s.share_cv then s.cv_url end, s.share_cv, s.share_email, s.share_phone
  from public.students s
  where s.visible_to_sponsors and public.has_talent_directory_access(public.current_sponsor_org_id())
  order by s.full_name
$$;

-- Exact current published paths only. Folder ownership and prior opportunity
-- interest must not expose superseded, withdrawn or unshared generated files.
drop policy if exists member_manage_cv on storage.objects;
drop policy if exists sponsor_read_shared_cv on storage.objects;
create or replace function public.can_read_current_member_cv(object_path text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.students s
    left join public.member_cv_documents d on d.user_id = s.id
    where s.cv_url = object_path
      and (d.user_id is null or (d.published_path = object_path and d.published_revision is not null))
      and (
        (s.id = auth.uid() and (public.has_verified_member_workspace() or public.current_member_id() is not null))
        or (s.visible_to_sponsors and s.share_cv and public.has_talent_directory_access(public.current_sponsor_org_id()))
      )
  )
$$;
revoke all on function public.can_read_current_member_cv(text) from public, anon;
grant execute on function public.can_read_current_member_cv(text) to authenticated, service_role;
create policy read_current_member_cv on storage.objects for select to authenticated
  using (bucket_id = 'member-cvs' and public.can_read_current_member_cv(name));

-- Keep this compatibility helper for older callers, but it must match the new
-- current publication gate and never bypass entitlement through opportunities.
create or replace function public.can_access_member_cv(target_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.students where id = target_user_id and cv_url is not null
    and public.can_read_current_member_cv(cv_url))
$$;
update storage.buckets set public = false, file_size_limit = 5242880 where id = 'member-cvs';
commit;
