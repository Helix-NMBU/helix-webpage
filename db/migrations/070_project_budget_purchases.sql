-- Project-scoped actuals. Header/authority locks precede request, ordered anchors and ledger.
begin;
alter table finance.purchases add column project_id uuid references project_management.projects(id),
  add column responsible_department_id uuid references project_management.departments(id);
alter table finance.uploads add column project_id uuid references project_management.projects(id),
  add column responsible_department_id uuid references project_management.departments(id);
alter table finance.purchase_lines add column budget_authority text check(budget_authority in ('project_approved','legacy_approved','unbudgeted')),
  add column legacy_budget_id uuid references finance.budgets(id), add column legacy_approved_on date;
alter table finance.exception_reviews drop constraint exception_reviews_kind_check;
alter table finance.exception_reviews add constraint exception_reviews_kind_check check(kind in
  ('missing_approval','overrun','line_mismatch','dated_before_approval','budget_overrun','unbudgeted'));

create or replace function finance.assert_project_financial_assignment(target_project uuid,next_season text,next_departments text[]) returns void
language plpgsql stable security invoker set search_path=pg_catalog as $$
begin
  if exists(select 1 from finance.project_budgets h join finance.seasons season on season.id=h.season_id
    join project_management.departments responsible on responsible.id=h.responsible_department_id
    where h.project_id=target_project and (season.code<>next_season or not responsible.name=any(next_departments)))
    or exists(select 1 from finance.project_budgets h join finance.project_budget_versions v on v.project_budget_id=h.id
      join finance.project_budget_version_entries e on e.version_id=v.id join finance.systems sys on sys.id=e.system_id
      join identity.departments d on d.department_key=sys.department_key where h.project_id=target_project and not project_management.canonical_department(d.name)=any(next_departments))
    or exists(select 1 from finance.purchases p join finance.seasons s on s.id=p.season_id
      join project_management.departments d on d.id=p.responsible_department_id where p.project_id=target_project
      and (s.code<>next_season or not d.name=any(next_departments)))
    or exists(select 1 from finance.purchases p join finance.purchase_lines l on l.purchase_id=p.id
      join finance.systems sys on sys.id=l.system_id join identity.departments d on d.department_key=sys.department_key
      where p.project_id=target_project and not project_management.canonical_department(d.name)=any(next_departments)) then
    raise exception 'project_financial_history_assignment' using errcode='23514';
  end if;
end;
$$;

create function finance.lock_project_purchase_scope(actor uuid, google_sub text, email text, target_project uuid, department uuid)
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare h finance.project_budgets%rowtype; p project_management.projects%rowtype; scope jsonb; current_code text;
begin
  perform pg_advisory_xact_lock(hashtextextended('project-budget:'||target_project::text,0));
  select * into h from finance.project_budgets where project_id=target_project for update;
  select * into p from project_management.projects where id=target_project for share;
  if not found then raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002'; end if;
  perform 1 from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
    join neon_auth.account a on a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub
    where m.id=actor for share of m,u,a;
  perform 1 from project_management.department_members where member_id=actor for share;
  perform 1 from identity.member_roles where member_id=actor for share;
  perform 1 from finance.member_grants where member_id=actor for share;
  perform 1 from finance.seasons where code=p.season for share;
  scope:=finance.project_budget_scope(actor,$2,$3,target_project,department);
  if not coalesce((scope->'capabilities'->>'canRegisterPurchase')::boolean,false) or scope->>'responsibleDepartmentId' is null then
    raise exception 'finance:PROJECT_FORBIDDEN' using errcode='42501';
  end if;
  select setting_value #>> '{}' into current_code from finance.settings where setting_key='current_season' for share;
  if current_code is distinct from p.season then raise exception 'FINANCE|conflict|Purchases can only be registered in the current season.'; end if;
  return scope;
end;
$$;

create function finance.replay_project_purchase(actor uuid,google_sub text,email text,project_id uuid,department_id uuid,request_id uuid,payload_hash text)
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||request_id::text,0));
 perform finance.lock_project_purchase_scope(actor,$2,$3,$4,$5);
 return finance.replay_purchase_mutation(actor,$6,'registerPurchase',$7);
end;
$$;

create function finance.create_project_upload_authorization(actor uuid, google_sub text, email text, project_id uuid, department_id uuid,
 upload_id uuid, staging_key text, original_name text, content_type text, byte_size bigint, expires_at timestamptz)
returns uuid language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare scope jsonb;
begin
 scope:=finance.lock_project_purchase_scope(actor,$2,$3,$4,$5);
 perform finance.create_upload_authorization(actor,$6,$7,$8,$9,$10,$11);
 update finance.uploads set project_id=$4,responsible_department_id=(scope->>'responsibleDepartmentId')::uuid where id=$6;
 return $6;
end;
$$;
create function finance.reserve_project_upload_final_candidate(
  p_actor uuid, p_google_sub text, p_email text, p_project_id uuid, p_department_id uuid, p_upload_id uuid, p_key text, p_sha256 text, p_byte_size bigint
) returns void
language plpgsql security invoker set search_path = pg_catalog, finance as $fn$
declare upload finance.uploads%rowtype;
begin
  perform finance.lock_project_purchase_scope(p_actor,p_google_sub,p_email,p_project_id,p_department_id);
  select * into upload from finance.uploads where id = p_upload_id for update;
  if not found or p_actor is null or upload.member_id <> p_actor then
    raise exception 'FINANCE|not_found|Upload not found.';
  end if;
  if upload.project_id is distinct from p_project_id or upload.responsible_department_id is distinct from p_department_id then
    raise exception 'FINANCE|denied|This upload belongs to another project.';
  end if;
  if upload.status <> 'pending' then
    raise exception 'FINANCE|conflict|This upload has already been finalized.';
  end if;
  if p_key !~ ('^' || p_actor::text || '/final/' || p_upload_id::text || '/[0-9a-f]{32}$')
     or p_sha256 !~ '^[0-9a-f]{64}$' or p_byte_size is distinct from upload.byte_size then
    raise exception 'FINANCE|invalid|Invalid final upload details.';
  end if;
  insert into finance.upload_final_candidates (storage_key, upload_id, member_id, content_sha256, byte_size)
  values (p_key, p_upload_id, p_actor, p_sha256, p_byte_size);
end;
$fn$;

create function finance.check_project_upload_access(actor uuid,google_sub text,email text,project_id uuid,department_id uuid,upload_id uuid)
returns void language plpgsql volatile security invoker set search_path=pg_catalog as $$
begin
 perform finance.lock_project_purchase_scope(actor,$2,$3,$4,$5);
 perform 1 from finance.uploads u where u.id=$6 and u.member_id=actor and u.project_id=$4 and u.responsible_department_id=$5 for share;
 if not found then raise exception 'FINANCE|not_found|Upload not found.'; end if;
end;
$$;

create function finance.complete_project_upload_finalize(actor uuid, google_sub text, email text, project_id uuid, department_id uuid,
 upload_id uuid, final_key text, sha256 text, byte_size bigint, content_type text)
returns void language plpgsql volatile security invoker set search_path=pg_catalog as $$
begin
 perform finance.lock_project_purchase_scope(actor,$2,$3,$4,$5);
 perform 1 from finance.uploads u where u.id=$6 and u.member_id=actor and u.project_id=$4 and u.responsible_department_id=$5 for update;
 if not found then raise exception 'FINANCE|not_found|Upload not found.'; end if;
 perform finance.complete_upload_finalize(actor,$6,$7,$8,$9,$10);
end;
$$;

-- Called while all affected headers are locked. Facts remain the original discrepancy.
create function finance.track_project_purchase(actor uuid, purchase_id uuid) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare item record; h record; discrepancies jsonb:='[]'; unplanned jsonb; warnings jsonb:='[]'; actual bigint;
begin
  for item in select distinct e.id,e.project_budget_id,e.approved_version_id,e.planned_ore,e.project_id,e.source,e.legacy_budget_status,e.budget_id,b.approved_on
    from finance.purchase_lines l join finance.allocations a on a.line_id=l.id
    join finance.effective_budget_entries e on e.id=a.budget_item_id join finance.budgets b on b.id=e.budget_id
    where l.purchase_id=$2 and not e.protected
  loop
    if item.approved_version_id is null and not (item.source='legacy' and item.legacy_budget_status='approved') then raise exception 'FINANCE|invalid|Choose an effective approved budget entry.|budgetItemId'; end if;
    update finance.purchase_lines l set project_budget_id=item.project_budget_id,approved_version_id=item.approved_version_id,
      budget_authority=case when item.approved_version_id is not null then 'project_approved' else 'legacy_approved' end,
      legacy_budget_id=case when item.approved_version_id is null then item.budget_id else null end,
      legacy_approved_on=case when item.approved_version_id is null then item.approved_on else null end
      where l.purchase_id=$2 and l.budget_item_id=item.id;
    actual:=finance.item_registered_actual_ore(item.id);
    if actual>item.planned_ore then discrepancies:=discrepancies||jsonb_build_array(jsonb_build_object(
      'entryId',item.id,'projectBudgetId',item.project_budget_id,'approvedVersionId',item.approved_version_id,
      'authority',case when item.approved_version_id is not null then 'project_approved' else 'legacy_approved' end,
      'legacyBudgetId',case when item.approved_version_id is null then item.budget_id else null end,
      'legacyApprovedOn',case when item.approved_version_id is null then item.approved_on else null end,
      'approvedOre',item.planned_ore::text,'actualOre',actual::text,'overrunOre',(actual-item.planned_ore)::text)); end if;
    if exists(select 1 from finance.project_budget_completion where entry_id=item.id and complete) then
      update finance.project_budget_completion set complete=false,revision=revision+1,updated_by_member_id=actor,
        reason='Further purchase registered',updated_at=clock_timestamp() where entry_id=item.id;
      perform finance.append_audit(actor,'project_budget_entry',item.id::text,'completion_reopened','complete','partial','Further purchase registered');
    end if;
  end loop;
  if jsonb_array_length(discrepancies)>0 then
    perform finance.record_purchase_exception($2,'budget_overrun',jsonb_build_object('entries',discrepancies));
    warnings:=warnings||jsonb_build_array(jsonb_build_object('code','budget_overrun','message','Actual cost exceeds the approved plan. Finance review is required.'));
  end if;
  select jsonb_agg(jsonb_build_object('lineId',l.id,'systemId',l.system_id,'amountOre',l.amount_ore::text)) into unplanned
    from finance.purchase_lines l where l.purchase_id=$2 and l.unbudgeted;
  if unplanned is not null then
    update finance.purchase_lines set budget_authority='unbudgeted' where finance.purchase_lines.purchase_id=$2 and unbudgeted;
    perform finance.record_purchase_exception($2,'unbudgeted',jsonb_build_object('lines',unplanned));
    warnings:=warnings||jsonb_build_array(jsonb_build_object('code','unbudgeted','message','Unbudgeted actual cost recorded for Finance review.'));
  end if;
  for h in select distinct e.project_budget_id from finance.purchase_lines l join finance.allocations a on a.line_id=l.id
    join finance.project_budget_entries e on e.budget_item_id=a.budget_item_id where l.purchase_id=$2 order by e.project_budget_id
  loop
    update finance.project_budgets set revision=revision+1,updated_by_member_id=actor,updated_at=clock_timestamp() where id=h.project_budget_id;
  end loop;
  return warnings;
end;
$$;
create or replace function finance.register_project_purchase(
  p_actor uuid,
  p_google_sub text,
  p_email text,
  p_project_id uuid,
  p_department_id uuid,
  p_request_id uuid,
  p_payload_hash text,
  p_body jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, finance, identity
as $fn$
declare
  replay jsonb;
  scope jsonb;
  project_header finance.project_budgets%rowtype;
  current_budget finance.budgets%rowtype;
  registered_purchase_id uuid := gen_random_uuid();
  purchase_ref text;
  purchase_ordinal bigint;
  registration_year integer;
  quota_count integer;
  line jsonb;
  line_index integer := 0;
  line_id uuid;
  line_ref text;
  alloc_ref text;
  doc_ref text;
  doc_index integer := 0;
  upload_id uuid;
  upload_row finance.uploads%rowtype;
  target_item_id uuid;
  line_system_id uuid;
  amount_ore bigint;
  quantity numeric;
  line_description text;
  unbudgeted boolean;
  total_ore bigint := 0;
  warnings jsonb := coalesce(p_body -> 'warnings', '[]'::jsonb);
  payment_method text := p_body ->> 'paymentMethod';
  document_kind text := p_body ->> 'documentKind';
  invoice_due date := nullif(p_body ->> 'invoiceDueDate', '')::date;
  refund_account text := nullif(p_body ->> 'refundAccount', '');
  refund_phone text := nullif(p_body ->> 'refundPhone', '');
  link_request_id uuid := nullif(p_body ->> 'requestRecordId', '')::uuid;
  force_direct boolean := coalesce((p_body ->> 'forceDirect')::boolean, false);
  recovery_ctx jsonb := coalesce(p_body -> 'recoveryContext', 'null'::jsonb);
  request_line_id uuid;
  linked_request finance.requests%rowtype;
  request_line_rec record;
  approval_decided_at timestamptz;
  purchase_date date := (p_body ->> 'purchaseDate')::date;
  has_valid_link boolean := false;
  line_overrun boolean;
  fulfilled_after bigint;
  approved_line bigint;
  v_constraint text;
  saved jsonb;
  recipient record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text || ':' || p_request_id::text, 0));
  scope := finance.lock_project_purchase_scope(p_actor,p_google_sub,p_email,p_project_id,p_department_id);
  select * into project_header from finance.project_budgets where project_id=p_project_id;
  if project_header.approved_version_id is not null then
    perform 1 from finance.project_budget_versions where id=project_header.approved_version_id for share;
  end if;
  if p_request_id is null or p_payload_hash !~ '^[a-f0-9]{64}$' then raise exception 'FINANCE|invalid|A valid request ID is required.'; end if;
  replay := finance.replay_purchase_mutation(p_actor,p_request_id,'registerPurchase',p_payload_hash);
  if replay is not null then
    return replay;
  end if;

  if link_request_id is not null then
    if exists(select 1 from finance.requests r join finance.request_lines rl on rl.revision_id=r.approved_revision_id
      left join finance.project_budget_entries e on e.budget_item_id=rl.budget_item_id
      where r.id=link_request_id and e.project_budget_id is distinct from project_header.id) then
      raise exception 'FINANCE|recover|This request includes entries outside this project. Register directly for Finance review.|requestRecordId';
    end if;
    linked_request := finance.lock_request_fulfillment(link_request_id);
  end if;

  for request_line_rec in
    select i.id, i.status
    from finance.budget_items i
    where i.id in (
        select (l ->> 'budgetItemId')::uuid
        from jsonb_array_elements(coalesce(p_body -> 'lines', '[]'::jsonb)) l
        where coalesce((l ->> 'unbudgeted')::boolean, false) is not true and nullif(l ->> 'budgetItemId', '') is not null
        union
        select rl.budget_item_id
        from jsonb_array_elements(coalesce(p_body -> 'lines', '[]'::jsonb)) l
        join finance.request_lines rl on rl.id = nullif(l ->> 'requestLineId', '')::uuid
        where nullif(l ->> 'requestLineId', '') is not null
        union
        select rl.budget_item_id
        from finance.request_lines rl
        where link_request_id is not null
          and rl.revision_id = linked_request.approved_revision_id
      )
      or (
        i.protected
        and i.budget_id = (select b.id from finance.budgets b join finance.seasons s on s.id = b.season_id join finance.settings st on st.setting_key = 'current_season' and s.code = st.setting_value #>> '{}')
        and i.system_id in (
          select (l ->> 'systemId')::uuid
          from jsonb_array_elements(coalesce(p_body -> 'lines', '[]'::jsonb)) l
          where coalesce((l ->> 'unbudgeted')::boolean, false)
        )
      )
    order by i.id
    for update of i
  loop
    if link_request_id is not null
      and linked_request.approved_revision_id is not null
      and exists (
        select 1
        from finance.request_lines rl
        where rl.revision_id = linked_request.approved_revision_id
          and rl.budget_item_id = request_line_rec.id
      )
      and request_line_rec.status = 'cancelled'
    then
      raise exception 'FINANCE|recover|A budget line on this approval was cancelled. Register the purchase directly and keep the request reference for Finance review.|requestRecordId';
    end if;
  end loop;

  -- This is a ledger container only. Creating it never records a budget approval.
  insert into finance.budgets(season_id,public_ref,status,created_by_member_id,updated_by_member_id)
    values((scope->>'seasonId')::uuid,'B-'||(scope->>'seasonCode'),'draft',p_actor,p_actor)
    on conflict do nothing;
  select * into current_budget from finance.budgets where season_id=(scope->>'seasonId')::uuid for update;
  if not found then raise exception 'FINANCE|conflict|The current season ledger could not be loaded. Try again.'; end if;

  select count(*)::integer into quota_count
  from finance.purchases
  where requester_member_id = p_actor
    and created_at > clock_timestamp() - interval '1 hour';
  if quota_count >= 20 then
    raise exception 'FINANCE|quota|You can save at most 20 purchases per hour. Try again later.';
  end if;


  registration_year := coalesce((p_body ->> 'registrationYear')::integer, extract(year from clock_timestamp())::integer);

  if jsonb_array_length(coalesce(p_body -> 'uploadIds', '[]'::jsonb)) < 1 then
    raise exception 'FINANCE|invalid|Add at least one supporting file.|files';
  end if;
  if jsonb_array_length(coalesce(p_body -> 'uploadIds', '[]'::jsonb)) > 15 then
    raise exception 'FINANCE|invalid|You can attach at most 15 files.|files';
  end if;
  if jsonb_array_length(coalesce(p_body -> 'lines', '[]'::jsonb)) < 1 then
    raise exception 'FINANCE|invalid|Add at least one purchase line.|lines';
  end if;

  for upload_id in
    select value::uuid
    from jsonb_array_elements_text(p_body -> 'uploadIds') as value
    order by 1
  loop
    select * into upload_row
    from finance.uploads
    where id = upload_id
    for update;
    if not found then
      raise exception 'FINANCE|invalid|Supporting file is missing or not finalized.|files';
    end if;
    if upload_row.member_id <> p_actor then
      raise exception 'FINANCE|denied|Supporting file belongs to another member.';
    end if;
    if upload_row.project_id is distinct from p_project_id or upload_row.responsible_department_id is distinct from (scope->>'responsibleDepartmentId')::uuid then
      raise exception 'FINANCE|invalid|Supporting file belongs to another project.|files';
    end if;
    if upload_row.status <> 'finalized' or upload_row.final_key is null then
      raise exception 'FINANCE|invalid|Supporting file is missing or not finalized.|files';
    end if;
    if upload_row.purchase_id is not null then
      raise exception 'FINANCE|conflict|Supporting file is already linked to a purchase.';
    end if;
  end loop;

  if link_request_id is not null then
    if linked_request.requester_member_id <> p_actor then
      raise exception 'FINANCE|recover|This approval belongs to another member. Register the purchase directly and keep the request reference for Finance review.|requestRecordId';
    end if;
    if linked_request.season_id <> current_budget.season_id then
      raise exception 'FINANCE|recover|This approval is for another season. Register the purchase directly and keep the request reference for Finance review.|requestRecordId';
    end if;
    if linked_request.status <> 'approved' or linked_request.approved_revision_id is null then
      raise exception 'FINANCE|recover|This request is not an open approval. Register the purchase directly and keep the request reference for Finance review.|requestRecordId';
    end if;
    select d.decided_at into approval_decided_at
    from finance.request_decisions d
    where d.revision_id = linked_request.approved_revision_id;
  end if;

  select public_ref, ordinal into purchase_ref, purchase_ordinal
  from finance.issue_purchase_reference(p_actor, registration_year);

  insert into finance.purchases (
    id, season_id, requester_member_id, public_ref, status, buyer_name, supplier_name,
    payment_method, purchase_date, justification, document_kind, document_number,
    refund_account, refund_phone, request_id
  ) values (
    registered_purchase_id,
    current_budget.season_id,
    p_actor,
    purchase_ref,
    'registered',
    p_body ->> 'buyerName',
    p_body ->> 'supplierName',
    payment_method,
    purchase_date,
    p_body ->> 'justification',
    document_kind,
    nullif(p_body ->> 'documentNumber', ''),
    refund_account,
    refund_phone,
    case when link_request_id is not null and not force_direct then link_request_id else null end
  );

  update finance.purchases set project_id=p_project_id,responsible_department_id=(scope->>'responsibleDepartmentId')::uuid where id=registered_purchase_id;

  for line in select value from jsonb_array_elements(p_body -> 'lines') as value
  loop
    line_index := line_index + 1;
    line_system_id := (line ->> 'systemId')::uuid;
    unbudgeted := coalesce((line ->> 'unbudgeted')::boolean, false);
    amount_ore := (line ->> 'amountOre')::bigint;
    quantity := (line ->> 'quantity')::numeric;
    line_description := line ->> 'description';
    request_line_id := nullif(line ->> 'requestLineId', '')::uuid;
    total_ore := total_ore + amount_ore;

    if not exists(select 1 from finance.systems sys join identity.departments d on d.department_key=sys.department_key
      join project_management.projects p on p.id=p_project_id
      where sys.id=line_system_id and sys.active and project_management.canonical_department(d.name)=any(p.departments)) then
      raise exception 'FINANCE|invalid|Choose an active system belonging to this project.|systemId';
    end if;
    if amount_ore is null or amount_ore<=0 or quantity is null or quantity<=0 then
      raise exception 'FINANCE|invalid|Enter a positive quantity and line total.|amountNok';
    end if;
    if unbudgeted then
      target_item_id := finance.ensure_unallocated_for_purchase(p_actor, current_budget.id, line_system_id);
    else
      target_item_id := (line ->> 'budgetItemId')::uuid;
      if not exists (
        select 1 from finance.effective_budget_entries i
        where i.id=target_item_id and i.project_id=p_project_id
          and i.project_budget_id=project_header.id and (i.approved_version_id=project_header.approved_version_id
          or (i.source='legacy' and i.legacy_budget_status='approved' and project_header.approved_version_id is null)) and i.budget_id=current_budget.id and i.system_id=line_system_id
          and i.status<>'cancelled' and not i.protected
      ) then
        raise exception 'FINANCE|invalid|Choose a current budget item for this system.|budgetItemId';
      end if;
    end if;

    if request_line_id is not null and not force_direct then
      select rl.id, rl.budget_item_id, rl.approved_ore, rl.revision_id
        into request_line_rec
      from finance.request_lines rl
      where rl.id = request_line_id;
      if not found
        or link_request_id is null
        or request_line_rec.revision_id <> linked_request.approved_revision_id
        or request_line_rec.budget_item_id <> target_item_id
      then
        raise exception 'FINANCE|recover|This line does not match the open approval. Register the purchase directly and keep the request reference for Finance review.|requestLineId';
      end if;
      has_valid_link := true;
    elsif force_direct and recovery_ctx is not null and recovery_ctx <> 'null'::jsonb then
      request_line_id := null;
    end if;

    line_ref := purchase_ref || '-L' || line_index::text;
    insert into finance.purchase_lines (
      purchase_id, public_ref, system_id, budget_item_id, unbudgeted, request_line_id, description, quantity, amount_ore
    ) values (
      registered_purchase_id,
      line_ref,
      line_system_id,
      case when unbudgeted then null else target_item_id end,
      unbudgeted,
      case when force_direct then null else request_line_id end,
      line_description,
      quantity,
      amount_ore
    ) returning id into line_id;

    alloc_ref := line_ref || '-A1';
    insert into finance.allocations (line_id, budget_item_id, public_ref, amount_ore)
    values (line_id, target_item_id, alloc_ref, amount_ore);

    if request_line_id is not null and not force_direct then
      approved_line := coalesce(request_line_rec.approved_ore, 0);
      fulfilled_after := finance.request_line_linked_actual_ore(request_line_id);
      line_overrun := fulfilled_after > approved_line;
      if line_overrun then
        perform finance.record_purchase_exception(
          registered_purchase_id,
          'overrun',
          jsonb_build_object(
            'requestId', link_request_id,
            'requestLineId', request_line_id,
            'approvedOre', approved_line::text,
            'fulfilledOre', fulfilled_after::text,
            'overrunOre', (fulfilled_after - approved_line)::text,
            'publicRef', purchase_ref
          )
        );
      end if;
    end if;
  end loop;

  if has_valid_link
    and approval_decided_at is not null
    and purchase_date < (approval_decided_at at time zone 'Europe/Oslo')::date
  then
    perform finance.record_purchase_exception(
      registered_purchase_id,
      'dated_before_approval',
      jsonb_build_object(
        'requestId', link_request_id,
        'purchaseDate', purchase_date::text,
        'approvalDecidedAt', approval_decided_at::text,
        'publicRef', purchase_ref
      )
    );
  end if;

  if force_direct and recovery_ctx is not null and recovery_ctx <> 'null'::jsonb then
    perform finance.record_purchase_exception(
      registered_purchase_id,
      'line_mismatch',
      jsonb_build_object(
        'requestId', recovery_ctx ->> 'requestRecordId',
        'requestLineId', recovery_ctx ->> 'requestLineId',
        'publicRef', purchase_ref,
        'recovery', 'direct_registration'
      )
    );
  end if;

  if document_kind = 'invoice' and invoice_due is null then
    raise exception 'FINANCE|invalid|Enter an invoice due date.|invoiceDueDate';
  end if;
  if document_kind = 'invoice' or payment_method = 'invoice' then
    insert into finance.invoice_obligations (purchase_id, due_date)
    values (registered_purchase_id, invoice_due);
  end if;
  if payment_method = 'outlay' then
    insert into finance.outlay_reimbursements (purchase_id) values (registered_purchase_id);
  end if;

  for upload_id in
    select value::uuid
    from jsonb_array_elements_text(p_body -> 'uploadIds') as value
  loop
    doc_index := doc_index + 1;
    select * into upload_row from finance.uploads where id = upload_id;
    doc_ref := purchase_ref || '-D' || doc_index::text;
    insert into finance.documents (
      purchase_id, public_ref, kind, document_number, document_date, original_name,
      content_type, byte_size, content_sha256, storage_key
    ) values (
      registered_purchase_id,
      doc_ref,
      document_kind,
      nullif(p_body ->> 'documentNumber', ''),
      purchase_date,
      upload_row.original_name,
      upload_row.content_type,
      upload_row.byte_size,
      upload_row.content_sha256,
      upload_row.final_key
    );
    update finance.uploads set purchase_id = registered_purchase_id where id = upload_id;
  end loop;

  warnings := warnings || finance.track_project_purchase(p_actor,registered_purchase_id);

  perform finance.append_audit(p_actor, 'purchase', registered_purchase_id::text, 'created', null, purchase_ref, null);

  for recipient in
    select distinct g.member_id
    from finance.member_grants g
    where g.active
      and g.profile in ('finance', 'head_of_finance')
  loop
    insert into finance.outbox (event_type, entity, entity_id, recipient_member_id, dedupe_key, payload)
    values (
      'purchase_registered',
      'purchase',
      registered_purchase_id,
      recipient.member_id,
      'purchase_registered:' || registered_purchase_id::text || ':' || recipient.member_id::text,
      jsonb_build_object(
        'publicRef', purchase_ref,
        'supplierName', p_body ->> 'supplierName',
        'totalOre', total_ore::text
      )
    )
    on conflict (dedupe_key) do nothing;
  end loop;

  return finance.finish_purchase_mutation(
    p_actor, p_request_id, 'registerPurchase', p_payload_hash, registered_purchase_id, warnings
  );
exception
  when unique_violation then
    get stacked diagnostics v_constraint = CONSTRAINT_NAME;
    if v_constraint = 'idempotency_keys_pkey' then
      saved := finance.replay_purchase_mutation(p_actor, p_request_id, 'registerPurchase', p_payload_hash);
      if saved is not null then
        return saved;
      end if;
    end if;
    if v_constraint = 'purchases_public_ref_key' then
      saved := finance.replay_purchase_mutation(p_actor, p_request_id, 'registerPurchase', p_payload_hash);
      if saved is not null then
        return saved;
      end if;
    end if;
    raise;
end;
$fn$;


create function finance.set_project_budget_completion(actor uuid, google_sub text, email text, request_id uuid, payload_hash text, body jsonb)
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare h finance.project_budgets%rowtype; scope jsonb; entry uuid:=(body->>'entryId')::uuid;
  reason text:=nullif(btrim(body->>'reason'),''); completed boolean:=(body->>'complete')::boolean; replay jsonb; response jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||request_id::text,0));
  select * into h from finance.project_budgets where id=(body->>'projectBudgetId')::uuid;
  if not found then raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002'; end if;
  scope:=finance.lock_project_purchase_scope(actor,$2,$3,h.project_id,h.responsible_department_id);
  select * into h from finance.project_budgets where id=h.id;
  replay:=finance.replay_purchase_mutation(actor,$4,'setProjectBudgetCompletion',$5);
  if replay is not null then return replay||jsonb_build_object('replayed',true); end if;
  if request_id is null or payload_hash !~ '^[a-f0-9]{64}$' or completed is null or reason is null or length(reason)>500 then
    raise exception 'FINANCE|invalid|Enter a reason of up to 500 characters.|reason'; end if;
  if h.revision<>(body->>'expectedRevision')::integer then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
  if not exists(select 1 from finance.effective_budget_entries e where e.id=entry and e.project_budget_id=h.id and e.approved_version_id=h.approved_version_id and h.approved_version_id is not null and e.status<>'cancelled' and not e.protected) then
    raise exception 'FINANCE|invalid|Choose an effective approved entry.|entryId'; end if;
  if completed and not exists(select 1 from finance.allocations a join finance.purchase_lines l on l.id=a.line_id join finance.purchases p on p.id=l.purchase_id where a.budget_item_id=entry and p.status='registered') then
    raise exception 'FINANCE|invalid|Register a purchase before marking this entry complete.|entryId'; end if;
  insert into finance.project_budget_completion(entry_id,complete,updated_by_member_id,reason)
    values(entry,completed,actor,reason) on conflict(entry_id) do update set complete=excluded.complete,reason=excluded.reason,
      updated_by_member_id=actor,updated_at=clock_timestamp(),revision=finance.project_budget_completion.revision+1;
  update finance.project_budgets set revision=revision+1,updated_by_member_id=actor,updated_at=clock_timestamp() where id=h.id returning * into h;
  perform finance.append_audit(actor,'project_budget_entry',entry::text,case when completed then 'completed' else 'completion_reopened' end,null,completed::text,reason);
  response:=jsonb_build_object('ok',true,'id',h.id,'revision',h.revision,'viewVersion',finance.bump_view_version(),'warnings','[]'::jsonb,'errors','[]'::jsonb);
  insert into finance.idempotency_keys(member_id,request_id,action,payload_hash,response) values(actor,$4,'setProjectBudgetCompletion',$5,response);
  return response;
end;
$$;

-- Keep generic purchase writes subject to the same current-account guarantee.
-- Called only after sorted project headers, before requests, anchors and ledger.
create function finance.lock_verified_purchase_actor(actor uuid, required_capability text)
returns void language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare current_member record;
begin
  select m.google_sub,m.email into current_member
    from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
    join neon_auth.account a on a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub
    where m.id=actor for share of m,u,a;
  if not found then raise exception 'FINANCE|denied|A verified Helix member account is required.'; end if;
  perform 1 from identity.member_roles where member_id=actor for share;
  perform 1 from finance.member_grants where member_id=actor for share;
  if not finance.project_budget_verified_member(actor,current_member.google_sub,current_member.email) then
    raise exception 'FINANCE|denied|A verified Helix member account is required.';
  end if;
  if not coalesce((finance.capability_flags(actor)->>required_capability)::boolean,false) then
    raise exception 'FINANCE|denied|Finance access is required.';
  end if;
end;
$$;

-- Core writes hold the authoritative allocation anchors before returning. Adoption
-- takes UPDATE on those anchors, so membership is now stable until commit. Never
-- acquire a newly discovered header after anchors/ledger: retry in header order.
create function finance.assert_purchase_project_headers(purchase_id uuid,locked_headers uuid[])
returns void language plpgsql stable security invoker set search_path=pg_catalog as $$
begin
  if exists(select 1 from finance.allocations a join finance.purchase_lines l on l.id=a.line_id
    join finance.project_budget_entries e on e.budget_item_id=a.budget_item_id
    where l.purchase_id=$1 and not e.project_budget_id=any(locked_headers)) then
    raise exception 'finance:PROJECT_CONFLICT' using errcode='40001';
  end if;
end;
$$;

alter function finance.register_purchase(uuid,uuid,text,jsonb) rename to register_purchase_before_project_tracking;
create function finance.register_purchase(actor uuid,request_id uuid,payload_hash text,body jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare h record; result jsonb; extra jsonb; locked_headers uuid[]:='{}';
begin
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||request_id::text,0));
  for h in select distinct pb.id from finance.project_budgets pb join finance.project_budget_entries e on e.project_budget_id=pb.id
    where e.budget_item_id in(
      select nullif(l->>'budgetItemId','')::uuid from jsonb_array_elements(body->'lines') l
      union select rl.budget_item_id from jsonb_array_elements(body->'lines') l join finance.request_lines rl on rl.id=nullif(l->>'requestLineId','')::uuid
      union select rl.budget_item_id from finance.requests r join finance.request_lines rl on rl.revision_id=r.approved_revision_id where r.id=nullif(body->>'requestRecordId','')::uuid
    ) order by pb.id
  loop
    perform 1 from finance.project_budgets where id=h.id for update;
    locked_headers:=array_append(locked_headers,h.id);
  end loop;
  perform finance.lock_verified_purchase_actor(actor,'registerActual');
  if exists(select 1 from finance.purchase_lines l join finance.purchases p on p.id=l.purchase_id where p.requester_member_id=actor
    and p.id=(finance.replay_purchase_mutation(actor,$2,'registerPurchase',$3)->>'id')::uuid) then
    return finance.register_purchase_before_project_tracking(actor,$2,$3,$4);
  end if;
  result:=finance.register_purchase_before_project_tracking(actor,$2,$3,$4);
  perform finance.assert_purchase_project_headers((result->>'id')::uuid,locked_headers);
  extra:=finance.track_project_purchase(actor,(result->>'id')::uuid);
  result:=jsonb_set(result,'{warnings}',coalesce(result->'warnings','[]')||extra);
  update finance.idempotency_keys set response=result where member_id=actor and finance.idempotency_keys.request_id=$2;
  return result;
end;
$$;
alter function finance.void_registered_purchase(uuid,uuid,text,uuid,text,integer) rename to void_purchase_before_project_tracking;
create function finance.void_registered_purchase(actor uuid,request_id uuid,payload_hash text,purchase_id uuid,reason text,expected_revision integer default null)
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare h record; entry record; response jsonb; replay jsonb; locked_headers uuid[]:='{}';
begin
  perform pg_advisory_xact_lock(hashtextextended(actor::text||':'||request_id::text,0));
  for h in select distinct e.project_budget_id from finance.project_budget_entries e where e.budget_item_id in(
    select a.budget_item_id from finance.allocations a join finance.purchase_lines l on l.id=a.line_id where l.purchase_id=$4
    union select rl.budget_item_id from finance.purchases p join finance.requests r on r.id=p.request_id
      join finance.request_lines rl on rl.revision_id=r.approved_revision_id where p.id=$4
  ) order by e.project_budget_id
  loop
    perform 1 from finance.project_budgets where id=h.project_budget_id for update;
    locked_headers:=array_append(locked_headers,h.project_budget_id);
  end loop;
  perform finance.lock_verified_purchase_actor(actor,'paymentsVoidReview');
  replay:=finance.replay_purchase_mutation(actor,$2,'voidPurchase',$3);
  response:=finance.void_purchase_before_project_tracking(actor,$2,$3,$4,$5,$6);
  if replay is not null then return response; end if;
  perform finance.assert_purchase_project_headers($4,locked_headers);
  for entry in select distinct e.id,e.project_budget_id from finance.allocations a join finance.purchase_lines l on l.id=a.line_id
    join finance.project_budget_entries e on e.budget_item_id=a.budget_item_id where l.purchase_id=$4
  loop
    update finance.project_budget_completion set complete=false,revision=revision+1,updated_by_member_id=actor,
      reason='Linked purchase voided: '||$5,updated_at=clock_timestamp() where entry_id=entry.id;
    perform finance.append_audit(actor,'project_budget_entry',entry.id::text,'completion_reopened',null,'false','Linked purchase voided: '||$5);
  end loop;
  for h in select distinct e.project_budget_id from finance.allocations a join finance.purchase_lines l on l.id=a.line_id
    join finance.project_budget_entries e on e.budget_item_id=a.budget_item_id where l.purchase_id=$4
  loop update finance.project_budgets set revision=revision+1,updated_by_member_id=actor,updated_at=clock_timestamp() where id=h.project_budget_id; end loop;
  return response;
end;
$$;

-- Internal helpers are service-owned; no browser or public execution grants.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='finance' and p.proname in ('assert_project_financial_assignment','assert_purchase_project_headers','lock_verified_purchase_actor','lock_project_purchase_scope','replay_project_purchase','create_project_upload_authorization',
  'reserve_project_upload_final_candidate','check_project_upload_access','complete_project_upload_finalize','track_project_purchase','register_project_purchase',
  'set_project_budget_completion','register_purchase','void_registered_purchase','register_purchase_before_project_tracking','void_purchase_before_project_tracking')
 loop execute format('revoke all on function %s from public',f.signature); end loop;
end $$;
commit;
