-- Administrator-managed department membership and independent space access.
begin;
create table if not exists identity.member_feature_overrides (
  member_id uuid not null references identity.members(id) on delete cascade,
  feature_key text not null references identity.platform_features(feature_key),
  allowed boolean not null,
  primary key(member_id, feature_key)
);
alter table identity.member_feature_overrides enable row level security;
revoke all on identity.member_feature_overrides from public;
grant select, insert, update, delete on identity.member_feature_overrides to current_user;
insert into identity.platform_roles(role_key,label,sort_order) values('financials','Financials',5) on conflict(role_key) do nothing;

create or replace function identity.member_features(p_member_id uuid)
returns table(feature_key text) language sql stable security invoker set search_path=pg_catalog,identity as $$
  with assignments as (
    select g.feature_key,g.scope,md.department_key
    from identity.member_roles mr join identity.role_feature_grants g on g.role_key=mr.role_key
    left join identity.member_departments md on md.member_id=mr.member_id where mr.member_id=p_member_id
  ), resolved as (
    select case when scope='home_department' then 'team.'||department_key when scope='all_features' then '*' else feature_key end as feature_key
    from assignments where scope<>'home_department' or department_key is not null
  )
  select f.feature_key from identity.platform_features f
  left join identity.member_feature_overrides o on o.member_id=p_member_id and o.feature_key=f.feature_key
  where coalesce(o.allowed,
    exists(select 1 from resolved r where r.feature_key in ('*',f.feature_key)) or
    exists(select 1 from resolved r where r.feature_key='team.*' and f.feature_key like 'team.%'));
$$;

create or replace function identity.save_workspace_access(p_actor uuid,p_sub text,p_email text,p_change jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare
  target uuid := (p_change->>'memberId')::uuid;
  previous identity.members;
  department project_management.departments;
  choice jsonb;
  spaces text[];
  was_member boolean;
  was_lead boolean;
begin
  perform pg_advisory_xact_lock(72704,12);
  perform m.id from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=p_actor and m.google_sub=p_sub and m.email=p_email
      and identity.member_has_feature(m.id,'member_access.manage')
      and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub);
  if not found or p_actor=target then raise exception 'workspace_forbidden'; end if;
  select m.* into previous from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=target and u."emailVerified" is true and u.banned is not true and lower(u.email)=m.email
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub) for update of m;
  if not found then raise exception 'workspace_not_found'; end if;
  if previous.directory_revision is distinct from (p_change->>'expectedRevision')::integer then raise exception 'workspace_conflict'; end if;
  if jsonb_typeof(p_change->'departments') is distinct from 'array' or jsonb_array_length(p_change->'departments')<>7 then raise exception 'workspace_invalid'; end if;
  if jsonb_typeof(p_change->'spaceKeys') is distinct from 'array' or jsonb_array_length(p_change->'spaceKeys')>3 then raise exception 'workspace_invalid'; end if;
  if exists(select 1 from jsonb_array_elements(p_change->'spaceKeys') item where jsonb_typeof(item)<>'string') then raise exception 'workspace_invalid'; end if;
  select coalesce(array_agg(value),'{}'::text[]) into spaces from jsonb_array_elements_text(p_change->'spaceKeys');
  if exists(select 1 from unnest(spaces) value where value not in ('season-overview','recruiting','financials'))
    or cardinality(spaces)<>(select count(distinct value) from unnest(spaces) value) then raise exception 'workspace_invalid'; end if;
  for department in select * from project_management.departments where season='S27' order by id for update loop
    if (select count(*) from jsonb_array_elements(p_change->'departments') c where (c->>'id')::uuid=department.id)<>1 then raise exception 'workspace_invalid'; end if;
    select c into choice from jsonb_array_elements(p_change->'departments') c where (c->>'id')::uuid=department.id;
    if department.revision is distinct from (choice->>'revision')::integer then raise exception 'workspace_conflict'; end if;
    if jsonb_typeof(choice->'member') is distinct from 'boolean' or jsonb_typeof(choice->'lead') is distinct from 'boolean' or ((choice->>'lead')::boolean and not (choice->>'member')::boolean) then raise exception 'workspace_invalid'; end if;
    if (choice->>'lead')::boolean and exists(select 1 from project_management.department_members where department_id=department.id and is_lead and member_id<>target) then raise exception 'workspace_lead_conflict'; end if;
    select exists(select 1 from project_management.department_members where department_id=department.id and member_id=target),exists(select 1 from project_management.department_members where department_id=department.id and member_id=target and is_lead) into was_member,was_lead;
    if was_member is distinct from (choice->>'member')::boolean or was_lead is distinct from (choice->>'lead')::boolean then
      delete from project_management.department_members where department_id=department.id and member_id=target;
      if (choice->>'member')::boolean then insert into project_management.department_members values(department.id,target,(choice->>'lead')::boolean); end if;
      update project_management.departments set revision=revision+1,updated_at=now() where id=department.id;
    end if;
  end loop;
  if 'season-overview'=any(spaces) then
    insert into project_management.access(member_id,active) values(target,true) on conflict(member_id) do update set active=true;
  else
    update project_management.access set active=false where member_id=target and active;
  end if;
  insert into identity.member_feature_overrides(member_id,feature_key,allowed) values(target,'recruitment.manage','recruiting'=any(spaces))
    on conflict(member_id,feature_key) do update set allowed=excluded.allowed;
  if 'financials'=any(spaces) then
    insert into identity.member_roles(member_id,role_key) values(target,'financials') on conflict do nothing;
  else
    delete from identity.member_roles where member_id=target and role_key='financials';
  end if;
  update identity.members set directory_revision=directory_revision+1 where id=target;
end;
$$;
revoke all on function identity.save_workspace_access(uuid,text,text,jsonb) from public;
grant execute on function identity.save_workspace_access(uuid,text,text,jsonb) to current_user;
commit;
