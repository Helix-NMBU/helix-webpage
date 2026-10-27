-- Preserve existing assignments and store every co-assignee with member FKs.
begin;
create table if not exists project_management.task_assignees (
  task_id uuid not null references project_management.tasks(id) on delete cascade,
  member_id uuid not null references identity.members(id) on delete cascade,
  primary key (task_id, member_id)
);
create index if not exists task_assignees_member_idx on project_management.task_assignees(member_id, task_id);

-- Idempotent backfill: the old column exists only until its assignments migrate.
do $$
begin
  if exists(select 1 from information_schema.columns where table_schema='project_management' and table_name='tasks' and column_name='assignee_id') then
    insert into project_management.task_assignees(task_id,member_id)
      select id,assignee_id from project_management.tasks where assignee_id is not null on conflict do nothing;
    alter table project_management.tasks drop column assignee_id;
  end if;
end;
$$;

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
      insert into project_management.tasks(id,season,title,description,category,project_id,deadline,start_date,status,priority,kind,partner_name,blocked_reason,completed_at)
      values(target,'S27',data->>'title',data->>'description',data->>'category',(data->>'projectId')::uuid,
        (data->>'deadline')::date,(data->>'startDate')::date,data->>'status',data->>'priority',data->>'kind',data->>'partnerName',data->>'blockedReason',
        case when data->>'status' = 'done' then now() else null end) returning id into result_id;
    else
      select * into task_row from project_management.tasks where id = target and season = 'S27' for update;
      if not found then raise exception 'project_not_found'; end if;
      if not (task_row.category = any(lead_categories)) then raise exception 'project_task_lead_required'; end if;
      if task_row.revision <> expected then raise exception 'project_conflict'; end if;
      update project_management.tasks set title = data->>'title', description = data->>'description', category = data->>'category',
        project_id = (data->>'projectId')::uuid, deadline = (data->>'deadline')::date,
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
alter table project_management.task_assignees enable row level security;
revoke all on project_management.task_assignees from public;
grant select, insert, update, delete on project_management.task_assignees to current_user;
revoke all on function project_management.mutate(uuid,text,text,jsonb) from public;
grant execute on function project_management.mutate(uuid,text,text,jsonb) to current_user;
commit;
