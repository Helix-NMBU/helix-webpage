-- Preserve recorded purchases when the historical export lacks requester or payment metadata.
begin;

alter table finance.purchases
  add column import_source text check (btrim(import_source) <> ''),
  alter column requester_member_id drop not null,
  add constraint purchases_requester_or_import check (requester_member_id is not null or import_source is not null),
  drop constraint purchases_check1,
  add constraint purchases_refund_destination check (
    (payment_method = 'outlay' and (
      (refund_account is not null and refund_phone is null)
      or (refund_account is null and refund_phone is not null)
      or (import_source is not null and refund_account is null and refund_phone is null)
    ))
    or (payment_method <> 'outlay' and refund_account is null and refund_phone is null)
  );

alter table finance.invoice_obligations
  add column historical_payment boolean not null default false,
  drop constraint invoice_obligations_check,
  add constraint invoice_obligations_payment_details check (
    (paid and (historical_payment or (paid_on is not null and paid_by_member_id is not null)))
    or (not paid and paid_on is null and paid_by_member_id is null)
  );

alter table finance.outlay_reimbursements
  add column historical_payment boolean not null default false,
  drop constraint outlay_reimbursements_check,
  add constraint outlay_reimbursements_payment_details check (
    (paid and paid_on is not null and (historical_payment or paid_by_member_id is not null))
    or (not paid and paid_on is null and paid_by_member_id is null)
  );

create or replace function finance.notify_financials_purchase()
returns trigger language plpgsql security invoker set search_path = pg_catalog, finance, identity as $fn$
begin
  if new.import_source is not null then
    return new;
  end if;
  insert into finance.outbox (event_type, entity, entity_id, recipient_member_id, dedupe_key, payload)
    select 'purchase_registered', 'purchase', new.id, mr.member_id,
      'purchase_registered:' || new.id::text || ':' || mr.member_id::text,
      jsonb_build_object('publicRef', new.public_ref, 'supplierName', new.supplier_name,
        'totalOre', (select coalesce(sum(amount_ore), 0)::text from finance.purchase_lines where purchase_id = new.id))
    from identity.member_roles mr where mr.role_key = 'financials'
    on conflict (dedupe_key) do nothing;
  return new;
end;
$fn$;

commit;
