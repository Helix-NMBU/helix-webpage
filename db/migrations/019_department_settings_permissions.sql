-- Department settings require a department head, project manager or platform admin.
-- Existing department membership and verified Google identity remain required.
begin;
create or replace function project_management.save_department_home(p_actor uuid,p_sub text,p_email text,p_change jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare
  target uuid := (p_change->>'departmentId')::uuid;
  expected integer := (p_change->>'expectedRevision')::integer;
  previous project_management.department_homes;
begin
  perform pg_advisory_xact_lock(72704,12);
  perform a.member_id from project_management.access a where a.member_id=p_actor for share;
  perform dm.member_id from project_management.department_members dm
    join project_management.departments d on d.id=dm.department_id
    join identity.members m on m.id=dm.member_id join neon_auth."user" u on u.id=m.auth_user_id
    where d.id=target and d.season='S27' and dm.member_id=p_actor and (dm.is_lead or m.email='henrik.engdal@helixnmbu.no' or exists(select 1 from project_management.access a where a.member_id=p_actor and a.active and a.can_manage))
      and m.google_sub=p_sub and m.email=p_email and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub)
    for share of dm,m;
  if not found then raise exception 'department_home_forbidden'; end if;
  if p_change->>'action' is distinct from 'save_department_home' or expected is null or expected<0 or jsonb_typeof(p_change->'description') is distinct from 'string' or char_length(p_change->>'description')>2000 or not(p_change ? 'driveFolderUrl') then raise exception 'department_home_invalid'; end if;
  select * into previous from project_management.department_homes where department_id=target for update;
  if coalesce(previous.revision,0)<>expected then raise exception 'department_home_conflict'; end if;
  insert into project_management.department_homes(department_id,description,drive_folder_url,revision)
    values(target,btrim(p_change->>'description'),p_change->>'driveFolderUrl',1)
    on conflict(department_id) do update set description=excluded.description,drive_folder_url=excluded.drive_folder_url,revision=project_management.department_homes.revision+1,updated_at=now();
end;
$$;
revoke all on function project_management.save_department_home(uuid,text,text,jsonb) from public;
grant execute on function project_management.save_department_home(uuid,text,text,jsonb) to current_user;
commit;
