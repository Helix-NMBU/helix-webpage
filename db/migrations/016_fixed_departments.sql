-- Fix the organization's seven departments while preserving previous data.
begin;
select pg_advisory_xact_lock(72704,12);
create or replace function project_management.canonical_department(value text)
returns text language sql immutable strict set search_path=pg_catalog as $$
select case lower(btrim(value))
  when 'management' then 'Management' when 'executive team' then 'Management' when 'the board' then 'Management'
  when 'mechanical' then 'Mechanical & Production' when 'mechanical & production' then 'Mechanical & Production'
  when 'electrical' then 'Electronics' when 'electronics' then 'Electronics'
  when 'software' then 'Software & Autonomous' when 'software & autonomous' then 'Software & Autonomous'
  when 'business' then 'Business & Marketing' when 'marketing' then 'Business & Marketing' when 'partnerships' then 'Business & Marketing' when 'business & marketing' then 'Business & Marketing'
  when 'logistics' then 'Logistics' when 'operations' then 'Logistics' when 'finance' then 'Finance' end;
$$;
create table if not exists project_management.department_catalog_backup (id uuid primary key, snapshot jsonb not null);
create table if not exists project_management.project_departments_backup (id uuid primary key, departments text[] not null, revision integer not null);
alter table project_management.department_catalog_backup enable row level security;
alter table project_management.project_departments_backup enable row level security;
revoke all on project_management.department_catalog_backup, project_management.project_departments_backup from public;
insert into project_management.department_catalog_backup(id,snapshot)
 select d.id,jsonb_build_object('department',to_jsonb(d),'members',coalesce((select jsonb_agg(to_jsonb(m)) from project_management.department_members m where m.department_id=d.id),'[]'::jsonb))
 from project_management.departments d on conflict do nothing;

do $$
declare
  canonical text;
  matching uuid[];
  keep_id uuid;
  member_ids uuid[];
  lead_ids uuid[];
  previous_name text;
  project record;
  normalized text[];
begin
  foreach canonical in array array['Management','Mechanical & Production','Electronics','Software & Autonomous','Business & Marketing','Logistics','Finance']::text[] loop
    select array_agg(id order by (name=canonical) desc,id) into matching from project_management.departments where project_management.canonical_department(name)=canonical;
    if matching is null then
      insert into project_management.departments(id,season,name) values(gen_random_uuid(),'S27',canonical);
    else
      keep_id := matching[1];
      select name into previous_name from project_management.departments where id=keep_id;
      select coalesce(array_agg(distinct member_id),'{}'::uuid[]),coalesce(array_agg(distinct member_id) filter(where is_lead),'{}'::uuid[]) into member_ids,lead_ids from project_management.department_members where department_id=any(matching);
      if previous_name<>canonical or cardinality(matching)>1 then
        delete from project_management.department_members where department_id=any(matching);
        delete from project_management.departments where id=any(matching) and id<>keep_id;
        update project_management.departments set name=canonical,revision=revision+1,updated_at=now() where id=keep_id;
        insert into project_management.department_members(department_id,member_id,is_lead)
          select keep_id,member_id,cardinality(lead_ids)=1 and member_id=lead_ids[1] from unnest(member_ids) as m(member_id);
      end if;
    end if;
  end loop;
  -- Unknown historical departments remain recoverable from the backup.
  delete from project_management.departments where project_management.canonical_department(name) is null;
  for project in select id,departments,revision from project_management.projects loop
    normalized := array(select project_management.canonical_department(value) from unnest(project.departments) with ordinality as names(value,ordinal)
      where project_management.canonical_department(value) is not null group by project_management.canonical_department(value) order by min(ordinal));
    if normalized is distinct from project.departments then
      insert into project_management.project_departments_backup values(project.id,project.departments,project.revision) on conflict do nothing;
      update project_management.projects set departments=normalized,revision=revision+1 where id=project.id;
    end if;
  end loop;
  if not exists(select 1 from pg_constraint where conrelid='project_management.departments'::regclass and conname='organization_department_name') then
    alter table project_management.departments add constraint organization_department_name check(name=any(array['Management','Mechanical & Production','Electronics','Software & Autonomous','Business & Marketing','Logistics','Finance']::text[]));
  end if;
  if not exists(select 1 from pg_constraint where conrelid='project_management.projects'::regclass and conname='organization_project_departments') then
    alter table project_management.projects add constraint organization_project_departments check(departments <@ array['Management','Mechanical & Production','Electronics','Software & Autonomous','Business & Marketing','Logistics','Finance']::text[]);
  end if;
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
    perform a.member_id from project_management.access a
      join identity.members m on m.id=a.member_id join neon_auth."user" u on u.id=m.auth_user_id
      where a.member_id=candidate and a.active and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
        and exists(select 1 from neon_auth.account linked where linked."userId"=u.id and linked."providerId"='google' and linked."accountId"=m.google_sub)
      for share of a;
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
revoke all on function project_management.canonical_department(text), project_management.save_department(uuid,text,text,jsonb) from public;
grant execute on function project_management.canonical_department(text), project_management.save_department(uuid,text,text,jsonb) to current_user;
commit;
