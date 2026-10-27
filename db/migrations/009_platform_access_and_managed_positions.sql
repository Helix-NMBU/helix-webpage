-- Complete Neon setup for recruitment on branches that may not yet have website tables.
-- Requires identity.members from the member platform. No browser role receives access.
begin;

create schema if not exists website;

-- Keep application storage, review and cleanup behavior identical to migration 005.
create table if not exists website.applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  season text not null,
  full_name text not null,
  email text not null,
  phone text not null,
  study_program text not null,
  study_program_other text,
  year_of_study smallint not null check (year_of_study between 1 and 5),
  motivation text not null check (char_length(motivation) <= 250),
  position_id text not null,
  position_title text not null,
  interested_departments text[] not null default '{}',
  cv_path text not null,
  photo_path text,
  consent boolean not null default false
);
create unique index if not exists applications_one_per_email_per_season
  on website.applications (lower(email), season);
create index if not exists applications_created_idx on website.applications (created_at desc, id);

create table if not exists website.recruiters (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(btrim(email))),
  active boolean not null default false
);
create table if not exists website.application_uploads (
  path text primary key,
  created_at timestamptz not null default now()
);
create table if not exists website.file_cleanup (
  path text primary key,
  created_at timestamptz not null default now()
);
create table if not exists website.email_events (
  application_id uuid not null,
  kind text not null check (kind in ('confirmation', 'rejection')),
  status text not null check (status in ('skipped', 'sending', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  primary key (application_id, kind)
);
create table if not exists website.application_submission_limits (
  rate_key text primary key check (rate_key ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0)
);
create index if not exists application_submission_limits_window_idx
  on website.application_submission_limits (window_started_at);

alter table website.applications enable row level security;
alter table website.recruiters enable row level security;
alter table website.application_uploads enable row level security;
alter table website.file_cleanup enable row level security;
alter table website.email_events enable row level security;
alter table website.application_submission_limits enable row level security;

create table if not exists identity.departments (
  department_key text primary key,
  name text not null unique,
  sort_order smallint not null unique
);

insert into identity.departments (department_key, name, sort_order) values
  ('finance', 'Finance', 1),
  ('mechanical-production', 'Mechanical & Production', 2),
  ('electrical', 'Electrical', 3),
  ('software-autonomous', 'Software & Autonomous', 4),
  ('business-marketing', 'Business & Marketing', 5),
  ('logistics', 'Logistics', 6)
on conflict (department_key) do update set name = excluded.name, sort_order = excluded.sort_order;

create table if not exists identity.platform_roles (
  role_key text primary key,
  label text not null unique,
  sort_order smallint not null unique
);

insert into identity.platform_roles (role_key, label, sort_order) values
  ('project_manager', 'Project Manager', 1),
  ('department_lead', 'Department Lead', 2),
  ('team_member', 'Team Member', 3),
  ('platform_administrator', 'Platform administrator', 4)
on conflict (role_key) do update set label = excluded.label, sort_order = excluded.sort_order;

create table if not exists identity.platform_features (
  feature_key text primary key,
  label text not null,
  sort_order smallint not null
);

insert into identity.platform_features (feature_key, label, sort_order)
select 'team.' || department_key, name || ' team', sort_order
from identity.departments
on conflict (feature_key) do update set label = excluded.label, sort_order = excluded.sort_order;

insert into identity.platform_features (feature_key, label, sort_order) values
  ('recruitment.manage', 'Recruitment', 100),
  ('member_access.manage', 'Member access', 101)
on conflict (feature_key) do update set label = excluded.label, sort_order = excluded.sort_order;

create table if not exists identity.role_feature_grants (
  role_key text not null references identity.platform_roles(role_key) on delete cascade,
  feature_key text not null,
  scope text not null check (scope in ('global', 'home_department', 'all_features')),
  primary key (role_key, feature_key, scope),
  check ((scope = 'home_department' and feature_key = 'team.*') or
         (scope = 'all_features' and feature_key = '*') or
         (scope = 'global' and feature_key not in ('*', 'team.*')))
);

insert into identity.role_feature_grants (role_key, feature_key, scope) values
  ('team_member', 'team.*', 'home_department'),
  ('department_lead', 'team.*', 'home_department'),
  ('department_lead', 'recruitment.manage', 'global'),
  ('project_manager', 'recruitment.manage', 'global'),
  ('platform_administrator', '*', 'all_features')
on conflict do nothing;

create table if not exists identity.member_departments (
  member_id uuid primary key references identity.members(id) on delete cascade,
  department_key text not null references identity.departments(department_key),
  assigned_at timestamptz not null default now()
);

create table if not exists identity.member_roles (
  member_id uuid not null references identity.members(id) on delete cascade,
  role_key text not null references identity.platform_roles(role_key),
  assigned_at timestamptz not null default now(),
  primary key (member_id, role_key)
);

create index if not exists member_roles_role_idx on identity.member_roles(role_key, member_id);

create table if not exists website.positions (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  visible boolean not null default false,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into website.positions (id, document, visible, display_order)
select item->>'id', item, true, ordinal::integer - 1
from jsonb_array_elements($positions$[
  {"id":"open-application","title":"Open Application","department":"Open","applyUrl":"https://form.typeform.com/to/placeholder","contact":{"name":"Niclas Karlsen","email":"niclas.karlsen@helixnmbu.no"},"about":"Don't see a role that fits you exactly? We're always interested in hearing from talented, motivated students who share our passion for engineering and innovation. Tell us who you are, what you bring to the table and how you think you can contribute to Helix NMBU.","tasks":["Tell us about yourself and your background","Describe the skills and experience you'd bring to the team","Let us know which area of the car or organisation interests you most","Share examples of projects, coursework or work you're proud of"],"achieve":["A place on a passionate, high-performing student team","Hands-on experience in your area of interest","A network spanning engineering, business and design at NMBU and beyond"]},
  {"id":"business-partnerships","title":"Partner Relations Coordinator","department":"Business & Marketing","applyUrl":"https://form.typeform.com/to/placeholder","contact":{"name":"Aslan Yelli ","email":"aslan.yelli@helixnmbu.no","linkedin":"https://www.linkedin.com/in/aslan-yelli-04259a271/"},"about":"You will be responsible for securing the financial foundation of the team: identifying prospects, building relationships and closing sponsorship agreements that fund our season. This is a sales and relationship-driven role that combines strategic thinking with persistence and strong communication skills.","tasks":["Research, identify and approach potential sponsors across industries","Prepare tailored proposals, pitch decks and partnership packages","Lead meetings and negotiations with companies at various levels","Manage the pipeline of prospects and maintain accurate records of outreach","Work with the Head of Business to ensure sponsor deliverables are met"],"achieve":["A secured sponsor portfolio that meaningfully funds the season","Real experience in B2B sales, negotiation and account management","Lasting professional relationships in the Norwegian engineering and tech industry"]},
  {"id":"communication-content-manager","title":"Communication & Content Manager","department":"Business & Marketing","applyUrl":"https://form.typeform.com/to/placeholder","contact":{"name":"Selma Woldseth","email":"selma.woldseth@helixnmbu.no","linkedin":"https://linkedin.com/in/selma-w-040660363"},"about":"As Communication & Content Manager you will own how Helix tells its story: planning and running our communication across social media, the website and press. You will set the content strategy, keep the publishing rhythm going through the season and make sure sponsors, students and the FSAE community see what we're building.","tasks":["Own the content calendar and publishing across our social channels","Set the tone and visual direction together with the design profile","Coordinate content creators and photographers around builds and events","Produce sponsor visibility content and ensure partner commitments are delivered","Track engagement and use it to sharpen the communication strategy"],"achieve":["A visible, growing brand you shaped and ran through a full season","Real experience in communication strategy, publishing and analytics","A portfolio of campaigns tied to a race car people care about"]}
]$positions$::jsonb) with ordinality as source(item, ordinal)
on conflict (id) do nothing;

alter table website.positions enable row level security;

revoke all on schema website from public;
revoke all on all tables in schema website from public;
revoke all on identity.departments, identity.platform_roles, identity.platform_features,
  identity.role_feature_grants, identity.member_departments, identity.member_roles from public;
alter default privileges in schema identity revoke all on tables from public;
alter default privileges in schema website revoke all on tables from public;
alter default privileges in schema website revoke execute on functions from public;

do $$
declare browser_role text;
begin
  for browser_role in select rolname from pg_roles where rolname in ('anon', 'anonymous', 'authenticated') loop
    execute format('revoke all on identity.departments, identity.platform_roles, identity.platform_features, identity.role_feature_grants, identity.member_departments, identity.member_roles from %I', browser_role);
    execute format('revoke all on schema website from %I', browser_role);
    execute format('revoke all on all tables in schema website from %I', browser_role);
  end loop;
end;
$$;

grant usage on schema identity, website to current_user;
grant select, insert, update, delete on all tables in schema website to current_user;
grant select, insert, update, delete on identity.departments, identity.platform_roles,
  identity.platform_features, identity.role_feature_grants, identity.member_departments,
  identity.member_roles to current_user;

create or replace function identity.member_features(p_member_id uuid)
returns table (feature_key text)
language sql stable security invoker set search_path = pg_catalog, identity
as $$
  with assignments as (
    select g.feature_key, g.scope, md.department_key
    from identity.member_roles mr
    join identity.role_feature_grants g on g.role_key = mr.role_key
    left join identity.member_departments md on md.member_id = mr.member_id
    where mr.member_id = p_member_id
  ), resolved as (
    select case
      when scope = 'home_department' then 'team.' || department_key
      when scope = 'all_features' then '*'
      else feature_key
    end as feature_key
    from assignments
    where scope <> 'home_department' or department_key is not null
  )
  select distinct f.feature_key
  from identity.platform_features f
  where exists (select 1 from resolved r where r.feature_key in ('*', f.feature_key))
    or exists (select 1 from resolved r where r.feature_key = 'team.*' and f.feature_key like 'team.%');
$$;

create or replace function identity.member_has_feature(p_member_id uuid, p_feature_key text)
returns boolean
language sql stable security invoker set search_path = pg_catalog, identity
as $$
  select exists (select 1 from identity.member_features(p_member_id) f where f.feature_key = p_feature_key);
$$;

create or replace function identity.save_member_access(p_member_id uuid, p_department_key text, p_role_keys text[])
returns void
language plpgsql security invoker set search_path = pg_catalog, identity
as $$
declare
  platform_admin_count bigint;
begin
  if not exists (select 1 from identity.members where id = p_member_id) then
    raise exception 'Member not found' using errcode = 'P0002';
  end if;
  if p_department_key is not null and not exists (select 1 from identity.departments where department_key = p_department_key) then
    raise exception 'Invalid department' using errcode = '22023';
  end if;
  if p_role_keys is null or exists (select 1 from unnest(p_role_keys) as requested(role_key) where not exists (select 1 from identity.platform_roles r where r.role_key = requested.role_key)) then
    raise exception 'Invalid platform role' using errcode = '22023';
  end if;
  if (('team_member' = any(p_role_keys)) or ('department_lead' = any(p_role_keys))) and p_department_key is null then
    raise exception 'A department is required for Team Member and Department Lead roles' using errcode = '22023';
  end if;
  if not ('platform_administrator' = any(p_role_keys)) and exists (select 1 from identity.member_roles where member_id = p_member_id and role_key = 'platform_administrator') then
    select count(*) into platform_admin_count from identity.member_roles where role_key = 'platform_administrator';
    if platform_admin_count <= 1 then
      raise exception 'The last Platform administrator cannot be removed' using errcode = '23514';
    end if;
  end if;

  delete from identity.member_roles where member_id = p_member_id;
  insert into identity.member_roles (member_id, role_key)
  select p_member_id, key from unnest(p_role_keys) as roles(key)
  on conflict do nothing;
  if p_department_key is null then
    delete from identity.member_departments where member_id = p_member_id;
  else
    insert into identity.member_departments (member_id, department_key)
    values (p_member_id, p_department_key)
    on conflict (member_id) do update set department_key = excluded.department_key, assigned_at = now();
  end if;
end;
$$;

revoke all on function identity.member_features(uuid) from public;
revoke all on function identity.member_has_feature(uuid, text) from public;
revoke all on function identity.save_member_access(uuid, text, text[]) from public;
grant execute on function identity.member_features(uuid) to current_user;
grant execute on function identity.member_has_feature(uuid, text) to current_user;
grant execute on function identity.save_member_access(uuid, text, text[]) to current_user;

-- Preserve existing Neon recruiter grants while moving authorization to platform roles.
do $$
begin
  if to_regclass('website.recruiters') is not null then
    execute $copy$
      insert into identity.member_roles (member_id, role_key)
      select m.id, 'project_manager'
      from website.recruiters r
      join identity.members m on lower(btrim(m.email)) = lower(btrim(r.email))
      where r.active is true
      on conflict do nothing
    $copy$;
  end if;
end;
$$;

-- Grant the explicitly requested first Platform administrator if the member is onboarded.
insert into identity.member_roles (member_id, role_key)
select id, 'platform_administrator'
from identity.members
where lower(email) = 'henrik.engdal@helixnmbu.no'
on conflict do nothing;

commit;
