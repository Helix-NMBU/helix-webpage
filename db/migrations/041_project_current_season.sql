-- Project work uses the explicitly configured finance season. No member roster is copied.
begin;
create or replace function project_management.current_season() returns text language sql stable set search_path=pg_catalog as $$
 select coalesce((select setting_value #>> '{}' from finance.settings where setting_key='current_season'),'S27')
$$;
alter table project_management.projects drop constraint projects_season_check;
alter table project_management.projects add constraint projects_season_check check (season ~ '^S[0-9]{2}$');
alter table project_management.tasks drop constraint tasks_season_check;
alter table project_management.tasks add constraint tasks_season_check check (season ~ '^S[0-9]{2}$');
alter table project_management.departments drop constraint departments_season_check;
alter table project_management.departments add constraint departments_season_check check (season ~ '^S[0-9]{2}$');
alter table project_management.task_progress_events drop constraint task_progress_events_season_check;
alter table project_management.task_progress_events add constraint task_progress_events_season_check check (season ~ '^S[0-9]{2}$');

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
    select * into project_row from project_management.projects where id=target and season=project_management.current_season() for update;
    if not found then raise exception 'project_not_found'; end if;
    if not project_management.can_access_project(p_member_id,project_row.departments,true) then raise exception 'project_forbidden'; end if;
    if project_row.revision<>expected then raise exception 'project_conflict'; end if;
    delete from project_management.tasks where project_id=target and kind='task';
    delete from project_management.tasks where project_id=target;
    delete from project_management.projects where id=target;
    return target;
  elsif action='delete_task' then
    select * into task_row from project_management.tasks where id=target and season=project_management.current_season() for update;
    if not found then raise exception 'project_not_found'; end if;
    if not project_management.can_access_task(p_member_id,target,true) then raise exception 'project_forbidden'; end if;
    if task_row.revision<>expected then raise exception 'project_conflict'; end if;
    delete from project_management.tasks where milestone_id=target;
    delete from project_management.tasks where id=target;
    return target;
  elsif action = 'set_status' then
    select * into task_row from project_management.tasks where id = target and season = project_management.current_season() for update;
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
    select * into task_row from project_management.tasks where id = target and season = project_management.current_season() for update;
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
      perform id from project_management.projects where id = (data->>'projectId')::uuid and season = project_management.current_season() and category = data->>'category' for share;
      if not found then raise exception 'project_invalid_reference'; end if;
    end if;
    -- Full saves must organize legacy records too. Field-only and status updates
    -- are handled separately above; detail edits still require a scoped Lead.
    if data->>'kind' = 'task' then
      perform id from project_management.tasks where id = (data->>'milestoneId')::uuid
        and season = project_management.current_season() and kind = 'milestone' and category = data->>'category'
        and project_id is not null and project_id = (data->>'projectId')::uuid;
      if not found then raise exception 'project_invalid_reference'; end if;
    end if;
    if expected = 0 then
      insert into project_management.tasks(id,season,title,description,category,project_id,milestone_id,deadline,start_date,status,priority,kind,partner_name,blocked_reason,completed_at)
      values(target,project_management.current_season(),data->>'title',data->>'description',data->>'category',(data->>'projectId')::uuid,(data->>'milestoneId')::uuid,
        (data->>'deadline')::date,(data->>'startDate')::date,data->>'status',data->>'priority',data->>'kind',data->>'partnerName',data->>'blockedReason',
        case when data->>'status' = 'done' then now() else null end) returning id into result_id;
    else
      select * into task_row from project_management.tasks where id = target and season = project_management.current_season() for update;
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
      values(target,project_management.current_season(),data->>'name',data->>'description',data->>'category',array(select jsonb_array_elements_text(data->'departments')),(data->>'startDate')::date,(data->>'deadline')::date,data->>'priority',array(select value::uuid from jsonb_array_elements_text(data->'leadIds')),coalesce(data->>'status','todo'))
      returning id into result_id;
    else
      select * into project_row from project_management.projects where id = target and season = project_management.current_season() for update;
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

create or replace function project_management.save_department(p_member_id uuid, p_google_sub text, p_email text, p_change jsonb)
returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare
  manager boolean;
  target uuid := (p_change->>'id')::uuid;
  expected integer := (p_change->>'expectedRevision')::integer;
  data jsonb := p_change->'department';
  department_name text;
  previous project_management.departments;
  members uuid[];
  lead_uuids uuid[];
  candidate uuid;
begin
  perform pg_advisory_xact_lock(72704,12);
  select project_management.is_department_manager(m.id) into manager from identity.members m
    left join project_management.access a on m.id=a.member_id join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=p_member_id and m.google_sub=p_google_sub and m.email=p_email
      and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account linked where linked."userId"=u.id and linked."providerId"='google' and linked."accountId"=m.google_sub)
    for share of m;
  if not found or manager is not true then raise exception 'project_forbidden'; end if;
  if p_change->>'action' is distinct from 'save_department' or expected is null or expected < 1 then raise exception 'project_invalid'; end if;
  if jsonb_typeof(data) is distinct from 'object' or jsonb_typeof(data->'name') is distinct from 'string'
    or jsonb_typeof(data->'memberIds') is distinct from 'array' or (not (data ? 'leadId') and jsonb_typeof(data->'leadIds') is distinct from 'array') then raise exception 'project_invalid'; end if;
  department_name := btrim(data->>'name');
  if not (department_name=any(array['Management','Mechanical & Production','Electronics','Software & Autonomous','Business & Marketing','Logistics','Finance']::text[])) then raise exception 'project_invalid'; end if;
  if char_length(department_name) not between 1 and 100 or jsonb_array_length(data->'memberIds') > 500 then raise exception 'project_invalid'; end if;
  select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}'::uuid[]) into members from jsonb_array_elements_text(data->'memberIds') as selected(value);
  select coalesce(array_agg(distinct value::uuid),'{}'::uuid[]) into lead_uuids from jsonb_array_elements_text(case when data ? 'leadIds' then data->'leadIds' when data->>'leadId' is not null then jsonb_build_array(data->>'leadId') else '[]'::jsonb end);
  if exists(select 1 from unnest(lead_uuids) lead where not (lead=any(members)) or project_management.is_department_manager(lead)) then raise exception 'project_department_member'; end if;
  foreach candidate in array members loop
    if candidate is null then raise exception 'project_department_member'; end if;
    perform m.id from identity.members m left join neon_auth."user" u on u.id=m.auth_user_id
      where m.id=candidate and ((m.auth_user_id is null and m.google_sub is null) or (lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
        and exists(select 1 from neon_auth.account linked where linked."userId"=u.id and linked."providerId"='google' and linked."accountId"=m.google_sub)))
      for share of m;
    if not found then raise exception 'project_department_member'; end if;
  end loop;
  if exists(select 1 from project_management.departments where season=project_management.current_season() and lower(name)=lower(department_name) and id<>target) then raise exception 'project_department_exists'; end if;
    select * into previous from project_management.departments where id=target and season=project_management.current_season() for update;
    if not found then raise exception 'project_not_found'; end if;
    if previous.revision<>expected then raise exception 'project_conflict'; end if;
    if previous.name<>department_name then raise exception 'project_department_name'; end if;
    update project_management.departments set revision=revision+1,updated_at=now() where id=target;
  -- Upsert instead of deleting existing Viewer grants.
  delete from project_management.department_members where department_id=target and not(member_id=any(members)) and not project_management.is_department_manager(member_id);
  insert into project_management.department_members(department_id,member_id,is_lead,access_level)
    select target,selected_id,selected_id=any(lead_uuids),case when selected_id=any(lead_uuids) then 'lead' when data ? 'viewerIds' then case when selected_id::text in (select jsonb_array_elements_text(data->'viewerIds')) then 'viewer' else 'member' end else coalesce((select nullif(access_level,'lead') from project_management.department_members where department_id=target and member_id=selected_id),'member') end from unnest(members) as selected(selected_id)
    on conflict(department_id,member_id) do update set is_lead=excluded.is_lead,access_level=excluded.access_level;
  return target;
end;
$$;

create or replace function identity.save_workspace_member(p_actor uuid,p_sub text,p_email text,p_change jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare
  target uuid := (p_change->>'id')::uuid;
  previous identity.members;
  department project_management.departments;
  choice jsonb;
  next_access text;
  previous_access text;
  was_member boolean;
  was_lead boolean;
begin
  perform pg_advisory_xact_lock(72704,12);
  perform m.id from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=p_actor and m.google_sub=p_sub and m.email=p_email and m.email='henrik.engdal@helixnmbu.no'
      and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub);
  if not found then raise exception 'workspace_forbidden'; end if;
  select m.* into previous from identity.members m left join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=target and ((m.auth_user_id is null and m.google_sub is null) or
      (u."emailVerified" is true and u.banned is not true and lower(u.email)=m.email
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub))) for update of m;
  if not found then raise exception 'workspace_not_found'; end if;
  if previous.directory_revision<>(p_change->>'expectedRevision')::integer then raise exception 'workspace_conflict'; end if;
  if char_length(btrim(p_change->>'name')) not between 1 and 160 or char_length(coalesce(p_change->>'helixRole',''))>150 then raise exception 'workspace_invalid'; end if;
  if jsonb_typeof(p_change->'departments') is distinct from 'array' or jsonb_array_length(p_change->'departments')<>7 then raise exception 'workspace_invalid'; end if;
  for department in select * from project_management.departments where season=project_management.current_season() order by id for update loop
    if (select count(*) from jsonb_array_elements(p_change->'departments') c where (c->>'id')::uuid=department.id)<>1 then raise exception 'workspace_invalid'; end if;
    select c into choice from jsonb_array_elements(p_change->'departments') c where (c->>'id')::uuid=department.id;
    if department.revision<>(choice->>'revision')::integer then raise exception 'workspace_conflict'; end if;
    if jsonb_typeof(choice->'member') is distinct from 'boolean' or jsonb_typeof(choice->'lead') is distinct from 'boolean' or ((choice->>'lead')::boolean and not (choice->>'member')::boolean) then raise exception 'workspace_invalid'; end if;
    select access_level into previous_access from project_management.department_members where department_id=department.id and member_id=target;
    next_access := case when project_management.is_department_manager(target) then 'viewer'
      when choice ? 'access' then choice->>'access'
      when (choice->>'lead')::boolean then 'lead'
      when (choice->>'member')::boolean then coalesce(nullif(previous_access,'lead'),'member') else null end;
    if next_access is not null and next_access not in ('member','viewer','lead') then raise exception 'workspace_invalid'; end if;
    if choice ? 'access' and ((choice->>'member')::boolean is distinct from (choice->>'access' is not null) or (choice->>'lead')::boolean is distinct from (choice->>'access'='lead' and choice->>'access' is not null)) then raise exception 'workspace_invalid'; end if;
    select exists(select 1 from project_management.department_members where department_id=department.id and member_id=target),exists(select 1 from project_management.department_members where department_id=department.id and member_id=target and is_lead) into was_member,was_lead;
    if previous_access is distinct from next_access then
      delete from project_management.department_members where department_id=department.id and member_id=target;
      if next_access is not null then insert into project_management.department_members(department_id,member_id,is_lead,access_level) values(department.id,target,next_access='lead',next_access); end if;
      update project_management.departments set revision=revision+1,updated_at=now() where id=department.id;
    end if;
  end loop;
  update identity.members set full_name=btrim(p_change->>'name'),helix_role=nullif(btrim(p_change->>'helixRole'),''),directory_revision=directory_revision+1 where id=target;
end;
$$;

create or replace function project_management.save_department_home(p_actor uuid,p_sub text,p_email text,p_change jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare
  target uuid := (p_change->>'departmentId')::uuid;
  expected integer := (p_change->>'expectedRevision')::integer;
  previous project_management.department_homes;
begin
  perform pg_advisory_xact_lock(72704,12);
  perform a.member_id from project_management.access a where a.member_id=p_actor for share;
  perform dm.member_id from project_management.department_members dm
    join project_management.departments d on d.id=dm.department_id
    join identity.members m on m.id=dm.member_id join neon_auth."user" u on u.id=m.auth_user_id
    where d.id=target and d.season=project_management.current_season() and dm.member_id=p_actor and (dm.access_level='lead' or project_management.is_department_manager(p_actor))
      and m.google_sub=p_sub and m.email=p_email and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub)
    for share of dm,m;
  if not found then raise exception 'department_home_forbidden'; end if;
  if p_change->>'action' is distinct from 'save_department_home' or expected is null or expected<0 or jsonb_typeof(p_change->'description') is distinct from 'string' or char_length(p_change->>'description')>2000 or not(p_change ? 'driveFolderUrl') then raise exception 'department_home_invalid'; end if;
  select * into previous from project_management.department_homes where department_id=target for update;
  if coalesce(previous.revision,0)<>expected then raise exception 'department_home_conflict'; end if;
  insert into project_management.department_homes(department_id,description,drive_folder_url,revision)
    values(target,btrim(p_change->>'description'),p_change->>'driveFolderUrl',1)
    on conflict(department_id) do update set description=excluded.description,drive_folder_url=excluded.drive_folder_url,revision=project_management.department_homes.revision+1,updated_at=now();
end;
$$;

create or replace function identity.save_workspace_access(p_actor uuid,p_sub text,p_email text,p_change jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare
  target uuid := (p_change->>'memberId')::uuid;
  previous identity.members;
  department project_management.departments;
  choice jsonb;
  spaces text[];
  next_access text;
  previous_access text;
  was_member boolean;
  was_lead boolean;
begin
  perform pg_advisory_xact_lock(72704,12);
  perform m.id from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=p_actor and m.google_sub=p_sub and m.email=p_email
      and identity.member_has_feature(m.id,'member_access.manage')
      and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub);
  if not found then raise exception 'workspace_forbidden'; end if;
  select m.* into previous from identity.members m left join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=target and ((m.auth_user_id is null and m.google_sub is null) or
      (u."emailVerified" is true and u.banned is not true and lower(u.email)=m.email
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub))) for update of m;
  if not found then raise exception 'workspace_not_found'; end if;
  if previous.directory_revision is distinct from (p_change->>'expectedRevision')::integer then raise exception 'workspace_conflict'; end if;
  if jsonb_typeof(p_change->'departments') is distinct from 'array' or jsonb_array_length(p_change->'departments')<>7 then raise exception 'workspace_invalid'; end if;
  if jsonb_typeof(p_change->'spaceKeys') is distinct from 'array' or jsonb_array_length(p_change->'spaceKeys')>3 then raise exception 'workspace_invalid'; end if;
  if exists(select 1 from jsonb_array_elements(p_change->'spaceKeys') item where jsonb_typeof(item)<>'string') then raise exception 'workspace_invalid'; end if;
  select coalesce(array_agg(value),'{}'::text[]) into spaces from jsonb_array_elements_text(p_change->'spaceKeys');
  if exists(select 1 from unnest(spaces) value where value not in ('season-overview','recruiting','financials'))
    or cardinality(spaces)<>(select count(distinct value) from unnest(spaces) value) then raise exception 'workspace_invalid'; end if;
  for department in select * from project_management.departments where season=project_management.current_season() order by id for update loop
    if (select count(*) from jsonb_array_elements(p_change->'departments') c where (c->>'id')::uuid=department.id)<>1 then raise exception 'workspace_invalid'; end if;
    select c into choice from jsonb_array_elements(p_change->'departments') c where (c->>'id')::uuid=department.id;
    if department.revision is distinct from (choice->>'revision')::integer then raise exception 'workspace_conflict'; end if;
    if jsonb_typeof(choice->'member') is distinct from 'boolean' or jsonb_typeof(choice->'lead') is distinct from 'boolean' or ((choice->>'lead')::boolean and not (choice->>'member')::boolean) then raise exception 'workspace_invalid'; end if;
    select access_level into previous_access from project_management.department_members where department_id=department.id and member_id=target;
    next_access := case when project_management.is_department_manager(target) then 'viewer'
      when choice ? 'access' then choice->>'access'
      when (choice->>'lead')::boolean then 'lead'
      when (choice->>'member')::boolean then coalesce(nullif(previous_access,'lead'),'member') else null end;
    if next_access is not null and next_access not in ('member','viewer','lead') then raise exception 'workspace_invalid'; end if;
    if choice ? 'access' and ((choice->>'member')::boolean is distinct from (choice->>'access' is not null) or (choice->>'lead')::boolean is distinct from (choice->>'access'='lead' and choice->>'access' is not null)) then raise exception 'workspace_invalid'; end if;
    select exists(select 1 from project_management.department_members where department_id=department.id and member_id=target),exists(select 1 from project_management.department_members where department_id=department.id and member_id=target and is_lead) into was_member,was_lead;
    if previous_access is distinct from next_access then
      delete from project_management.department_members where department_id=department.id and member_id=target;
      if next_access is not null then insert into project_management.department_members(department_id,member_id,is_lead,access_level) values(department.id,target,next_access='lead',next_access); end if;
      update project_management.departments set revision=revision+1,updated_at=now() where id=department.id;
    end if;
  end loop;
  if 'season-overview'=any(spaces) then
    insert into project_management.access(member_id,active) values(target,true) on conflict(member_id) do update set active=true;
  else
    update project_management.access set active=false where member_id=target and active;
  end if;
  insert into identity.member_feature_overrides(member_id,feature_key,allowed) values(target,'recruitment.manage','recruiting'=any(spaces))
    on conflict(member_id,feature_key) do update set allowed=excluded.allowed;
  if 'financials'=any(spaces) then
    insert into identity.member_roles(member_id,role_key) values(target,'financials') on conflict do nothing;
  else
    delete from identity.member_roles where member_id=target and role_key='financials';
  end if;
  update identity.members set directory_revision=directory_revision+1 where id=target;
end;
$$;

create or replace function project_management.can_access_project(actor uuid, department_names text[], managing boolean default false)
returns boolean language sql stable security invoker set search_path=pg_catalog as $$
  select project_management.is_department_manager(actor) or exists(
    select 1 from project_management.department_members dm join project_management.departments d on d.id=dm.department_id
    where dm.member_id=actor and d.season=project_management.current_season() and d.name=any(department_names) and (not managing or dm.access_level='lead'));
$$;

create or replace function project_management.sync_manager_departments()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  perform pg_advisory_xact_lock(72704,12);
  if new.role_key in ('project_manager','platform_administrator') then
    insert into project_management.department_members(department_id,member_id,is_lead,access_level)
      select id,new.member_id,false,'viewer' from project_management.departments where season=project_management.current_season()
      on conflict(department_id,member_id) do update set access_level='viewer',is_lead=false;
    update project_management.departments set revision=revision+1 where season=project_management.current_season();
    update identity.members set directory_revision=directory_revision+1 where id=new.member_id;
  end if;
  return new;
end;
$$;

create or replace function project_management.estimate_task_history(p_member_id uuid, p_google_sub text, p_email text, p_change jsonb)
returns uuid language plpgsql security invoker set search_path=pg_catalog as $$
declare
  target uuid := (p_change->>'id')::uuid;
  expected integer := (p_change->>'expectedRevision')::integer;
  created date := (p_change->>'createdDate')::date;
  completed date := (p_change->>'completedDate')::date;
  item project_management.tasks;
begin
  perform pg_advisory_xact_lock(72704,12);
  perform m.id from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=p_member_id and m.google_sub=p_google_sub and m.email=p_email
      and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub)
    for share of m;
  if not found then raise exception 'project_forbidden'; end if;
  select * into item from project_management.tasks where id=target and season=project_management.current_season() for update;
  if not found then raise exception 'project_not_found'; end if;
  if not project_management.can_access_task(p_member_id,target,true) then raise exception 'project_task_lead_required'; end if;
  if item.revision <> expected then raise exception 'project_conflict'; end if;
  if item.kind <> 'task' or created is null or completed is null or length(trim(coalesce(p_change->>'basis',''))) not between 1 and 1000 or created < date '2000-01-01'
    or created > completed or completed > (now() at time zone 'Europe/Oslo')::date then raise exception 'project_invalid'; end if;
  update project_management.tasks set status='done', blocked_reason='', completed_at=coalesce(item.completed_at,now()),
    revision=revision+1, updated_at=now() where id=target;
  insert into project_management.task_history_estimates(task_id,created_date,completed_date,basis,recorded_by)
    values(target,created,completed,trim(p_change->>'basis'),p_member_id);
  return target;
end;
$$;

revoke all on function project_management.current_season() from public;
grant execute on function project_management.current_season() to current_user;
commit;
