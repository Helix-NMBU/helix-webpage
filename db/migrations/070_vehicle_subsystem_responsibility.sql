begin;

create table project_management.vehicle_subsystem_responsibilities (
  subsystem_id uuid not null,
  component_kind text not null default 'subsystem' check (component_kind='subsystem'),
  season_code text not null references finance.seasons(code),
  member_id uuid not null references identity.members(id) on delete cascade,
  primary key (subsystem_id,season_code),
  foreign key (subsystem_id,component_kind) references project_management.vehicle_components(id,kind) on delete cascade
);
create index vehicle_subsystem_responsibilities_member_idx on project_management.vehicle_subsystem_responsibilities(member_id);
alter table project_management.vehicle_subsystem_responsibilities enable row level security;

create function project_management.vehicle_responsibility_members(p_season text)
returns table(id uuid,name text) language sql stable security invoker set search_path=pg_catalog as $$
  select m.id,m.full_name
  from identity.members m left join neon_auth."user" u on u.id=m.auth_user_id
  where ((m.auth_user_id is null and m.google_sub is null) or
    (lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub)))
    and exists(
      select 1 from project_management.department_members dm join project_management.departments d on d.id=dm.department_id
      where dm.member_id=m.id and d.season=p_season and dm.access_level in ('member','lead')
    )
$$;

create or replace function project_management.read_vehicle_catalog(p_actor uuid,p_sub text,p_email text)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
  with season as (select project_management.current_season() as code)
  select jsonb_build_object(
    'components',project_management.vehicle_catalog_components(false,null,true),
    'season',season.code,
    'canAssignResponsibility',exists(select 1 from finance.seasons s where s.code=season.code and s.status<>'closed'),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name) order by lower(m.name),m.id)
      from project_management.vehicle_responsibility_members(season.code) m),'[]'::jsonb),
    'responsibilities',coalesce((select jsonb_agg(jsonb_build_object('subsystemId',a.subsystem_id,'memberId',m.id,'name',m.full_name))
      from project_management.vehicle_subsystem_responsibilities a join identity.members m on m.id=a.member_id
      where a.season_code=season.code),'[]'::jsonb)
  )
  from season where project_management.can_manage_vehicle_catalog(p_actor,p_sub,p_email)
$$;

create function project_management.save_vehicle_catalog_entry(p_actor uuid,p_sub text,p_email text,item jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare
  responsibility jsonb := item->'responsibility';
  subsystem uuid := (item->>'id')::uuid;
  parent uuid := (item->>'parentId')::uuid;
  active_season text;
  season_status text;
  member uuid := (responsibility->>'memberId')::uuid;
  existing_member uuid;
  active_component boolean;
begin
  -- Serialize edits with existing catalog and membership changes. Validate and
  -- update the component and its current-season assignment in one transaction.
  perform pg_advisory_xact_lock(72704,12);
  perform 1 from finance.settings where setting_key='current_season' for share;
  if not project_management.can_manage_vehicle_catalog(p_actor,p_sub,p_email) then raise exception 'catalog_forbidden'; end if;
  if parent is null then
    if responsibility is not null then raise exception 'catalog_invalid'; end if;
    return project_management.save_vehicle_component(p_actor,p_sub,p_email,item);
  end if;

  active_season := project_management.current_season();
  select s.status into season_status from finance.seasons s where s.code=active_season for share;
  select a.member_id into existing_member from project_management.vehicle_subsystem_responsibilities a
    where a.subsystem_id=subsystem and a.season_code=active_season;
  active_component := not (item->>'archived')::boolean and exists(
    select 1 from project_management.vehicle_components p where p.id=parent and not p.archived
  );

  if responsibility is not null then
    if responsibility->>'season' is distinct from active_season then raise exception 'catalog_conflict'; end if;
    if season_status is null then raise exception 'catalog_season_missing'; end if;
    if season_status='closed' then raise exception 'catalog_closed'; end if;
  else
    member := existing_member;
  end if;

  if active_component and (season_status is distinct from 'closed' or (item->>'revision')::integer=0) and member is null then
    raise exception 'catalog_owner_required';
  end if;
  if member is not null and ((active_component and season_status is distinct from 'closed') or member is distinct from existing_member)
    and not exists(select 1 from project_management.vehicle_responsibility_members(active_season) m where m.id=member)
  then raise exception 'catalog_owner_ineligible'; end if;

  perform project_management.save_vehicle_component(p_actor,p_sub,p_email,item);
  if responsibility is not null then
    if member is null then
      delete from project_management.vehicle_subsystem_responsibilities
        where subsystem_id=subsystem and season_code=active_season;
    else
      insert into project_management.vehicle_subsystem_responsibilities(subsystem_id,season_code,member_id)
      values(subsystem,active_season,member)
      on conflict(subsystem_id,season_code) do update set member_id=excluded.member_id;
    end if;
  end if;
  return project_management.read_vehicle_catalog(p_actor,p_sub,p_email);
end
$$;

revoke all on function project_management.vehicle_responsibility_members(text),
  project_management.save_vehicle_catalog_entry(uuid,text,text,jsonb) from public;
grant execute on function project_management.vehicle_responsibility_members(text),
  project_management.save_vehicle_catalog_entry(uuid,text,text,jsonb) to current_user;

commit;
