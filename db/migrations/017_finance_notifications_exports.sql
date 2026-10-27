-- Finance notification delivery, purchase export metadata, and upload cleanup.
-- Additive. Does not edit migrations 011 through 016.
-- Dispatch, export, download, and cleanup do not bump finance.view_versions.
-- Those operations do not change a budget, purchase, request, or financing view.
--
-- Lock order (do not invert):
--   save_recovery_mutation:
--     1. pg_advisory_xact_lock(hashtextextended(actor::text || ':' || request_id::text, 0))
--     2. finance.idempotency_keys FOR UPDATE
--   claim_outbox_deliveries:
--     finance.outbox FOR UPDATE SKIP LOCKED, ordered by created_at, id
--   record_delivery_result and reconcile_outbox_delivery:
--     1. finance.outbox FOR UPDATE
--     2. finance.outbox_attempts FOR UPDATE
--   upload cleanup and upload reconciliation:
--     finance.uploads FOR UPDATE, ordered by id when more than one row is locked
--     then a read of finance.documents (no budget or system FOR UPDATE)
--   guard_document_upload (before insert on finance.documents):
--     finance.uploads FOR UPDATE for the matching storage key
-- Never lock a system row or the view-version row FOR UPDATE here.
-- Never call finance.lock_current_budget (that helper locks the budget FOR UPDATE).

begin;

alter table finance.outbox
  add column attempt_count integer not null default 0 check (attempt_count >= 0),
  add column next_attempt_at timestamptz,
  add column sent_at timestamptz,
  add column provider_message_id text,
  add column safe_error text;

alter table finance.outbox
  drop constraint if exists outbox_safe_error_check;

alter table finance.outbox
  add constraint outbox_safe_error_check check (
    safe_error is null or safe_error in (
      'recipient_not_allowlisted',
      'delivery_disabled',
      'recipient_inactive',
      'recipient_email_missing',
      'compose_failed',
      'provider_rejected',
      'provider_unknown',
      'attempt_bound',
      'reconciled_not_sent'
    )
  );

create table finance.outbox_attempts (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid not null references finance.outbox(id) on delete cascade,
  attempt_no integer not null check (attempt_no > 0),
  status text not null check (status in ('claimed', 'sent', 'failed', 'uncertain')),
  claim_token uuid not null unique,
  provider_idempotency_key text not null unique,
  provider_message_id text,
  safe_error text,
  claimed_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (outbox_id, attempt_no),
  check (
    safe_error is null or safe_error in (
      'recipient_not_allowlisted',
      'delivery_disabled',
      'recipient_inactive',
      'recipient_email_missing',
      'compose_failed',
      'provider_rejected',
      'provider_unknown',
      'attempt_bound',
      'reconciled_not_sent'
    )
  )
);

create unique index outbox_attempts_one_open
  on finance.outbox_attempts (outbox_id)
  where status in ('claimed', 'uncertain');

create table finance.export_objects (
  id uuid primary key,
  actor_member_id uuid not null references identity.members(id),
  storage_key text not null unique,
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size > 0),
  file_name text not null check (file_name = 'purchases.csv'),
  created_at timestamptz not null default now()
);

alter table finance.uploads
  add column commit_state text not null default 'settled' check (commit_state in ('settled', 'uncertain')),
  add column object_removed boolean not null default false;

create index uploads_cleanup_idx
  on finance.uploads (expires_at, id)
  where purchase_id is null and status <> 'abandoned';

alter table finance.outbox_attempts enable row level security;
alter table finance.export_objects enable row level security;

create or replace function finance.delivery_output_is_safe(p_response jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $fn$
  select p_response is not null
    and jsonb_typeof(p_response) = 'object'
    and p_response::text !~* 'refund_account|refund_phone|X-Amz-|AWSAccessKeyId=';
$fn$;

create or replace function finance.save_recovery_mutation(
  p_actor uuid,
  p_request_id uuid,
  p_action text,
  p_payload_hash text,
  p_capability text,
  p_response jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
declare
  existing finance.idempotency_keys%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_request_id::text, 0));
  if p_actor is null or not exists (select 1 from identity.members where id = p_actor) then
    raise exception 'FINANCE|denied|A verified Helix member account is required.';
  end if;
  if p_request_id is null or p_payload_hash is null or char_length(p_payload_hash) < 32 then
    raise exception 'FINANCE|invalid|A valid request ID is required.';
  end if;
  if not finance.member_has_capability(p_actor, p_capability) then
    raise exception 'FINANCE|denied|Finance access is required.';
  end if;
  if not finance.delivery_output_is_safe(p_response) then
    raise exception 'FINANCE|invalid|Recovery output cannot store refund details or signed links.';
  end if;
  select * into existing
  from finance.idempotency_keys
  where member_id = p_actor and request_id = p_request_id
  for update;
  if found then
    if existing.action <> p_action or existing.payload_hash <> p_payload_hash or existing.response is null then
      raise exception 'FINANCE|conflict|This request ID was already used for a different change.';
    end if;
    return existing.response;
  end if;
  insert into finance.idempotency_keys (member_id, request_id, action, payload_hash, response)
  values (p_actor, p_request_id, p_action, p_payload_hash, p_response);
  return p_response;
end;
$fn$;

create or replace function finance.replay_recovery_mutation(
  p_actor uuid,
  p_request_id uuid,
  p_action text,
  p_payload_hash text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  existing finance.idempotency_keys%rowtype;
begin
  select * into existing
  from finance.idempotency_keys
  where member_id = p_actor and request_id = p_request_id;
  if not found or existing.response is null then
    return null;
  end if;
  if existing.action = p_action and existing.payload_hash = p_payload_hash then
    return existing.response;
  end if;
  raise exception 'FINANCE|conflict|This request ID was already used for a different change.';
end;
$fn$;

create or replace function finance.claim_outbox_deliveries(
  p_limit integer,
  p_max_attempts integer,
  p_outbox_id uuid default null
) returns table (
  outbox_id uuid,
  claim_token uuid,
  attempt_no integer,
  event_type text,
  entity text,
  entity_id uuid,
  recipient_member_id uuid,
  provider_idempotency_key text
)
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  locked finance.outbox%rowtype;
  token uuid;
  attempt integer;
  idem text;
begin
  if p_limit is null or p_limit < 1 or p_limit > 25 then
    raise exception 'FINANCE|invalid|Choose a delivery batch between 1 and 25.';
  end if;
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 5 then
    raise exception 'FINANCE|invalid|Delivery attempts are bounded.';
  end if;
  for locked in
    select o.*
    from finance.outbox o
    where o.status in ('pending', 'failed')
      and (p_outbox_id is null or o.id = p_outbox_id)
      and o.attempt_count < p_max_attempts
      and (o.next_attempt_at is null or o.next_attempt_at <= clock_timestamp())
      and not exists (
        select 1
        from finance.outbox_attempts a
        where a.outbox_id = o.id
          and a.status in ('claimed', 'uncertain')
      )
    order by o.created_at, o.id
    limit p_limit
    for update skip locked
  loop
    token := gen_random_uuid();
    select coalesce(max(x.attempt_no), 0) + 1 into attempt
    from finance.outbox_attempts x
    where x.outbox_id = locked.id;
    idem := 'finance-outbox:' || locked.id::text || ':' || attempt::text;
    insert into finance.outbox_attempts (
      outbox_id, attempt_no, status, claim_token, provider_idempotency_key
    ) values (
      locked.id, attempt, 'claimed', token, idem
    );
    update finance.outbox
      set status = 'uncertain',
          attempt_count = locked.attempt_count + 1,
          safe_error = null,
          updated_at = clock_timestamp()
      where id = locked.id;
    outbox_id := locked.id;
    claim_token := token;
    attempt_no := attempt;
    event_type := locked.event_type;
    entity := locked.entity;
    entity_id := locked.entity_id;
    recipient_member_id := locked.recipient_member_id;
    provider_idempotency_key := idem;
    return next;
  end loop;
end;
$fn$;

create or replace function finance.record_delivery_result(
  p_claim_token uuid,
  p_outcome text,
  p_provider_message_id text,
  p_safe_error text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  attempt finance.outbox_attempts%rowtype;
  message_id text;
  target_outbox uuid;
begin
  if p_outcome not in ('sent', 'failed', 'uncertain') then
    raise exception 'FINANCE|invalid|Unknown delivery outcome.';
  end if;
  if p_safe_error is not null and p_safe_error not in (
    'recipient_not_allowlisted', 'delivery_disabled', 'recipient_inactive', 'recipient_email_missing',
    'compose_failed', 'provider_rejected', 'provider_unknown', 'attempt_bound', 'reconciled_not_sent'
  ) then
    raise exception 'FINANCE|invalid|Unknown delivery error.';
  end if;
  message_id := nullif(p_provider_message_id, '');
  if message_id is not null and message_id !~ '^[A-Za-z0-9_-]{1,128}$' then
    raise exception 'FINANCE|invalid|Unknown delivery error.';
  end if;
  select a.outbox_id into target_outbox
  from finance.outbox_attempts a
  where a.claim_token = p_claim_token;
  if not found then
    raise exception 'FINANCE|not_found|Delivery attempt not found.';
  end if;
  perform 1 from finance.outbox where id = target_outbox for update;
  select * into attempt
  from finance.outbox_attempts
  where claim_token = p_claim_token
  for update;
  if attempt.status = p_outcome then
    return jsonb_build_object('ok', true, 'status', attempt.status, 'replay', true);
  end if;
  if attempt.status <> 'claimed' then
    raise exception 'FINANCE|conflict|This delivery attempt was already recorded.';
  end if;
  update finance.outbox_attempts
    set status = p_outcome,
        provider_message_id = message_id,
        safe_error = p_safe_error,
        finished_at = clock_timestamp()
    where id = attempt.id;
  update finance.outbox
    set status = p_outcome,
        attempt_count = case
          when p_outcome = 'failed' and p_safe_error in ('delivery_disabled', 'recipient_not_allowlisted')
            then greatest(attempt_count - 1, 0)
          else attempt_count
        end,
        provider_message_id = coalesce(message_id, provider_message_id),
        safe_error = p_safe_error,
        sent_at = case when p_outcome = 'sent' then clock_timestamp() else sent_at end,
        next_attempt_at = case when p_outcome = 'failed' then clock_timestamp() else null end,
        updated_at = clock_timestamp()
    where id = attempt.outbox_id;
  return jsonb_build_object('ok', true, 'status', p_outcome, 'replay', false);
end;
$fn$;

create or replace function finance.reconcile_outbox_delivery(
  p_outbox_id uuid,
  p_observation text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  row finance.outbox%rowtype;
  attempt finance.outbox_attempts%rowtype;
  next_status text;
begin
  if p_observation not in ('sent', 'not_sent', 'still_unknown') then
    raise exception 'FINANCE|invalid|Unknown delivery observation.';
  end if;
  select * into row from finance.outbox where id = p_outbox_id for update;
  if not found then
    raise exception 'FINANCE|not_found|Delivery attempt not found.';
  end if;
  select * into attempt
  from finance.outbox_attempts
  where outbox_id = p_outbox_id
  order by attempt_no desc
  limit 1
  for update;
  if p_observation = 'still_unknown' then
    if row.status <> 'uncertain' then
      raise exception 'FINANCE|conflict|This delivery is not waiting for reconciliation.';
    end if;
    return jsonb_build_object('ok', true, 'status', 'uncertain', 'replay', false);
  end if;
  next_status := case when p_observation = 'sent' then 'sent' else 'failed' end;
  if row.status = next_status then
    return jsonb_build_object('ok', true, 'status', row.status, 'replay', true);
  end if;
  if row.status <> 'uncertain' then
    raise exception 'FINANCE|conflict|Reconcile the unknown delivery before retrying.';
  end if;
  if found and attempt.status = 'claimed' and attempt.claimed_at > clock_timestamp() - interval '5 minutes' then
    raise exception 'FINANCE|conflict|This delivery is still in progress. Try again in a few minutes.';
  end if;
  if found and attempt.status in ('claimed', 'uncertain') then
    update finance.outbox_attempts
      set status = next_status,
          safe_error = case when p_observation = 'not_sent' then 'reconciled_not_sent' else safe_error end,
          finished_at = clock_timestamp()
      where id = attempt.id;
  end if;
  update finance.outbox
    set status = next_status,
        safe_error = case when p_observation = 'not_sent' then 'reconciled_not_sent' else safe_error end,
        sent_at = case when p_observation = 'sent' then coalesce(sent_at, clock_timestamp()) else sent_at end,
        next_attempt_at = case when p_observation = 'not_sent' then clock_timestamp() else null end,
        updated_at = clock_timestamp()
    where id = p_outbox_id;
  return jsonb_build_object('ok', true, 'status', next_status, 'replay', false);
end;
$fn$;

create or replace function finance.guard_document_upload()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  upload finance.uploads%rowtype;
begin
  select * into upload
  from finance.uploads
  where final_key = new.storage_key or staging_key = new.storage_key
  for update;
  if found then
    if upload.status = 'abandoned' then
      raise exception 'FINANCE|conflict|This file is no longer available.';
    end if;
  end if;
  return new;
end;
$fn$;

create trigger documents_guard_upload
  before insert or update of storage_key on finance.documents
  for each row execute function finance.guard_document_upload();

create or replace function finance.upload_is_referenced(p_upload finance.uploads)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, finance
as $fn$
  select p_upload.purchase_id is not null
    or exists (
      select 1
      from finance.documents d
      where d.storage_key = p_upload.staging_key
         or (p_upload.final_key is not null and d.storage_key = p_upload.final_key)
    );
$fn$;

create or replace function finance.upload_keys_owned(p_upload finance.uploads)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $fn$
  select p_upload.staging_key like p_upload.member_id::text || '/%'
    and (
      p_upload.final_key is null
      or p_upload.final_key like p_upload.member_id::text || '/%'
    );
$fn$;

create or replace function finance.mark_upload_commit_uncertain(
  p_actor uuid,
  p_upload_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  upload finance.uploads%rowtype;
begin
  if not finance.member_has_capability(p_actor, 'purchaseRegister') then
    raise exception 'FINANCE|denied|Finance access is required.';
  end if;
  select * into upload from finance.uploads where id = p_upload_id for update;
  if not found then
    raise exception 'FINANCE|not_found|Upload not found.';
  end if;
  if finance.upload_is_referenced(upload) then
    raise exception 'FINANCE|conflict|This file is saved with a purchase and cannot be cleaned up.';
  end if;
  update finance.uploads set commit_state = 'uncertain' where id = p_upload_id;
  return jsonb_build_object('ok', true, 'commitState', 'uncertain');
end;
$fn$;

create or replace function finance.reconcile_upload_commit(
  p_actor uuid,
  p_upload_id uuid,
  p_observation text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  upload finance.uploads%rowtype;
  referenced boolean;
begin
  if p_observation not in ('saved', 'absent', 'still_unknown') then
    raise exception 'FINANCE|invalid|Unknown upload observation.';
  end if;
  if not finance.member_has_capability(p_actor, 'purchaseRegister') then
    raise exception 'FINANCE|denied|Finance access is required.';
  end if;
  select * into upload from finance.uploads where id = p_upload_id for update;
  if not found then
    raise exception 'FINANCE|not_found|Upload not found.';
  end if;
  if upload.commit_state <> 'uncertain' and p_observation = 'still_unknown' then
    raise exception 'FINANCE|conflict|This upload is not waiting for reconciliation.';
  end if;
  if p_observation = 'still_unknown' then
    return jsonb_build_object('ok', true, 'commitState', 'uncertain', 'replay', upload.commit_state = 'uncertain');
  end if;
  referenced := finance.upload_is_referenced(upload);
  if p_observation = 'saved' and not referenced then
    raise exception 'FINANCE|conflict|No saved purchase reference was found for this upload.';
  end if;
  if p_observation = 'absent' and referenced then
    raise exception 'FINANCE|conflict|This file is saved with a purchase and cannot be cleaned up.';
  end if;
  if upload.commit_state = 'settled' then
    return jsonb_build_object('ok', true, 'commitState', 'settled', 'replay', true);
  end if;
  update finance.uploads set commit_state = 'settled' where id = p_upload_id;
  return jsonb_build_object('ok', true, 'commitState', 'settled', 'replay', false);
end;
$fn$;

create or replace function finance.begin_upload_cleanup(
  p_actor uuid,
  p_upload_id uuid,
  p_now timestamptz,
  p_grace interval
) returns table (
  upload_id uuid,
  staging_key text,
  final_key text,
  member_id uuid
)
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  upload finance.uploads%rowtype;
  eligible boolean;
begin
  if not finance.member_has_capability(p_actor, 'purchaseRegister') then
    raise exception 'FINANCE|denied|Finance access is required.';
  end if;
  if p_grace is null or p_grace < interval '0' then
    raise exception 'FINANCE|invalid|Cleanup grace is invalid.';
  end if;
  select * into upload from finance.uploads where id = p_upload_id for update;
  if not found then
    raise exception 'FINANCE|not_found|Upload not found.';
  end if;
  if upload.commit_state = 'uncertain' then
    raise exception 'FINANCE|uncertain|Reconcile the unknown upload commit before deleting files.';
  end if;
  if not finance.upload_keys_owned(upload) then
    raise exception 'FINANCE|conflict|This upload path does not belong to its owner.';
  end if;
  if finance.upload_is_referenced(upload) then
    raise exception 'FINANCE|conflict|This file is saved with a purchase and cannot be cleaned up.';
  end if;
  eligible := (
    upload.status = 'pending'
    and upload.final_key is null
    and upload.expires_at <= p_now
  ) or (
    upload.status = 'finalized'
    and upload.expires_at <= p_now - p_grace
  ) or (
    upload.status = 'abandoned'
    and upload.object_removed is false
  );
  if not eligible then
    raise exception 'FINANCE|conflict|This upload is not ready for cleanup.';
  end if;
  if upload.status <> 'abandoned' then
    update finance.uploads set status = 'abandoned' where id = upload.id;
  end if;
  upload_id := upload.id;
  staging_key := upload.staging_key;
  final_key := upload.final_key;
  member_id := upload.member_id;
  return next;
end;
$fn$;

create or replace function finance.finish_upload_object_delete(
  p_actor uuid,
  p_upload_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
declare
  upload finance.uploads%rowtype;
begin
  if not finance.member_has_capability(p_actor, 'purchaseRegister') then
    raise exception 'FINANCE|denied|Finance access is required.';
  end if;
  select * into upload from finance.uploads where id = p_upload_id for update;
  if not found then
    raise exception 'FINANCE|not_found|Upload not found.';
  end if;
  if upload.commit_state = 'uncertain' then
    raise exception 'FINANCE|uncertain|Reconcile the unknown upload commit before deleting files.';
  end if;
  if upload.status <> 'abandoned' then
    raise exception 'FINANCE|conflict|This upload is not ready for cleanup.';
  end if;
  if finance.upload_is_referenced(upload) then
    raise exception 'FINANCE|conflict|This file is saved with a purchase and cannot be cleaned up.';
  end if;
  update finance.uploads set object_removed = true where id = p_upload_id;
  return jsonb_build_object('ok', true, 'removed', true);
end;
$fn$;

create or replace function finance.mark_upload_delete_uncertain(
  p_actor uuid,
  p_upload_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
begin
  if not finance.member_has_capability(p_actor, 'purchaseRegister') then
    raise exception 'FINANCE|denied|Finance access is required.';
  end if;
  perform 1 from finance.uploads where id = p_upload_id for update;
  if not found then
    raise exception 'FINANCE|not_found|Upload not found.';
  end if;
  update finance.uploads set commit_state = 'uncertain' where id = p_upload_id;
  return jsonb_build_object('ok', true, 'commitState', 'uncertain');
end;
$fn$;

create or replace function finance.list_upload_cleanup_ids(
  p_actor uuid,
  p_now timestamptz,
  p_grace interval,
  p_limit integer
) returns table (upload_id uuid)
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
begin
  if not finance.member_has_capability(p_actor, 'purchaseRegister') then
    raise exception 'FINANCE|denied|Finance access is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'FINANCE|invalid|Choose a cleanup batch between 1 and 50.';
  end if;
  return query
  select u.id
  from finance.uploads u
  where u.commit_state = 'settled'
    and u.purchase_id is null
    and u.object_removed is false
    and (
      (u.status = 'pending' and u.final_key is null and u.expires_at <= p_now)
      or (u.status = 'finalized' and u.expires_at <= p_now - p_grace)
      or u.status = 'abandoned'
    )
    and not exists (
      select 1 from finance.documents d
      where d.storage_key = u.staging_key
         or (u.final_key is not null and d.storage_key = u.final_key)
    )
  order by u.id
  limit p_limit;
end;
$fn$;

create or replace function finance.store_export_object(
  p_actor uuid,
  p_export_id uuid,
  p_storage_key text,
  p_sha256 text,
  p_byte_size bigint
) returns uuid
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
begin
  if not finance.member_has_capability(p_actor, 'purchaseRegister') then
    raise exception 'FINANCE|denied|Finance access is required.';
  end if;
  insert into finance.export_objects (id, actor_member_id, storage_key, content_sha256, byte_size, file_name)
  values (p_export_id, p_actor, p_storage_key, p_sha256, p_byte_size, 'purchases.csv');
  return p_export_id;
end;
$fn$;

revoke all on function finance.delivery_output_is_safe(jsonb) from public;
revoke all on function finance.save_recovery_mutation(uuid, uuid, text, text, text, jsonb) from public;
revoke all on function finance.replay_recovery_mutation(uuid, uuid, text, text) from public;
revoke all on function finance.claim_outbox_deliveries(integer, integer, uuid) from public;
revoke all on function finance.record_delivery_result(uuid, text, text, text) from public;
revoke all on function finance.reconcile_outbox_delivery(uuid, text) from public;
revoke all on function finance.guard_document_upload() from public;
revoke all on function finance.upload_is_referenced(finance.uploads) from public;
revoke all on function finance.upload_keys_owned(finance.uploads) from public;
revoke all on function finance.mark_upload_commit_uncertain(uuid, uuid) from public;
revoke all on function finance.reconcile_upload_commit(uuid, uuid, text) from public;
revoke all on function finance.begin_upload_cleanup(uuid, uuid, timestamptz, interval) from public;
revoke all on function finance.finish_upload_object_delete(uuid, uuid) from public;
revoke all on function finance.mark_upload_delete_uncertain(uuid, uuid) from public;
revoke all on function finance.list_upload_cleanup_ids(uuid, timestamptz, interval, integer) from public;
revoke all on function finance.store_export_object(uuid, uuid, text, text, bigint) from public;

grant execute on function finance.delivery_output_is_safe(jsonb) to current_user;
grant execute on function finance.save_recovery_mutation(uuid, uuid, text, text, text, jsonb) to current_user;
grant execute on function finance.replay_recovery_mutation(uuid, uuid, text, text) to current_user;
grant execute on function finance.claim_outbox_deliveries(integer, integer, uuid) to current_user;
grant execute on function finance.record_delivery_result(uuid, text, text, text) to current_user;
grant execute on function finance.reconcile_outbox_delivery(uuid, text) to current_user;
grant execute on function finance.guard_document_upload() to current_user;
grant execute on function finance.upload_is_referenced(finance.uploads) to current_user;
grant execute on function finance.upload_keys_owned(finance.uploads) to current_user;
grant execute on function finance.mark_upload_commit_uncertain(uuid, uuid) to current_user;
grant execute on function finance.reconcile_upload_commit(uuid, uuid, text) to current_user;
grant execute on function finance.begin_upload_cleanup(uuid, uuid, timestamptz, interval) to current_user;
grant execute on function finance.finish_upload_object_delete(uuid, uuid) to current_user;
grant execute on function finance.mark_upload_delete_uncertain(uuid, uuid) to current_user;
grant execute on function finance.list_upload_cleanup_ids(uuid, timestamptz, interval, integer) to current_user;
grant execute on function finance.store_export_object(uuid, uuid, text, text, bigint) to current_user;

commit;
