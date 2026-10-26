-- Workspace directory metadata and department-scoped project ownership.
begin;
alter table identity.members add column if not exists directory_revision integer not null default 1 check(directory_revision>0);
alter table identity.members add column if not exists last_seen_at timestamptz;
alter table project_management.projects add column if not exists priority text not null default 'normal' check(priority in ('low','normal','high','urgent'));
alter table project_management.projects add column if not exists lead_ids uuid[] not null default '{}'::uuid[] check(cardinality(lead_ids)<=20);
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
  perform a.member_id from project_management.access a where a.member_id=p_member_id for share;
  select coalesce(a.active and a.can_manage,false), case when a.active then a.task_lead_categories else '{}'::text[] end into manager, lead_categories from identity.members m
    left join project_management.access a on a.member_id = m.id
    join neon_auth."user" u on u.id = m.auth_user_id
    where m.id = p_member_id and (a.active or (action='save_project' and exists(select 1 from project_management.department_members dm join project_management.departments d on d.id=dm.department_id where dm.member_id=m.id and dm.is_lead and d.season='S27'))) and m.google_sub = p_google_sub and m.email = p_email
      and lower(u.email) = m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account linked where linked."userId" = u.id and linked."providerId" = 'google' and linked."accountId" = m.google_sub)
    for share of m;
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
  elsif action = 'update_milestone' then
    -- A field-only update never changes placement, identity, status or kind.
    data := p_change->'changes';
    if jsonb_typeof(data) is distinct from 'object' or data = '{}'::jsonb then raise exception 'project_invalid'; end if;
    if exists(select 1 from jsonb_object_keys(data) as fields(key) where key not in ('priority','assigneeIds','deadline')) then raise exception 'project_invalid'; end if;
    select * into task_row from project_management.tasks where id = target and season = 'S27' for update;
    if not found then raise exception 'project_not_found'; end if;
    if task_row.kind <> 'milestone' then raise exception 'project_invalid'; end if;
    if not coalesce(task_row.category = any(lead_categories), false) then raise exception 'project_task_lead_required'; end if;
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
        perform a.member_id from project_management.access a
          join identity.members m on m.id = a.member_id
          join neon_auth."user" u on u.id = m.auth_user_id
          where a.member_id = assignee_uuid and a.active
            and lower(u.email) = m.email and u."emailVerified" is true and u.banned is not true
            and exists(select 1 from neon_auth.account linked where linked."userId" = u.id and linked."providerId" = 'google' and linked."accountId" = m.google_sub)
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
    data := p_change->'project';
    if not manager and not exists(select 1 from project_management.department_members dm join project_management.departments d on d.id=dm.department_id where dm.member_id=p_member_id and dm.is_lead and d.season='S27' and d.name in (select jsonb_array_elements_text(data->'departments'))) then raise exception 'project_forbidden'; end if;
    if jsonb_typeof(data->'leadIds') is distinct from 'array' or jsonb_array_length(data->'leadIds')>20 then raise exception 'project_invalid'; end if;
    for assignee_uuid in select value::uuid from jsonb_array_elements_text(data->'leadIds') loop
      perform m.id from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
        where m.id=assignee_uuid and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
          and exists(select 1 from neon_auth.account linked where linked."userId"=u.id and linked."providerId"='google' and linked."accountId"=m.google_sub);
      if not found then raise exception 'project_invalid_reference'; end if;
    end loop;
    if expected = 0 then
      insert into project_management.projects(id,season,name,description,category,departments,deadline,priority,lead_ids)
      values(target,'S27',data->>'name',data->>'description',data->>'category',array(select jsonb_array_elements_text(data->'departments')),(data->>'deadline')::date,data->>'priority',array(select value::uuid from jsonb_array_elements_text(data->'leadIds')))
      returning id into result_id;
    else
      select * into project_row from project_management.projects where id = target and season = 'S27' for update;
      if not found then raise exception 'project_not_found'; end if;
      if project_row.revision <> expected then raise exception 'project_conflict'; end if;
      if not manager and not exists(select 1 from project_management.department_members dm join project_management.departments d on d.id=dm.department_id where dm.member_id=p_member_id and dm.is_lead and d.season='S27' and d.name=any(project_row.departments)) then raise exception 'project_forbidden'; end if;
      if exists(select 1 from project_management.tasks where project_id = target and category <> data->>'category') then
        raise exception 'project_invalid_reference';
      end if;
      update project_management.projects set name = data->>'name', description = data->>'description', category = data->>'category',
        departments = array(select jsonb_array_elements_text(data->'departments')), deadline = (data->>'deadline')::date, priority=data->>'priority',lead_ids=array(select value::uuid from jsonb_array_elements_text(data->'leadIds')), revision = revision + 1
        where id = target returning id into result_id;
    end if;
  else raise exception 'project_invalid';
  end if;
  return result_id;
end;
$$;
revoke all on function project_management.mutate(uuid,text,text,jsonb) from public;
grant execute on function project_management.mutate(uuid,text,text,jsonb) to current_user;
-- Departments can include verified members without granting task-module access.
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
  lead_uuid uuid;
  candidate uuid;
begin
  perform pg_advisory_xact_lock(72704,12);
  select a.can_manage into manager from project_management.access a
    join identity.members m on m.id=a.member_id join neon_auth."user" u on u.id=m.auth_user_id
    where a.member_id=p_member_id and a.active and m.google_sub=p_google_sub and m.email=p_email
      and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account linked where linked."userId"=u.id and linked."providerId"='google' and linked."accountId"=m.google_sub)
    for share of a;
  if not found or manager is not true then raise exception 'project_forbidden'; end if;
  if p_change->>'action' is distinct from 'save_department' or expected is null or expected < 1 then raise exception 'project_invalid'; end if;
  if jsonb_typeof(data) is distinct from 'object' or jsonb_typeof(data->'name') is distinct from 'string'
    or jsonb_typeof(data->'memberIds') is distinct from 'array' or not (data ? 'leadId') then raise exception 'project_invalid'; end if;
  department_name := btrim(data->>'name');
  if not (department_name=any(array['Management','Mechanical & Production','Electronics','Software & Autonomous','Business & Marketing','Logistics','Finance']::text[])) then raise exception 'project_invalid'; end if;
  if char_length(department_name) not between 1 and 100 or jsonb_array_length(data->'memberIds') > 500 then raise exception 'project_invalid'; end if;
  select coalesce(array_agg(distinct value::uuid order by value::uuid),'{}'::uuid[]) into members from jsonb_array_elements_text(data->'memberIds') as selected(value);
  lead_uuid := (data->>'leadId')::uuid;
  if lead_uuid is not null and not (lead_uuid=any(members)) then raise exception 'project_department_member'; end if;
  foreach candidate in array members loop
    if candidate is null then raise exception 'project_department_member'; end if;
    perform m.id from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
      where m.id=candidate and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
        and exists(select 1 from neon_auth.account linked where linked."userId"=u.id and linked."providerId"='google' and linked."accountId"=m.google_sub)
      for share of m;
    if not found then raise exception 'project_department_member'; end if;
  end loop;
  if exists(select 1 from project_management.departments where season='S27' and lower(name)=lower(department_name) and id<>target) then raise exception 'project_department_exists'; end if;
    select * into previous from project_management.departments where id=target and season='S27' for update;
    if not found then raise exception 'project_not_found'; end if;
    if previous.revision<>expected then raise exception 'project_conflict'; end if;
    if previous.name<>department_name then raise exception 'project_department_name'; end if;
    update project_management.departments set revision=revision+1,updated_at=now() where id=target;
  delete from project_management.department_members where department_id=target;
  insert into project_management.department_members(department_id,member_id,is_lead)
    select target,selected_id,coalesce(selected_id=lead_uuid,false) from unnest(members) as selected(selected_id);
  return target;
end;
$$;
revoke all on function project_management.save_department(uuid,text,text,jsonb) from public;
grant execute on function project_management.save_department(uuid,text,text,jsonb) to current_user;
-- Administrator-only directory edits. Role/grant changes are intentionally separate.
create or replace function identity.save_workspace_member(p_actor uuid,p_sub text,p_email text,p_change jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare
  target uuid := (p_change->>'id')::uuid;
  previous identity.members;
  department project_management.departments;
  choice jsonb;
  was_member boolean;
  was_lead boolean;
begin
  perform pg_advisory_xact_lock(72704,12);
  perform m.id from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=p_actor and m.google_sub=p_sub and m.email=p_email and m.email='henrik.engdal@helixnmbu.no'
      and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub);
  if not found then raise exception 'workspace_forbidden'; end if;
  select m.* into previous from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=target and u."emailVerified" is true and u.banned is not true and lower(u.email)=m.email
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub) for update of m;
  if not found then raise exception 'workspace_not_found'; end if;
  if previous.directory_revision<>(p_change->>'expectedRevision')::integer then raise exception 'workspace_conflict'; end if;
  if char_length(btrim(p_change->>'name')) not between 1 and 160 or char_length(coalesce(p_change->>'helixRole',''))>150 then raise exception 'workspace_invalid'; end if;
  if jsonb_typeof(p_change->'departments') is distinct from 'array' or jsonb_array_length(p_change->'departments')<>7 then raise exception 'workspace_invalid'; end if;
  for department in select * from project_management.departments where season='S27' order by id for update loop
    if (select count(*) from jsonb_array_elements(p_change->'departments') c where (c->>'id')::uuid=department.id)<>1 then raise exception 'workspace_invalid'; end if;
    select c into choice from jsonb_array_elements(p_change->'departments') c where (c->>'id')::uuid=department.id;
    if department.revision<>(choice->>'revision')::integer then raise exception 'workspace_conflict'; end if;
    if jsonb_typeof(choice->'member') is distinct from 'boolean' or jsonb_typeof(choice->'lead') is distinct from 'boolean' or ((choice->>'lead')::boolean and not (choice->>'member')::boolean) then raise exception 'workspace_invalid'; end if;
    if (choice->>'lead')::boolean and exists(select 1 from project_management.department_members where department_id=department.id and is_lead and member_id<>target) then raise exception 'workspace_lead_conflict'; end if;
    select exists(select 1 from project_management.department_members where department_id=department.id and member_id=target),exists(select 1 from project_management.department_members where department_id=department.id and member_id=target and is_lead) into was_member,was_lead;
    if was_member is distinct from (choice->>'member')::boolean or was_lead is distinct from (choice->>'lead')::boolean then
      delete from project_management.department_members where department_id=department.id and member_id=target;
      if (choice->>'member')::boolean then insert into project_management.department_members values(department.id,target,(choice->>'lead')::boolean); end if;
      update project_management.departments set revision=revision+1,updated_at=now() where id=department.id;
    end if;
  end loop;
  update identity.members set full_name=btrim(p_change->>'name'),helix_role=nullif(btrim(p_change->>'helixRole'),''),directory_revision=directory_revision+1 where id=target;
end;
$$;
revoke all on function identity.save_workspace_member(uuid,text,text,jsonb) from public;
grant execute on function identity.save_workspace_member(uuid,text,text,jsonb) to current_user;
commit;
