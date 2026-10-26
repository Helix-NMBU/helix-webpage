-- Trusted-server project management storage. No users, grants or tasks are seeded.
begin;
create schema if not exists project_management;
create table if not exists project_management.access (
  member_id uuid primary key references identity.members(id) on delete cascade,
  active boolean not null default false,
  can_manage boolean not null default false
);
create table if not exists project_management.projects (
  id uuid primary key,
  season text not null check (season = 'S27'),
  name text not null check (length(btrim(name)) between 1 and 200),
  description text not null default '' check (length(description) <= 2000),
  category text not null check (category in ('production','partnership-deliverables','marketing','operations')),
  departments text[] not null default '{}' check (cardinality(departments) <= 10),
  deadline date,
  revision integer not null default 1 check (revision > 0),
  unique (id, season, category)
);
create table if not exists project_management.tasks (
  id uuid primary key,
  season text not null check (season = 'S27'),
  title text not null check (length(btrim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 2000),
  category text not null check (category in ('production','partnership-deliverables','marketing','operations')),
  project_id uuid,
  assignee_id uuid references identity.members(id) on delete set null,
  deadline date,
  start_date date,
  status text not null check (status in ('todo','in_progress','blocked','done','cancelled')),
  priority text not null check (priority in ('low','normal','high','urgent')),
  kind text not null check (kind in ('task','milestone')),
  partner_name text not null default '' check (length(partner_name) <= 200),
  blocked_reason text not null default '' check (length(blocked_reason) <= 500),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (project_id, season, category) references project_management.projects(id, season, category),
  check (start_date is null or deadline is null or start_date <= deadline),
  check (kind <> 'milestone' or deadline is not null),
  check (category <> 'partnership-deliverables' or length(btrim(partner_name)) > 0),
  check (status <> 'blocked' or length(btrim(blocked_reason)) > 0),
  check ((status = 'done') = (completed_at is not null))
);
create index if not exists project_tasks_assignee_idx on project_management.tasks(assignee_id, season);
create index if not exists project_tasks_deadline_idx on project_management.tasks(season, deadline);
create index if not exists project_tasks_project_idx on project_management.tasks(project_id);

-- All checks and writes share one transaction. Lock grants against concurrent
-- revocation and task rows against concurrent edits before checking revisions.
create or replace function project_management.mutate(p_member_id uuid, p_google_sub text, p_email text, p_change jsonb)
returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare
  manager boolean;
  action text := p_change->>'action';
  target uuid := (p_change->>'id')::uuid;
  expected integer := (p_change->>'expectedRevision')::integer;
  data jsonb;
  task_row project_management.tasks;
  project_row project_management.projects;
  result_id uuid;
begin
  select a.can_manage into manager from project_management.access a
    join identity.members m on m.id = a.member_id
    join neon_auth."user" u on u.id = m.auth_user_id
    where a.member_id = p_member_id and a.active and m.google_sub = p_google_sub and m.email = p_email
      and lower(u.email) = m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account linked where linked."userId" = u.id and linked."providerId" = 'google' and linked."accountId" = m.google_sub)
    for share of a;
  if not found then raise exception 'project_forbidden'; end if;
  if expected is null or expected < 0 then raise exception 'project_invalid'; end if;
  if action = 'set_status' then
    select * into task_row from project_management.tasks where id = target and season = 'S27' for update;
    if not found then raise exception 'project_not_found'; end if;
    if not manager and task_row.assignee_id is distinct from p_member_id then raise exception 'project_forbidden'; end if;
    if task_row.revision <> expected then raise exception 'project_conflict'; end if;
    update project_management.tasks set status = p_change->>'status', blocked_reason = p_change->>'blockedReason',
      completed_at = case when p_change->>'status' = 'done' then coalesce(task_row.completed_at, now()) else null end,
      revision = revision + 1, updated_at = now() where id = target returning id into result_id;
  elsif action = 'save_task' then
    if not manager then raise exception 'project_forbidden'; end if;
    data := p_change->'task';
    if data->>'assigneeId' is not null then
      perform a.member_id from project_management.access a
        join identity.members m on m.id = a.member_id
        join neon_auth."user" u on u.id = m.auth_user_id
        where a.member_id = (data->>'assigneeId')::uuid and a.active
          and lower(u.email) = m.email and u."emailVerified" is true and u.banned is not true
          and exists(select 1 from neon_auth.account linked where linked."userId" = u.id and linked."providerId" = 'google' and linked."accountId" = m.google_sub)
        for share of a;
      if not found then raise exception 'project_invalid_reference'; end if;
    end if;
    if data->>'projectId' is not null then
      perform id from project_management.projects where id = (data->>'projectId')::uuid and season = 'S27' and category = data->>'category' for share;
      if not found then raise exception 'project_invalid_reference'; end if;
    end if;
    if expected = 0 then
      insert into project_management.tasks(id,season,title,description,category,project_id,assignee_id,deadline,start_date,status,priority,kind,partner_name,blocked_reason,completed_at)
      values(target,'S27',data->>'title',data->>'description',data->>'category',(data->>'projectId')::uuid,(data->>'assigneeId')::uuid,
        (data->>'deadline')::date,(data->>'startDate')::date,data->>'status',data->>'priority',data->>'kind',data->>'partnerName',data->>'blockedReason',
        case when data->>'status' = 'done' then now() else null end) returning id into result_id;
    else
      select * into task_row from project_management.tasks where id = target and season = 'S27' for update;
      if not found then raise exception 'project_not_found'; end if;
      if task_row.revision <> expected then raise exception 'project_conflict'; end if;
      update project_management.tasks set title = data->>'title', description = data->>'description', category = data->>'category',
        project_id = (data->>'projectId')::uuid, assignee_id = (data->>'assigneeId')::uuid, deadline = (data->>'deadline')::date,
        start_date = (data->>'startDate')::date, status = data->>'status', priority = data->>'priority', kind = data->>'kind',
        partner_name = data->>'partnerName', blocked_reason = data->>'blockedReason', revision = revision + 1, updated_at = now(),
        completed_at = case when data->>'status' = 'done' then coalesce(task_row.completed_at, now()) else null end
        where id = target returning id into result_id;
    end if;
  elsif action = 'save_project' then
    if not manager then raise exception 'project_forbidden'; end if;
    data := p_change->'project';
    if expected = 0 then
      insert into project_management.projects(id,season,name,description,category,departments,deadline)
      values(target,'S27',data->>'name',data->>'description',data->>'category',array(select jsonb_array_elements_text(data->'departments')),(data->>'deadline')::date)
      returning id into result_id;
    else
      select * into project_row from project_management.projects where id = target and season = 'S27' for update;
      if not found then raise exception 'project_not_found'; end if;
      if project_row.revision <> expected then raise exception 'project_conflict'; end if;
      if exists(select 1 from project_management.tasks where project_id = target and category <> data->>'category') then
        raise exception 'project_invalid_reference';
      end if;
      update project_management.projects set name = data->>'name', description = data->>'description', category = data->>'category',
        departments = array(select jsonb_array_elements_text(data->'departments')), deadline = (data->>'deadline')::date, revision = revision + 1
        where id = target returning id into result_id;
    end if;
  else raise exception 'project_invalid';
  end if;
  return result_id;
end;
$$;
alter table project_management.access enable row level security;
alter table project_management.projects enable row level security;
alter table project_management.tasks enable row level security;
revoke all on schema project_management from public;
revoke all on all tables in schema project_management from public;
revoke all on all functions in schema project_management from public;
grant usage on schema project_management to current_user;
grant select, insert, update, delete on all tables in schema project_management to current_user;
grant execute on all functions in schema project_management to current_user;
commit;
