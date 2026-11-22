-- Finance can attach an existing Drive file without pretending it was uploaded or transferred.
begin;
alter table finance.purchases add column invoice_viewer_url text,
 add column invoice_linked_by uuid references identity.members(id), add column invoice_linked_at timestamptz;
alter table finance.purchases add constraint purchase_invoice_reference_url check (
 invoice_viewer_url is null or invoice_viewer_url ~ '^https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]{1,200}/view([?]resourcekey=[A-Za-z0-9_-]{1,200})?$');

create function finance.link_purchase_invoice(actor uuid,google_sub text,email text,purchase uuid,expected_revision integer,request uuid,payload_hash text,viewer_url text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare prior jsonb; current_purchase finance.purchases%rowtype;
begin
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||request::text,0));
 perform finance.lock_verified_purchase_actor(actor,'filesAndRefunds');
 if not finance.project_budget_verified_member(actor,$2,$3) then raise exception 'FINANCE|denied|Finance access is required.'; end if;
 prior:=finance.begin_purchase_mutation(actor,request,'linkPurchaseInvoice',payload_hash,'filesAndRefunds');
 if prior is not null then return prior; end if;
 select * into current_purchase from finance.purchases where id=purchase for update;
 if not found then raise exception 'FINANCE|not_found|Purchase was not found.'; end if;
 if current_purchase.status<>'registered' then raise exception 'FINANCE|conflict|Only a registered purchase can be updated.'; end if;
 if expected_revision is null or current_purchase.revision<>expected_revision then raise exception 'FINANCE|conflict|This purchase changed. Refresh it before saving.'; end if;
 if viewer_url is null or viewer_url !~ '^https://drive[.]google[.]com/file/d/[A-Za-z0-9_-]{1,200}/view([?]resourcekey=[A-Za-z0-9_-]{1,200})?$' then raise exception 'FINANCE|invalid|Paste a valid Google Drive file link.'; end if;
 if current_purchase.invoice_viewer_url is not null or exists(select 1 from finance.documents d join finance.invoice_transfers t on t.document_id=d.id where d.purchase_id=purchase and d.storage_backend='google_drive' and t.status='stored' and d.drive_viewer_url is not null) then
  raise exception 'FINANCE|conflict|This purchase already has an invoice link. Refresh its details.';
 end if;
 update finance.purchases set invoice_viewer_url=viewer_url,invoice_linked_by=actor,invoice_linked_at=clock_timestamp(),revision=revision+1 where id=purchase;
 perform finance.append_audit(actor,'purchase',purchase::text,'invoice_viewer_url',null,viewer_url,null);
 return finance.finish_purchase_mutation(actor,request,'linkPurchaseInvoice',payload_hash,purchase,'[]'::jsonb);
end $$;
revoke all on function finance.link_purchase_invoice(uuid,text,text,uuid,integer,uuid,text,text) from public;

-- A reference has the same whole-invoice visibility boundary as an uploaded document.
create or replace function finance.invoice_document_scope(document uuid) returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select case when p.project_id is not null then jsonb_build_object('projectId',p.project_id,'departmentId',p.responsible_department_id)
 else (select case when count(*)>0 and count(distinct e.project_id)=1 and bool_and(e.project_id is not null)
   then jsonb_build_object('projectId',min(e.project_id::text),'departmentId',min(h.responsible_department_id::text)) end
   from finance.purchase_lines l left join finance.allocations a on a.line_id=l.id
   left join finance.effective_budget_entries e on e.id=a.budget_item_id
   left join finance.project_budgets h on h.id=e.project_budget_id where l.purchase_id=p.id) end
 from finance.purchases p where p.id=coalesce((select d.purchase_id from finance.documents d where d.id=document),(select linked.id from finance.purchases linked where linked.id=document and linked.invoice_viewer_url is not null))
$$;
create or replace function finance.invoice_document_access(actor uuid,google_sub text,email text,document uuid,for_retry boolean default false)
returns boolean language plpgsql stable security invoker set search_path=pg_catalog as $$
declare flags jsonb; scope jsonb; access jsonb; uploaded boolean;
begin
 if not finance.project_budget_verified_member(actor,$2,$3) then return false; end if;
 uploaded:=exists(select 1 from finance.documents where id=document);
 if not uploaded and (for_retry or not exists(select 1 from finance.purchases where id=document and invoice_viewer_url is not null)) then return false; end if;
 flags:=finance.capability_flags(actor);
 if coalesce((flags->>'filesAndRefunds')::boolean,false) then return true; end if;
 scope:=finance.invoice_document_scope(document);
 if scope is null then return false; end if;
 begin access:=finance.project_budget_scope(actor,$2,$3,(scope->>'projectId')::uuid,(scope->>'departmentId')::uuid);
 exception when insufficient_privilege or check_violation or no_data_found then return false; end;
 return coalesce((access->'capabilities'->>case when for_retry then 'canRegisterPurchase' else 'canRead' end)::boolean,false);
end $$;
commit;
