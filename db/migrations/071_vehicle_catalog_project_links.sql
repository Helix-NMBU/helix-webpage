begin;

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
      where a.season_code=season.code),'[]'::jsonb),
    'linkedProjects',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'componentId',a.component_id) order by lower(p.name),p.id)
      from project_management.project_vehicle_components a join project_management.projects p on p.id=a.project_id
      where a.component_id is not null and p.season=season.code
        and project_management.can_access_project(p_actor,p.departments)),'[]'::jsonb)
  )
  from season where project_management.can_manage_vehicle_catalog(p_actor,p_sub,p_email)
$$;

commit;
