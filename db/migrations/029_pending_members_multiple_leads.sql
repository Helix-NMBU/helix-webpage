-- Pending members have no authentication identity until verified Google sign-in.
begin;
alter table identity.members alter column auth_user_id drop not null;
alter table identity.members alter column google_sub drop not null;
alter table identity.members alter column verified_at drop not null;
alter table identity.members add constraint members_identity_complete check ((auth_user_id is null and google_sub is null and verified_at is null) or (auth_user_id is not null and google_sub is not null and verified_at is not null));
drop index if exists project_management.project_department_lead_idx;
create or replace function identity.onboard_member(
  p_auth_user_id uuid,
  p_google_sub text,
  p_email text,
  p_name text,
  p_draft jsonb,
  p_sharing jsonb
) returns uuid
language plpgsql
set search_path = identity, cv, pg_temp
as $$
declare
  saved_id uuid;
begin
  if p_email is null or p_email <> lower(p_email) or p_email !~ '^[^[:space:]@]+@helixnmbu[.]no$'
    or p_google_sub is null or length(p_google_sub) < 1
    then raise exception 'Identity mismatch' using errcode = '42501'; end if;
  if not exists (
    select 1
    from neon_auth."user" u
    join neon_auth.account a on a."userId" = u.id
    where u.id = p_auth_user_id
      and lower(u.email) = p_email
      and u."emailVerified" is true
      and coalesce(u.banned, false) = false
      and a."providerId" = 'google'
      and a."accountId" = p_google_sub
  ) then raise exception 'Identity mismatch' using errcode = '42501'; end if;
  if exists (
    select 1 from identity.members
    where auth_user_id = p_auth_user_id and google_sub <> p_google_sub
  ) then raise exception 'Identity mismatch' using errcode = '42501'; end if;
  update identity.members set auth_user_id=p_auth_user_id, google_sub=p_google_sub, verified_at=now()
    where email=p_email and auth_user_id is null and google_sub is null;
  insert into identity.members (auth_user_id, google_sub, email, full_name)
  values (p_auth_user_id, p_google_sub, p_email, coalesce(p_name, ''))
  on conflict (auth_user_id) do update
    set email = excluded.email, verified_at = now()
  returning id into saved_id;
  insert into cv.documents (member_id, draft, sharing)
  values (saved_id, p_draft, p_sharing)
  on conflict (member_id) do nothing;
  return saved_id;
end
$$;


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
  for department in select * from project_management.departments where season='S27' order by id for update loop
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
revoke all on function identity.save_workspace_member(uuid,text,text,jsonb) from public;
grant execute on function identity.save_workspace_member(uuid,text,text,jsonb) to current_user;

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
  if exists(select 1 from project_management.departments where season='S27' and lower(name)=lower(department_name) and id<>target) then raise exception 'project_department_exists'; end if;
    select * into previous from project_management.departments where id=target and season='S27' for update;
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
revoke all on function project_management.save_department(uuid,text,text,jsonb) from public;
grant execute on function project_management.save_department(uuid,text,text,jsonb) to current_user;

commit;
