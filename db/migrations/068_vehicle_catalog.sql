begin;

create table project_management.vehicle_components (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('system','subsystem')),
  parent_id uuid,
  parent_kind text generated always as (case when parent_id is not null then 'system' end) stored,
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9-]{0,23}$'),
  name text not null check (length(btrim(name)) between 1 and 120),
  description text not null default '' check (length(description) <= 1000),
  archived boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  unique (id,kind),
  check ((kind='system') = (parent_id is null)),
  foreign key (parent_id,parent_kind) references project_management.vehicle_components(id,kind)
);
create index vehicle_components_parent_idx on project_management.vehicle_components(parent_id);
alter table project_management.vehicle_components enable row level security;

create table project_management.project_vehicle_components (
  project_id uuid primary key references project_management.projects(id) on delete cascade,
  component_id uuid references project_management.vehicle_components(id),
  revision integer not null default 1 check (revision > 0)
);
create index project_vehicle_components_component_idx on project_management.project_vehicle_components(component_id);
alter table project_management.project_vehicle_components enable row level security;

create function project_management.verified_vehicle_catalog_member(p_actor uuid,p_sub text,p_email text)
returns boolean language sql stable security invoker set search_path=pg_catalog as $$
  select exists (
    select 1 from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=p_actor and m.google_sub=p_sub and m.email=p_email
      and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub)
  )
$$;

create function project_management.can_manage_vehicle_catalog(p_actor uuid,p_sub text,p_email text)
returns boolean language sql stable security invoker set search_path=pg_catalog as $$
  select project_management.verified_vehicle_catalog_member(p_actor,p_sub,p_email)
    and (project_management.is_department_manager(p_actor) or exists(
      select 1 from project_management.department_members dm join project_management.departments d on d.id=dm.department_id
      where dm.member_id=p_actor and d.name='Management' and d.season=project_management.current_season() and dm.access_level in ('member','lead')
    ))
$$;

create function project_management.vehicle_catalog_components(p_choices boolean,p_current uuid,p_all boolean default false)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'parentId',c.parent_id,'code',c.code,'name',c.name,
    'description',c.description,'archived',c.archived,'revision',c.revision) order by lower(c.name),c.code),'[]'::jsonb)
  from project_management.vehicle_components c left join project_management.vehicle_components parent on parent.id=c.parent_id
  where p_all or (p_choices and not c.archived and not coalesce(parent.archived,false))
    or c.id=p_current or c.id=(select parent_id from project_management.vehicle_components where id=p_current)
$$;

create function project_management.read_vehicle_catalog(p_actor uuid,p_sub text,p_email text)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
  select jsonb_build_object('components',project_management.vehicle_catalog_components(false,null,true))
  where project_management.can_manage_vehicle_catalog(p_actor,p_sub,p_email)
$$;

create function project_management.save_vehicle_component(p_actor uuid,p_sub text,p_email text,item jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare
  target uuid;
  parent uuid;
  expected integer;
  old_component project_management.vehicle_components;
begin
  perform pg_advisory_xact_lock(72704,12);
  perform 1 from finance.settings where setting_key='current_season' for share;
  if not project_management.can_manage_vehicle_catalog(p_actor,p_sub,p_email) then raise exception 'catalog_forbidden'; end if;
  target := (item->>'id')::uuid;
  parent := (item->>'parentId')::uuid;
  expected := (item->>'revision')::integer;
  select * into old_component from project_management.vehicle_components where id=target for update;
  if expected is distinct from coalesce(old_component.revision,0) then raise exception 'catalog_conflict'; end if;
  if old_component.id is not null and (old_component.parent_id is null) <> (parent is null) then
    raise exception 'catalog_invalid';
  end if;
  if parent is not null and parent is distinct from old_component.parent_id and not exists(
    select 1 from project_management.vehicle_components c where c.id=parent and c.kind='system' and not c.archived
  ) then raise exception 'catalog_component'; end if;

  insert into project_management.vehicle_components(id,kind,parent_id,code,name,description,archived)
  values(target,case when parent is null then 'system' else 'subsystem' end,parent,item->>'code',item->>'name',item->>'description',(item->>'archived')::boolean)
  on conflict(id) do update set parent_id=excluded.parent_id,code=excluded.code,name=excluded.name,
    description=excluded.description,archived=excluded.archived,revision=vehicle_components.revision+1;

  return project_management.read_vehicle_catalog(p_actor,p_sub,p_email);
end
$$;

create function project_management.read_project_vehicle_scope(p_actor uuid,p_sub text,p_email text,p_project uuid)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
  select jsonb_build_object('componentId',assignment.component_id,'revision',coalesce(assignment.revision,0),
    'canEdit',access.can_edit,'components',project_management.vehicle_catalog_components(access.can_edit,assignment.component_id))
  from project_management.projects p
  left join project_management.project_vehicle_components assignment on assignment.project_id=p.id
  cross join lateral (
    select project_management.can_access_project(p_actor,p.departments,true)
      and not exists(select 1 from finance.seasons where code=p.season and status='closed') as can_edit
  ) access
  where p.id=p_project and p.season=project_management.current_season()
    and project_management.verified_vehicle_catalog_member(p_actor,p_sub,p_email)
    and project_management.can_access_project(p_actor,p.departments)
$$;

create function project_management.save_project_vehicle_scope(p_actor uuid,p_sub text,p_email text,p_project uuid,p_change jsonb)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare
  component uuid := (p_change->>'componentId')::uuid;
  expected integer := (p_change->>'expectedRevision')::integer;
  active_season text;
  season_status text;
  project project_management.projects;
  previous project_management.project_vehicle_components;
begin
  perform pg_advisory_xact_lock(72704,12);
  perform 1 from finance.settings where setting_key='current_season' for share;
  active_season := project_management.current_season();
  if not project_management.verified_vehicle_catalog_member(p_actor,p_sub,p_email) then raise exception 'catalog_forbidden'; end if;
  select * into project from project_management.projects where id=p_project and season=active_season for update;
  if not found or not project_management.can_access_project(p_actor,project.departments,true) then raise exception 'catalog_forbidden'; end if;
  select status into season_status from finance.seasons where code=active_season for share;
  if season_status='closed' then raise exception 'catalog_closed'; end if;
  select * into previous from project_management.project_vehicle_components where project_id=p_project for update;
  if expected is distinct from coalesce(previous.revision,0) then raise exception 'catalog_conflict'; end if;
  if component is not null and component is distinct from previous.component_id and not exists(
    select 1 from project_management.vehicle_components c left join project_management.vehicle_components parent on parent.id=c.parent_id
    where c.id=component and not c.archived and not coalesce(parent.archived,false)
  ) then raise exception 'catalog_component'; end if;

  insert into project_management.project_vehicle_components(project_id,component_id)
  values(p_project,component)
  on conflict(project_id) do update set component_id=excluded.component_id,revision=project_vehicle_components.revision+1;

  return project_management.read_project_vehicle_scope(p_actor,p_sub,p_email,p_project);
end
$$;

revoke all on function project_management.verified_vehicle_catalog_member(uuid,text,text),
  project_management.can_manage_vehicle_catalog(uuid,text,text),
  project_management.vehicle_catalog_components(boolean,uuid,boolean),
  project_management.read_vehicle_catalog(uuid,text,text),
  project_management.save_vehicle_component(uuid,text,text,jsonb),
  project_management.read_project_vehicle_scope(uuid,text,text,uuid),
  project_management.save_project_vehicle_scope(uuid,text,text,uuid,jsonb) from public;
grant execute on function project_management.verified_vehicle_catalog_member(uuid,text,text),
  project_management.can_manage_vehicle_catalog(uuid,text,text),
  project_management.vehicle_catalog_components(boolean,uuid,boolean),
  project_management.read_vehicle_catalog(uuid,text,text),
  project_management.save_vehicle_component(uuid,text,text,jsonb),
  project_management.read_project_vehicle_scope(uuid,text,text,uuid),
  project_management.save_project_vehicle_scope(uuid,text,text,uuid,jsonb) to current_user;

commit;
