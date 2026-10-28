-- Durable ownership of each final-object candidate before the storage write.
-- Lock order: upload, then candidate. Cleanup never holds locks over object I/O.
begin;

create table finance.upload_final_candidates (
  storage_key text primary key,
  upload_id uuid not null references finance.uploads(id),
  member_id uuid not null references identity.members(id),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  status text not null default 'pending' check (status in ('pending', 'published', 'cleanup')),
  created_at timestamptz not null default clock_timestamp(),
  last_cleaned_at timestamptz
);
create index upload_final_candidates_upload_idx on finance.upload_final_candidates (upload_id, status);
create index upload_final_candidates_cleanup_idx on finance.upload_final_candidates (status, created_at, last_cleaned_at);
alter table finance.upload_final_candidates enable row level security;
revoke all on finance.upload_final_candidates from public;

create or replace function finance.reserve_upload_final_candidate(
  p_actor uuid, p_upload_id uuid, p_key text, p_sha256 text, p_byte_size bigint
) returns void
language plpgsql security invoker set search_path = pg_catalog, finance as $fn$
declare upload finance.uploads%rowtype;
begin
  if p_actor is null or not finance.member_has_capability(p_actor, 'registerActual') then
    raise exception 'FINANCE|denied|Finance access is required.';
  end if;
  select * into upload from finance.uploads where id = p_upload_id for update;
  if not found or p_actor is null or upload.member_id <> p_actor then
    raise exception 'FINANCE|not_found|Upload not found.';
  end if;
  if upload.status <> 'pending' then
    raise exception 'FINANCE|conflict|This upload has already been finalized.';
  end if;
  if p_key !~ ('^' || p_actor::text || '/final/' || p_upload_id::text || '/[0-9a-f]{32}$')
     or p_sha256 !~ '^[0-9a-f]{64}$' or p_byte_size is distinct from upload.byte_size then
    raise exception 'FINANCE|invalid|Invalid final upload details.';
  end if;
  insert into finance.upload_final_candidates (storage_key, upload_id, member_id, content_sha256, byte_size)
  values (p_key, p_upload_id, p_actor, p_sha256, p_byte_size);
end;
$fn$;

create or replace function finance.complete_upload_finalize(
  p_actor uuid, p_upload_id uuid, p_final_key text, p_content_sha256 text,
  p_byte_size bigint, p_content_type text
) returns void
language plpgsql security invoker set search_path = pg_catalog, finance as $fn$
declare upload finance.uploads%rowtype; candidate finance.upload_final_candidates%rowtype;
begin
  select * into upload from finance.uploads where id = p_upload_id for update;
  if not found or p_actor is null or upload.member_id <> p_actor then
    raise exception 'FINANCE|not_found|Upload not found.';
  end if;
  if upload.status <> 'pending' then
    raise exception 'FINANCE|conflict|This upload has already been finalized.';
  end if;
  select * into candidate from finance.upload_final_candidates where storage_key = p_final_key for update;
  if not found or candidate.upload_id <> p_upload_id or candidate.member_id <> p_actor
     or candidate.status <> 'pending' or candidate.content_sha256 <> p_content_sha256
     or candidate.byte_size <> p_byte_size or upload.byte_size is distinct from p_byte_size then
    raise exception 'FINANCE|conflict|The final upload is no longer available.';
  end if;
  update finance.uploads set status = 'finalized', final_key = p_final_key,
    content_sha256 = p_content_sha256, content_type = p_content_type, byte_size = p_byte_size
  where id = p_upload_id;
  update finance.upload_final_candidates set status = 'published' where storage_key = p_final_key;
end;
$fn$;

create or replace function finance.begin_final_candidate_cleanup(
  p_actor uuid, p_upload_id uuid, p_key text, p_now timestamptz, p_grace interval
) returns boolean
language plpgsql security invoker set search_path = pg_catalog, finance as $fn$
declare upload finance.uploads%rowtype; candidate finance.upload_final_candidates%rowtype;
begin
  select * into upload from finance.uploads where id = p_upload_id for update;
  if not found then raise exception 'FINANCE|not_found|Upload not found.'; end if;
  select * into candidate from finance.upload_final_candidates where storage_key = p_key and upload_id = p_upload_id for update;
  if not found then raise exception 'FINANCE|not_found|Final upload candidate not found.'; end if;
  if p_actor is null or (p_actor = upload.member_id and not finance.member_has_capability(p_actor, 'registerActual'))
     or (p_actor <> upload.member_id and not finance.member_has_capability(p_actor, 'purchaseRegister')) then
    raise exception 'FINANCE|denied|Finance access is required.';
  end if;
  if candidate.status = 'published' or exists (select 1 from finance.uploads where final_key = p_key)
     or exists (select 1 from finance.documents where storage_key = p_key) then
    raise exception 'FINANCE|conflict|This file is saved with a purchase and cannot be cleaned up.';
  end if;
  if upload.status = 'pending' and (not finance.member_has_capability(p_actor, 'purchaseRegister') or p_grace is null
      or p_grace < interval '0' or candidate.created_at > p_now - p_grace) then
    raise exception 'FINANCE|conflict|This final upload is not ready for cleanup.';
  end if;
  update finance.upload_final_candidates set status = 'cleanup' where storage_key = p_key;
  return true;
end;
$fn$;

create or replace function finance.finish_final_candidate_cleanup(p_actor uuid, p_upload_id uuid, p_key text, p_now timestamptz)
returns void
language plpgsql security invoker set search_path = pg_catalog, finance as $fn$
declare upload finance.uploads%rowtype; candidate finance.upload_final_candidates%rowtype;
begin
  select * into upload from finance.uploads where id = p_upload_id for update;
  if not found then raise exception 'FINANCE|not_found|Upload not found.'; end if;
  select * into candidate from finance.upload_final_candidates where storage_key = p_key and upload_id = p_upload_id for update;
  if not found then raise exception 'FINANCE|not_found|Final upload candidate not found.'; end if;
  if p_actor is null or (p_actor = upload.member_id and not finance.member_has_capability(p_actor, 'registerActual'))
     or (p_actor <> upload.member_id and not finance.member_has_capability(p_actor, 'purchaseRegister')) then
    raise exception 'FINANCE|denied|Finance access is required.';
  end if;
  if candidate.status <> 'cleanup' or exists (select 1 from finance.uploads where final_key = p_key)
     or exists (select 1 from finance.documents where storage_key = p_key) then
    raise exception 'FINANCE|conflict|This file is saved with a purchase and cannot be cleaned up.';
  end if;
  update finance.upload_final_candidates set last_cleaned_at = p_now where storage_key = p_key;
end;
$fn$;

create or replace function finance.list_final_candidate_cleanup_ids(
  p_actor uuid, p_now timestamptz, p_grace interval, p_limit integer, p_upload_id uuid default null
) returns table (upload_id uuid, storage_key text)
language plpgsql security invoker set search_path = pg_catalog, finance as $fn$
begin
  if p_actor is null or not finance.member_has_capability(p_actor, 'purchaseRegister') then
    raise exception 'FINANCE|denied|Finance access is required.';
  end if;
  if p_grace is null or p_grace < interval '0' or p_limit is null or p_limit < 1 then
    raise exception 'FINANCE|invalid|Cleanup settings are invalid.';
  end if;
  return query select c.upload_id, c.storage_key from finance.upload_final_candidates c
  where c.status in ('pending', 'cleanup')
    and (p_upload_id is null or c.upload_id = p_upload_id)
    and c.created_at <= p_now - p_grace
    and (c.last_cleaned_at is null or c.last_cleaned_at <= p_now - p_grace)
    and not exists (select 1 from finance.uploads u where u.final_key = c.storage_key)
    and not exists (select 1 from finance.documents d where d.storage_key = c.storage_key)
  order by c.created_at, c.storage_key limit least(p_limit, 50);
end;
$fn$;

revoke all on function finance.reserve_upload_final_candidate(uuid, uuid, text, text, bigint) from public;
revoke all on function finance.complete_upload_finalize(uuid, uuid, text, text, bigint, text) from public;
revoke all on function finance.begin_final_candidate_cleanup(uuid, uuid, text, timestamptz, interval) from public;
revoke all on function finance.finish_final_candidate_cleanup(uuid, uuid, text, timestamptz) from public;
revoke all on function finance.list_final_candidate_cleanup_ids(uuid, timestamptz, interval, integer, uuid) from public;
grant execute on function finance.reserve_upload_final_candidate(uuid, uuid, text, text, bigint) to current_user;
grant execute on function finance.complete_upload_finalize(uuid, uuid, text, text, bigint, text) to current_user;
grant execute on function finance.begin_final_candidate_cleanup(uuid, uuid, text, timestamptz, interval) to current_user;
grant execute on function finance.finish_final_candidate_cleanup(uuid, uuid, text, timestamptz) to current_user;
grant execute on function finance.list_final_candidate_cleanup_ids(uuid, timestamptz, interval, integer, uuid) to current_user;
commit;
