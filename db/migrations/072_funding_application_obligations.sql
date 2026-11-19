-- Funding awards are explicit obligations, independent of sponsor Won, cash and budget approval.
begin;
alter table finance.budget_obligations add column protected_entry jsonb
 check(protected_entry is null or coalesce(jsonb_typeof(protected_entry)='object' and protected_entry ?& array['planned_ore','system_id','ordinary_priority']
   and (protected_entry->>'planned_ore') ~ '^[0-9]+$' and (protected_entry->>'planned_ore')::numeric<=9223372036854775807
   and (protected_entry->>'system_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   and protected_entry->>'ordinary_priority' in ('P1','P2','P3','P4'),false));
alter table finance.budget_obligations drop constraint budget_obligations_application_id_entry_id_key;
create unique index budget_obligations_one_unreleased on finance.budget_obligations(application_id,entry_id) where released_at is null;
create table finance.funding_budget_proposals (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references finance.funding_applications(id),
  project_budget_id uuid not null references finance.project_budgets(id),
  entry_id uuid not null,
  desired_entry jsonb not null check(jsonb_typeof(desired_entry)='object'),
  note text not null default '' check(char_length(note)<=1000),
  adopted_version_id uuid references finance.project_budget_versions(id),
  adopted_at timestamptz,
  adopted_by_member_id uuid references identity.members(id),
  created_by_member_id uuid not null references identity.members(id),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(entry_id,project_budget_id) references finance.project_budget_entries(id,project_budget_id),
  check((adopted_version_id is null and adopted_at is null and adopted_by_member_id is null) or (adopted_version_id is not null and adopted_at is not null and adopted_by_member_id is not null))
);
create unique index funding_budget_proposals_one_pending on finance.funding_budget_proposals(application_id,entry_id) where adopted_at is null;
create table finance.funding_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references finance.funding_applications(id),
  actor_member_id uuid not null references identity.members(id),
  action text not null,
  request_id uuid not null,
  reason text,
  snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique(actor_member_id,request_id)
);
create trigger funding_application_events_append_only before update or delete on finance.funding_application_events
for each row execute function finance.preserve_project_budget_history();

create function finance.funding_application_head(p_actor uuid,p_sub text,p_email text) returns boolean
language sql stable security invoker set search_path=pg_catalog as $$
 select finance.project_budget_verified_member(p_actor,p_sub,p_email)
 and coalesce((finance.capability_flags(p_actor)->>'purchaseRegister')::boolean,false)
 and coalesce((finance.capability_flags(p_actor)->>'approveBudget')::boolean,false)
$$;
create function finance.lock_funding_application_actor(p_actor uuid) returns void
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 -- Match budget writes: identity linkage, department assignments, then roles/grants.
 perform m.id from identity.members m join neon_auth."user" u on u.id=m.auth_user_id where m.id=p_actor for share of m,u;
 perform a."userId" from neon_auth.account a join identity.members m on m.auth_user_id=a."userId" where m.id=p_actor for share of a;
 perform 1 from project_management.department_members where member_id=p_actor for share;
 perform 1 from identity.member_roles where member_id=p_actor for share;
 perform 1 from finance.member_grants where member_id=p_actor for share;
 perform 1 from partner_deals.member_grants where member_id=p_actor for share;
 perform 1 from partner_deals.space_access where member_id=p_actor for share;
end;
$$;

-- Capture the obligation's real entry baseline. For a new entry, retain its
-- proposed baseline even when no approved version contains it yet.
create or replace function finance.assert_project_budget_entry_obligation(target_entry uuid, proposed jsonb) returns void
language plpgsql stable security invoker set search_path=pg_catalog as $$
declare baseline finance.project_budget_version_entries%rowtype; protection jsonb; existing_award boolean;
begin
 select exists(select 1 from finance.budget_obligations o join finance.funding_applications a on a.id=o.application_id where o.entry_id=target_entry and o.released_at is null and a.awarded_at is not null) into existing_award;
 if not existing_award then return; end if;
 select ve.* into baseline from finance.project_budget_entries e join finance.project_budgets h on h.id=e.project_budget_id
   join finance.project_budget_version_entries ve on ve.entry_id=e.id and ve.version_id=h.approved_version_id where e.id=target_entry;
 if baseline.entry_id is null then
   select ve.* into baseline from finance.project_budget_entries e join finance.project_budgets h on h.id=e.project_budget_id
     join finance.project_budget_version_entries ve on ve.entry_id=e.id and ve.version_id=h.pending_version_id where e.id=target_entry;
 end if;
 if coalesce((proposed->>'removed')::boolean,false) or proposed->>'status'='cancelled'
   or (baseline.entry_id is not null and ((proposed->>'planned_ore')::bigint<baseline.planned_ore or (proposed->>'system_id')::uuid<>baseline.system_id or proposed->>'ordinary_priority'>baseline.ordinary_priority)) then
   raise exception 'finance:PROJECT_OBLIGATION_ACTIVE' using errcode='23514';
 end if;
 for protection in select o.protected_entry from finance.budget_obligations o join finance.funding_applications a on a.id=o.application_id
   where o.entry_id=target_entry and o.released_at is null and a.awarded_at is not null and o.protected_entry is not null loop
   if (proposed->>'planned_ore')::bigint<(protection->>'planned_ore')::bigint or proposed->>'system_id'<>protection->>'system_id'
     or proposed->>'ordinary_priority'>protection->>'ordinary_priority' then raise exception 'finance:PROJECT_OBLIGATION_ACTIVE' using errcode='23514'; end if;
 end loop;
end;
$$;

-- Cloning retained approved history is not a new plan decision. Every subsequent
-- edit and promotion still validates the active protection snapshots.
create or replace function finance.enforce_project_entry_obligation() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if tg_op='INSERT' and not exists(select 1 from finance.project_budget_version_entries current_row where current_row.version_id=new.version_id and current_row.entry_id=new.entry_id)
   and exists(select 1 from finance.project_budget_entries entry join finance.project_budgets h on h.id=entry.project_budget_id
     join finance.project_budget_versions candidate on candidate.id=new.version_id and candidate.project_budget_id=h.id and candidate.status='draft'
     join finance.project_budget_version_entries approved on approved.entry_id=entry.id and approved.version_id=h.approved_version_id
     where entry.id=new.entry_id and (to_jsonb(approved)-'version_id')=(to_jsonb(new)-'version_id')) then return new; end if;
 perform finance.assert_project_budget_entry_obligation(case when tg_op='DELETE' then old.entry_id else new.entry_id end,
   case when tg_op='DELETE' then to_jsonb(old)||jsonb_build_object('removed',true) else to_jsonb(new) end);
 if tg_op='DELETE' then return old; end if; return new;
end;
$$;

create function finance.preserve_funding_application_history() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if tg_table_name='funding_applications' then
   if tg_op='DELETE' and old.awarded_at is not null then raise exception 'finance:FUNDING_HISTORY_IMMUTABLE' using errcode='23514'; end if;
   if tg_op='UPDATE' and (old.deal_id is distinct from new.deal_id or
     (old.awarded_at is not null and (old.season_id,old.funding_id,old.purchase_conditions,old.awarded_at,old.awarded_by_member_id,old.award_date,old.award_reference)
       is distinct from (new.season_id,new.funding_id,new.purchase_conditions,new.awarded_at,new.awarded_by_member_id,new.award_date,new.award_reference))) then
     raise exception 'finance:FUNDING_HISTORY_IMMUTABLE' using errcode='23514';
   end if;
 elsif tg_table_name='budget_obligations' then
   if tg_op='DELETE' or (old.id,old.application_id,old.entry_id,old.created_by_member_id,old.created_at)
     is distinct from (new.id,new.application_id,new.entry_id,new.created_by_member_id,new.created_at)
     or (old.protected_entry is distinct from new.protected_entry and (old.released_at is not null or exists(select 1 from finance.funding_applications app where app.id=old.application_id and app.awarded_at is not null)))
     or (old.released_at is not null and (old.released_at,old.released_by_member_id,old.release_reason) is distinct from (new.released_at,new.released_by_member_id,new.release_reason)) then
     raise exception 'finance:FUNDING_HISTORY_IMMUTABLE' using errcode='23514';
   end if;
 else
   if tg_op='DELETE' or (old.id,old.application_id,old.project_budget_id,old.entry_id,old.desired_entry,old.note,old.created_by_member_id,old.created_at)
     is distinct from (new.id,new.application_id,new.project_budget_id,new.entry_id,new.desired_entry,new.note,new.created_by_member_id,new.created_at)
     or (old.adopted_at is not null and (old.adopted_version_id,old.adopted_at,old.adopted_by_member_id) is distinct from (new.adopted_version_id,new.adopted_at,new.adopted_by_member_id)) then
     raise exception 'finance:FUNDING_HISTORY_IMMUTABLE' using errcode='23514';
   end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end;
$$;
create trigger funding_application_history before update or delete on finance.funding_applications for each row execute function finance.preserve_funding_application_history();
create trigger budget_obligation_history before update or delete on finance.budget_obligations for each row execute function finance.preserve_funding_application_history();
create trigger funding_proposal_history before update or delete on finance.funding_budget_proposals for each row execute function finance.preserve_funding_application_history();

-- Preserve 070's incurred-actual checks in the existing shared helper. Add
-- proposal/link systems without copying or replacing that helper's definition.
create function finance.assert_project_funding_assignment(target_project uuid,next_season text,next_departments text[]) returns void
language plpgsql stable security invoker set search_path=pg_catalog as $$
begin
 if exists(select 1 from (
   select proposal.project_budget_id,proposal.application_id,(proposal.desired_entry->>'systemId')::uuid as system_id from finance.funding_budget_proposals proposal
   union select entry.project_budget_id,obligation.application_id,(obligation.protected_entry->>'system_id')::uuid from finance.budget_obligations obligation
     join finance.project_budget_entries entry on entry.id=obligation.entry_id where obligation.protected_entry is not null
 ) retained join finance.project_budgets h on h.id=retained.project_budget_id join finance.funding_applications app on app.id=retained.application_id
   join finance.seasons season on season.id=app.season_id join finance.systems sys on sys.id=retained.system_id join identity.departments d on d.department_key=sys.department_key
   where h.project_id=target_project and (season.code<>next_season or not project_management.canonical_department(d.name)=any(next_departments))) then
   raise exception 'project_financial_history_assignment' using errcode='23514';
 end if;
end;
$$;
create or replace function finance.enforce_project_financial_assignment() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if old.season is distinct from new.season or old.departments is distinct from new.departments then
   perform finance.assert_project_financial_assignment(new.id,new.season,new.departments);
   perform finance.assert_project_funding_assignment(new.id,new.season,new.departments);
 end if;
 return new;
end;
$$;

create function finance.retain_obligated_project() returns trigger
language plpgsql security invoker set search_path=pg_catalog as $$
begin
 if exists(select 1 from finance.project_budgets h join finance.project_budget_entries e on e.project_budget_id=h.id
   join finance.budget_obligations o on o.entry_id=e.id join finance.funding_applications a on a.id=o.application_id
   where h.project_id=old.id and o.released_at is null and a.awarded_at is not null) then
   raise exception 'project_p0_obligation_history' using errcode='23514';
 end if;
 return old;
end;
$$;
create trigger project_p0_history before delete on project_management.projects for each row execute function finance.retain_obligated_project();

create function finance.mutate_funding_application(p_actor uuid,p_sub text,p_email text,p_request uuid,p_hash text,p_body jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog as $$
declare
 v_action text:=p_body->>'action'; v_app finance.funding_applications%rowtype; v_existing finance.idempotency_keys%rowtype;
 v_header finance.project_budgets%rowtype; v_version finance.project_budget_versions%rowtype; v_proposal finance.funding_budget_proposals%rowtype;
 v_obligation finance.budget_obligations%rowtype; v_deal partner_deals.deals%rowtype; v_scope jsonb; v_entry jsonb:=p_body->'entry';
 v_headers uuid[]:='{}'; v_link_set jsonb; v_current_links jsonb; v_entry_id uuid; v_app_id uuid; v_header_id uuid; v_baseline jsonb;
 v_before jsonb; v_after jsonb; v_response jsonb; v_view bigint; v_version_snapshot jsonb; v_reason text:=nullif(btrim(p_body->>'reason'),''); v_affected integer;
begin
 if v_action not in ('saveFundingApplication','linkFundingApplicationEntry','proposeFundingBudgetEntry','recordFundingAward','releaseFundingObligation','adoptFundingProposal')
   or p_request is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'finance:FUNDING_INVALID' using errcode='23514'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||p_request::text,0));
 if v_action='saveFundingApplication' then
   perform finance.lock_funding_application_actor(p_actor);
   if not finance.project_budget_verified_member(p_actor,p_sub,p_email) or not coalesce((select pipeline from partner_deals.capabilities(p_actor,p_sub,p_email)),false) then raise exception 'finance:PROJECT_FORBIDDEN' using errcode='42501'; end if;
   select * into v_deal from partner_deals.deals where id=(p_body->>'dealId')::uuid for update;
   if not found then raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002'; end if;
   select * into v_app from finance.funding_applications where deal_id=v_deal.id for update;
 else
   v_app_id:=(p_body->>'applicationId')::uuid;
   select * into v_app from finance.funding_applications where id=v_app_id;
   if not found then raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002'; end if;
   if v_action='recordFundingAward' then
     select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'entryId',o.entry_id,'headerId',e.project_budget_id) order by o.id),'[]'::jsonb),coalesce(array_agg(distinct e.project_budget_id),'{}') into v_link_set,v_headers
       from finance.budget_obligations o join finance.project_budget_entries e on e.id=o.entry_id where o.application_id=v_app.id and o.released_at is null;
   elsif v_action='linkFundingApplicationEntry' then
     select project_budget_id into v_header_id from finance.project_budget_entries where id=(p_body->>'entryId')::uuid;
     if not found then raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002'; end if; v_headers:=array[v_header_id];
   elsif v_action='releaseFundingObligation' then
     select o.* into v_obligation from finance.budget_obligations o where o.id=(p_body->>'obligationId')::uuid and o.application_id=v_app.id;
     if not found then raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002'; end if;
     select project_budget_id into v_header_id from finance.project_budget_entries where id=v_obligation.entry_id; v_headers:=array[v_header_id];
   elsif v_action='adoptFundingProposal' then
     select * into v_proposal from finance.funding_budget_proposals where id=(p_body->>'proposalId')::uuid and application_id=v_app.id;
     if not found or v_proposal.project_budget_id<>(p_body->>'projectBudgetId')::uuid then raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002'; end if;
     v_headers:=array[v_proposal.project_budget_id];
   else v_headers:=array[(p_body->>'projectBudgetId')::uuid]; end if;
   -- Never acquire a header after an application lock. Revalidate link sets after all sorted headers are held.
   perform h.id from finance.project_budgets h where h.id=any(v_headers) order by h.id for update;
   get diagnostics v_affected=row_count;
   if v_affected<>cardinality(v_headers) then raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002'; end if;
   perform p.id from project_management.projects p join finance.project_budgets h on h.project_id=p.id where h.id=any(v_headers) order by p.id for share of p;
   perform finance.lock_funding_application_actor(p_actor);
   if not finance.project_budget_verified_member(p_actor,p_sub,p_email) then raise exception 'finance:PROJECT_FORBIDDEN' using errcode='42501'; end if;
   if v_action='adoptFundingProposal' then
     select * into v_header from finance.project_budgets where id=v_headers[1];
     v_scope:=finance.project_budget_scope(p_actor,p_sub,p_email,v_header.project_id,v_header.responsible_department_id);
     if not (v_scope->'capabilities'->>'canDraft')::boolean then raise exception 'finance:PROJECT_FORBIDDEN' using errcode='42501'; end if;
   elsif not finance.funding_application_head(p_actor,p_sub,p_email) then raise exception 'finance:PROJECT_FORBIDDEN' using errcode='42501'; end if;
   select * into v_app from finance.funding_applications where id=v_app_id for update;
   if v_action='recordFundingAward' then
     select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'entryId',o.entry_id,'headerId',e.project_budget_id) order by o.id),'[]'::jsonb) into v_current_links
       from finance.budget_obligations o join finance.project_budget_entries e on e.id=o.entry_id where o.application_id=v_app.id and o.released_at is null;
     if v_current_links is distinct from v_link_set then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
   end if;
 end if;
 select * into v_existing from finance.idempotency_keys where member_id=p_actor and request_id=p_request for update;
 if found then
   if v_existing.action<>v_action or v_existing.payload_hash<>p_hash or v_existing.response is null then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
   return v_existing.response||jsonb_build_object('replayed',true);
 end if;
 if v_app.id is not null and v_app.revision<>(p_body->>'expectedRevision')::integer then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
 v_before:=coalesce(to_jsonb(v_app),'{}'::jsonb);
 if v_action='saveFundingApplication' then
   if v_deal.revision<>(p_body->>'dealExpectedRevision')::integer then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
   if not exists(select 1 from finance.seasons where id=(p_body->>'seasonId')::uuid and status<>'closed') then raise exception 'finance:FUNDING_INVALID' using errcode='23514'; end if;
   if nullif(p_body->>'fundingId','') is not null and not exists(select 1 from finance.funding where id=(p_body->>'fundingId')::uuid and season_id=(p_body->>'seasonId')::uuid and funding_type='grant' and status<>'deleted') then raise exception 'finance:FUNDING_INVALID' using errcode='23514'; end if;
   if v_app.id is null then
     if (p_body->>'expectedRevision')::integer<>0 then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
     insert into finance.funding_applications(deal_id,season_id,purchase_conditions,funding_id,created_by_member_id)
       values(v_deal.id,(p_body->>'seasonId')::uuid,p_body->>'purchaseConditions',nullif(p_body->>'fundingId','')::uuid,p_actor) returning * into v_app;
   else
     if v_app.awarded_at is not null or (v_app.season_id<>(p_body->>'seasonId')::uuid and exists(select 1 from finance.budget_obligations where application_id=v_app.id)) then raise exception 'finance:FUNDING_HISTORY_IMMUTABLE' using errcode='23514'; end if;
     update finance.funding_applications set purchase_conditions=p_body->>'purchaseConditions',season_id=(p_body->>'seasonId')::uuid,funding_id=case when p_body ? 'fundingId' then nullif(p_body->>'fundingId','')::uuid else v_app.funding_id end where id=v_app.id returning * into v_app;
   end if;
 else
   perform 1 from finance.seasons where id=v_app.season_id and status<>'closed' for share;
   if not found then raise exception 'finance:PROJECT_FORBIDDEN' using errcode='42501'; end if;
   if cardinality(v_headers)=1 then select * into v_header from finance.project_budgets where id=v_headers[1]; end if;
   if v_action in ('linkFundingApplicationEntry','proposeFundingBudgetEntry','adoptFundingProposal') and
     (v_header.season_id<>v_app.season_id or v_header.revision<>(p_body->>'expectedBudgetRevision')::integer) then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
   if v_action='recordFundingAward' then
     if v_app.awarded_at is not null then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
     perform e.id from finance.project_budget_entries e join finance.budget_obligations o on o.entry_id=e.id where o.application_id=v_app.id and o.released_at is null order by e.id for update of e;
     -- A concurrently completed genuine approval is the current financial baseline.
     -- Entries absent from approval retain their original proposed/link protection.
     update finance.budget_obligations obligation set protected_entry=to_jsonb(approved)
       from finance.project_budget_entries entry join finance.project_budgets h on h.id=entry.project_budget_id
       join finance.project_budget_version_entries approved on approved.version_id=h.approved_version_id and approved.entry_id=entry.id
       where obligation.application_id=v_app.id and obligation.entry_id=entry.id and obligation.released_at is null and not approved.removed and approved.status<>'cancelled';
     update finance.funding_applications set awarded_at=clock_timestamp(),awarded_by_member_id=p_actor,award_date=(p_body->>'awardDate')::date,award_reference=p_body->>'awardReference' where id=v_app.id returning * into v_app;
   elsif v_action='releaseFundingObligation' then
     select * into v_obligation from finance.budget_obligations where id=(p_body->>'obligationId')::uuid and application_id=v_app.id for update;
     perform 1 from finance.project_budget_entries where id=v_obligation.entry_id for update;
     if v_obligation.released_at is not null then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
     if v_reason is null or char_length(v_reason)>500 then raise exception 'finance:PROJECT_REASON_REQUIRED' using errcode='23514'; end if;
     update finance.budget_obligations set released_at=clock_timestamp(),released_by_member_id=p_actor,release_reason=v_reason where id=v_obligation.id;
   elsif v_action='linkFundingApplicationEntry' or v_action='proposeFundingBudgetEntry' then
     v_entry_id:=case when v_action='linkFundingApplicationEntry' then (p_body->>'entryId')::uuid else nullif(v_entry->>'entryId','')::uuid end;
     if v_entry_id is null then
       insert into finance.project_budget_entries(project_budget_id,created_by_member_id) values(v_header.id,p_actor) returning id into v_entry_id;
     elsif not exists(select 1 from finance.project_budget_entries where id=v_entry_id and project_budget_id=v_header.id) then raise exception 'finance:PROJECT_NOT_FOUND' using errcode='P0002'; end if;
     perform 1 from finance.project_budget_entries where id=v_entry_id for update;
     select to_jsonb(ve) into v_baseline from finance.project_budget_version_entries ve where ve.entry_id=v_entry_id and ve.version_id=v_header.approved_version_id and not ve.removed and ve.status<>'cancelled';
     if v_baseline is null then
       select jsonb_build_object('planned_ore',e.planned_ore::text,'system_id',e.system_id,'ordinary_priority',coalesce(e.ordinary_priority,pending.ordinary_priority)) into v_baseline
         from finance.effective_budget_entries e left join finance.project_budget_version_entries pending on pending.version_id=v_header.pending_version_id and pending.entry_id=e.id
         where e.id=v_entry_id and e.source='legacy' and e.legacy_budget_status='approved' and e.status<>'cancelled' and coalesce(e.ordinary_priority,pending.ordinary_priority) is not null;
     end if;
     if v_baseline is null then
       select to_jsonb(ve) into v_baseline from finance.project_budget_version_entries ve join finance.project_budget_versions v on v.id=ve.version_id
         where ve.entry_id=v_entry_id and v.id=v_header.pending_version_id and not ve.removed and ve.status<>'cancelled' and v.status in ('department_pending','finance_pending');
     end if;
     if v_action='proposeFundingBudgetEntry' then
       if v_baseline is not null and (v_entry->>'plannedOre')::bigint<(v_baseline->>'planned_ore')::bigint then raise exception 'finance:FUNDING_INVALID' using errcode='23514'; end if;
       if not exists(select 1 from finance.systems sys join identity.departments d on d.department_key=sys.department_key join project_management.projects p on p.id=v_header.project_id
         where sys.id=(v_entry->>'systemId')::uuid and sys.active and project_management.canonical_department(d.name)=any(p.departments)) then raise exception 'finance:FUNDING_INVALID' using errcode='23514'; end if;
       if nullif(v_entry->>'ownerMemberId','') is not null and not exists(select 1 from identity.members where id=(v_entry->>'ownerMemberId')::uuid) then raise exception 'finance:FUNDING_INVALID' using errcode='23514'; end if;
       if nullif(v_entry->>'earmarkId','') is not null and not exists(select 1 from finance.funding_parts part join finance.funding fund on fund.id=part.funding_id
         where part.id=(v_entry->>'earmarkId')::uuid and fund.season_id=v_app.season_id and (fund.status<>'deleted' or exists(select 1 from finance.effective_budget_entries current_entry where current_entry.id=v_entry_id and current_entry.earmark_id=part.id))) then
         raise exception 'finance:FUNDING_INVALID' using errcode='23514';
       end if;
       insert into finance.funding_budget_proposals(application_id,project_budget_id,entry_id,desired_entry,note,created_by_member_id)
         values(v_app.id,v_header.id,v_entry_id,v_entry||jsonb_build_object('entryId',v_entry_id),coalesce(p_body->>'note',''),p_actor) returning * into v_proposal;
       if v_baseline is null then v_baseline:=jsonb_build_object('planned_ore',v_entry->>'plannedOre','system_id',v_entry->>'systemId','ordinary_priority',v_entry->>'ordinaryPriority'); end if;
     elsif v_baseline is null then
       select jsonb_build_object('planned_ore',p.desired_entry->>'plannedOre','system_id',p.desired_entry->>'systemId','ordinary_priority',p.desired_entry->>'ordinaryPriority') into v_baseline
         from finance.funding_budget_proposals p where p.entry_id=v_entry_id order by p.created_at desc limit 1;
       if v_baseline is null then raise exception 'finance:FUNDING_INVALID' using errcode='23514'; end if;
     end if;
     if not exists(select 1 from finance.budget_obligations where application_id=v_app.id and entry_id=v_entry_id and released_at is null) then
       insert into finance.budget_obligations(application_id,entry_id,created_by_member_id,protected_entry) values(v_app.id,v_entry_id,p_actor,v_baseline) returning * into v_obligation;
     elsif v_action='linkFundingApplicationEntry' then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001';
     else select * into v_obligation from finance.budget_obligations where application_id=v_app.id and entry_id=v_entry_id and released_at is null; end if;
   elsif v_action='adoptFundingProposal' then
     select * into v_proposal from finance.funding_budget_proposals where id=(p_body->>'proposalId')::uuid and application_id=v_app.id for update;
     perform 1 from finance.project_budget_entries where id=v_proposal.entry_id for update;
     if v_proposal.adopted_at is not null then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
     if v_header.pending_version_id is null then
       if v_header.approved_version_id is null then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
       insert into finance.project_budget_versions(project_budget_id,version_number,created_by_member_id)
         select v_header.id,max(version_number)+1,p_actor from finance.project_budget_versions where project_budget_id=v_header.id returning * into v_version;
       insert into finance.project_budget_version_entries(version_id,entry_id,system_id,description,category,planned_ore,ordinary_priority,reuse_status,expected_purchase_date,owner_member_id,owner_email,status,note,earmark_id,removed)
         select v_version.id,entry_id,system_id,description,category,planned_ore,ordinary_priority,reuse_status,expected_purchase_date,owner_member_id,owner_email,status,note,earmark_id,removed from finance.project_budget_version_entries where version_id=v_header.approved_version_id;
       update finance.project_budgets set pending_version_id=v_version.id where id=v_header.id;
     else
       select * into v_version from finance.project_budget_versions where id=v_header.pending_version_id for update;
       if v_version.status<>'draft' then raise exception 'finance:PROJECT_CONFLICT' using errcode='40001'; end if;
     end if;
     v_version_snapshot:=finance.project_budget_snapshot(v_version.id); v_entry:=v_proposal.desired_entry;
     insert into finance.project_budget_version_entries(version_id,entry_id,system_id,description,category,planned_ore,ordinary_priority,reuse_status,expected_purchase_date,owner_member_id,owner_email,status,note,earmark_id,removed)
       values(v_version.id,v_proposal.entry_id,(v_entry->>'systemId')::uuid,v_entry->>'description',v_entry->>'category',(v_entry->>'plannedOre')::bigint,v_entry->>'ordinaryPriority',v_entry->>'reuseStatus',
         nullif(v_entry->>'expectedPurchaseDate','')::date,nullif(v_entry->>'ownerMemberId','')::uuid,nullif(v_entry->>'ownerEmail',''),v_entry->>'status',nullif(v_entry->>'note',''),nullif(v_entry->>'earmarkId','')::uuid,false)
       on conflict(version_id,entry_id) do update set system_id=excluded.system_id,description=excluded.description,category=excluded.category,planned_ore=excluded.planned_ore,ordinary_priority=excluded.ordinary_priority,
         reuse_status=excluded.reuse_status,expected_purchase_date=excluded.expected_purchase_date,owner_member_id=excluded.owner_member_id,owner_email=excluded.owner_email,status=excluded.status,note=excluded.note,earmark_id=excluded.earmark_id,removed=false;
     update finance.funding_budget_proposals set adopted_version_id=v_version.id,adopted_at=clock_timestamp(),adopted_by_member_id=p_actor where id=v_proposal.id;
     insert into finance.project_budget_decisions(project_budget_id,version_id,action,actor_member_id,snapshot,request_id,created_at)
       values(v_header.id,v_version.id,v_action,p_actor,jsonb_build_object('before',v_version_snapshot,'after',finance.project_budget_snapshot(v_version.id),'applicationId',v_app.id,'proposalId',v_proposal.id),p_request,clock_timestamp());
   end if;
 end if;
 update finance.funding_applications set revision=revision+1 where id=v_app.id returning * into v_app;
 if cardinality(v_headers)>0 then
   update finance.project_budgets set revision=revision+1,updated_by_member_id=p_actor,updated_at=clock_timestamp() where id=any(v_headers);
   if cardinality(v_headers)=1 then select * into v_header from finance.project_budgets where id=v_headers[1]; end if;
 end if;
 v_after:=to_jsonb(v_app)||jsonb_build_object('entryId',v_entry_id,'proposalId',v_proposal.id,'obligationId',v_obligation.id,'entryProtection',v_obligation.protected_entry,'protections',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'entryId',o.entry_id,'protectedEntry',o.protected_entry,'releasedAt',o.released_at) order by o.id),'[]'::jsonb) from finance.budget_obligations o where o.application_id=v_app.id),'projectBudgetIds',to_jsonb(v_headers));
 insert into finance.funding_application_events(application_id,actor_member_id,action,request_id,reason,snapshot) values(v_app.id,p_actor,v_action,p_request,v_reason,jsonb_build_object('before',v_before,'after',v_after));
 insert into finance.audit_log(actor_member_id,entity,entity_id,field_name,old_value,new_value,reason) values(p_actor,'funding_application',v_app.id::text,v_action,v_before::text,v_after::text,v_reason);
 v_view:=finance.bump_view_version();
 v_response:=jsonb_build_object('ok',true,'id',v_app.id,'revision',v_app.revision,'viewVersion',v_view);
 if v_header.id is not null then v_response:=v_response||jsonb_build_object('projectBudgetId',v_header.id,'budgetRevision',v_header.revision); end if;
 insert into finance.idempotency_keys(member_id,request_id,action,payload_hash,response) values(p_actor,p_request,v_action,p_hash,v_response);
 return v_response;
end;
$$;
alter table finance.funding_budget_proposals enable row level security;
alter table finance.funding_application_events enable row level security;
revoke all on finance.funding_budget_proposals,finance.funding_application_events from public;
revoke all on function finance.funding_application_head(uuid,text,text),finance.lock_funding_application_actor(uuid),finance.preserve_funding_application_history(),finance.retain_obligated_project(),finance.assert_project_funding_assignment(uuid,text,text[]),finance.mutate_funding_application(uuid,text,text,uuid,text,jsonb) from public;
commit;
