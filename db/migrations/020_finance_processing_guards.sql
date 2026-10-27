begin;

-- Check JSON property names, not arbitrary text within a CSV field.
create or replace function finance.delivery_output_is_safe(p_response jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $fn$
  select p_response is not null
    and jsonb_typeof(p_response) = 'object'
    and p_response::text !~* '"(refund_account|refund_phone|refundAccount|refundPhone)"[[:space:]]*:'
    and p_response::text !~* 'X-Amz-|AWSAccessKeyId=';
$fn$;

-- Preserve existing obligations but require a due date on new invoice obligations.
create or replace function finance.require_invoice_due_date()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, finance
as $fn$
begin
  if new.due_date is null and (tg_op = 'INSERT' or new.due_date is distinct from old.due_date) then
    raise exception 'FINANCE|invalid|Enter an invoice due date.|invoiceDueDate';
  end if;
  return new;
end;
$fn$;

create trigger invoice_obligation_due_date_guard
before insert or update of due_date on finance.invoice_obligations
for each row execute function finance.require_invoice_due_date();

create or replace function finance.review_purchase_exception(
  p_actor uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_review_id uuid,
  p_reason text,
  p_expected_revision integer
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
declare
  replay jsonb;
  review_row finance.exception_reviews%rowtype;
  purchase_id uuid;
  purchase_status text;
  saved jsonb;
  v_constraint text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_request_id::text, 0));
  replay := finance.begin_purchase_mutation(p_actor, p_request_id, 'reviewException', p_payload_hash, 'paymentsVoidReview');
  if replay is not null then
    return replay;
  end if;
  if p_expected_revision is not null and p_expected_revision < 0 then
    raise exception 'FINANCE|invalid|A valid revision is required.';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'FINANCE|invalid|Enter a review reason.|reason';
  end if;
  -- Serialize against voids before locking the exception, using the same purchase lock.
  select e.purchase_id into purchase_id from finance.exception_reviews e where e.id = p_review_id;
  if not found then
    raise exception 'FINANCE|not_found|Exception was not found.';
  end if;
  select status into purchase_status from finance.purchases where id = purchase_id for update;
  if not found then
    raise exception 'FINANCE|not_found|Purchase was not found.';
  end if;
  if purchase_status <> 'registered' then
    raise exception 'FINANCE|conflict|A voided purchase cannot be reviewed.';
  end if;
  select * into review_row from finance.exception_reviews where id = p_review_id for update;
  if not found then
    raise exception 'FINANCE|not_found|Exception was not found.';
  end if;
  if review_row.review_status = 'reviewed' then
    raise exception 'FINANCE|conflict|This exception is already reviewed.'
      using detail = jsonb_build_object(
        'reviewer', review_row.actor_member_id,
        'time', review_row.reviewed_at,
        'reason', review_row.reason
      )::text;
  end if;
  update finance.exception_reviews
    set review_status = 'reviewed',
        reason = btrim(p_reason),
        actor_member_id = p_actor,
        reviewed_at = clock_timestamp()
  where id = p_review_id;
  perform finance.append_audit(p_actor, 'exception_review', p_review_id::text, 'review_status', 'open', 'reviewed', btrim(p_reason));
  return finance.finish_purchase_mutation(p_actor, p_request_id, 'reviewException', p_payload_hash, p_review_id, '[]'::jsonb);
exception
  when unique_violation then
    get stacked diagnostics v_constraint = CONSTRAINT_NAME;
    if v_constraint = 'idempotency_keys_pkey' then
      saved := finance.replay_purchase_mutation(p_actor, p_request_id, 'reviewException', p_payload_hash);
      if saved is not null then
        return saved;
      end if;
    end if;
    raise;
end;
$fn$;

commit;
