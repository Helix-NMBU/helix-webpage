-- Milestone links and observed task state history. Baseline starts at migration time;
-- scheduled dates and prior completion timestamps are never inferred as history.
begin;
alter table project_management.tasks add column if not exists milestone_id uuid references project_management.tasks(id);
create index if not exists project_tasks_milestone_idx on project_management.tasks(milestone_id);

-- Serialize relation edits before row locks, including trusted direct-SQL writes.
create or replace function project_management.lock_task_relations()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  perform pg_advisory_xact_lock(72704, 12);
  return null;
end;
$$;
drop trigger if exists project_task_relations_lock on project_management.tasks;
create trigger project_task_relations_lock before insert or update or delete on project_management.tasks
for each statement execute function project_management.lock_task_relations();

create or replace function project_management.check_milestone_link()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
declare
  milestone project_management.tasks;
begin
  if new.milestone_id is not null then
    if new.id = new.milestone_id or new.kind <> 'task' then raise exception 'project_invalid_reference'; end if;
    select * into milestone from project_management.tasks where id = new.milestone_id;
    if not found or milestone.kind <> 'milestone' or milestone.season <> new.season or milestone.category <> new.category
      or (milestone.project_id is not null and milestone.project_id is distinct from new.project_id) then
      raise exception 'project_invalid_reference';
    end if;
    -- Cancelling a milestone preserves its old links; it cannot receive new tasks.
    if milestone.status = 'cancelled' and (tg_op = 'INSERT' or old.milestone_id is distinct from new.milestone_id) then
      raise exception 'project_invalid_reference';
    end if;
  end if;
  if exists(select 1 from project_management.tasks child where child.milestone_id = new.id
    and (new.kind <> 'milestone' or child.season <> new.season or child.category <> new.category
      or (new.project_id is not null and new.project_id is distinct from child.project_id))) then
    raise exception 'project_invalid_reference';
  end if;
  return new;
end;
$$;
drop trigger if exists project_task_milestone_check on project_management.tasks;
create trigger project_task_milestone_check before insert or update on project_management.tasks
for each row execute function project_management.check_milestone_link();

-- Intentionally no task FK: deletion must retain the observed state history.
create table if not exists project_management.task_progress_events (
  event_id bigint generated always as identity primary key,
  task_id uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  season text not null check (season = 'S27'),
  category text not null check (category in ('production','partnership-deliverables','marketing','operations')),
  kind text not null check (kind in ('task','milestone')),
  status text not null check (status in ('todo','in_progress','blocked','done','cancelled'))
);
create index if not exists task_progress_events_season_order_idx on project_management.task_progress_events(season,recorded_at,event_id);
create index if not exists task_progress_events_task_idx on project_management.task_progress_events(task_id);
insert into project_management.task_progress_events(task_id,season,category,kind,status)
  select t.id,t.season,t.category,t.kind,t.status from project_management.tasks t
  where not exists(select 1 from project_management.task_progress_events e where e.task_id=t.id);

create or replace function project_management.record_task_progress()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  if tg_op = 'DELETE' then
    insert into project_management.task_progress_events(task_id,season,category,kind,status)
      values(old.id,old.season,old.category,old.kind,'cancelled');
    return old;
  end if;
  if tg_op = 'INSERT' or (new.season,new.category,new.kind,new.status) is distinct from (old.season,old.category,old.kind,old.status) then
    insert into project_management.task_progress_events(task_id,season,category,kind,status)
      values(new.id,new.season,new.category,new.kind,new.status);
  end if;
  return new;
end;
$$;
drop trigger if exists project_task_progress_record on project_management.tasks;
create trigger project_task_progress_record after insert or update or delete on project_management.tasks
for each row execute function project_management.record_task_progress();

create or replace function project_management.keep_task_progress_immutable()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
begin
  raise exception 'project_invalid_immutable_history';
end;
$$;
drop trigger if exists project_task_progress_immutable on project_management.task_progress_events;
create trigger project_task_progress_immutable before update or delete or truncate on project_management.task_progress_events
for each statement execute function project_management.keep_task_progress_immutable();

create or replace function project_management.mutate(p_member_id uuid, p_google_sub text, p_email text, p_change jsonb)
returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare
  manager boolean;
  lead_categories text[];
  action text := p_change->>'action';
  target uuid := (p_change->>'id')::uuid;
  expected integer := (p_change->>'expectedRevision')::integer;
  data jsonb;
  task_row project_management.tasks;
  project_row project_management.projects;
  result_id uuid;
  assignee_uuid uuid;
begin
  -- Match the statement trigger lock order before taking any task/project row locks.
  perform pg_advisory_xact_lock(72704, 12);
  select a.can_manage, a.task_lead_categories into manager, lead_categories from project_management.access a
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
    if not manager and not exists(select 1 from project_management.task_assignees ta where ta.task_id=target and ta.member_id=p_member_id) and not (task_row.category = any(lead_categories)) then raise exception 'project_forbidden'; end if;
    if task_row.revision <> expected then raise exception 'project_conflict'; end if;
    update project_management.tasks set status = p_change->>'status', blocked_reason = p_change->>'blockedReason',
      completed_at = case when p_change->>'status' = 'done' then coalesce(task_row.completed_at, now()) else null end,
      revision = revision + 1, updated_at = now() where id = target returning id into result_id;
  elsif action = 'save_task' then
    data := p_change->'task';
    if not (data ? 'milestoneId') then raise exception 'project_invalid'; end if;
    if not coalesce((data->>'category') = any(lead_categories), false) then raise exception 'project_task_lead_required'; end if;
    if jsonb_typeof(data->'assigneeIds') is distinct from 'array' then raise exception 'project_invalid'; end if;
    if jsonb_array_length(data->'assigneeIds') > 20 then raise exception 'project_invalid'; end if;
    for assignee_uuid in select distinct value::uuid from jsonb_array_elements_text(data->'assigneeIds') as assignee(value) order by 1 loop
      perform a.member_id from project_management.access a
        join identity.members m on m.id = a.member_id
        join neon_auth."user" u on u.id = m.auth_user_id
        where a.member_id = assignee_uuid and a.active
          and lower(u.email) = m.email and u."emailVerified" is true and u.banned is not true
          and exists(select 1 from neon_auth.account linked where linked."userId" = u.id and linked."providerId" = 'google' and linked."accountId" = m.google_sub)
        for share of a;
      if not found then raise exception 'project_invalid_reference'; end if;
    end loop;
    if data->>'projectId' is not null then
      perform id from project_management.projects where id = (data->>'projectId')::uuid and season = 'S27' and category = data->>'category' for share;
      if not found then raise exception 'project_invalid_reference'; end if;
    end if;
    if expected = 0 then
      insert into project_management.tasks(id,season,title,description,category,project_id,milestone_id,deadline,start_date,status,priority,kind,partner_name,blocked_reason,completed_at)
      values(target,'S27',data->>'title',data->>'description',data->>'category',(data->>'projectId')::uuid,(data->>'milestoneId')::uuid,
        (data->>'deadline')::date,(data->>'startDate')::date,data->>'status',data->>'priority',data->>'kind',data->>'partnerName',data->>'blockedReason',
        case when data->>'status' = 'done' then now() else null end) returning id into result_id;
    else
      select * into task_row from project_management.tasks where id = target and season = 'S27' for update;
      if not found then raise exception 'project_not_found'; end if;
      if not (task_row.category = any(lead_categories)) then raise exception 'project_task_lead_required'; end if;
      if task_row.revision <> expected then raise exception 'project_conflict'; end if;
      update project_management.tasks set title = data->>'title', description = data->>'description', category = data->>'category',
        project_id = (data->>'projectId')::uuid, milestone_id = (data->>'milestoneId')::uuid, deadline = (data->>'deadline')::date,
        start_date = (data->>'startDate')::date, status = data->>'status', priority = data->>'priority', kind = data->>'kind',
        partner_name = data->>'partnerName', blocked_reason = data->>'blockedReason', revision = revision + 1, updated_at = now(),
        completed_at = case when data->>'status' = 'done' then coalesce(task_row.completed_at, now()) else null end
        where id = target returning id into result_id;
    end if;
    delete from project_management.task_assignees where task_id=target;
    insert into project_management.task_assignees(task_id,member_id)
      select target, value::uuid from jsonb_array_elements_text(data->'assigneeIds') as assignee(value)
      on conflict do nothing;
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
alter table project_management.task_progress_events enable row level security;
revoke all on project_management.task_progress_events from public;
grant select, insert on project_management.task_progress_events to current_user;
revoke all on sequence project_management.task_progress_events_event_id_seq from public;
grant usage, select on sequence project_management.task_progress_events_event_id_seq to current_user;
revoke all on function project_management.lock_task_relations(), project_management.check_milestone_link(),
  project_management.record_task_progress(), project_management.keep_task_progress_immutable(),
  project_management.mutate(uuid,text,text,jsonb) from public;
grant execute on function project_management.lock_task_relations(), project_management.check_milestone_link(),
  project_management.record_task_progress(), project_management.keep_task_progress_immutable(),
  project_management.mutate(uuid,text,text,jsonb) to current_user;
commit;
