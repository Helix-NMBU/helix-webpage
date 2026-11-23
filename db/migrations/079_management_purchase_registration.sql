-- Management intake records actual costs before project allocation is known.
-- Existing plans, allocations, approvals, evidence and purchase IDs are preserved.
begin;
alter table finance.purchase_lines
  alter column system_id drop not null,
  add column project_id uuid references project_management.projects(id),
  add constraint unassigned_purchase_line check (system_id is not null or (unbudgeted and budget_item_id is null and request_line_id is null));
create index purchase_lines_project_idx on finance.purchase_lines(project_id);

create function finance.management_member(p_actor uuid,p_sub text,p_email text)
returns boolean language sql stable set search_path=pg_catalog as $$
 select exists(select 1 from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
   join project_management.department_members dm on dm.member_id=m.id and dm.access_level in ('member','lead')
   join project_management.departments d on d.id=dm.department_id and d.name='Management' and d.season=project_management.current_season()
   where m.id=p_actor and m.google_sub=p_sub and m.email=lower(p_email) and lower(u.email)=m.email
     and u."emailVerified" is true and u.banned is not true
     and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub));
$$;
create function finance.lock_management_actor(p_actor uuid,p_sub text,p_email text)
returns void language plpgsql set search_path=pg_catalog as $$
begin
 perform pg_advisory_xact_lock(72704,12);
 perform m.id from identity.members m join neon_auth."user" u on u.id=m.auth_user_id where m.id=p_actor for share of m,u;
 perform a."userId" from neon_auth.account a join identity.members m on m.auth_user_id=a."userId" where m.id=p_actor for share of a;
 perform dm.member_id from project_management.department_members dm where dm.member_id=p_actor for share;
 if not finance.management_member(p_actor,p_sub,p_email) then raise exception 'FINANCE|denied|Management membership is required.'; end if;
end;
$$;

-- Unassigned costs have no invented allocation. Once assigned to an entry,
-- the original invariant still requires the complete line amount exactly once.
create or replace function finance.enforce_allocation_total()
returns trigger language plpgsql set search_path=pg_catalog as $$
declare target uuid; line_amount bigint; assigned_system uuid; allocated bigint;
begin
 if tg_table_name='allocations' then target:=coalesce(new.line_id,old.line_id); else target:=coalesce(new.id,old.id); end if;
 select amount_ore,system_id into line_amount,assigned_system from finance.purchase_lines where id=target;
 if not found then return null; end if;
 select coalesce(sum(amount_ore),0) into allocated from finance.allocations where line_id=target;
 if (assigned_system is null and allocated<>0) or (assigned_system is not null and allocated<>line_amount) then
   raise exception 'Allocation total must equal the line amount' using errcode='23514';
 end if;
 return null;
end;
$$;

create function finance.management_purchase_choices(p_actor uuid,p_sub text,p_email text)
returns jsonb language plpgsql stable set search_path=pg_catalog as $$
begin
 if not finance.management_member(p_actor,p_sub,p_email) then raise exception 'FINANCE|denied|Management membership is required.'; end if;
 return jsonb_build_object(
   'seasonCode',(select setting_value #>> '{}' from finance.settings where setting_key='current_season'),
   'projects',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name) order by lower(p.name),p.id)
     from project_management.projects p where p.season=project_management.current_season() and p_actor=any(p.lead_ids)),'[]'::jsonb),
   'items',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'projectId',i.project_id,'systemId',i.system_id,
       'description',i.description,'publicRef',i.public_ref,'plannedNok',finance.format_ore(i.planned_ore)) order by i.public_ref)
     from finance.effective_budget_entries i join finance.budgets b on b.id=i.budget_id
     join finance.seasons s on s.id=b.season_id and s.status<>'closed' and s.code=project_management.current_season()
     join project_management.projects p on p.id=i.project_id and p.season=s.code and p_actor=any(p.lead_ids)
     join finance.systems sys on sys.id=i.system_id and sys.active
     where not i.protected and i.status<>'cancelled' and (i.approved_version_id is not null or i.legacy_budget_status='approved')),'[]'::jsonb),
   'purchases',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'purchaseId',pur.id,'publicRef',pur.public_ref,
       'supplierName',pur.supplier_name,'purchaseDate',pur.purchase_date,'description',l.description,'amountNok',finance.format_ore(l.amount_ore),
       'projectId',l.project_id,'budgetItemId',l.budget_item_id,'revision',pur.revision) order by pur.created_at desc,l.public_ref)
     from finance.purchase_lines l join finance.purchases pur on pur.id=l.purchase_id and pur.status='registered'
     join finance.seasons s on s.id=pur.season_id and s.code=project_management.current_season()
     left join project_management.projects p on p.id=l.project_id
     where (l.project_id is null and l.system_id is null and pur.requester_member_id=p_actor)
       or (p_actor=any(p.lead_ids) and p.season=s.code)),'[]'::jsonb));
end;
$$;

create function finance.register_management_purchase(p_actor uuid,p_sub text,p_email text,p_request uuid,p_hash text,p_body jsonb)
returns jsonb language plpgsql set search_path=pg_catalog as $$
#variable_conflict use_variable
<<registration>>
declare
 season_row finance.seasons%rowtype; purchase_id uuid:=gen_random_uuid(); ref text; ordinal bigint;
 line jsonb; effective_system uuid; line_id uuid; line_number integer:=0; project uuid; item uuid;
 upload_id uuid; upload_row finance.uploads%rowtype; document_number integer:=0; response jsonb; warnings jsonb:='[]';
 amount bigint;
begin
 perform finance.lock_management_actor(p_actor,p_sub,p_email);
 if p_request is null or p_hash is null or length(p_hash)<32 then raise exception 'FINANCE|invalid|A valid request ID is required.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||p_request::text,0));
 response:=finance.replay_purchase_mutation(p_actor,p_request,'registerManagementPurchase',p_hash);
 if response is not null then return response; end if;
 select s.* into season_row from finance.seasons s join finance.settings st on st.setting_key='current_season' and st.setting_value #>> '{}' =s.code for share of s,st;
 if not found or season_row.status='closed' then raise exception 'FINANCE|conflict|An open finance season is required.'; end if;
 perform h.id from finance.project_budgets h where h.project_id in (select nullif(value->>'projectId','')::uuid from jsonb_array_elements(p_body->'lines')) order by h.id for update;
 if (select count(*) from finance.purchases where requester_member_id=p_actor and created_at>clock_timestamp()-interval '1 hour')>=20 then raise exception 'FINANCE|quota|You can save at most 20 purchases per hour. Try again later.'; end if;
 if jsonb_typeof(p_body->'lines') is distinct from 'array' or jsonb_array_length(p_body->'lines') not between 1 and 50
   or jsonb_typeof(p_body->'uploadIds') is distinct from 'array' or jsonb_array_length(p_body->'uploadIds') not between 1 and 15 then raise exception 'FINANCE|invalid|Add purchase lines and supporting files.'; end if;
 if (p_body->>'purchaseDate')::date>(clock_timestamp() at time zone 'Europe/Oslo')::date then raise exception 'FINANCE|invalid|Purchase date cannot be in the future.'; end if;
 for upload_id in select value::uuid from jsonb_array_elements_text(p_body->'uploadIds') order by 1 loop
   select * into upload_row from finance.uploads where id=upload_id for update;
   if not found or upload_row.member_id<>p_actor or upload_row.status<>'finalized' or upload_row.final_key is null
     or upload_row.content_sha256 is null or upload_row.purchase_id is not null then raise exception 'FINANCE|invalid|Supporting file is missing, changed or already used.|files'; end if;
 end loop;
 select public_ref,issued.ordinal into ref,ordinal from finance.issue_purchase_reference(p_actor,extract(year from clock_timestamp() at time zone 'Europe/Oslo')::integer) issued;
 insert into finance.purchases(id,season_id,requester_member_id,public_ref,status,buyer_name,supplier_name,payment_method,purchase_date,justification,document_kind,document_number,refund_account,refund_phone)
 values(purchase_id,season_row.id,p_actor,ref,'registered',p_body->>'buyerName',p_body->>'supplierName',p_body->>'paymentMethod',
   (p_body->>'purchaseDate')::date,p_body->>'justification',p_body->>'documentKind',nullif(p_body->>'documentNumber',''),nullif(p_body->>'refundAccount',''),nullif(p_body->>'refundPhone',''));
 update finance.purchases set project_id=(select min(nullif(value->>'projectId',''))::uuid from jsonb_array_elements(p_body->'lines') having count(distinct nullif(value->>'projectId',''))=1 and bool_and(nullif(value->>'projectId','') is not null)) where id=registration.purchase_id;
 update finance.purchases pur set responsible_department_id=h.responsible_department_id from finance.project_budgets h where pur.id=registration.purchase_id and h.project_id=pur.project_id;
 for line in select value from jsonb_array_elements(p_body->'lines') loop
   line_number:=line_number+1; project:=nullif(line->>'projectId','')::uuid; item:=nullif(line->>'budgetItemId','')::uuid; amount:=(line->>'amountOre')::bigint;
   if amount<=0 or (line->>'quantity')::numeric<=0 then raise exception 'FINANCE|invalid|Enter positive line amounts and quantities.'; end if;
   if project is not null and not exists(select 1 from project_management.projects p where p.id=project and p.season=season_row.code and p_actor=any(p.lead_ids)) then raise exception 'FINANCE|denied|Choose a current project you lead.|projectId'; end if;
   if item is not null then
     select i.system_id into effective_system from finance.budget_items anchor join finance.effective_budget_entries i on i.id=anchor.id join finance.budgets b on b.id=i.budget_id
       join finance.systems sys on sys.id=i.system_id and sys.active
       where i.id=item and i.project_id=project and project is not null and b.season_id=season_row.id and (i.approved_version_id is not null or i.legacy_budget_status='approved') and not i.protected and i.status<>'cancelled' for update of anchor;
     if not found then raise exception 'FINANCE|conflict|Choose an approved entry in this project.|budgetItemId'; end if;
   else effective_system:=null; end if;
   insert into finance.purchase_lines(purchase_id,public_ref,system_id,budget_item_id,project_id,unbudgeted,description,quantity,amount_ore)
   values(purchase_id,ref||'-L'||line_number,effective_system,item,project,item is null,line->>'description',(line->>'quantity')::numeric,amount) returning id into line_id;
   if item is not null then
     insert into finance.allocations(line_id,budget_item_id,public_ref,amount_ore) values(line_id,item,ref||'-L'||line_number||'-A1',amount);
   end if;
 end loop;
 if p_body->>'paymentMethod'='invoice' or p_body->>'documentKind'='invoice' then
   if nullif(p_body->>'invoiceDueDate','') is null then raise exception 'FINANCE|invalid|Enter an invoice due date.|invoiceDueDate'; end if;
   insert into finance.invoice_obligations(purchase_id,due_date) values(purchase_id,(p_body->>'invoiceDueDate')::date);
 end if;
 if p_body->>'paymentMethod'='outlay' then insert into finance.outlay_reimbursements(purchase_id) values(purchase_id); end if;
 for upload_id in select value::uuid from jsonb_array_elements_text(p_body->'uploadIds') loop
   document_number:=document_number+1;
   select * into upload_row from finance.uploads where id=upload_id;
   insert into finance.documents(purchase_id,public_ref,kind,document_number,document_date,original_name,content_type,byte_size,content_sha256,storage_key)
   values(purchase_id,ref||'-D'||document_number,p_body->>'documentKind',nullif(p_body->>'documentNumber',''),(p_body->>'purchaseDate')::date,
     upload_row.original_name,upload_row.content_type,upload_row.byte_size,upload_row.content_sha256,upload_row.final_key);
   update finance.uploads set purchase_id=registration.purchase_id where id=upload_id;
 end loop;
 warnings:=finance.track_project_purchase(p_actor,purchase_id);
 perform finance.append_audit(p_actor,'purchase',purchase_id::text,'created',null,ref,null);
 response:=finance.finish_purchase_mutation(p_actor,p_request,'registerManagementPurchase',p_hash,purchase_id,warnings)||jsonb_build_object('publicRef',ref);
 update finance.idempotency_keys set response=registration.response where member_id=p_actor and request_id=p_request;
 return response;
end;
$$;

create function finance.reserve_management_upload_final_candidate(p_actor uuid,p_sub text,p_email text,p_upload uuid,p_key text,p_sha text,p_size bigint)
returns void language plpgsql set search_path=pg_catalog as $$
declare upload finance.uploads%rowtype;
begin
 perform finance.lock_management_actor(p_actor,p_sub,p_email);
 select * into upload from finance.uploads where id=p_upload for update;
 if not found or upload.member_id<>p_actor then raise exception 'FINANCE|not_found|Upload not found.'; end if;
 if upload.status<>'pending' then raise exception 'FINANCE|conflict|This upload has already been finalized.'; end if;
 if p_key !~ ('^'||p_actor::text||'/final/'||p_upload::text||'/[0-9a-f]{32}$') or p_sha !~ '^[0-9a-f]{64}$' or p_size is distinct from upload.byte_size then raise exception 'FINANCE|invalid|Invalid final upload details.'; end if;
 insert into finance.upload_final_candidates(storage_key,upload_id,member_id,content_sha256,byte_size) values(p_key,p_upload,p_actor,p_sha,p_size);
end;
$$;

create function finance.link_management_purchase(p_actor uuid,p_sub text,p_email text,p_line uuid,p_project uuid,p_item uuid,p_revision integer)
returns jsonb language plpgsql set search_path=pg_catalog as $$
declare line finance.purchase_lines%rowtype; purchase finance.purchases%rowtype; effective_system uuid; prior jsonb;
begin
 perform finance.lock_management_actor(p_actor,p_sub,p_email);
 if not exists(select 1 from project_management.projects p where p.id=p_project and p.season=project_management.current_season() and p_actor=any(p.lead_ids)) then raise exception 'FINANCE|denied|Choose a current project you lead.'; end if;
 perform h.id from finance.project_budgets h where h.project_id=p_project or exists(select 1 from finance.purchase_lines l join finance.allocations a on a.line_id=l.id join finance.effective_budget_entries e on e.id=a.budget_item_id where l.purchase_id=(select purchase_id from finance.purchase_lines where id=p_line) and e.project_budget_id=h.id) order by h.id for update;
 select pur.* into purchase from finance.purchases pur join finance.purchase_lines l on l.purchase_id=pur.id
   join finance.seasons s on s.id=pur.season_id and s.code=project_management.current_season() and s.status<>'closed' where l.id=p_line for update of pur;
 if not found or purchase.status<>'registered' then raise exception 'FINANCE|not_found|This purchase is unavailable.'; end if;
 if purchase.revision is distinct from p_revision then raise exception 'FINANCE|conflict|This purchase changed. Reload before linking it.'; end if;
 select * into line from finance.purchase_lines where id=p_line for update;
 if line.system_id is not null or (line.project_id is not null and line.project_id<>p_project)
   or (line.project_id is null and purchase.requester_member_id<>p_actor) then raise exception 'FINANCE|denied|This purchase is already allocated or belongs to another member.'; end if;
 if p_item is not null then
   select i.system_id into effective_system from finance.budget_items anchor join finance.effective_budget_entries i on i.id=anchor.id join finance.budgets b on b.id=i.budget_id
     join finance.systems sys on sys.id=i.system_id and sys.active
     where i.id=p_item and i.project_id=p_project and b.season_id=purchase.season_id and (i.approved_version_id is not null or i.legacy_budget_status='approved') and not i.protected and i.status<>'cancelled' for update of anchor;
   if not found then raise exception 'FINANCE|conflict|Choose an approved budget entry in this project.'; end if;
 end if;
 prior:=jsonb_build_object('projectId',line.project_id,'budgetItemId',line.budget_item_id);
 update finance.purchase_lines set project_id=p_project,system_id=effective_system,budget_item_id=p_item,unbudgeted=p_item is null where id=p_line;
 if p_item is not null then
   insert into finance.allocations(line_id,budget_item_id,public_ref,amount_ore) values(p_line,p_item,line.public_ref||'-A1',line.amount_ore);

 end if;
 perform finance.track_project_purchase(p_actor,purchase.id);
 update finance.purchases set revision=revision+1 where id=purchase.id;
 perform finance.append_audit(p_actor,'purchase_line',p_line::text,'project_allocation',prior::text,jsonb_build_object('projectId',p_project,'budgetItemId',p_item)::text,null);
 return jsonb_build_object('ok',true,'viewVersion',finance.bump_view_version(),'id',purchase.id,'warnings','[]'::jsonb,'errors','[]'::jsonb);
end;
$$;

revoke all on function finance.management_member(uuid,text,text),finance.lock_management_actor(uuid,text,text),finance.management_purchase_choices(uuid,text,text),
  finance.reserve_management_upload_final_candidate(uuid,text,text,uuid,text,text,bigint),
  finance.register_management_purchase(uuid,text,text,uuid,text,jsonb),finance.link_management_purchase(uuid,text,text,uuid,uuid,uuid,integer) from public;
create or replace view finance.registered_allocation_facts as
select a.id as allocation_id,a.budget_item_id,l.id as line_id,p.id as purchase_id,p.season_id,p.purchase_date,a.amount_ore,
  e.system_id,l.system_id as purchase_system_id,e.protected as unbudgeted,
  coalesce(e.project_id,l.project_id,p.project_id) as project_id,
  coalesce(e.responsible_department_id,p.responsible_department_id) as responsible_department_id,
  e.project_budget_id,l.approved_version_id,
  case when l.approved_version_id is not null then recorded.earmark_id else anchor.earmark_id end as recorded_earmark_id
from finance.allocations a join finance.purchase_lines l on l.id=a.line_id
join finance.purchases p on p.id=l.purchase_id and p.status='registered'
join finance.budget_items anchor on anchor.id=a.budget_item_id
join finance.effective_budget_entries e on e.id=a.budget_item_id
left join finance.project_budget_version_entries recorded on recorded.version_id=l.approved_version_id and recorded.entry_id=a.budget_item_id
union all
select null::uuid,l.budget_item_id,l.id,p.id,p.season_id,p.purchase_date,l.amount_ore,
  l.system_id,l.system_id,true,coalesce(l.project_id,p.project_id),coalesce(h.responsible_department_id,p.responsible_department_id),
  h.id,l.approved_version_id,null::uuid
from finance.purchase_lines l join finance.purchases p on p.id=l.purchase_id and p.status='registered'
left join finance.project_budgets h on h.project_id=coalesce(l.project_id,p.project_id) and h.season_id=p.season_id
where l.system_id is null and not exists(select 1 from finance.allocations a where a.line_id=l.id);
alter function finance.invoice_document_access(uuid,text,text,uuid,boolean) rename to invoice_document_access_before_management;
create function finance.invoice_document_access(actor uuid,google_sub text,email text,document uuid,for_retry boolean default false)
returns boolean language sql stable set search_path=pg_catalog as $$
 select finance.invoice_document_access_before_management(actor,$2,$3,document,for_retry) or
   (finance.management_member(actor,$2,$3) and exists(select 1 from finance.documents d join finance.purchases p on p.id=d.purchase_id where d.id=document and p.requester_member_id=actor));
$$;
revoke all on function finance.invoice_document_access(uuid,text,text,uuid,boolean) from public;
commit;
