begin;

create function project_management.delete_vehicle_component(
  p_actor uuid,p_sub text,p_email text,p_component uuid,p_revision integer
)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare
  previous project_management.vehicle_components;
begin
  perform pg_advisory_xact_lock(72704,12);
  perform 1 from finance.settings where setting_key='current_season' for share;
  if not project_management.can_manage_vehicle_catalog(p_actor,p_sub,p_email) then raise exception 'catalog_forbidden'; end if;
  select * into previous from project_management.vehicle_components where id=p_component for update;
  if not found or previous.revision is distinct from p_revision then raise exception 'catalog_conflict'; end if;
  if exists(select 1 from project_management.vehicle_components where parent_id=p_component) then
    raise exception 'catalog_has_subsystems';
  end if;
  if exists(select 1 from project_management.project_vehicle_components where component_id=p_component) then
    raise exception 'catalog_has_projects';
  end if;
  delete from project_management.vehicle_components where id=p_component;
  return project_management.read_vehicle_catalog(p_actor,p_sub,p_email);
end
$$;

revoke all on function project_management.delete_vehicle_component(uuid,text,text,uuid,integer) from public;
grant execute on function project_management.delete_vehicle_component(uuid,text,text,uuid,integer) to current_user;

commit;
