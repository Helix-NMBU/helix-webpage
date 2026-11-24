-- Link existing budgeted purchases in the pipeline. Won activates P0 obligations;
-- ordinary priorities and monetary budget approvals remain unchanged.
begin;
create view partner_deals.budget_link_entries as
with approved as (
 select e.id as entry_id,h.id as project_budget_id,h.revision as budget_revision,h.season_id,p.name as project_name,project_management.canonical_department(department.name) as department_name,
  e.description,e.planned_ore,coalesce(e.ordinary_priority,pending.ordinary_priority) as ordinary_priority,e.priority,true as approved,
  coalesce(to_jsonb(current_entry),jsonb_build_object('planned_ore',e.planned_ore::text,'system_id',e.system_id,'ordinary_priority',coalesce(e.ordinary_priority,pending.ordinary_priority))) as protection
 from finance.effective_budget_entries e join finance.project_budgets h on h.id=e.project_budget_id
 join project_management.projects p on p.id=h.project_id
 join finance.systems sys on sys.id=e.system_id join identity.departments department on department.department_key=sys.department_key
 left join finance.project_budget_version_entries current_entry on current_entry.version_id=h.approved_version_id and current_entry.entry_id=e.id
 left join finance.project_budget_versions submitted on submitted.id=h.pending_version_id and submitted.status in ('department_pending','finance_pending')
 left join finance.project_budget_version_entries pending on pending.version_id=submitted.id and pending.entry_id=e.id
 where e.status<>'cancelled' and (h.approved_version_id is not null or (e.source='legacy' and e.legacy_budget_status='approved'))
  and coalesce(e.ordinary_priority,pending.ordinary_priority) is not null
), pending as (
 select e.entry_id,h.id,h.revision,h.season_id,p.name,project_management.canonical_department(department.name),e.description,e.planned_ore,e.ordinary_priority,case when exists(select 1 from finance.budget_obligations o join finance.funding_applications app on app.id=o.application_id where o.entry_id=e.entry_id and o.released_at is null and app.awarded_at is not null) then 'P0' else e.ordinary_priority end as priority,false as approved,to_jsonb(e) as protection
 from finance.project_budgets h join project_management.projects p on p.id=h.project_id
 join finance.project_budget_versions v on v.id=h.pending_version_id
 join finance.project_budget_version_entries e on e.version_id=v.id
 join finance.systems sys on sys.id=e.system_id join identity.departments department on department.department_key=sys.department_key
 where v.status in ('department_pending','finance_pending') and not e.removed and e.status<>'cancelled'
  and not exists(select 1 from approved current_entry where current_entry.entry_id=e.entry_id)
)
select * from approved union all select * from pending;
revoke all on partner_deals.budget_link_entries from public;

create function partner_deals.budget_links(p_actor uuid,p_sub text,p_email text,p_deal uuid)
returns jsonb language plpgsql set search_path=pg_catalog as $$
declare d partner_deals.deals%rowtype; app finance.funding_applications%rowtype; season finance.seasons%rowtype; entries jsonb;
begin
 perform finance.lock_funding_application_actor(p_actor);
 if not finance.project_budget_verified_member(p_actor,p_sub,p_email) or not coalesce((select pipeline from partner_deals.capabilities(p_actor,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 select * into d from partner_deals.deals where id=p_deal;
 if not found then raise exception 'deal_not_found' using errcode='P0002'; end if;
 select * into app from finance.funding_applications where deal_id=d.id;
 select * into season from finance.seasons where id=coalesce(app.season_id,d.primary_season_id,(select s.id from finance.seasons s join finance.settings st on st.setting_key='current_season' and s.code=st.setting_value #>> '{}'));
 select coalesce(jsonb_agg(jsonb_build_object('entryId',e.entry_id,'projectBudgetId',e.project_budget_id,'budgetRevision',e.budget_revision,'projectName',e.project_name,'departmentName',e.department_name,'description',e.description,
   'plannedNok',finance.budget_nok(e.planned_ore),'ordinaryPriority',e.ordinary_priority,'priority',e.priority,'approved',e.approved,
   'selected',exists(select 1 from finance.budget_obligations o where o.application_id=app.id and o.entry_id=e.entry_id and o.released_at is null)) order by lower(e.project_name),lower(e.description),e.entry_id),'[]'::jsonb)
 into entries from partner_deals.budget_link_entries e where e.season_id=season.id;
 -- Retain selected records even if a later budget revision removes them from choices.
 select entries||coalesce(jsonb_agg(jsonb_build_object('entryId',o.entry_id,'projectBudgetId',h.id,'budgetRevision',h.revision,'projectName',p.name,'departmentName',coalesce(project_management.canonical_department(department.name),responsible.name),'description',coalesce(anchor.description,o.protected_entry->>'description','Unavailable budget entry'),
   'plannedNok',finance.budget_nok(coalesce((o.protected_entry->>'planned_ore')::bigint,0)),'ordinaryPriority',o.protected_entry->>'ordinary_priority','priority',case when app.awarded_at is not null then 'P0' else o.protected_entry->>'ordinary_priority' end,'approved',false,'selected',true,'unavailable',true)),'[]'::jsonb)
 into entries from finance.budget_obligations o join finance.project_budget_entries e on e.id=o.entry_id join finance.project_budgets h on h.id=e.project_budget_id join project_management.projects p on p.id=h.project_id
 left join finance.budget_items anchor on anchor.id=e.id
 left join finance.systems sys on sys.id=(o.protected_entry->>'system_id')::uuid
 left join identity.departments department on department.department_key=sys.department_key
 join project_management.departments responsible on responsible.id=h.responsible_department_id
 where o.application_id=app.id and o.released_at is null and not exists(select 1 from partner_deals.budget_link_entries choice where choice.entry_id=o.entry_id and choice.season_id=season.id);
 return jsonb_build_object('dealId',d.id,'dealRevision',d.revision,'applicationRevision',coalesce(app.revision,0),'seasonCode',season.code,'locked',d.stage='won' or app.awarded_at is not null or season.id is null or season.status='closed','entries',entries);
end $$;

create function partner_deals.lock_budget_link_headers(p_deal uuid,p_entries uuid[])
returns uuid[] language plpgsql set search_path=pg_catalog as $$
declare headers uuid[];
begin
 select coalesce(array_agg(distinct entry.project_budget_id),'{}') into headers from finance.project_budget_entries entry
 where entry.id=any(p_entries) or exists(select 1 from finance.budget_obligations obligation join finance.funding_applications app on app.id=obligation.application_id where app.deal_id=p_deal and obligation.entry_id=entry.id and obligation.released_at is null);
 perform h.id from finance.project_budgets h where h.id=any(headers) order by h.id for update;
 return headers;
end $$;

create function partner_deals.save_budget_links(p_actor uuid,p_sub text,p_email text,p_request uuid,p_hash text,p_body jsonb)
returns jsonb language plpgsql set search_path=pg_catalog as $$
declare d partner_deals.deals%rowtype; app finance.funding_applications%rowtype; prior finance.idempotency_keys%rowtype;
 headers uuid[]; selected uuid[]; current_ids uuid[]; season uuid; item jsonb; choice record; response jsonb; before_state jsonb; request_action text:='saveDealBudgetLinks';
begin
 if p_request is null or p_hash !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_body->'entries')<>'array' or jsonb_array_length(p_body->'entries')>200 then raise exception 'deal_invalid' using errcode='22023'; end if;
 select coalesce(array_agg((entry->>'entryId')::uuid order by (entry->>'entryId')::uuid),'{}') into selected from jsonb_array_elements(p_body->'entries') entry;
 if cardinality(selected)<>(select count(distinct id) from unnest(selected) id) then raise exception 'deal_invalid' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_actor::text||':'||p_request::text,0));
 headers:=partner_deals.lock_budget_link_headers((p_body->>'dealId')::uuid,selected);
 perform finance.lock_funding_application_actor(p_actor);
 if not finance.project_budget_verified_member(p_actor,p_sub,p_email) or not coalesce((select pipeline from partner_deals.capabilities(p_actor,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 select * into prior from finance.idempotency_keys where member_id=p_actor and request_id=p_request for update;
 if found then
  if prior.action<>request_action or prior.payload_hash<>p_hash or prior.response is null then raise exception 'deal_conflict' using errcode='40001'; end if;
  return prior.response||jsonb_build_object('replayed',true);
 end if;
 select * into d from partner_deals.deals where id=(p_body->>'dealId')::uuid for update;
 if not found then raise exception 'deal_not_found' using errcode='P0002'; end if;
 if d.revision<>(p_body->>'dealExpectedRevision')::integer then raise exception 'deal_conflict' using errcode='40001'; end if;
 if d.stage='won' or d.cancelled_at is not null then raise exception 'deal_won_locked' using errcode='22023'; end if;
 select * into app from finance.funding_applications where deal_id=d.id for update;
 if coalesce(app.revision,0)<>(p_body->>'applicationExpectedRevision')::integer then raise exception 'deal_conflict' using errcode='40001'; end if;
 if app.awarded_at is not null then raise exception 'deal_won_locked' using errcode='22023'; end if;
 if exists(select 1 from finance.budget_obligations o join finance.project_budget_entries entry on entry.id=o.entry_id where o.application_id=app.id and o.released_at is null and not entry.project_budget_id=any(headers)) then raise exception 'deal_conflict' using errcode='40001'; end if;
 season:=coalesce(app.season_id,d.primary_season_id,(select s.id from finance.seasons s join finance.settings st on st.setting_key='current_season' and s.code=st.setting_value #>> '{}'));
 perform 1 from finance.seasons where id=season and status<>'closed' for share;
 if not found then raise exception 'deal_invalid' using errcode='22023'; end if;
 for item in select * from jsonb_array_elements(p_body->'entries') loop
  select * into choice from partner_deals.budget_link_entries e where e.entry_id=(item->>'entryId')::uuid and e.season_id=season;
  if not found then raise exception 'deal_conflict' using errcode='40001'; end if;
  if choice.budget_revision<>(item->>'budgetRevision')::integer then raise exception 'deal_conflict' using errcode='40001'; end if;
 end loop;
 select coalesce(array_agg(o.entry_id order by o.entry_id),'{}') into current_ids from finance.budget_obligations o where o.application_id=app.id and o.released_at is null;
 before_state:=coalesce(to_jsonb(app),'{}')||jsonb_build_object('entryIds',current_ids);
 if current_ids is distinct from selected then
  if app.id is null then insert into finance.funding_applications(deal_id,season_id,created_by_member_id) values(d.id,season,p_actor) returning * into app; end if;
  update finance.budget_obligations set released_at=clock_timestamp(),released_by_member_id=p_actor,release_reason='Unlinked in pipeline before confirmation' where application_id=app.id and released_at is null and not entry_id=any(selected);
  insert into finance.budget_obligations(application_id,entry_id,created_by_member_id,protected_entry)
   select app.id,e.entry_id,p_actor,e.protection from partner_deals.budget_link_entries e where e.entry_id=any(selected)
    and not exists(select 1 from finance.budget_obligations o where o.application_id=app.id and o.entry_id=e.entry_id and o.released_at is null);
  update finance.funding_applications set revision=revision+1 where id=app.id returning * into app;
  update partner_deals.deals set revision=revision+1,updated_at=clock_timestamp(),updated_by_member_id=p_actor where id=d.id returning * into d;
  update finance.project_budgets set revision=revision+1,updated_at=clock_timestamp(),updated_by_member_id=p_actor where id=any(headers);
  insert into finance.funding_application_events(application_id,actor_member_id,action,request_id,snapshot) values(app.id,p_actor,request_action,p_request,jsonb_build_object('before',before_state,'entryIds',selected));
  insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot) values(d.id,p_actor,'budget_links_changed',before_state,jsonb_build_object('entryIds',selected));
  perform finance.bump_view_version();
 end if;
 response:=jsonb_build_object('ok',true,'dealRevision',d.revision,'applicationRevision',coalesce(app.revision,0));
 insert into finance.idempotency_keys(member_id,request_id,action,payload_hash,response) values(p_actor,p_request,request_action,p_hash,response);
 return response;
end $$;

-- Take budget headers before the deal/application locks, matching Finance writes.
alter function partner_deals.confirm_won(uuid,text,text,uuid,integer) rename to confirm_won_before_budget_links;
create function partner_deals.confirm_won(p_actor uuid,p_sub text,p_email text,p_deal uuid,p_expected integer)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare headers uuid[]; before_revision integer; app finance.funding_applications%rowtype; target uuid; d partner_deals.deals%rowtype;
begin
 select revision into before_revision from finance.funding_applications where deal_id=p_deal;
 headers:=partner_deals.lock_budget_link_headers(p_deal,'{}');
 perform finance.lock_funding_application_actor(p_actor);
 if not finance.project_budget_verified_member(p_actor,p_sub,p_email) or not coalesce((select pipeline from partner_deals.capabilities(p_actor,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 perform 1 from partner_deals.deals where id=p_deal for update;
 select * into app from finance.funding_applications where deal_id=p_deal for update;
 if app.revision is distinct from before_revision then raise exception 'deal_conflict' using errcode='40001'; end if;
 if exists(select 1 from finance.budget_obligations o join finance.project_budget_entries entry on entry.id=o.entry_id where o.application_id=app.id and o.released_at is null and not entry.project_budget_id=any(headers)) then raise exception 'deal_conflict' using errcode='40001'; end if;
 target:=partner_deals.confirm_won_before_budget_links(p_actor,p_sub,p_email,p_deal,p_expected);
 if app.id is not null and app.awarded_at is null and exists(select 1 from finance.budget_obligations where application_id=app.id and released_at is null) then
  perform 1 from finance.seasons where id=app.season_id and status<>'closed' for share;
  if not found then raise exception 'deal_invalid' using errcode='22023'; end if;
  select * into d from partner_deals.deals where id=target;
  perform entry.id from finance.project_budget_entries entry join finance.budget_obligations o on o.entry_id=entry.id where o.application_id=app.id and o.released_at is null order by entry.id for update of entry;
  update finance.budget_obligations o set protected_entry=to_jsonb(approved)
   from finance.project_budget_entries entry join finance.project_budgets h on h.id=entry.project_budget_id join finance.project_budget_version_entries approved on approved.version_id=h.approved_version_id and approved.entry_id=entry.id
   where o.application_id=app.id and o.entry_id=entry.id and o.released_at is null and not approved.removed and approved.status<>'cancelled';
  update finance.funding_applications set awarded_at=clock_timestamp(),awarded_by_member_id=p_actor,award_date=(d.won_at at time zone 'Europe/Oslo')::date,
   award_reference=case when d.opportunity_kind='grant' then 'Grant approved: ' else 'Deal confirmed won: ' end||d.title,revision=revision+1 where id=app.id;
  update finance.project_budgets set revision=revision+1,updated_at=clock_timestamp(),updated_by_member_id=p_actor where id=any(headers);
  insert into finance.funding_application_events(application_id,actor_member_id,action,request_id,snapshot) values(app.id,p_actor,'pipelineWon',gen_random_uuid(),jsonb_build_object('dealId',d.id,'projectBudgetIds',headers));
  insert into partner_deals.audit(deal_id,actor_member_id,action,after_snapshot) values(d.id,p_actor,'budget_priorities_activated',jsonb_build_object('applicationId',app.id,'priority','P0','projectBudgetIds',headers));
  insert into finance.audit_log(actor_member_id,entity,entity_id,field_name,old_value,new_value) values(p_actor,'funding_application',app.id::text,'pipelineWon',to_jsonb(app)::text,jsonb_build_object('dealId',d.id,'priority','P0','projectBudgetIds',headers)::text);
  perform finance.bump_view_version();
 end if;
 return target;
end $$;
revoke all on function partner_deals.budget_links(uuid,text,text,uuid),partner_deals.lock_budget_link_headers(uuid,uuid[]),partner_deals.save_budget_links(uuid,text,text,uuid,text,jsonb),partner_deals.confirm_won_before_budget_links(uuid,text,text,uuid,integer),partner_deals.confirm_won(uuid,text,text,uuid,integer) from public;
commit;
