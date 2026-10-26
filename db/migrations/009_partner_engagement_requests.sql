-- Let partner-portal requests use the existing Helix request queue and lifecycle.
-- Legacy sponsor requests continue to use organization_id; partner requests use
-- partner_organization_id. Exactly one owner is required for every request.
begin;

alter table sponsor.requests alter column organization_id drop not null;
alter table sponsor.requests add column if not exists partner_organization_id uuid
  references partner.organizations(id);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sponsor_requests_exactly_one_organization'
      and conrelid = 'sponsor.requests'::regclass
  ) then
    alter table sponsor.requests
      add constraint sponsor_requests_exactly_one_organization
      check ((organization_id is not null) <> (partner_organization_id is not null));
  end if;
end;
$$;

create index if not exists sponsor_requests_partner_organization
  on sponsor.requests (partner_organization_id, updated_at desc)
  where partner_organization_id is not null;

-- Server API checks this in addition to partner.published_cvs before listing or
-- signing a download, so direct API calls cannot bypass the tier boundary.
create or replace function partner.can_access_directory(p_user uuid, p_organization uuid)
returns boolean language sql stable security invoker set search_path = pg_catalog as $$
  select exists (
    select 1
    from partner.authorized_memberships(p_user) m
    join partner.organizations o on o.id = m.organization_id
    where m.organization_id = p_organization
      and o.agreement_tier in ('silver', 'gold', 'platinum', 'main')
  );
$$;

create or replace function partner.can_manage_requests(p_user uuid, p_organization uuid)
returns boolean language sql stable security invoker set search_path = pg_catalog as $$
  select exists (
    select 1
    from partner.authorized_memberships(p_user) m
    join partner.organizations o on o.id = m.organization_id
    where m.organization_id = p_organization
      and o.agreement_tier in ('bronze', 'silver', 'gold', 'platinum', 'main')
  );
$$;

create or replace function partner.create_engagement_request(
  p_user uuid, p_organization uuid, p_type text, p_title text, p_body text
) returns uuid language plpgsql security invoker set search_path = pg_catalog, sponsor, partner as $$
declare actor_email_address text; request_id uuid;
begin
  if not partner.can_manage_requests(p_user, p_organization) then
    raise exception 'Current partner request access is required.' using errcode = '42501';
  end if;
  select lower(u.email) into actor_email_address from neon_auth."user" u
    where u.id = p_user and u."emailVerified" and not coalesce(u.banned, false);
  if actor_email_address is null then
    raise exception 'A verified account is required.' using errcode = '42501';
  end if;
  if p_type not in ('general_collaboration', 'thesis_project', 'recruitment')
    or length(btrim(p_title)) not between 1 and 160
    or length(btrim(p_body)) not between 1 and 10000 then
    raise exception 'Check the request fields.' using errcode = '22023';
  end if;
  insert into sponsor.requests(
    organization_id, partner_organization_id, author_auth_user_id, author_email, type, title, body
  ) values (null, p_organization, p_user, actor_email_address, p_type, btrim(p_title), btrim(p_body))
  returning id into request_id;
  insert into sponsor.request_history(request_id, revision, actor_email, kind, to_status)
    values(request_id, 0, actor_email_address, 'created', 'submitted');
  return request_id;
end;
$$;

create or replace function partner.mutate_engagement_request(
  p_user uuid, p_organization uuid, p_request uuid, p_revision integer,
  p_operation text, p_payload jsonb
) returns uuid language plpgsql security invoker set search_path = pg_catalog, sponsor, partner as $$
declare item sponsor.requests%rowtype; actor_email_address text; next_status text; event_kind text;
begin
  if not partner.can_manage_requests(p_user, p_organization) then
    raise exception 'Current partner request access is required.' using errcode = '42501';
  end if;
  select * into item from sponsor.requests
    where id = p_request and partner_organization_id = p_organization for update;
  if item.id is null then raise exception 'Request was not found.' using errcode = 'P0002'; end if;
  select lower(u.email) into actor_email_address from neon_auth."user" u
    where u.id = p_user and u."emailVerified" and not coalesce(u.banned, false);
  if actor_email_address is null then raise exception 'A verified account is required.' using errcode = '42501'; end if;
  if p_revision is null or p_revision <> item.revision then
    raise exception 'This request changed. Reload it before trying again.' using errcode = '40001';
  end if;
  if item.status in ('completed', 'declined', 'cancelled') then
    raise exception 'Closed requests are read-only.' using errcode = '40001';
  end if;
  next_status := item.status;
  if p_operation = 'reply' then
    if jsonb_typeof(p_payload->'body') is distinct from 'string'
      or length(btrim(p_payload->>'body')) not between 1 and 10000 then
      raise exception 'Reply must contain 1 to 10000 characters.' using errcode = '22023';
    end if;
    insert into sponsor.request_replies(request_id, author_auth_user_id, author_email, actor, body)
      values(item.id, p_user, actor_email_address, 'sponsor', btrim(p_payload->>'body'));
    if item.status = 'input_needed' then next_status := 'under_review'; end if;
    event_kind := 'reply';
  elsif p_operation = 'status' and p_payload->>'status' = 'cancelled' then
    next_status := 'cancelled';
    event_kind := 'status';
  else
    raise exception 'This request operation is not allowed.' using errcode = '42501';
  end if;
  update sponsor.requests
    set status = next_status, revision = revision + 1, updated_at = clock_timestamp()
    where id = item.id;
  insert into sponsor.request_history(request_id, revision, actor_email, kind, from_status, to_status)
    values(item.id, item.revision + 1, actor_email_address, event_kind, item.status, next_status);
  return item.id;
end;
$$;

revoke all on function partner.can_manage_requests(uuid, uuid) from public;
revoke all on function partner.can_access_directory(uuid, uuid) from public;
revoke all on function partner.create_engagement_request(uuid, uuid, text, text, text) from public;
revoke all on function partner.mutate_engagement_request(uuid, uuid, uuid, integer, text, jsonb) from public;

commit;
