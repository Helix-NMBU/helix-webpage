-- Collaboration requests are private to a sponsor organization and authorized Helix administrators.
begin;
create table if not exists sponsor.requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references sponsor.organizations(id),
  author_auth_user_id uuid not null references neon_auth."user"(id),
  author_email text not null,
  type text not null check (type in ('general_collaboration', 'thesis_project', 'recruitment')),
  title text not null check (length(btrim(title)) between 1 and 160),
  body text not null check (length(btrim(body)) between 1 and 10000),
  status text not null default 'submitted' check (status in ('submitted', 'under_review', 'input_needed', 'completed', 'declined', 'cancelled')),
  assigned_admin_id uuid references sponsor.staff(id),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);
create index if not exists sponsor_requests_organization on sponsor.requests (organization_id, updated_at desc);
create table if not exists sponsor.request_replies (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references sponsor.requests(id),
  author_auth_user_id uuid not null references neon_auth."user"(id),
  author_email text not null,
  actor text not null check (actor in ('sponsor', 'admin')),
  body text not null check (length(btrim(body)) between 1 and 10000),
  created_at timestamptz not null default clock_timestamp()
);
create table if not exists sponsor.request_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references sponsor.requests(id),
  revision integer not null,
  actor_email text not null,
  kind text not null check (kind in ('created', 'assigned', 'status', 'reply')),
  from_status text,
  to_status text,
  assigned_admin_email text,
  created_at timestamptz not null default clock_timestamp(),
  unique (request_id, revision)
);

-- Recheck current database grants inside each mutation, including after a caller read its session.
create or replace function sponsor.create_request(p_user uuid, p_type text, p_title text, p_body text)
returns uuid language plpgsql set search_path = sponsor, pg_temp as $$
declare contact sponsor.contacts%rowtype; actor_email_address text; request_id uuid;
begin
  select lower(u.email) into actor_email_address from neon_auth."user" u
    where u.id = p_user and u."emailVerified" and not coalesce(u.banned, false);
  if actor_email_address is null then raise exception 'A verified account is required.' using errcode = '42501'; end if;
  select c.* into contact from sponsor.contacts c
    join sponsor.organizations o on o.id = c.organization_id and o.active
    join sponsor.agreements a on a.organization_id = o.id
    where c.auth_user_id = p_user and c.email = actor_email_address and c.active
      and a.revoked_at is null and a.starts_at <= clock_timestamp() and a.ends_at > clock_timestamp()
      and a.tier in ('bronze', 'silver', 'gold', 'platinum', 'main');
  if contact.id is null then raise exception 'Current sponsor access is required.' using errcode = '42501'; end if;
  insert into sponsor.requests(organization_id, author_auth_user_id, author_email, type, title, body)
    values(contact.organization_id, p_user, actor_email_address, p_type, p_title, p_body) returning id into request_id;
  insert into sponsor.request_history(request_id, revision, actor_email, kind, to_status)
    values(request_id, 0, actor_email_address, 'created', 'submitted');
  return request_id;
end $$;

create or replace function sponsor.mutate_request(p_user uuid, p_request uuid, p_revision integer, p_operation text, p_payload jsonb)
returns uuid language plpgsql set search_path = sponsor, pg_temp as $$
declare item sponsor.requests%rowtype; actor_email_address text; admin_id uuid; contact_org uuid;
  next_status text; assignee uuid; assignee_email text; actor text; kind text;
begin
  select * into item from sponsor.requests where id = p_request for update;
  if item.id is null then raise exception 'Request was not found.' using errcode = 'P0002'; end if;
  select lower(u.email) into actor_email_address from neon_auth."user" u
    where u.id = p_user and u."emailVerified" and not coalesce(u.banned, false);
  if actor_email_address is null then raise exception 'A verified account is required.' using errcode = '42501'; end if;
  select s.id into admin_id from sponsor.staff s
    where s.auth_user_id = p_user and s.email = actor_email_address and s.active and s.role = 'admin';
  if admin_id is null then
    select c.organization_id into contact_org from sponsor.contacts c
      join sponsor.organizations o on o.id = c.organization_id and o.active
      join sponsor.agreements a on a.organization_id = o.id
      where c.auth_user_id = p_user and c.email = actor_email_address and c.active
        and a.revoked_at is null and a.starts_at <= clock_timestamp() and a.ends_at > clock_timestamp()
        and a.tier in ('bronze', 'silver', 'gold', 'platinum', 'main');
    if contact_org is null then raise exception 'Current sponsor access is required.' using errcode = '42501'; end if;
    if contact_org <> item.organization_id then raise exception 'Request was not found.' using errcode = 'P0002'; end if;
  end if;
  if p_revision is null or p_revision <> item.revision then raise exception 'This request changed. Reload it before trying again.' using errcode = '40001'; end if;
  if item.status in ('completed', 'declined', 'cancelled') then raise exception 'Closed requests are read-only.' using errcode = '40001'; end if;
  actor := case when admin_id is null then 'sponsor' else 'admin' end;
  next_status := item.status;
  if p_operation = 'assign' then
    if admin_id is null then raise exception 'Administrator access is required.' using errcode = '42501'; end if;
    assignee := (p_payload->>'assigneeId')::uuid;
    select s.email into assignee_email from sponsor.staff s join neon_auth."user" u on u.id = s.auth_user_id
      where s.id = assignee and s.active and s.role = 'admin' and lower(u.email) = s.email
        and u."emailVerified" and not coalesce(u.banned, false);
    if assignee_email is null then raise exception 'Choose an active administrator.' using errcode = '22023'; end if;
    if item.assigned_admin_id = assignee then raise exception 'This administrator already owns the request.' using errcode = '22023'; end if;
    update sponsor.requests set assigned_admin_id = assignee where id = item.id;
    kind := 'assigned';
  elsif p_operation in ('reply', 'status') then
    if admin_id is not null and item.assigned_admin_id is distinct from admin_id then
      raise exception 'Assign this request to yourself before replying or changing status.' using errcode = '42501';
    end if;
    if p_operation = 'reply' then
      if jsonb_typeof(p_payload->'body') is distinct from 'string' or length(btrim(p_payload->>'body')) not between 1 and 10000 then
        raise exception 'Reply must contain 1 to 10000 characters.' using errcode = '22023';
      end if;
      insert into sponsor.request_replies(request_id, author_auth_user_id, author_email, actor, body)
        values(item.id, p_user, actor_email_address, actor, p_payload->>'body');
      if actor = 'sponsor' and item.status = 'input_needed' then next_status := 'under_review'; end if;
      kind := 'reply';
    else
      next_status := p_payload->>'status';
      if actor = 'sponsor' then
        if next_status is distinct from 'cancelled' then raise exception 'This status change is not allowed.' using errcode = '42501'; end if;
      elsif not coalesce(
        (item.status = 'submitted' and next_status in ('under_review', 'input_needed', 'declined'))
        or (item.status = 'under_review' and next_status in ('input_needed', 'completed', 'declined'))
        or (item.status = 'input_needed' and next_status in ('under_review', 'completed', 'declined')), false) then
        raise exception 'This status change is not allowed.' using errcode = '42501';
      end if;
      kind := 'status';
    end if;
  else raise exception 'Choose a valid request operation.' using errcode = '22023';
  end if;
  update sponsor.requests set status = next_status, revision = revision + 1, updated_at = clock_timestamp() where id = item.id;
  insert into sponsor.request_history(request_id, revision, actor_email, kind, from_status, to_status, assigned_admin_email)
    values(item.id, item.revision + 1, actor_email_address, kind, item.status, next_status, assignee_email);
  return item.id;
end $$;

revoke all on sponsor.requests, sponsor.request_replies, sponsor.request_history from public;
grant select, insert, update, delete on sponsor.requests, sponsor.request_replies, sponsor.request_history to current_user;
revoke all on function sponsor.create_request(uuid,text,text,text) from public;
revoke all on function sponsor.mutate_request(uuid,uuid,integer,text,jsonb) from public;
commit;
