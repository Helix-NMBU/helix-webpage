-- Create a project and its initial milestones in one transaction. Existing
-- mutation functions remain the authority for identity, role and hierarchy checks.
begin;
create or replace function project_management.create_project_with_milestones(p_member_id uuid, p_google_sub text, p_email text, p_change jsonb)
returns uuid language plpgsql security invoker set search_path = pg_catalog as $$
declare
  result_id uuid;
  draft jsonb;
  milestone_ids uuid[] := '{}';
  milestone_id uuid;
begin
  if p_change->>'action' is distinct from 'save_project' or (p_change->>'expectedRevision')::integer is distinct from 0
    or jsonb_typeof(p_change->'milestones') is distinct from 'array' then raise exception 'project_invalid'; end if;
  if jsonb_array_length(p_change->'milestones')>20 then raise exception 'project_invalid'; end if;
  -- The normal project mutation takes the same advisory lock used by task writes.
  -- Any later failure rolls back this insert and all child writes together.
  result_id := project_management.mutate(p_member_id,p_google_sub,p_email,p_change-'milestones');
  for draft in select value from jsonb_array_elements(p_change->'milestones') loop
    if jsonb_typeof(draft) is distinct from 'object' then raise exception 'project_invalid'; end if;
    if exists(select 1 from jsonb_object_keys(draft) as f(key) where key not in ('id','title','description','deadline','partnerName')) then raise exception 'project_invalid'; end if;
    if jsonb_typeof(draft->'id') is distinct from 'string' or jsonb_typeof(draft->'title') is distinct from 'string'
      or jsonb_typeof(draft->'description') is distinct from 'string' or jsonb_typeof(draft->'deadline') is distinct from 'string'
      or jsonb_typeof(draft->'partnerName') is distinct from 'string' then raise exception 'project_invalid'; end if;
    milestone_id := (draft->>'id')::uuid;
    if milestone_id=any(milestone_ids) then raise exception 'project_invalid'; end if;
    milestone_ids := array_append(milestone_ids,milestone_id);
    if length(btrim(draft->>'title')) not between 1 and 200 or length(draft->>'description')>2000 or length(draft->>'partnerName')>200
      or draft->>'deadline' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or draft->>'deadline' < '2000-01-01' or draft->>'deadline' > '2100-12-31'
      or (draft->>'deadline')::date::text <> draft->>'deadline' then raise exception 'project_invalid'; end if;
    perform project_management.mutate(p_member_id,p_google_sub,p_email,jsonb_build_object(
      'action','save_task','id',milestone_id,'expectedRevision',0,
      'task',jsonb_build_object('title',btrim(draft->>'title'),'description',btrim(draft->>'description'),
        'category',p_change->'project'->>'category','projectId',result_id,'milestoneId',null,
        'assigneeIds','[]'::jsonb,'startDate',null,'deadline',draft->>'deadline','kind','milestone',
        'status','todo','priority','normal','partnerName',btrim(draft->>'partnerName'),'blockedReason','')));
  end loop;
  return result_id;
end;
$$;
revoke all on function project_management.create_project_with_milestones(uuid,text,text,jsonb) from public;
grant execute on function project_management.create_project_with_milestones(uuid,text,text,jsonb) to current_user;
commit;
