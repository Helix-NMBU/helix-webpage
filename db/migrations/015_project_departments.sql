-- Platform-managed season departments and memberships; no roster is imported.
begin;
create table if not exists project_management.departments (
  id uuid primary key,
  season text not null check (season = 'S27'),
  name text not null check (name = btrim(name) and char_length(name) between 1 and 100),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
create unique index if not exists project_departments_name_idx on project_management.departments(season,lower(name));
create table if not exists project_management.department_members (
  department_id uuid not null references project_management.departments(id) on delete cascade,
  member_id uuid not null references identity.members(id) on delete cascade,
  is_lead boolean not null default false,
  primary key (department_id,member_id)
);
create unique index if not exists project_department_lead_idx on project_management.department_members(department_id) where is_lead;
alter table project_management.departments enable row level security;
alter table project_management.department_members enable row level security;
revoke all on project_management.departments, project_management.department_members from public;

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
  if p_change->>'action' is distinct from 'save_department' or expected is null or expected < 0 then raise exception 'project_invalid'; end if;
  if jsonb_typeof(data) is distinct from 'object' or jsonb_typeof(data->'name') is distinct from 'string'
    or jsonb_typeof(data->'memberIds') is distinct from 'array' or not (data ? 'leadId') then raise exception 'project_invalid'; end if;
  department_name := btrim(data->>'name');
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
  if expected=0 then
    insert into project_management.departments(id,season,name) values(target,'S27',department_name);
  else
    select * into previous from project_management.departments where id=target and season='S27' for update;
    if not found then raise exception 'project_not_found'; end if;
    if previous.revision<>expected then raise exception 'project_conflict'; end if;
    if previous.name<>department_name then raise exception 'project_department_name'; end if;
    update project_management.departments set revision=revision+1,updated_at=now() where id=target;
  end if;
  delete from project_management.department_members where department_id=target;
  insert into project_management.department_members(department_id,member_id,is_lead)
    select target,selected_id,coalesce(selected_id=lead_uuid,false) from unnest(members) as selected(selected_id);
  return target;
end;
$$;
revoke all on function project_management.save_department(uuid,text,text,jsonb) from public;
grant execute on function project_management.save_department(uuid,text,text,jsonb) to current_user;
commit;
