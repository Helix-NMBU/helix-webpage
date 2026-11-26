-- Helix S27 BOM (25 subsystem tables) and S27 Design Event (wing split).
begin;

select pg_advisory_xact_lock(72704,12);

-- The original internal BOM import included named responsibility assignments.
-- Databases with that import already have the catalog and project links.
do $migration$
declare
  already_imported boolean;
begin
  if to_regclass('helix_migrations.applied') is not null then
    execute 'select exists(select 1 from helix_migrations.applied where filename = $1)'
      into already_imported using '074_s27_bom_vehicle_catalog.sql';
    if already_imported then return; end if;
  end if;

  insert into project_management.vehicle_components(kind,code,name,description)
  select 'system',code,name,description from (values
    ('CB','Chassis','The spaceframe and its structural mounts.'),
    ('SU','Suspension and running gear','Wheel location, damping, hubs and braking.'),
    ('AERO','Aerodynamics','The aerodynamic package and exterior bodywork.'),
    ('COCKPIT','Cockpit','Driver controls, fit and protection.'),
    ('DT','Drivetrain','The engine and mechanical power transmission.'),
    ('LV','Electronics','Vehicle electronics, controls and instrumentation.')
  ) as bom(code,name,description)
  on conflict(code) do update set name=excluded.name,description=excluded.description,
    archived=false,revision=vehicle_components.revision+1
  where vehicle_components.kind='system';

  insert into project_management.vehicle_components(kind,parent_id,code,name)
  select 'subsystem',parent.id,bom.code,bom.name
  from (values
    ('CB','CB-FRAME','Spaceframe'),
    ('SU','SU-UPRIGHT','Uprights'),
    ('SU','SU-ARMS','Wishbones'),
    ('SU','SU-DAMP','Dampers, rockers and pushrods'),
    ('SU','WT-HUBS','Wheel hubs'),
    ('SU','BR-HYD','Braking system'),
    ('AERO','AERO-FLOOR','Floor and sidepods'),
    ('AERO','AERO-FRONT','Front wing'),
    ('AERO','AERO-REAR','Rear wing'),
    ('AERO','CB-BODY','Bodywork and nose'),
    ('COCKPIT','ST-RACK','Mechanical steering'),
    ('COCKPIT','CP-SEAT','Seat and headrest'),
    ('COCKPIT','BR-PEDAL','Pedal box'),
    ('COCKPIT','CP-SAFETY','Firewall, cockpit floor and harness'),
    ('DT','ET-ENGINE','Engine overhaul'),
    ('DT','DT-DIFF','Engine mounts, differential and driveshafts'),
    ('DT','ET-COOL','Cooling and fuel'),
    ('DT','ET-INTAKE','Intake'),
    ('DT','ET-EXH','Exhaust'),
    ('DT','DT-CHAIN','Chain and sprockets'),
    ('DT','ET-TURBO','Turbo'),
    ('LV','LV-SHUT','Shutdown circuit and BSPD'),
    ('LV','LV-SHIFT','Gear shifting'),
    ('LV','LV-WHEEL','Steering-wheel electronics'),
    ('LV','LV-DASH','Dashboard'),
    ('LV','LV-ECU','Sensors and other electronics')
  ) as bom(parent_code,code,name)
  join project_management.vehicle_components parent on parent.code=bom.parent_code and parent.kind='system'
  on conflict(code) do update set parent_id=excluded.parent_id,name=excluded.name,
    archived=false,revision=vehicle_components.revision+1
  where vehicle_components.kind='subsystem';

  -- Keep the old components and their historical links. Move S27 project
  -- links on retired entries to the closest unambiguous BOM scope.
  update project_management.project_vehicle_components link
  set component_id=target.id,revision=link.revision+1
  from (values
    ('BR','BR-HYD'),
    ('ET','DT'),
    ('ST','ST-RACK'),
    ('WT','SU'),
    ('CB-COCKPIT','COCKPIT'),
    ('AERO-WINGS','AERO'),
    ('BR-WHEEL','BR-HYD'),
    ('ST-COLUMN','ST-RACK'),
    ('WT-TIRES','SU'),
    ('LV-POWER','LV-ECU')
  ) as mapping(old_code,new_code)
  join project_management.vehicle_components source on source.code=mapping.old_code
  join project_management.vehicle_components target on target.code=mapping.new_code
  cross join project_management.projects project
  where link.component_id=source.id and link.project_id=project.id and project.season='S27';

  update project_management.vehicle_components
  set archived=true,revision=revision+1
  where code in ('BR','ET','ST','WT','CB-COCKPIT','AERO-WINGS','BR-WHEEL','ST-COLUMN','WT-TIRES','LV-POWER','AT','AT-SENSE','AT-CTRL') and not archived;
end;
$migration$;

commit;
