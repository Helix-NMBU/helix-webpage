-- Require placement for new items and full saves without rewriting legacy work.
-- Existing ungrouped records and their observed history remain readable, and
-- non-hierarchy updates (including set_status) continue to work until organized.
begin;
create or replace function project_management.check_milestone_link()
returns trigger language plpgsql security invoker set search_path = pg_catalog as $$
declare
  milestone project_management.tasks;
  hierarchy_changed boolean;
begin
  hierarchy_changed := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    hierarchy_changed := (new.id,new.season,new.category,new.kind,new.project_id,new.milestone_id)
      is distinct from (old.id,old.season,old.category,old.kind,old.project_id,old.milestone_id);
  end if;
  if hierarchy_changed then
    if new.project_id is null or (new.kind = 'task' and new.milestone_id is null)
      or (new.kind = 'milestone' and new.milestone_id is not null) then
      raise exception 'project_invalid_hierarchy';
    end if;
    if new.milestone_id is not null then
      if new.id = new.milestone_id or new.kind <> 'task' then raise exception 'project_invalid_reference'; end if;
      select * into milestone from project_management.tasks where id = new.milestone_id;
      if not found or milestone.kind <> 'milestone' or milestone.season <> new.season or milestone.category <> new.category
        or milestone.project_id is null or milestone.project_id is distinct from new.project_id then
        raise exception 'project_invalid_reference';
      end if;
      if milestone.status = 'cancelled' and (tg_op = 'INSERT' or old.milestone_id is distinct from new.milestone_id) then
        raise exception 'project_invalid_reference';
      end if;
    end if;
    -- A parent edit may not make any existing child link invalid. Legacy links
    -- are left untouched on status/detail-only updates, never silently repaired.
    if tg_op = 'UPDATE' and exists(select 1 from project_management.tasks child where child.milestone_id = old.id
      and (new.kind <> 'milestone' or child.season <> new.season or child.category <> new.category
        or new.project_id is null or new.project_id is distinct from child.project_id)) then
      raise exception 'project_invalid_reference';
    end if;
  end if;
  return new;
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
        for share of a;
      if not found then raise exception 'project_invalid_reference'; end if;
    end loop;
    if data->>'projectId' is not null then
      perform id from project_management.projects where id = (data->>'projectId')::uuid and season = 'S27' and category = data->>'category' for share;
      if not found then raise exception 'project_invalid_reference'; end if;
    end if;
    -- Full saves must organize legacy records too; only set_status bypasses
    -- placement checks. A session or assignee grant never grants detail edits.
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
revoke all on function project_management.check_milestone_link(), project_management.mutate(uuid,text,text,jsonb) from public;
grant execute on function project_management.check_milestone_link(), project_management.mutate(uuid,text,text,jsonb) to current_user;
commit;
