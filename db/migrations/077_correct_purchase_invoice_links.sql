-- Correct a purchase invoice reference while retaining original uploads and audit history.
begin;
create or replace function finance.link_purchase_invoice(actor uuid,google_sub text,email text,purchase uuid,expected_revision integer,request uuid,payload_hash text,viewer_url text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare prior jsonb; current_purchase finance.purchases%rowtype; previous_url text;
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
 previous_url:=coalesce(current_purchase.invoice_viewer_url,(select d.drive_viewer_url from finance.documents d join finance.invoice_transfers t on t.document_id=d.id where d.purchase_id=purchase and d.storage_backend='google_drive' and t.status='stored' and d.drive_viewer_url is not null order by d.id limit 1));
 update finance.purchases set invoice_viewer_url=viewer_url,invoice_linked_by=actor,invoice_linked_at=clock_timestamp(),revision=revision+1 where id=purchase;
 perform finance.append_audit(actor,'purchase',purchase::text,'invoice_viewer_url',previous_url,viewer_url,null);
 return finance.finish_purchase_mutation(actor,request,'linkPurchaseInvoice',payload_hash,purchase,'[]'::jsonb);
end $$;
revoke all on function finance.link_purchase_invoice(uuid,text,text,uuid,integer,uuid,text,text) from public;

commit;
