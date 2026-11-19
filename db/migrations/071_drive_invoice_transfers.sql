-- New evidence is committed with its actual expense. Existing private documents are not migrated.
alter table finance.invoice_transfers alter column drive_id drop not null, alter column folder_id drop not null;
alter table finance.invoice_transfers add constraint invoice_destination_pair check ((drive_id is null)=(folder_id is null));
create table finance.invoice_retry_requests (
 actor_member_id uuid not null references identity.members(id), request_id uuid not null, document_id uuid not null references finance.documents(id), expected_revision integer not null,
 primary key(actor_member_id,request_id)
);
create table finance.invoice_transfer_events (
 id bigint generated always as identity primary key, document_id uuid not null references finance.documents(id),
 actor_member_id uuid references identity.members(id), action text not null, revision integer not null,
 safe_error text, created_at timestamptz not null default clock_timestamp(), unique(document_id,revision)
);
create function finance.enqueue_invoice_transfer() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
declare purchaser uuid; historical text;
begin
 select requester_member_id,import_source into purchaser,historical from finance.purchases where id=new.purchase_id;
 if historical is not null then return new; end if;
 if not exists(select 1 from finance.uploads u where u.member_id=purchaser and u.status='finalized'
   and u.final_key=new.storage_key and u.content_sha256=new.content_sha256 and u.byte_size=new.byte_size
   and (u.purchase_id is null or u.purchase_id=new.purchase_id)) then
   raise exception 'FINANCE|invalid|Invoice evidence must use a verified finalized upload.|files';
 end if;
 new.storage_backend:='google_drive'; new.drive_file_id:=null; new.drive_viewer_url:=null;
 return new;
end; $$;
create trigger documents_verified_transfer before insert on finance.documents for each row execute function finance.enqueue_invoice_transfer();
create function finance.create_invoice_transfer() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if new.storage_backend='google_drive' then
   insert into finance.invoice_transfers(document_id,content_sha256,staging_key) values(new.id,new.content_sha256,new.storage_key);
   insert into finance.invoice_transfer_events(document_id,actor_member_id,action,revision)
     select new.id,requester_member_id,'queued',0 from finance.purchases where id=new.purchase_id;
 end if;
 return new;
end; $$;
create trigger documents_enqueue_transfer after insert on finance.documents for each row execute function finance.create_invoice_transfer();

-- Whole-invoice visibility must not disclose another project's purchases on mixed historical invoices.
create function finance.invoice_document_scope(document uuid) returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select case when p.project_id is not null then jsonb_build_object('projectId',p.project_id,'departmentId',p.responsible_department_id)
 else (select case when count(*)>0 and count(distinct e.project_id)=1 and bool_and(e.project_id is not null)
   then jsonb_build_object('projectId',min(e.project_id::text),'departmentId',min(h.responsible_department_id::text)) end
   from finance.purchase_lines l left join finance.allocations a on a.line_id=l.id
   left join finance.effective_budget_entries e on e.id=a.budget_item_id
   left join finance.project_budgets h on h.id=e.project_budget_id where l.purchase_id=p.id) end
 from finance.documents d join finance.purchases p on p.id=d.purchase_id where d.id=document
$$;
create function finance.invoice_document_access(actor uuid,google_sub text,email text,document uuid,for_retry boolean default false)
returns boolean language plpgsql stable security invoker set search_path=pg_catalog as $$
declare flags jsonb; scope jsonb; access jsonb;
begin
 if not finance.project_budget_verified_member(actor,$2,$3) or not exists(select 1 from finance.documents where id=document) then return false; end if;
 flags:=finance.capability_flags(actor);
 if coalesce((flags->>'filesAndRefunds')::boolean,false) then return true; end if;
 scope:=finance.invoice_document_scope(document);
 if scope is null then return false; end if;
 begin access:=finance.project_budget_scope(actor,$2,$3,(scope->>'projectId')::uuid,(scope->>'departmentId')::uuid);
 exception when insufficient_privilege or check_violation or no_data_found then return false; end;
 return coalesce((access->'capabilities'->>case when for_retry then 'canRegisterPurchase' else 'canRead' end)::boolean,false);
end; $$;

create function finance.lock_invoice_actor(actor uuid,google_sub text,email text,document uuid)
returns void language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare project uuid; scoped_project uuid; headers uuid[]; current_headers uuid[]; header uuid;
begin
 select p.project_id into scoped_project from finance.documents d join finance.purchases p on p.id=d.purchase_id where d.id=document;
 -- A headerless scoped purchase has exactly one project. Serialize its first header creation before taking any header lock.
 if scoped_project is not null and not exists(select 1 from finance.project_budgets h where h.project_id=scoped_project) then
   perform pg_advisory_xact_lock(hashtextextended('project-budget:'||scoped_project::text,0));
 end if;
 select coalesce(array_agg(h.id order by h.id),'{}'::uuid[]) into headers from finance.project_budgets h
 where h.project_id=scoped_project or h.id in(select e.project_budget_id from finance.documents d
   join finance.purchase_lines l on l.purchase_id=d.purchase_id join finance.allocations a on a.line_id=l.id
   join finance.project_budget_entries e on e.budget_item_id=a.budget_item_id where d.id=document);
 -- All multi-project writers use HEADER UUID order, which is independent of project UUID order.
 foreach header in array headers loop perform 1 from finance.project_budgets h where h.id=header for update; end loop;
 select coalesce(array_agg(h.id order by h.id),'{}'::uuid[]) into current_headers from finance.project_budgets h
 where h.project_id=scoped_project or h.id in(select e.project_budget_id from finance.documents d
   join finance.purchase_lines l on l.purchase_id=d.purchase_id join finance.allocations a on a.line_id=l.id
   join finance.project_budget_entries e on e.budget_item_id=a.budget_item_id where d.id=document);
 if current_headers is distinct from headers then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
 for project in select h.project_id from finance.project_budgets h where h.id=any(headers)
   union select scoped_project where scoped_project is not null order by 1 loop
   perform 1 from project_management.projects p where p.id=project for share;
 end loop;
 perform 1 from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
   join neon_auth.account a on a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub where m.id=actor for share of m,u,a;
 perform 1 from identity.member_roles where member_id=actor for share;
 perform 1 from finance.member_grants where member_id=actor for share;
 perform 1 from project_management.department_members where member_id=actor for share;
 if not finance.invoice_document_access(actor,$2,$3,document,true) then raise exception 'finance:PROJECT_FORBIDDEN' using errcode='42501'; end if;
end; $$;

create function finance.claim_invoice_transfer(actor uuid,google_sub text,email text,document uuid,expected_revision integer,
 server_drive text,server_folder text,token uuid,manual boolean default false,retry_request uuid default null)
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare job finance.invoice_transfers%rowtype; prior finance.invoice_retry_requests%rowtype;
begin
 perform finance.lock_invoice_actor(actor,$2,$3,document);
 if manual then
   if retry_request is null or expected_revision is null then raise exception 'invoice_retry_id_required'; end if;
   perform pg_advisory_xact_lock(hashtextextended('invoice-retry:'||actor::text||retry_request::text,0));
   select * into prior from finance.invoice_retry_requests where actor_member_id=actor and request_id=retry_request for update;
   if found then
     if prior.document_id<>document or prior.expected_revision<>expected_revision then raise exception 'invoice_retry_id_reused' using errcode='23514'; end if;
     return jsonb_build_object('replayed',true);
   end if;
   insert into finance.invoice_retry_requests values(actor,retry_request,document,expected_revision);
 end if;
 select * into job from finance.invoice_transfers where document_id=document for update;
 if not found then raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002'; end if;
 if job.status='stored' then return jsonb_build_object('done',true); end if;
 if job.lease_until>clock_timestamp() then return jsonb_build_object('busy',true); end if;
 if expected_revision is not null and job.revision<>expected_revision then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
 if job.status='needs_attention' and not manual then return jsonb_build_object('attention',true); end if;
 update finance.invoice_transfers set drive_id=coalesce(drive_id,server_drive),folder_id=coalesce(folder_id,server_folder),
   status='transferring',lease_token=token,lease_until=clock_timestamp()+interval '90 seconds',attempts=attempts+1,
   last_error=null,revision=revision+1,updated_at=clock_timestamp() where document_id=document returning * into job;
 insert into finance.invoice_transfer_events(document_id,actor_member_id,action,revision) values(document,actor,'claimed',job.revision);
 update finance.view_versions set version=version+1 where singleton;
 return to_jsonb(job)||(select jsonb_build_object('purchase_id',d.purchase_id,'original_name',d.original_name,'content_type',d.content_type,'byte_size',d.byte_size) from finance.documents d where d.id=document);
end; $$;

-- A fenced worker can only advance its own lease. Provider data never enters app-facing DTOs.
create function finance.advance_invoice_transfer(actor uuid,google_sub text,email text,document uuid,token uuid,expected_revision integer,change jsonb)
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare job finance.invoice_transfers%rowtype; operation text:=change->>'action'; amount bigint; next_id text;
begin
 perform finance.lock_invoice_actor(actor,$2,$3,document);
 select * into job from finance.invoice_transfers where document_id=document for update;
 if job.lease_token is distinct from token or job.lease_until<=clock_timestamp() or job.revision<>expected_revision then
   raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
 if operation='reserve' then
   next_id:=change->>'fileId';
   if next_id !~ '^[A-Za-z0-9_-]{5,200}$' or (job.drive_file_id is not null and job.drive_file_id<>next_id) then raise exception 'invoice_immutable_id'; end if;
   update finance.invoice_transfers set drive_file_id=next_id where document_id=document;
 elsif operation='session' then
   if job.drive_file_id is null or change->>'uri' !~ '^https://www.googleapis.com/upload/drive/v3/files\?' then raise exception 'invoice_invalid_session'; end if;
   update finance.invoice_transfers set resumable_session_uri=change->>'uri',confirmed_bytes=0 where document_id=document;
 elsif operation='progress' then
   amount:=(change->>'bytes')::bigint;
   if amount<job.confirmed_bytes or amount>(select byte_size from finance.documents where id=document) then raise exception 'invoice_invalid_progress'; end if;
   update finance.invoice_transfers set confirmed_bytes=amount where document_id=document;
 elsif operation='reset' then
   update finance.invoice_transfers set resumable_session_uri=null,confirmed_bytes=0 where document_id=document;
 elsif operation='stored' then
   if job.drive_file_id is null or job.drive_id is null or change->>'fileId'<>job.drive_file_id or change->>'sha256'<>job.content_sha256 then raise exception 'invoice_unverified'; end if;
   update finance.invoice_transfers set status='stored',verified_at=clock_timestamp(),confirmed_bytes=(select byte_size from finance.documents where id=document),
     lease_token=null,lease_until=null,resumable_session_uri=null,last_error=null where document_id=document;
   update finance.documents set drive_file_id=job.drive_file_id,drive_viewer_url='https://drive.google.com/file/d/'||job.drive_file_id||'/view' where id=document;
 elsif operation='yield' then
   update finance.invoice_transfers set status='pending',lease_token=null,lease_until=null where document_id=document;
 elsif operation='fail' then
   if change->>'error' not in ('configuration_missing','provider_unavailable','provider_permission','provider_mismatch','source_unavailable','source_mismatch','transfer_uncertain') then raise exception 'invoice_invalid_error'; end if;
   update finance.invoice_transfers set status='needs_attention',last_error=change->>'error',lease_token=null,lease_until=null where document_id=document;
 else raise exception 'invoice_invalid_transition'; end if;
 update finance.invoice_transfers set revision=revision+1,updated_at=clock_timestamp() where document_id=document returning * into job;
 insert into finance.invoice_transfer_events(document_id,actor_member_id,action,revision,safe_error) values(document,actor,operation,job.revision,job.last_error);
 update finance.view_versions set version=version+1 where singleton;
 return to_jsonb(job);
end; $$;

-- Source/digest/destination/allocated ID are durable even after configuration changes or retries.
create function finance.protect_invoice_transfer() returns trigger language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if new.document_id<>old.document_id or new.content_sha256<>old.content_sha256 or new.staging_key<>old.staging_key
 or (old.drive_id is not null and new.drive_id is distinct from old.drive_id) or (old.folder_id is not null and new.folder_id is distinct from old.folder_id)
 or (old.drive_file_id is not null and new.drive_file_id is distinct from old.drive_file_id)
 or (old.status='stored' and (to_jsonb(new)-'revision'-'updated_at') is distinct from (to_jsonb(old)-'revision'-'updated_at')) then raise exception 'invoice_immutable_evidence'; end if;
 return new;
end; $$;
create trigger invoice_transfer_immutable before update on finance.invoice_transfers for each row execute function finance.protect_invoice_transfer();
alter table finance.invoice_transfer_events enable row level security;
alter table finance.invoice_retry_requests enable row level security;
revoke all on finance.invoice_transfer_events,finance.invoice_retry_requests from public;
revoke all on function finance.enqueue_invoice_transfer(),finance.create_invoice_transfer(),finance.invoice_document_scope(uuid),finance.invoice_document_access(uuid,text,text,uuid,boolean),finance.lock_invoice_actor(uuid,text,text,uuid),finance.claim_invoice_transfer(uuid,text,text,uuid,integer,text,text,uuid,boolean,uuid),finance.advance_invoice_transfer(uuid,text,text,uuid,uuid,integer,jsonb),finance.protect_invoice_transfer() from public;
