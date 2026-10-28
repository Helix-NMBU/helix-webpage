-- Allow authorized administrators to update their own workspace access.
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
  select m.* into previous from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=target and u."emailVerified" is true and u.banned is not true and lower(u.email)=m.email
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub) for update of m;
  if not found then raise exception 'workspace_not_found'; end if;
  if previous.directory_revision is distinct from (p_change->>'expectedRevision')::integer then raise exception 'workspace_conflict'; end if;
  if jsonb_typeof(p_change->'departments') is distinct from 'array' or jsonb_array_length(p_change->'departments')<>7 then raise exception 'workspace_invalid'; end if;
  if jsonb_typeof(p_change->'spaceKeys') is distinct from 'array' or jsonb_array_length(p_change->'spaceKeys')>3 then raise exception 'workspace_invalid'; end if;
  if exists(select 1 from jsonb_array_elements(p_change->'spaceKeys') item where jsonb_typeof(item)<>'string') then raise exception 'workspace_invalid'; end if;
  select coalesce(array_agg(value),'{}'::text[]) into spaces from jsonb_array_elements_text(p_change->'spaceKeys');
  if exists(select 1 from unnest(spaces) value where value not in ('season-overview','recruiting','financials'))
    or cardinality(spaces)<>(select count(distinct value) from unnest(spaces) value) then raise exception 'workspace_invalid'; end if;
  for department in select * from project_management.departments where season='S27' order by id for update loop
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
    if next_access='lead' and exists(select 1 from project_management.department_members where department_id=department.id and is_lead and member_id<>target) then raise exception 'workspace_lead_conflict'; end if;
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
revoke all on function identity.save_workspace_access(uuid,text,text,jsonb) from public;
grant execute on function identity.save_workspace_access(uuid,text,text,jsonb) to current_user;
