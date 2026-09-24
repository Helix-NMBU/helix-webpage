-- Sponsor Portal v2, fresh-database setup.
-- Run this after enabling Google auth and email magic links in Supabase Auth.
create extension if not exists pgcrypto;

create type public.sponsor_tier as enum ('Main', 'Gold', 'Silver', 'Bronze', 'Service');
create type public.request_status as enum ('submitted', 'in_progress', 'waiting_for_sponsor', 'completed');
create type public.opportunity_kind as enum ('thesis', 'job', 'project_challenge');
create type public.opportunity_status as enum ('draft', 'submitted', 'under_review', 'changes_requested', 'approved', 'published', 'closed');
create type public.engagement_kind as enum ('talent_introduction', 'recruitment_event', 'technical_workshop');
create type public.engagement_status as enum ('requested', 'quoting', 'approved', 'scheduled', 'in_progress', 'fulfilled', 'cancelled');

create table public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete set null,
  email text not null unique,
  full_name text not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'retired')),
  has_recruitment_access boolean not null default false,
  has_sponsor_portal_access boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.sponsor_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  website_url text,
  logo_url text,
  created_at timestamptz not null default now()
);

create table public.sponsorship_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sponsor_organizations(id) on delete cascade,
  tier public.sponsor_tier not null,
  starts_at date not null,
  ends_at date not null,
  talent_directory boolean not null default false,
  included_thesis_proposals integer check (included_thesis_proposals is null or included_thesis_proposals >= 0),
  notes text,
  created_at timestamptz not null default now(),
  check (ends_at >= starts_at)
);

create index sponsor_agreements_by_period
  on public.sponsorship_agreements (organization_id, starts_at, ends_at);

create table public.sponsor_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sponsor_organizations(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  email text not null unique,
  full_name text not null,
  is_active boolean not null default true,
  invited_at timestamptz,
  last_access_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.benefit_catalog (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.agreement_benefits (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.sponsorship_agreements(id) on delete cascade,
  benefit_id uuid not null references public.benefit_catalog(id) on delete cascade,
  allowance integer check (allowance is null or allowance >= 0),
  used integer not null default 0 check (used >= 0),
  unique (agreement_id, benefit_id)
);

create table public.proposal_credits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sponsor_organizations(id) on delete cascade,
  agreement_id uuid references public.sponsorship_agreements(id) on delete set null,
  source text not null check (source in ('included', 'paid_add_on')),
  quote_amount numeric(12,2),
  quote_currency text default 'NOK',
  invoiced_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.departments (
  id bigint generated always as identity primary key,
  name text not null unique
);

create table public.students (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  personal_email text,
  personal_phone text,
  linkedin text,
  field_of_study text,
  graduation_year integer,
  profile_image_url text,
  cv_url text,
  career_entries jsonb not null default '[]'::jsonb,
  skills text[] not null default '{}',
  visible_to_sponsors boolean not null default false,
  share_cv boolean not null default false,
  share_email boolean not null default false,
  share_phone boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.positions (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  season text not null,
  title text not null,
  department_id bigint references public.departments(id) on delete set null,
  unique (student_id, season, title)
);

create table public.portal_resources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.sponsor_organizations(id) on delete cascade,
  title text not null,
  description text,
  url text not null,
  owner_member_id uuid references public.members(id) on delete set null,
  expires_at date,
  created_at timestamptz not null default now()
);

create table public.sponsor_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sponsor_organizations(id) on delete cascade,
  created_by uuid not null references public.sponsor_contacts(id) on delete restrict,
  assigned_to uuid references public.members(id) on delete set null,
  category text not null,
  subject text not null,
  description text not null,
  status public.request_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.member_opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sponsor_organizations(id) on delete cascade,
  created_by uuid not null references public.sponsor_contacts(id) on delete restrict,
  kind public.opportunity_kind not null,
  status public.opportunity_status not null default 'draft',
  title text not null,
  summary text not null,
  description text not null,
  fields text[] not null default '{}',
  location text,
  starts_at date,
  deadline date,
  compensation text,
  company_supervisor text,
  available_resources text,
  expected_deliverables text,
  confidentiality text,
  intellectual_property text,
  attachment_paths text[] not null default '{}',
  proposal_credit_id uuid references public.proposal_credits(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.member_responses (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.member_opportunities(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  note text not null,
  share_profile boolean not null default true,
  share_cv boolean not null default false,
  share_email boolean not null default false,
  share_phone boolean not null default false,
  status text not null default 'interested' check (status in ('interested', 'contacted', 'withdrawn', 'closed')),
  created_at timestamptz not null default now(),
  unique (opportunity_id, member_user_id)
);

create table public.helix_engagements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sponsor_organizations(id) on delete cascade,
  created_by uuid not null references public.sponsor_contacts(id) on delete restrict,
  assigned_to uuid references public.members(id) on delete set null,
  kind public.engagement_kind not null,
  status public.engagement_status not null default 'requested',
  title text not null,
  description text not null,
  criteria text,
  preferred_dates text,
  location text,
  audience text,
  capacity integer check (capacity is null or capacity > 0),
  budget text,
  quote_amount numeric(12,2),
  quote_currency text default 'NOK',
  included_benefit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.portal_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.sponsor_organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('request', 'opportunity', 'response', 'engagement')),
  entity_id uuid not null,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  attachment_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  organization_id uuid references public.sponsor_organizations(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.current_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.members
  where status = 'active' and (user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt()->>'email', '')))
  limit 1
$$;

create or replace function public.is_portal_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.members
    where status = 'active'
      and has_sponsor_portal_access
      and (user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt()->>'email', '')))
  )
$$;

create or replace function public.current_sponsor_contact_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.sponsor_contacts
  where is_active and (user_id = auth.uid() or lower(email) = lower(coalesce(auth.jwt()->>'email', '')))
  limit 1
$$;

create or replace function public.current_sponsor_org_id()
returns uuid language sql stable security definer set search_path = public as $$
  select organization_id from public.sponsor_contacts where id = public.current_sponsor_contact_id()
$$;

create or replace function public.has_active_portal_agreement(org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sponsorship_agreements
    where organization_id = org_id
      and tier <> 'Service'
      and current_date between starts_at and ends_at
  )
$$;

create or replace function public.has_talent_directory_access(org_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sponsorship_agreements
    where organization_id = org_id
      and talent_directory
      and current_date between starts_at and ends_at
  )
$$;

create or replace function public.current_portal_context()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  result jsonb;
begin
  update public.sponsor_contacts
    set user_id = auth.uid(), last_access_at = now()
    where user_id is null and is_active and lower(email) = lower(coalesce(auth.jwt()->>'email', ''));
  update public.members
    set user_id = auth.uid()
    where user_id is null and status = 'active' and lower(email) = lower(coalesce(auth.jwt()->>'email', ''));

  select jsonb_build_object(
    'is_member', exists(select 1 from public.members m where m.id = public.current_member_id()),
    'is_admin', public.is_portal_admin(),
    'sponsor_contact_id', c.id,
    'organization_id', o.id,
    'organization_name', o.name,
    'organization_logo_url', o.logo_url,
    'tier', a.tier,
    'agreement_id', a.id,
    'agreement_ends_at', a.ends_at,
    'talent_directory', coalesce(a.talent_directory, false),
    'thesis_credits', case when a.tier = 'Main' then null else
      (select count(*) from public.proposal_credits pc where pc.organization_id = o.id and pc.consumed_at is null)
    end
  ) into result
  from (select 1) seed
  left join public.sponsor_contacts c on c.id = public.current_sponsor_contact_id()
  left join public.sponsor_organizations o on o.id = c.organization_id
  left join lateral (
    select * from public.sponsorship_agreements sa
    where sa.organization_id = o.id and current_date between sa.starts_at and sa.ends_at
    order by sa.ends_at desc limit 1
  ) a on true;
  return coalesce(result, '{}'::jsonb);
end
$$;

create or replace function public.log_portal_event(event_type text, entity_type text default null, entity_id uuid default null, metadata jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.audit_events(actor_user_id, organization_id, event_type, entity_type, entity_id, metadata)
  values (auth.uid(), public.current_sponsor_org_id(), event_type, entity_type, entity_id, metadata)
$$;

grant execute on function public.current_portal_context() to authenticated;
grant execute on function public.log_portal_event(text, text, uuid, jsonb) to authenticated;

create or replace function public.seed_included_proposal_credits()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(new.included_thesis_proposals, 0) > 0 then
    insert into public.proposal_credits(organization_id, agreement_id, source)
    select new.organization_id, new.id, 'included' from generate_series(1, new.included_thesis_proposals);
  end if;
  return new;
end
$$;
create trigger seed_agreement_credits after insert on public.sponsorship_agreements for each row execute function public.seed_included_proposal_credits();

create or replace function public.publish_member_opportunity(target_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare item public.member_opportunities%rowtype; agreement public.sponsorship_agreements%rowtype; credit_id uuid;
begin
  if not public.is_portal_admin() then raise exception 'Sponsor Portal Administrator access required'; end if;
  select * into item from public.member_opportunities where id = target_id for update;
  if item.id is null then raise exception 'Opportunity not found'; end if;
  if item.kind = 'thesis' then
    select * into agreement from public.sponsorship_agreements
      where organization_id = item.organization_id and current_date between starts_at and ends_at
      order by ends_at desc limit 1;
    if agreement.id is null then raise exception 'No active sponsorship agreement'; end if;
    if agreement.tier is distinct from 'Main'::public.sponsor_tier then
      select id into credit_id from public.proposal_credits
        where organization_id = item.organization_id and consumed_at is null
        order by created_at for update skip locked limit 1;
      if credit_id is null then raise exception 'No Thesis Proposal credit is available'; end if;
      update public.proposal_credits set consumed_at = now() where id = credit_id;
      update public.member_opportunities set proposal_credit_id = credit_id where id = target_id;
    end if;
  end if;
  update public.member_opportunities set status = 'published', published_at = now(), updated_at = now() where id = target_id;
end
$$;
grant execute on function public.publish_member_opportunity(uuid) to authenticated;

create or replace function public.list_sponsor_responses()
returns table (
  id uuid, opportunity_id uuid, status text, note text, created_at timestamptz,
  full_name text, field_of_study text, graduation_year integer, profile_image_url text,
  email text, phone text, cv_url text
) language sql stable security definer set search_path = public as $$
  select r.id, r.opportunity_id, r.status, r.note, r.created_at,
    case when r.share_profile then s.full_name end,
    case when r.share_profile then s.field_of_study end,
    case when r.share_profile then s.graduation_year end,
    case when r.share_profile then s.profile_image_url end,
    case when r.share_email then coalesce(s.personal_email, s.email) end,
    case when r.share_phone then s.personal_phone end,
    case when r.share_cv then s.cv_url end
  from public.member_responses r
  join public.member_opportunities o on o.id = r.opportunity_id
  join public.students s on s.id = r.member_user_id
  where (
    o.organization_id = public.current_sponsor_org_id()
    and public.has_active_portal_agreement(o.organization_id)
  ) or public.is_portal_admin()
$$;
grant execute on function public.list_sponsor_responses() to authenticated;

create or replace function public.list_sponsor_members()
returns table (
  id uuid, full_name text, email text, personal_email text, personal_phone text,
  linkedin text, field_of_study text, graduation_year integer, profile_image_url text,
  cv_url text, share_cv boolean, share_email boolean, share_phone boolean
) language sql stable security definer set search_path = public as $$
  select s.id, s.full_name,
    case when s.share_email then coalesce(s.personal_email, s.email) end,
    null::text,
    case when s.share_phone then s.personal_phone end,
    s.linkedin, s.field_of_study, s.graduation_year, s.profile_image_url,
    case when s.share_cv then s.cv_url end,
    s.share_cv, s.share_email, s.share_phone
  from public.students s
  where s.visible_to_sponsors
    and public.has_talent_directory_access(public.current_sponsor_org_id())
  order by s.full_name
$$;
grant execute on function public.list_sponsor_members() to authenticated;

create or replace function public.can_access_member_cv(target_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_portal_admin() or exists (
    select 1 from public.students s
    where s.id = target_user_id and s.share_cv and (
      (s.visible_to_sponsors and public.has_talent_directory_access(public.current_sponsor_org_id()))
      or exists (
        select 1 from public.member_responses r
        join public.member_opportunities o on o.id = r.opportunity_id
        where r.member_user_id = s.id and r.share_cv
          and o.organization_id = public.current_sponsor_org_id()
          and public.has_active_portal_agreement(o.organization_id)
      )
    )
  )
$$;

alter table public.members enable row level security;
alter table public.sponsor_organizations enable row level security;
alter table public.sponsorship_agreements enable row level security;
alter table public.sponsor_contacts enable row level security;
alter table public.benefit_catalog enable row level security;
alter table public.agreement_benefits enable row level security;
alter table public.proposal_credits enable row level security;
alter table public.departments enable row level security;
alter table public.students enable row level security;
alter table public.positions enable row level security;
alter table public.portal_resources enable row level security;
alter table public.sponsor_requests enable row level security;
alter table public.member_opportunities enable row level security;
alter table public.member_responses enable row level security;
alter table public.helix_engagements enable row level security;
alter table public.portal_messages enable row level security;
alter table public.audit_events enable row level security;

create policy admin_members on public.members for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy sponsor_read_org on public.sponsor_organizations for select to authenticated using ((id = public.current_sponsor_org_id() and public.has_active_portal_agreement(id)) or public.is_portal_admin());
create policy admin_org on public.sponsor_organizations for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy sponsor_read_agreement on public.sponsorship_agreements for select to authenticated using ((organization_id = public.current_sponsor_org_id() and public.has_active_portal_agreement(organization_id)) or public.is_portal_admin());
create policy admin_agreement on public.sponsorship_agreements for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy sponsor_read_contacts on public.sponsor_contacts for select to authenticated using ((organization_id = public.current_sponsor_org_id() and public.has_active_portal_agreement(organization_id)) or public.is_portal_admin());
create policy admin_contacts on public.sponsor_contacts for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy portal_read_benefits on public.benefit_catalog for select to authenticated using (public.has_active_portal_agreement(public.current_sponsor_org_id()) or public.is_portal_admin());
create policy admin_benefits on public.benefit_catalog for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy sponsor_read_agreement_benefits on public.agreement_benefits for select to authenticated using (
  exists(select 1 from public.sponsorship_agreements a where a.id = agreement_id and ((a.organization_id = public.current_sponsor_org_id() and public.has_active_portal_agreement(a.organization_id)) or public.is_portal_admin()))
);
create policy admin_agreement_benefits on public.agreement_benefits for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy sponsor_read_credits on public.proposal_credits for select to authenticated using ((organization_id = public.current_sponsor_org_id() and public.has_active_portal_agreement(organization_id)) or public.is_portal_admin());
create policy admin_credits on public.proposal_credits for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());
create policy member_read_departments on public.departments for select to authenticated using (public.current_member_id() is not null or public.is_portal_admin());
create policy admin_departments on public.departments for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());

create policy member_own_profile on public.students for all to authenticated
  using (id = auth.uid() and public.current_member_id() is not null)
  with check (id = auth.uid() and public.current_member_id() is not null);
create policy admin_profiles on public.students for select to authenticated using (public.is_portal_admin());
create policy member_positions on public.positions for all to authenticated
  using (student_id = auth.uid() and public.current_member_id() is not null)
  with check (student_id = auth.uid() and public.current_member_id() is not null);
create policy portal_read_positions on public.positions for select to authenticated using (
  public.is_portal_admin() or exists(select 1 from public.students s where s.id = student_id and s.visible_to_sponsors and public.has_talent_directory_access(public.current_sponsor_org_id()))
);

create policy portal_resources_read on public.portal_resources for select to authenticated using (
  public.is_portal_admin() or (public.has_active_portal_agreement(public.current_sponsor_org_id()) and (organization_id is null or organization_id = public.current_sponsor_org_id()))
);
create policy admin_resources on public.portal_resources for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());

create policy sponsor_requests_read on public.sponsor_requests for select to authenticated using ((organization_id = public.current_sponsor_org_id() and public.has_active_portal_agreement(organization_id)) or public.is_portal_admin());
create policy sponsor_requests_insert on public.sponsor_requests for insert to authenticated with check (
  organization_id = public.current_sponsor_org_id() and created_by = public.current_sponsor_contact_id() and public.has_active_portal_agreement(organization_id)
);
create policy admin_requests_update on public.sponsor_requests for update to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());

create policy opportunities_read on public.member_opportunities for select to authenticated using (
  (organization_id = public.current_sponsor_org_id() and public.has_active_portal_agreement(organization_id)) or public.is_portal_admin() or (status = 'published' and public.current_member_id() is not null)
);
create policy sponsor_opportunities_insert on public.member_opportunities for insert to authenticated with check (
  organization_id = public.current_sponsor_org_id() and created_by = public.current_sponsor_contact_id() and public.has_active_portal_agreement(organization_id)
);
create policy sponsor_opportunities_update_draft on public.member_opportunities for update to authenticated using (
  organization_id = public.current_sponsor_org_id() and status in ('draft', 'changes_requested')
) with check (organization_id = public.current_sponsor_org_id());
create policy admin_opportunities on public.member_opportunities for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());

create policy member_responses_own on public.member_responses for all to authenticated using (member_user_id = auth.uid()) with check (member_user_id = auth.uid());
create policy sponsor_responses_read on public.member_responses for select to authenticated using (
  exists(select 1 from public.member_opportunities o where o.id = opportunity_id and o.organization_id = public.current_sponsor_org_id() and public.has_active_portal_agreement(o.organization_id)) or public.is_portal_admin()
);
create policy admin_responses_update on public.member_responses for update to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());

create policy engagements_read on public.helix_engagements for select to authenticated using ((organization_id = public.current_sponsor_org_id() and public.has_active_portal_agreement(organization_id)) or public.is_portal_admin());
create policy engagements_insert on public.helix_engagements for insert to authenticated with check (
  organization_id = public.current_sponsor_org_id() and created_by = public.current_sponsor_contact_id() and public.has_active_portal_agreement(organization_id)
);
create policy admin_engagements on public.helix_engagements for all to authenticated using (public.is_portal_admin()) with check (public.is_portal_admin());

create policy portal_messages_read on public.portal_messages for select to authenticated using (
  (organization_id = public.current_sponsor_org_id() and public.has_active_portal_agreement(organization_id)) or public.is_portal_admin() or (
    entity_type = 'response' and exists (
      select 1 from public.member_responses r join public.member_opportunities o on o.id = r.opportunity_id
      where r.id = entity_id and r.member_user_id = auth.uid() and o.organization_id = portal_messages.organization_id
    )
  )
);
create policy portal_messages_insert on public.portal_messages for insert to authenticated with check (
  sender_user_id = auth.uid() and (
    (organization_id = public.current_sponsor_org_id() and public.has_active_portal_agreement(organization_id)) or public.is_portal_admin() or (
      entity_type = 'response' and exists (
        select 1 from public.member_responses r join public.member_opportunities o on o.id = r.opportunity_id
        where r.id = entity_id and r.member_user_id = auth.uid() and o.organization_id = portal_messages.organization_id
      )
    )
  )
);
create policy admin_audit_read on public.audit_events for select to authenticated using (public.is_portal_admin());

insert into public.benefit_catalog(code, name, description) values
  ('portal', 'Sponsor Portal', 'Access to sponsor information, contacts, resources, and requests.'),
  ('talent_directory', 'Talent Directory', 'Browse published Member Profiles.'),
  ('thesis_proposal', 'Thesis Proposal', 'Publish an approved master thesis proposal.'),
  ('talent_introduction', 'Curated Talent Introduction', 'A Helix-managed introduction to consenting members.'),
  ('recruitment_event', 'Recruitment Event', 'A sponsor event coordinated for Helix members.'),
  ('technical_workshop', 'Technical Workshop', 'A sponsor-led workshop coordinated for Helix members.'),
  ('job_posting', 'Job Posting', 'Publish an approved role to members.'),
  ('project_challenge', 'Project Challenge', 'Publish an approved sponsor-backed project brief.');

insert into public.departments(name) values ('Management'), ('Marketing'), ('Finance'), ('Mechanical'), ('Electrical'), ('Autonomous'), ('Software') on conflict do nothing;

insert into storage.buckets(id, name, public, file_size_limit) values
  ('member-cvs', 'member-cvs', false, 5242880),
  ('member-profiles', 'member-profiles', false, 5242880),
  ('portal-attachments', 'portal-attachments', false, 10485760)
on conflict (id) do nothing;

create policy member_manage_cv on storage.objects for all to authenticated
  using (bucket_id = 'member-cvs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'member-cvs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy member_manage_profile_images on storage.objects for all to authenticated
  using (bucket_id = 'member-profiles' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'member-profiles' and (storage.foldername(name))[1] = auth.uid()::text);
create policy sponsor_read_shared_cv on storage.objects for select to authenticated using (
  bucket_id = 'member-cvs'
  and public.can_access_member_cv(((storage.foldername(name))[1])::uuid)
);
create policy portal_attachment_access on storage.objects for all to authenticated
  using (bucket_id = 'portal-attachments' and (
    ((storage.foldername(name))[1] = public.current_sponsor_org_id()::text and public.has_active_portal_agreement(public.current_sponsor_org_id())) or public.is_portal_admin() or exists (
      select 1 from public.member_responses r join public.member_opportunities o on o.id = r.opportunity_id
      where r.member_user_id = auth.uid() and o.organization_id::text = (storage.foldername(name))[1]
    )
  ))
  with check (bucket_id = 'portal-attachments' and (
    ((storage.foldername(name))[1] = public.current_sponsor_org_id()::text and public.has_active_portal_agreement(public.current_sponsor_org_id())) or public.is_portal_admin() or exists (
      select 1 from public.member_responses r join public.member_opportunities o on o.id = r.opportunity_id
      where r.member_user_id = auth.uid() and o.organization_id::text = (storage.foldername(name))[1]
    )
  ));

create or replace function public.audit_portal_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare org_id uuid;
begin
  org_id := coalesce(new.organization_id, old.organization_id, public.current_sponsor_org_id());
  insert into public.audit_events(actor_user_id, organization_id, event_type, entity_type, entity_id, metadata)
  values (auth.uid(), org_id, tg_op || '_' || tg_table_name, tg_table_name, coalesce(new.id, old.id), '{}'::jsonb);
  return coalesce(new, old);
end
$$;

create trigger audit_sponsor_requests after insert or update on public.sponsor_requests for each row execute function public.audit_portal_change();
create trigger audit_member_opportunities after insert or update on public.member_opportunities for each row execute function public.audit_portal_change();
create trigger audit_helix_engagements after insert or update on public.helix_engagements for each row execute function public.audit_portal_change();
create trigger audit_sponsorship_agreements after insert or update on public.sponsorship_agreements for each row execute function public.audit_portal_change();
