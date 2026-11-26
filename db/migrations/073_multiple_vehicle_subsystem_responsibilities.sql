begin;

select pg_advisory_xact_lock(72704,12);

-- A responsibility can reference a member or retain a name from the S27 BOM
-- until that person has an eligible member profile. A name grants no access.
alter table project_management.vehicle_subsystem_responsibilities
  drop constraint vehicle_subsystem_responsibilities_pkey,
  alter column member_id drop not null,
  add column recorded_name text,
  add constraint vehicle_responsibility_person check (
    (member_id is not null and recorded_name is null) or
    (member_id is null and length(btrim(recorded_name)) between 1 and 120 and recorded_name is not null)
  );
create unique index vehicle_responsibility_member_assignment
  on project_management.vehicle_subsystem_responsibilities(subsystem_id,season_code,member_id)
  where member_id is not null;
create unique index vehicle_responsibility_named_assignment
  on project_management.vehicle_subsystem_responsibilities(subsystem_id,season_code,recorded_name)
  where recorded_name is not null;

create or replace function project_management.read_vehicle_catalog(p_actor uuid,p_sub text,p_email text)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
  with season as (select project_management.current_season() as code)
  select jsonb_build_object(
    'components',project_management.vehicle_catalog_components(false,null,true),
    'season',season.code,
    'canAssignResponsibility',exists(select 1 from finance.seasons s where s.code=season.code and s.status<>'closed'),
    'members',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',m.name) order by lower(m.name),m.id)
      from project_management.vehicle_responsibility_members(season.code) m),'[]'::jsonb),
    'responsibilities',coalesce((select jsonb_agg(jsonb_build_object('subsystemId',a.subsystem_id,'memberId',a.member_id,
      'name',coalesce(m.full_name,a.recorded_name)) order by lower(coalesce(m.full_name,a.recorded_name)),a.member_id,a.subsystem_id)
      from project_management.vehicle_subsystem_responsibilities a left join identity.members m on m.id=a.member_id
      where a.season_code=season.code),'[]'::jsonb),
    'linkedProjects',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'componentId',a.component_id) order by lower(p.name),p.id)
      from project_management.project_vehicle_components a join project_management.projects p on p.id=a.project_id
      where a.component_id is not null and p.season=season.code
        and project_management.can_access_project(p_actor,p.departments)),'[]'::jsonb)
  )
  from season where project_management.can_manage_vehicle_catalog(p_actor,p_sub,p_email)
$$;

create or replace function project_management.save_vehicle_catalog_entry(p_actor uuid,p_sub text,p_email text,item jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare
  responsibility jsonb := item->'responsibility';
  subsystem uuid := (item->>'id')::uuid;
  parent uuid := (item->>'parentId')::uuid;
  active_season text;
  season_status text;
  existing_members uuid[];
  existing_names text[];
  desired_members uuid[];
  desired_names text[];
  active_component boolean;
begin
  perform pg_advisory_xact_lock(72704,12);
  perform 1 from finance.settings where setting_key='current_season' for share;
  if not project_management.can_manage_vehicle_catalog(p_actor,p_sub,p_email) then raise exception 'catalog_forbidden'; end if;
  if parent is null then
    if responsibility is not null then raise exception 'catalog_invalid'; end if;
    return project_management.save_vehicle_component(p_actor,p_sub,p_email,item);
  end if;

  active_season := project_management.current_season();
  select s.status into season_status from finance.seasons s where s.code=active_season for share;
  select coalesce(array_agg(a.member_id) filter (where a.member_id is not null),'{}'),
    coalesce(array_agg(a.recorded_name) filter (where a.recorded_name is not null),'{}')
    into existing_members,existing_names
    from project_management.vehicle_subsystem_responsibilities a
    where a.subsystem_id=subsystem and a.season_code=active_season;
  active_component := not (item->>'archived')::boolean and exists(
    select 1 from project_management.vehicle_components p where p.id=parent and not p.archived
  );

  desired_members := existing_members;
  desired_names := existing_names;
  if responsibility is not null then
    if responsibility->>'season' is distinct from active_season then raise exception 'catalog_conflict'; end if;
    if season_status is null then raise exception 'catalog_season_missing'; end if;
    if season_status='closed' then raise exception 'catalog_closed'; end if;
    if jsonb_typeof(responsibility->'memberIds') is distinct from 'array' then raise exception 'catalog_invalid'; end if;
    desired_members := array(select distinct value::uuid from jsonb_array_elements_text(responsibility->'memberIds'));
    if responsibility ? 'pendingNames' then
      desired_names := array(select distinct value from jsonb_array_elements_text(responsibility->'pendingNames'));
      if not desired_names <@ existing_names then raise exception 'catalog_invalid'; end if;
    end if;
  end if;

  if active_component and (season_status is distinct from 'closed' or (item->>'revision')::integer=0)
    and cardinality(desired_members)+cardinality(desired_names)=0 then raise exception 'catalog_owner_required'; end if;
  if exists(
    select 1 from unnest(desired_members) selected(id)
    where ((active_component and season_status is distinct from 'closed') or not selected.id=any(existing_members))
      and not exists(select 1 from project_management.vehicle_responsibility_members(active_season) m where m.id=selected.id)
  ) then raise exception 'catalog_owner_ineligible'; end if;

  perform project_management.save_vehicle_component(p_actor,p_sub,p_email,item);
  if responsibility is not null then
    delete from project_management.vehicle_subsystem_responsibilities a
      where a.subsystem_id=subsystem and a.season_code=active_season
        and ((a.member_id is not null and not a.member_id=any(desired_members))
          or (a.recorded_name is not null and not a.recorded_name=any(desired_names)));
    insert into project_management.vehicle_subsystem_responsibilities(subsystem_id,season_code,member_id)
      select subsystem,active_season,selected.id from unnest(desired_members) selected(id)
      where not selected.id=any(existing_members);
  end if;
  return project_management.read_vehicle_catalog(p_actor,p_sub,p_email);
end
$$;

commit;
