-- Run deliberately after migration 029. Existing member profiles are preserved.
begin;
select pg_advisory_xact_lock(72704,12);
create temporary table requested_members (email text primary key, name text not null, title text not null, department text, season_overview boolean not null) on commit drop;
insert into requested_members values
 ('alex.rivera@helixnmbu.no','Alex Rivera','Project Manager',null,true),
 ('morgan.lee@helixnmbu.no','Morgan Lee','Project Manager',null,true),
 ('casey.parker@helixnmbu.no','Casey Parker','Head of Finance','Finance',false),
 ('jordan.kim@helixnmbu.no','Jordan Kim','Head of Business','Business & Marketing',false),
 ('taylor.blake@helixnmbu.no','Taylor Blake','Head of Marketing','Business & Marketing',false),
 ('sam.baker@helixnmbu.no','Sam Baker','Head of Mechanical & Production','Mechanical & Production',false),
 ('riley.jones@helixnmbu.no','Riley Jones','Head of Electronics','Electronics',false),
 ('jamie.davis@helixnmbu.no','Jamie Davis','Head of Software & Autonomous','Software & Autonomous',false);
do $$ begin
 if exists(select 1 from requested_members r where r.department is not null and not exists(select 1 from project_management.departments d where d.season='S27' and d.name=r.department)) then raise exception 'Required S27 department is missing'; end if;
end $$;
insert into identity.members(email,full_name,helix_role,auth_user_id,google_sub,verified_at)
select email,name,title,null,null,null from requested_members on conflict(email) do nothing;
-- Keep any existing authentication link while applying the requested name and title.
update identity.members m set full_name=r.name, helix_role=r.title, directory_revision=m.directory_revision+1
from requested_members r where m.email=r.email and (m.full_name is distinct from r.name or m.helix_role is distinct from r.title);
do $$ begin
 if exists(select 1 from requested_members r join identity.members m using(email) where r.department is not null and project_management.is_department_manager(m.id)) then raise exception 'A requested Lead already has a platform-wide manager role; review their access before proceeding'; end if;
end $$;
insert into project_management.department_members(department_id,member_id,is_lead,access_level)
select d.id,m.id,true,'lead' from requested_members r join identity.members m using(email)
join project_management.departments d on d.season='S27' and d.name=r.department
on conflict(department_id,member_id) do update set is_lead=true,access_level='lead';
update project_management.departments set revision=revision+1,updated_at=now() where season='S27' and name in (select department from requested_members where department is not null);
-- Season Overview includes read-only access to each department's projects.
insert into project_management.department_members(department_id,member_id,is_lead,access_level)
select d.id,m.id,false,'viewer' from requested_members r join identity.members m using(email) cross join project_management.departments d where r.season_overview and d.season='S27'
on conflict(department_id,member_id) do nothing;
-- Financials space access is separate from Finance department leadership.
insert into identity.member_roles(member_id,role_key)
select id,'financials' from identity.members where email='casey.parker@helixnmbu.no'
on conflict(member_id,role_key) do nothing;
-- Record the explicitly approved Head of Finance grant through the audited operator path.
do $$
declare operator_id uuid; target_id uuid;
begin
 select m.id into operator_id from identity.members m join identity.member_roles r on r.member_id=m.id and r.role_key='platform_administrator'
 join neon_auth."user" u on u.id=m.auth_user_id
 where m.email='operator@helixnmbu.no' and u."emailVerified" is true and u.banned is not true and lower(u.email)=m.email
   and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub);
 select id into target_id from identity.members where email='casey.parker@helixnmbu.no';
 if operator_id is null or target_id is null then raise exception 'Verified platform administrator or Finance member not found'; end if;
 perform finance.set_member_grant(operator_id,target_id,'head_of_finance',true,'Authorized Head of Finance assignment');
end $$;
insert into project_management.access(member_id,active)
select m.id,true from requested_members r join identity.members m using(email) where r.season_overview
on conflict(member_id) do update set active=true;
commit;
