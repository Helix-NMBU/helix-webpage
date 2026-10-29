-- Store project status independently while preserving existing displayed status.
begin;
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='project_management' and table_name='projects' and column_name='status') then
    alter table project_management.projects add column status text not null default 'todo' check (status in ('backlog','todo','in_progress','done','blocked','cancelled'));
    update project_management.projects p set status = case
      when not exists (select 1 from project_management.tasks t where t.project_id=p.id and t.kind='task') then 'todo'
      when not exists (select 1 from project_management.tasks t where t.project_id=p.id and t.kind='task' and t.status <> 'cancelled') then 'cancelled'
      when not exists (select 1 from project_management.tasks t where t.project_id=p.id and t.kind='task' and t.status not in ('done','cancelled')) then 'done'
      when exists (select 1 from project_management.tasks t where t.project_id=p.id and t.kind='task' and t.status='blocked') then 'blocked'
      when exists (select 1 from project_management.tasks t where t.project_id=p.id and t.kind='task' and t.status in ('in_progress','done')) then 'in_progress'
      else 'todo' end;
  end if;
end $$;
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
  assignee_uuid uuid;
begin
  -- Match the statement trigger lock order before taking any task/project row locks.
  perform pg_advisory_xact_lock(72704, 12);
  perform a.member_id from project_management.access a where a.member_id=p_member_id for share;
  select project_management.is_department_manager(m.id) into manager from identity.members m
    join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=p_member_id and m.google_sub=p_google_sub and m.email=p_email
      and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account linked where linked."userId"=u.id and linked."providerId"='google' and linked."accountId"=m.google_sub)
    for share of m;
  if not found then raise exception 'project_forbidden'; end if;
  if expected is null or expected < 0 then raise exception 'project_invalid'; end if;
  if action='delete_project' then
    select * into project_row from project_management.projects where id=target and season='S27' for update;
    if not found then raise exception 'project_not_found'; end if;
    if not project_management.can_access_project(p_member_id,project_row.departments,true) then raise exception 'project_forbidden'; end if;
    if project_row.revision<>expected then raise exception 'project_conflict'; end if;
    delete from project_management.tasks where project_id=target and kind='task';
    delete from project_management.tasks where project_id=target;
    delete from project_management.projects where id=target;
    return target;
  elsif action='delete_task' then
    select * into task_row from project_management.tasks where id=target and season='S27' for update;
    if not found then raise exception 'project_not_found'; end if;
    if not project_management.can_access_task(p_member_id,target,true) then raise exception 'project_forbidden'; end if;
    if task_row.revision<>expected then raise exception 'project_conflict'; end if;
    delete from project_management.tasks where milestone_id=target;
    delete from project_management.tasks where id=target;
    return target;
  elsif action = 'set_status' then
    select * into task_row from project_management.tasks where id = target and season = 'S27' for update;
    if not found then raise exception 'project_not_found'; end if;
    if not project_management.can_access_task(p_member_id,target,true) and not (
      task_row.kind='task' and exists(select 1 from project_management.task_assignees ta where ta.task_id=target and ta.member_id=p_member_id)
      and exists(select 1 from project_management.projects p join project_management.departments d on d.name=any(p.departments) and d.season=p.season
        join project_management.department_members dm on dm.department_id=d.id and dm.member_id=p_member_id and dm.access_level='member' where p.id=task_row.project_id)
    ) then raise exception 'project_forbidden'; end if;
    if task_row.revision <> expected then raise exception 'project_conflict'; end if;
    update project_management.tasks set status = p_change->>'status', blocked_reason = p_change->>'blockedReason',
      completed_at = case when p_change->>'status' = 'done' then coalesce(task_row.completed_at, now()) else null end,
      revision = revision + 1, updated_at = now() where id = target returning id into result_id;
  elsif action = 'update_milestone' then
    -- A field-only update never changes placement, identity, status or kind.
    data := p_change->'changes';
    if jsonb_typeof(data) is distinct from 'object' or data = '{}'::jsonb then raise exception 'project_invalid'; end if;
    if exists(select 1 from jsonb_object_keys(data) as fields(key) where key not in ('priority','assigneeIds','deadline')) then raise exception 'project_invalid'; end if;
    select * into task_row from project_management.tasks where id = target and season = 'S27' for update;
    if not found then raise exception 'project_not_found'; end if;
    if task_row.kind <> 'milestone' then raise exception 'project_invalid'; end if;
    if not project_management.can_access_task(p_member_id,target,true) then raise exception 'project_task_lead_required'; end if;
    if task_row.revision <> expected then raise exception 'project_conflict'; end if;
    if data ? 'priority' and (data->>'priority' is null or data->>'priority' not in ('low','normal','high','urgent')) then raise exception 'project_invalid'; end if;
    if data ? 'deadline' then
      if data->>'deadline' is null or data->>'deadline' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        or data->>'deadline' < '2000-01-01' or data->>'deadline' > '2100-12-31' then raise exception 'project_invalid'; end if;
      if task_row.start_date > (data->>'deadline')::date then raise exception 'project_invalid'; end if;
    end if;
    if data ? 'assigneeIds' then
      if jsonb_typeof(data->'assigneeIds') is distinct from 'array' then raise exception 'project_invalid'; end if;
      if jsonb_array_length(data->'assigneeIds') > 20 then raise exception 'project_invalid'; end if;
      for assignee_uuid in select distinct value::uuid from jsonb_array_elements_text(data->'assigneeIds') as assignee(value) order by 1 loop
        if assignee_uuid is null then raise exception 'project_invalid_reference'; end if;
        perform m.id from identity.members m
          left join neon_auth."user" u on u.id = m.auth_user_id
          where m.id=assignee_uuid and (project_management.is_department_manager(m.id) or exists(select 1 from project_management.department_members dm join project_management.departments d on d.id=dm.department_id join project_management.projects p on d.name=any(p.departments) and d.season=p.season where dm.member_id=m.id and p.id=coalesce((data->>'projectId')::uuid,task_row.project_id)) or (task_row.project_id is null and exists(select 1 from project_management.department_members dm where dm.member_id=m.id)))
            and ((m.auth_user_id is null and m.google_sub is null) or
              (lower(u.email) = m.email and u."emailVerified" is true and u.banned is not true
                and exists(select 1 from neon_auth.account linked where linked."userId" = u.id and linked."providerId" = 'google' and linked."accountId" = m.google_sub)))
          for share of m;
        if not found then raise exception 'project_invalid_reference'; end if;
      end loop;
    end if;
    update project_management.tasks set
      priority = case when data ? 'priority' then data->>'priority' else task_row.priority end,
      deadline = case when data ? 'deadline' then (data->>'deadline')::date else task_row.deadline end,
      revision = revision + 1, updated_at = now() where id = target returning id into result_id;
    if data ? 'assigneeIds' then
      delete from project_management.task_assignees where task_id=target;
      insert into project_management.task_assignees(task_id,member_id)
        select target, value::uuid from jsonb_array_elements_text(data->'assigneeIds') as assignee(value) on conflict do nothing;
    end if;
  elsif action = 'save_task' then
    data := p_change->'task';
    if not (data ? 'milestoneId') or data->>'projectId' is null
      or (data->>'kind' = 'task' and data->>'milestoneId' is null)
      or (data->>'kind' = 'milestone' and data->>'milestoneId' is not null) then
      raise exception 'project_invalid_hierarchy';
    end if;
    if not manager and not exists(select 1 from project_management.projects p where p.id=(data->>'projectId')::uuid and project_management.can_access_project(p_member_id,p.departments,true)) then raise exception 'project_task_lead_required'; end if;
    if jsonb_typeof(data->'assigneeIds') is distinct from 'array' then raise exception 'project_invalid'; end if;
    if jsonb_array_length(data->'assigneeIds') > 20 then raise exception 'project_invalid'; end if;
    for assignee_uuid in select distinct value::uuid from jsonb_array_elements_text(data->'assigneeIds') as assignee(value) order by 1 loop
      perform m.id from identity.members m
        left join neon_auth."user" u on u.id = m.auth_user_id
        where m.id=assignee_uuid and (project_management.is_department_manager(m.id) or exists(select 1 from project_management.department_members dm join project_management.departments d on d.id=dm.department_id join project_management.projects p on d.name=any(p.departments) and d.season=p.season where dm.member_id=m.id and p.id=coalesce((data->>'projectId')::uuid,task_row.project_id)) or (task_row.project_id is null and exists(select 1 from project_management.department_members dm where dm.member_id=m.id)))
          and ((data->>'kind' = 'milestone' and m.auth_user_id is null and m.google_sub is null) or
            (lower(u.email) = m.email and u."emailVerified" is true and u.banned is not true
              and exists(select 1 from neon_auth.account linked where linked."userId" = u.id and linked."providerId" = 'google' and linked."accountId" = m.google_sub)))
        for share of m;
      if not found then raise exception 'project_invalid_reference'; end if;
    end loop;
    if data->>'projectId' is not null then
      perform id from project_management.projects where id = (data->>'projectId')::uuid and season = 'S27' and category = data->>'category' for share;
      if not found then raise exception 'project_invalid_reference'; end if;
    end if;
    -- Full saves must organize legacy records too. Field-only and status updates
    -- are handled separately above; detail edits still require a scoped Lead.
    if data->>'kind' = 'task' then
      perform id from project_management.tasks where id = (data->>'milestoneId')::uuid
        and season = 'S27' and kind = 'milestone' and category = data->>'category'
        and project_id is not null and project_id = (data->>'projectId')::uuid;
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
      if not project_management.can_access_task(p_member_id,target,true) then raise exception 'project_task_lead_required'; end if;
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
    if p_change->'project' ? 'status' and (p_change->'project'->>'status' is null or p_change->'project'->>'status' not in ('backlog','todo','in_progress','done','blocked','cancelled')) then raise exception 'project_invalid'; end if;
    data := p_change->'project';
    if data ? 'startDate' and data->>'startDate' is not null then
      if data->>'startDate' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or data->>'startDate' < '2000-01-01' or data->>'startDate' > '2100-12-31' then raise exception 'project_invalid'; end if;
    end if;
    if not project_management.can_access_project(p_member_id,array(select jsonb_array_elements_text(data->'departments')),true) then raise exception 'project_forbidden'; end if;
    if jsonb_typeof(data->'leadIds') is distinct from 'array' or jsonb_array_length(data->'leadIds')>20 then raise exception 'project_invalid'; end if;
    for assignee_uuid in select value::uuid from jsonb_array_elements_text(data->'leadIds') loop
      -- Pending directory members can be named as leads, without granting them access.
      perform m.id from identity.members m left join neon_auth."user" u on u.id=m.auth_user_id
        where m.id=assignee_uuid and ((m.auth_user_id is null and m.google_sub is null) or
          (lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
          and exists(select 1 from neon_auth.account linked where linked."userId"=u.id and linked."providerId"='google' and linked."accountId"=m.google_sub)))
        for share of m;
      if not found then raise exception 'project_invalid_reference'; end if;
    end loop;
    if expected = 0 then
      insert into project_management.projects(id,season,name,description,category,departments,start_date,deadline,priority,lead_ids,status)
      values(target,'S27',data->>'name',data->>'description',data->>'category',array(select jsonb_array_elements_text(data->'departments')),(data->>'startDate')::date,(data->>'deadline')::date,data->>'priority',array(select value::uuid from jsonb_array_elements_text(data->'leadIds')),coalesce(data->>'status','todo'))
      returning id into result_id;
    else
      select * into project_row from project_management.projects where id = target and season = 'S27' for update;
      if not found then raise exception 'project_not_found'; end if;
      if project_row.revision <> expected then raise exception 'project_conflict'; end if;
      if not project_management.can_access_project(p_member_id,project_row.departments,true) then raise exception 'project_forbidden'; end if;
      if exists(select 1 from project_management.tasks where project_id = target and category <> data->>'category') then
        raise exception 'project_invalid_reference';
      end if;
      update project_management.projects set name = data->>'name', description = data->>'description', category = data->>'category',
        departments = array(select jsonb_array_elements_text(data->'departments')), start_date = case when data ? 'startDate' then (data->>'startDate')::date else project_row.start_date end, deadline = (data->>'deadline')::date, priority=data->>'priority',lead_ids=array(select value::uuid from jsonb_array_elements_text(data->'leadIds')), status=coalesce(data->>'status',project_row.status), revision = revision + 1
        where id = target returning id into result_id;
    end if;
  else raise exception 'project_invalid';
  end if;
  return result_id;
end;
$$;
revoke all on function project_management.mutate(uuid,text,text,jsonb) from public;
grant execute on function project_management.mutate(uuid,text,text,jsonb) to current_user;
commit;
