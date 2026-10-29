-- Explicit Space access for the private pipeline and shared agreements.
begin;
create table partner_deals.space_access (
  member_id uuid primary key references identity.members(id) on delete restrict,
  pipeline boolean not null default false,
  agreements boolean not null default false,
  check (not pipeline or agreements)
);
alter table partner_deals.space_access enable row level security;
revoke all on partner_deals.space_access from public;
-- Preserve existing effective access during the transition.
insert into partner_deals.space_access(member_id,pipeline,agreements)
select m.id,
  exists(select 1 from identity.member_roles r where r.member_id=m.id and r.role_key='project_manager')
    or exists(select 1 from partner_deals.member_grants g where g.member_id=m.id and g.active and g.capability='business'),
  exists(select 1 from identity.member_roles r where r.member_id=m.id and r.role_key='project_manager')
    or exists(select 1 from partner_deals.member_grants g where g.member_id=m.id and g.active and g.capability in ('business','marketing','finance'))
from identity.members m;

create or replace function partner_deals.capabilities(p_member uuid,p_sub text,p_email text)
returns table (pipeline boolean, shared boolean) language sql stable set search_path=pg_catalog as $$
 select coalesce(sa.pipeline,false),coalesce(sa.agreements,false)
 from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
 left join partner_deals.space_access sa on sa.member_id=m.id
 where m.id=p_member and m.google_sub=p_sub and m.email=lower(p_email)
   and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
   and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub)
$$;

create or replace function partner_deals.lock_actor(p_member uuid) returns void language plpgsql set search_path=pg_catalog as $$
begin
 perform m.id from identity.members m join neon_auth."user" u on u.id=m.auth_user_id where m.id=p_member for share of m,u;
 perform a."userId" from neon_auth.account a join identity.members m on m.auth_user_id=a."userId" where m.id=p_member for share of a;
 perform r.member_id from identity.member_roles r where r.member_id=p_member for share;
 perform g.member_id from partner_deals.member_grants g where g.member_id=p_member for share;
 perform s.member_id from partner_deals.space_access s where s.member_id=p_member for share;
end $$;

create or replace function identity.save_workspace_access(p_actor uuid,p_sub text,p_email text,p_change jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare
  target uuid := (p_change->>'memberId')::uuid;
  previous identity.members;
  department project_management.departments;
  choice jsonb;
  spaces text[];
  next_access text;
  previous_access text;
  was_member boolean;
  was_lead boolean;
begin
  perform pg_advisory_xact_lock(72704,12);
  perform m.id from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=p_actor and m.google_sub=p_sub and m.email=p_email
      and identity.member_has_feature(m.id,'member_access.manage')
      and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub);
  if not found then raise exception 'workspace_forbidden'; end if;
  select m.* into previous from identity.members m left join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=target and ((m.auth_user_id is null and m.google_sub is null) or
      (u."emailVerified" is true and u.banned is not true and lower(u.email)=m.email
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub))) for update of m;
  if not found then raise exception 'workspace_not_found'; end if;
  if previous.directory_revision is distinct from (p_change->>'expectedRevision')::integer then raise exception 'workspace_conflict'; end if;
  if jsonb_typeof(p_change->'departments') is distinct from 'array' or jsonb_array_length(p_change->'departments')<>7 then raise exception 'workspace_invalid'; end if;
  if jsonb_typeof(p_change->'spaceKeys') is distinct from 'array' or jsonb_array_length(p_change->'spaceKeys')>5 then raise exception 'workspace_invalid'; end if;
  if exists(select 1 from jsonb_array_elements(p_change->'spaceKeys') item where jsonb_typeof(item)<>'string') then raise exception 'workspace_invalid'; end if;
  select coalesce(array_agg(value),'{}'::text[]) into spaces from jsonb_array_elements_text(p_change->'spaceKeys');
  if exists(select 1 from unnest(spaces) value where value not in ('season-overview','recruiting','financials','pipeline','partner-agreements'))
    or cardinality(spaces)<>(select count(distinct value) from unnest(spaces) value) then raise exception 'workspace_invalid'; end if;
  if 'pipeline'=any(spaces) and not 'partner-agreements'=any(spaces) then raise exception 'workspace_invalid'; end if;
  for department in select * from project_management.departments where season=project_management.current_season() order by id for update loop
    if (select count(*) from jsonb_array_elements(p_change->'departments') c where (c->>'id')::uuid=department.id)<>1 then raise exception 'workspace_invalid'; end if;
    select c into choice from jsonb_array_elements(p_change->'departments') c where (c->>'id')::uuid=department.id;
    if department.revision is distinct from (choice->>'revision')::integer then raise exception 'workspace_conflict'; end if;
    if jsonb_typeof(choice->'member') is distinct from 'boolean' or jsonb_typeof(choice->'lead') is distinct from 'boolean' or ((choice->>'lead')::boolean and not (choice->>'member')::boolean) then raise exception 'workspace_invalid'; end if;
    select access_level into previous_access from project_management.department_members where department_id=department.id and member_id=target;
    next_access := case when choice ? 'access' then choice->>'access'
      when (choice->>'lead')::boolean then 'lead'
      when (choice->>'member')::boolean then coalesce(nullif(previous_access,'lead'),'member') else null end;
    if next_access is not null and next_access not in ('member','viewer','lead') then raise exception 'workspace_invalid'; end if;
    if choice ? 'access' and ((choice->>'member')::boolean is distinct from (choice->>'access' is not null) or (choice->>'lead')::boolean is distinct from (choice->>'access'='lead' and choice->>'access' is not null)) then raise exception 'workspace_invalid'; end if;
    select exists(select 1 from project_management.department_members where department_id=department.id and member_id=target),exists(select 1 from project_management.department_members where department_id=department.id and member_id=target and is_lead) into was_member,was_lead;
    if previous_access is distinct from next_access then
      delete from project_management.department_members where department_id=department.id and member_id=target;
      if next_access is not null then insert into project_management.department_members(department_id,member_id,is_lead,access_level) values(department.id,target,next_access='lead',next_access); end if;
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
  if p_change->'partnerSpacesConfigured' = 'true'::jsonb then
    insert into partner_deals.space_access(member_id,pipeline,agreements)
      values(target,'pipeline'=any(spaces),'partner-agreements'=any(spaces))
      on conflict(member_id) do update set pipeline=excluded.pipeline,agreements=excluded.agreements;
  end if;
  update identity.members set directory_revision=directory_revision+1 where id=target;
end;
$$;

commit;
