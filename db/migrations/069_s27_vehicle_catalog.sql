-- Seed the reusable Helix catalog and link existing S27 projects by ID.
begin;

insert into project_management.vehicle_components(kind,code,name,description)
select 'system',value->>'code',value->>'name',value->>'description'
from jsonb_array_elements($catalog$[
  {"code":"CB","name":"Chassis and Body","description":"The structure, bodywork and driver packaging.","subsystems":[["CB-FRAME","Frame"],["CB-BODY","Body panels and nose"],["CB-COCKPIT","Cockpit and driver fit"]]},
  {"code":"AERO","name":"Aerodynamics","description":"The package fitted to the car to manage airflow.","subsystems":[["AERO-WINGS","Front and rear wings"],["AERO-FLOOR","Floor and sidepods"]]},
  {"code":"BR","name":"Brake System","description":"Driver-operated braking and its mechanical interfaces.","subsystems":[["BR-PEDAL","Pedal box"],["BR-HYD","Hydraulics"],["BR-WHEEL","Wheel-end brakes"]]},
  {"code":"DT","name":"Drivetrain","description":"Mechanical transfer of power to the wheels.","subsystems":[["DT-CHAIN","Drive and chain guard"],["DT-DIFF","Differential and mounts"]]},
  {"code":"ET","name":"Engine and Powertrain","description":"The S27 combustion engine and its supporting systems.","subsystems":[["ET-ENGINE","Engine and intake"],["ET-COOL","Cooling and fuel"],["ET-EXH","Exhaust"]]},
  {"code":"ST","name":"Steering System","description":"The driver steering controls and mechanical linkage.","subsystems":[["ST-RACK","Steering rack and linkage"],["ST-COLUMN","Steering wheel and column"]]},
  {"code":"SU","name":"Suspension System","description":"The geometry, arms and damping that locate the wheels.","subsystems":[["SU-ARMS","Suspension arms"],["SU-DAMP","Dampers and springs"],["SU-UPRIGHT","Uprights and spindles"]]},
  {"code":"WT","name":"Wheels, Bearings and Tires","description":"The wheel assemblies and tires used for testing and competition.","subsystems":[["WT-HUBS","Hubs and bearings"],["WT-TIRES","Wheels and tires"]]},
  {"code":"LV","name":"Grounded Low Voltage System","description":"Low-voltage electrical power, controls and instrumentation.","subsystems":[["LV-POWER","Power distribution and harness"],["LV-ECU","Engine controls and sensors"],["LV-SHUT","Shutdown circuit"],["LV-DASH","Dashboard and driver controls"]]},
  {"code":"AT","name":"Autonomous System","description":"Technical classification for future autonomous vehicle work.","subsystems":[["AT-SENSE","Sensing and data collection"],["AT-CTRL","Autonomous control"]]}
]$catalog$::jsonb)
on conflict(code) do nothing;

insert into project_management.vehicle_components(kind,parent_id,code,name)
select 'subsystem',parent.id,child.value->>0,child.value->>1
from jsonb_array_elements($catalog$[
  {"code":"CB","name":"Chassis and Body","description":"The structure, bodywork and driver packaging.","subsystems":[["CB-FRAME","Frame"],["CB-BODY","Body panels and nose"],["CB-COCKPIT","Cockpit and driver fit"]]},
  {"code":"AERO","name":"Aerodynamics","description":"The package fitted to the car to manage airflow.","subsystems":[["AERO-WINGS","Front and rear wings"],["AERO-FLOOR","Floor and sidepods"]]},
  {"code":"BR","name":"Brake System","description":"Driver-operated braking and its mechanical interfaces.","subsystems":[["BR-PEDAL","Pedal box"],["BR-HYD","Hydraulics"],["BR-WHEEL","Wheel-end brakes"]]},
  {"code":"DT","name":"Drivetrain","description":"Mechanical transfer of power to the wheels.","subsystems":[["DT-CHAIN","Drive and chain guard"],["DT-DIFF","Differential and mounts"]]},
  {"code":"ET","name":"Engine and Powertrain","description":"The S27 combustion engine and its supporting systems.","subsystems":[["ET-ENGINE","Engine and intake"],["ET-COOL","Cooling and fuel"],["ET-EXH","Exhaust"]]},
  {"code":"ST","name":"Steering System","description":"The driver steering controls and mechanical linkage.","subsystems":[["ST-RACK","Steering rack and linkage"],["ST-COLUMN","Steering wheel and column"]]},
  {"code":"SU","name":"Suspension System","description":"The geometry, arms and damping that locate the wheels.","subsystems":[["SU-ARMS","Suspension arms"],["SU-DAMP","Dampers and springs"],["SU-UPRIGHT","Uprights and spindles"]]},
  {"code":"WT","name":"Wheels, Bearings and Tires","description":"The wheel assemblies and tires used for testing and competition.","subsystems":[["WT-HUBS","Hubs and bearings"],["WT-TIRES","Wheels and tires"]]},
  {"code":"LV","name":"Grounded Low Voltage System","description":"Low-voltage electrical power, controls and instrumentation.","subsystems":[["LV-POWER","Power distribution and harness"],["LV-ECU","Engine controls and sensors"],["LV-SHUT","Shutdown circuit"],["LV-DASH","Dashboard and driver controls"]]},
  {"code":"AT","name":"Autonomous System","description":"Technical classification for future autonomous vehicle work.","subsystems":[["AT-SENSE","Sensing and data collection"],["AT-CTRL","Autonomous control"]]}
]$catalog$::jsonb) as source(value)
join project_management.vehicle_components parent on parent.code=source.value->>'code' and parent.kind='system'
cross join lateral jsonb_array_elements(source.value->'subsystems') child
on conflict(code) do nothing;

insert into project_management.project_vehicle_components(project_id,component_id)
select p.id,c.id
from jsonb_array_elements($assignments$[
  {"id":"f7670cf5-2fc2-4958-8c30-d5f67ea06475","component":"BR"},
  {"id":"4726cfde-7756-4a3f-b85c-b9270e7a22d3","component":"CB"},
  {"id":"0d457f1d-84e0-4081-bfd2-954e56ae048e","component":"DT"},
  {"id":"6246b74a-77d9-4411-8ce6-5812d3fb9952","component":"ET"},
  {"id":"8248c27a-2a2f-42d5-9018-31235d67acd2","component":"ST"},
  {"id":"47b707b9-d764-42fc-82ff-3d5b698a7466","component":"SU"},
  {"id":"bd934306-d613-4e92-8ea9-c542ea4490c9","component":"WT"},
  {"id":"d8b01544-3771-43a7-8abe-2d82da4062c1","component":"LV"}
]$assignments$::jsonb) d
join project_management.projects p on p.id=(d.value->>'id')::uuid and p.season='S27'
join project_management.vehicle_components c on c.code=d.value->>'component'
on conflict(project_id) do nothing;

commit;
