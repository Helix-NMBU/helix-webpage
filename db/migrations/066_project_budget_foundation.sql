-- Project budget foundation. Preserve every existing finance allocation/document ID.
-- New workflows consume this contract; existing reads are switched in later slices.
begin;

create table finance.project_budgets (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references finance.seasons(id),
  project_id uuid not null references project_management.projects(id),
  responsible_department_id uuid not null references project_management.departments(id),
  approved_version_id uuid,
  pending_version_id uuid,
  revision integer not null default 0 check (revision >= 0),
  created_by_member_id uuid not null references identity.members(id),
  updated_by_member_id uuid not null references identity.members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, season_id),
  check (approved_version_id is null or approved_version_id is distinct from pending_version_id)
);

create table finance.project_budget_versions (
  id uuid primary key default gen_random_uuid(),
  project_budget_id uuid not null references finance.project_budgets(id),
  version_number integer not null check (version_number > 0),
  status text not null default 'draft' check (status in ('draft','department_pending','finance_pending','approved')),
  revision integer not null default 0 check (revision >= 0),
  submitted_at timestamptz,
  department_approved_by uuid references identity.members(id),
  department_approved_at timestamptz,
  approved_by uuid references identity.members(id),
  approved_at timestamptz,
  submitted_snapshot jsonb,
  created_by_member_id uuid not null references identity.members(id),
  created_at timestamptz not null default now(),
  unique (id, project_budget_id),
  unique (project_budget_id, version_number),
  check (status not in ('finance_pending','approved') or (department_approved_by is not null and department_approved_at is not null)),
  check (status <> 'approved' or (approved_by is not null and approved_at is not null)),
  check (submitted_snapshot is null or jsonb_typeof(submitted_snapshot) = 'array')
);
alter table finance.project_budgets
  add foreign key (approved_version_id,id) references finance.project_budget_versions(id,project_budget_id) deferrable initially deferred,
  add foreign key (pending_version_id,id) references finance.project_budget_versions(id,project_budget_id) deferrable initially deferred;

-- Entry ID is also the budget_items ID on materialization. A draft-only entry has
-- no legacy allocation row yet; it cannot be purchased until real approval.
create table finance.project_budget_entries (
  id uuid primary key default gen_random_uuid(),
  project_budget_id uuid not null references finance.project_budgets(id),
  budget_item_id uuid unique references finance.budget_items(id),
  created_by_member_id uuid not null references identity.members(id),
  created_at timestamptz not null default now(),
  unique (id,project_budget_id),
  check (budget_item_id is null or budget_item_id=id)
);
create table finance.project_budget_version_entries (
  version_id uuid not null references finance.project_budget_versions(id),
  entry_id uuid not null references finance.project_budget_entries(id),
  system_id uuid not null references finance.systems(id),
  description text not null check (char_length(btrim(description)) between 1 and 300),
  category text not null,
  planned_ore bigint not null check (planned_ore >= 0),
  ordinary_priority text not null check (ordinary_priority in ('P1','P2','P3','P4')),
  reuse_status text not null check (reuse_status in ('new','reuse','inspect','consumable')),
  expected_purchase_date date,
  owner_member_id uuid references identity.members(id),
  owner_email text,
  status text not null default 'planned' check (status in ('planned','active','done','cancelled')),
  note text,
  earmark_id uuid references finance.funding_parts(id),
  removed boolean not null default false,
  primary key(version_id,entry_id)
);
create table finance.project_budget_decisions (
  id uuid primary key default gen_random_uuid(),
  project_budget_id uuid not null references finance.project_budgets(id),
  version_id uuid not null,
  action text not null check (btrim(action) <> ''),
  actor_member_id uuid not null references identity.members(id),
  reason text,
  snapshot jsonb not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key(version_id,project_budget_id) references finance.project_budget_versions(id,project_budget_id),
  unique(actor_member_id,request_id,action)
);
create table finance.project_budget_completion (
  entry_id uuid primary key references finance.project_budget_entries(id),
  complete boolean not null default false,
  revision integer not null default 0 check (revision >= 0),
  updated_by_member_id uuid not null references identity.members(id),
  reason text,
  updated_at timestamptz not null default now()
);

-- Application classification is separate from sponsor Won and cash receipt.
create table finance.funding_applications (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null unique references partner_deals.deals(id),
  season_id uuid not null references finance.seasons(id),
  funding_id uuid references finance.funding(id),
  purchase_conditions text not null default '',
  awarded_at timestamptz,
  awarded_by_member_id uuid references identity.members(id),
  award_date date,
  award_reference text,
  revision integer not null default 0 check (revision >= 0),
  created_by_member_id uuid not null references identity.members(id),
  created_at timestamptz not null default now(),
  check ((awarded_at is null and awarded_by_member_id is null and award_date is null and award_reference is null)
    or (awarded_at is not null and awarded_by_member_id is not null and award_date is not null and award_reference is not null and char_length(btrim(award_reference)) > 0))
);
create table finance.budget_obligations (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references finance.funding_applications(id),
  entry_id uuid not null references finance.project_budget_entries(id),
  created_by_member_id uuid not null references identity.members(id),
  created_at timestamptz not null default now(),
  released_at timestamptz,
  released_by_member_id uuid references identity.members(id),
  release_reason text,
  unique(application_id,entry_id),
  check ((released_at is null and released_by_member_id is null and release_reason is null)
    or (released_at is not null and released_by_member_id is not null and release_reason is not null and char_length(btrim(release_reason)) > 0))
);

alter table finance.purchase_lines
  add column project_budget_id uuid references finance.project_budgets(id),
  add column approved_version_id uuid,
  add constraint purchase_lines_project_version foreign key(approved_version_id,project_budget_id)
    references finance.project_budget_versions(id,project_budget_id),
  add constraint purchase_lines_project_version_pair check (approved_version_id is null or project_budget_id is not null);
alter table finance.documents
  add column storage_backend text not null default 'private_storage' check(storage_backend in ('private_storage','google_drive')),
  add column drive_file_id text unique,
  add column drive_viewer_url text;
create table finance.invoice_transfers (
  document_id uuid primary key references finance.documents(id),
  status text not null default 'pending' check(status in ('pending','transferring','stored','needs_attention')),
  drive_id text not null,
  folder_id text not null,
  drive_file_id text unique,
  content_sha256 text not null,
  staging_key text not null,
  resumable_session_uri text,
  confirmed_bytes bigint not null default 0 check(confirmed_bytes >= 0),
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0 check(attempts >= 0),
  last_error text,
  verified_at timestamptz,
  revision integer not null default 0 check(revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status <> 'stored' or (drive_file_id is not null and verified_at is not null))
);
create index project_budgets_season_department_idx on finance.project_budgets(season_id,responsible_department_id);
create index project_budget_versions_status_idx on finance.project_budget_versions(project_budget_id,status);
create index budget_obligations_entry_idx on finance.budget_obligations(entry_id) where released_at is null;
create index invoice_transfers_pending_idx on finance.invoice_transfers(status,lease_until) where status <> 'stored';

create function finance.project_budget_verified_member(actor uuid, google_sub text, email text)
returns boolean language sql stable security invoker set search_path=pg_catalog as $$
  select exists(select 1 from identity.members m
    join neon_auth."user" u on u.id=m.auth_user_id
    join neon_auth.account a on a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub
    where m.id=actor and m.google_sub=$2 and m.email=lower($3)
      and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true)
$$;

create function finance.project_budget_scope(actor uuid, google_sub text, email text, target_project uuid, responsible_department uuid default null)
returns jsonb language plpgsql stable security invoker set search_path=pg_catalog as $$
declare p project_management.projects%rowtype; s finance.seasons%rowtype;
  target_department uuid; stored_department uuid; flags jsonb; is_finance boolean; is_head boolean; is_author boolean; is_reviewer boolean; can_read boolean;
begin
  if not finance.project_budget_verified_member(actor,$2,$3) then raise exception 'finance:PROJECT_FORBIDDEN' using errcode='42501'; end if;
  select * into p from project_management.projects where id=target_project;
  if not found then raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002'; end if;
  select * into s from finance.seasons where code=p.season;
  if not found then raise exception 'finance:PROJECT_SEASON_MISSING' using errcode='P0002'; end if;
  select responsible_department_id into stored_department from finance.project_budgets where project_id=p.id and season_id=s.id;
  if stored_department is not null and responsible_department is not null and stored_department<>responsible_department then
    raise exception 'finance:PROJECT_DEPARTMENT_MISMATCH' using errcode='23514';
  end if;
  target_department := coalesce(stored_department,responsible_department);
  if target_department is null and cardinality(p.departments)=1 then
    select id into target_department from project_management.departments where season=p.season and name=p.departments[1];
  end if;
  if target_department is not null and not exists(select 1 from project_management.departments d where d.id=target_department and d.season=p.season and d.name=any(p.departments)) then
    raise exception 'finance:PROJECT_DEPARTMENT_MISMATCH' using errcode='23514';
  end if;
  flags := finance.capability_flags(actor);
  is_finance := coalesce((flags->>'purchaseRegister')::boolean,false);
  is_head := is_finance and coalesce((flags->>'approveBudget')::boolean,false);
  is_author := actor=any(p.lead_ids);
  is_reviewer := exists(select 1 from project_management.department_members dm where dm.department_id=target_department and dm.member_id=actor and dm.is_lead);
  can_read := is_finance or is_author or is_reviewer;
  if not can_read then raise exception 'finance:PROJECT_FORBIDDEN' using errcode='42501'; end if;
  return jsonb_build_object('memberId',actor,'projectId',p.id,'seasonId',s.id,'seasonCode',s.code,'projectName',p.name,'projectLeadIds',p.lead_ids,
    'responsibleDepartmentId',target_department,'departments',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,
      'leadIds',coalesce((select jsonb_agg(dm.member_id order by dm.member_id) from project_management.department_members dm where dm.department_id=d.id and dm.is_lead),'[]'::jsonb)) order by d.name,d.id)
      from project_management.departments d where d.season=p.season and d.name=any(p.departments)),'[]'::jsonb),
    'capabilities',jsonb_build_object('canRead',true,'canDraft',is_author and s.status<>'closed','canReviewDepartment',is_reviewer and s.status<>'closed',
      'canApproveFinance',is_head and s.status<>'closed','canRequestChanges',(is_author or is_reviewer or is_finance) and s.status<>'closed',
      'canRegisterPurchase',(is_reviewer or is_finance) and s.status<>'closed','canReadFinance',is_finance,
      'canRecordAward',is_head and s.status<>'closed','canReleaseObligation',is_head and s.status<>'closed'));
end;
$$;

create function finance.enforce_project_budget_relation()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if not exists(select 1 from project_management.projects p join finance.seasons s on s.code=p.season
    join project_management.departments d on d.id=new.responsible_department_id and d.season=p.season and d.name=any(p.departments)
    where p.id=new.project_id and s.id=new.season_id) then
    raise exception 'finance:PROJECT_DEPARTMENT_MISMATCH' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger project_budget_relation before insert or update of project_id,season_id,responsible_department_id on finance.project_budgets
  for each row execute function finance.enforce_project_budget_relation();

create function finance.enforce_project_budget_pointers()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare budget_id uuid; b finance.project_budgets%rowtype;
begin
  if tg_table_name='project_budgets' then budget_id:=new.id; else budget_id:=new.project_budget_id; end if;
  select * into b from finance.project_budgets where id=budget_id;
  if b.approved_version_id is not null and not exists(select 1 from finance.project_budget_versions v where v.id=b.approved_version_id and v.project_budget_id=b.id and v.status='approved') then
    raise exception 'finance:PROJECT_APPROVED_VERSION_MISMATCH' using errcode='23514';
  end if;
  if b.pending_version_id is not null and not exists(select 1 from finance.project_budget_versions v where v.id=b.pending_version_id and v.project_budget_id=b.id and v.status<>'approved') then
    raise exception 'finance:PROJECT_PENDING_VERSION_MISMATCH' using errcode='23514';
  end if;
  return null;
end;
$$;
create constraint trigger project_budget_pointers after insert or update on finance.project_budgets
  deferrable initially deferred for each row execute function finance.enforce_project_budget_pointers();
create constraint trigger project_budget_version_pointers after update on finance.project_budget_versions
  deferrable initially deferred for each row execute function finance.enforce_project_budget_pointers();

create function finance.enforce_project_entry_identity()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if tg_op='UPDATE' and (old.id is distinct from new.id or old.project_budget_id is distinct from new.project_budget_id) then
    raise exception 'finance:PROJECT_ENTRY_IDENTITY_IMMUTABLE' using errcode='23514';
  end if;
  if new.budget_item_id is not null and not exists(select 1 from finance.budget_items i join finance.budgets legacy on legacy.id=i.budget_id
      join finance.project_budgets pb on pb.id=new.project_budget_id where i.id=new.budget_item_id and legacy.season_id=pb.season_id) then
    raise exception 'finance:PROJECT_ENTRY_MISMATCH' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger project_entry_identity before insert or update on finance.project_budget_entries
  for each row execute function finance.enforce_project_entry_identity();

create function finance.enforce_project_version_entry()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare target_version uuid; v finance.project_budget_versions%rowtype;
begin
  if tg_op='UPDATE' and (old.version_id is distinct from new.version_id or old.entry_id is distinct from new.entry_id) then
    raise exception 'finance:PROJECT_ENTRY_IDENTITY_IMMUTABLE' using errcode='23514';
  end if;
  target_version := case when tg_op='DELETE' then old.version_id else new.version_id end;
  select * into v from finance.project_budget_versions where id=target_version for update;
  if v.status <> 'draft' then raise exception 'finance:PROJECT_VERSION_IMMUTABLE' using errcode='23514'; end if;
  if tg_op='DELETE' then return old; end if;
  if not exists(select 1 from finance.project_budget_entries e where e.id=new.entry_id and e.project_budget_id=v.project_budget_id)
    or not exists(select 1 from finance.project_budgets b join project_management.projects p on p.id=b.project_id
      join finance.systems sys on sys.id=new.system_id join identity.departments d on d.department_key=sys.department_key
      where b.id=v.project_budget_id and project_management.canonical_department(d.name)=any(p.departments)) then
    raise exception 'finance:PROJECT_ENTRY_MISMATCH' using errcode='23514';
  end if;
  if new.earmark_id is not null and not exists(select 1 from finance.funding_parts fp join finance.funding f on f.id=fp.funding_id
    join finance.project_budgets b on b.id=v.project_budget_id where fp.id=new.earmark_id and f.season_id=b.season_id) then
    raise exception 'finance:PROJECT_EARMARK_MISMATCH' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger project_version_entry_integrity before insert or update or delete on finance.project_budget_version_entries
  for each row execute function finance.enforce_project_version_entry();

create function finance.preserve_project_budget_history()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  raise exception 'finance:PROJECT_HISTORY_IMMUTABLE' using errcode='23514';
end;
$$;
create trigger project_budget_decisions_append_only before update or delete on finance.project_budget_decisions
  for each row execute function finance.preserve_project_budget_history();
create function finance.preserve_approved_project_version()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  if old.status='approved' then raise exception 'finance:PROJECT_VERSION_IMMUTABLE' using errcode='23514'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger project_budget_approved_version_immutable before update or delete on finance.project_budget_versions
  for each row execute function finance.preserve_approved_project_version();

-- One row per materialized allocation identity. Approved snapshots supersede
-- their legacy plan atomically; removed entries retain a zero-plan history row.
create view finance.effective_budget_entries as
select i.id, i.budget_id, b.season_id, i.public_ref,
  pe.project_budget_id, pb.project_id, pb.responsible_department_id, pb.approved_version_id,
  coalesce(ve.system_id,i.system_id) as system_id,
  coalesce(ve.description,i.description) as description,
  coalesce(ve.category,i.category) as category,
  case when pb.approved_version_id is not null then
    case when ve.entry_id is null or ve.removed or ve.status='cancelled' or i.protected then 0 else ve.planned_ore end
    when b.status='approved' and i.status<>'cancelled' and not i.protected then i.planned_ore else 0 end as planned_ore,
  case when pb.approved_version_id is not null then ve.ordinary_priority
    when i.priority<>'EM' then i.priority else null end as ordinary_priority,
  case when exists(select 1 from finance.budget_obligations bo join finance.funding_applications fa on fa.id=bo.application_id
      where bo.entry_id=pe.id and bo.released_at is null and fa.awarded_at is not null) then 'P0'
    when pb.approved_version_id is not null then coalesce(ve.ordinary_priority,case when i.priority='EM' then 'P1' else i.priority end)
    else i.priority end as priority,
  coalesce(ve.reuse_status,i.reuse_status) as reuse_status,
  case when pb.approved_version_id is not null then ve.expected_purchase_date else i.expected_purchase_date end as expected_purchase_date,
  case when pb.approved_version_id is not null then ve.owner_member_id else i.owner_member_id end as owner_member_id,
  case when pb.approved_version_id is not null then
    case when ve.entry_id is null or ve.removed then 'cancelled' else ve.status end else i.status end as status,
  case when pb.approved_version_id is not null then ve.note else i.note end as note,
  case when pb.approved_version_id is not null then ve.earmark_id else i.earmark_id end as earmark_id,
  i.protected, greatest(i.revision,coalesce(pb.revision,0)) as revision,
  case when pb.approved_version_id is null then 'legacy' else 'project' end as source,
  b.status as legacy_budget_status,
  coalesce(pc.complete,false) as complete
from finance.budget_items i join finance.budgets b on b.id=i.budget_id
left join finance.project_budget_entries pe on pe.budget_item_id=i.id
left join finance.project_budgets pb on pb.id=pe.project_budget_id
left join finance.project_budget_version_entries ve on ve.version_id=pb.approved_version_id and ve.entry_id=pe.id
left join finance.project_budget_completion pc on pc.entry_id=pe.id;

create function finance.project_budget_assignments_changed()
returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
  perform finance.bump_view_version();
  return null;
end;
$$;
create trigger finance_project_leads_changed after update of lead_ids,departments on project_management.projects
  for each statement execute function finance.project_budget_assignments_changed();
create trigger finance_department_leads_changed after insert or update or delete on project_management.department_members
  for each statement execute function finance.project_budget_assignments_changed();

do $$
declare relation text; role_name text;
begin
  foreach relation in array array['project_budgets','project_budget_versions','project_budget_entries','project_budget_version_entries','project_budget_decisions','project_budget_completion','funding_applications','budget_obligations','invoice_transfers'] loop
    execute format('alter table finance.%I enable row level security',relation);
    execute format('revoke all on finance.%I from public',relation);
    foreach role_name in array array['anon','authenticated'] loop
      if exists(select 1 from pg_roles where rolname=role_name) then
        execute format('revoke all on finance.%I from %I',relation,role_name);
        execute format('revoke all on finance.effective_budget_entries from %I',role_name);
      end if;
    end loop;
  end loop;
end;
$$;
revoke all on finance.effective_budget_entries from public;
revoke all on function finance.project_budget_verified_member(uuid,text,text),finance.project_budget_scope(uuid,text,text,uuid,uuid) from public;
commit;
