-- The caller supplies a reviewed JSON snapshot and an authorized member email
-- using transaction-local helix.attio_import_payload and helix.attio_import_actor.
-- This statement is atomic and skips entries already linked by their Attio ID.
do $$
declare
 payload jsonb := current_setting('helix.attio_import_payload')::jsonb;
 actor identity.members%rowtype;
 linus uuid; finance_lead uuid; season uuid; season_end date; rec jsonb;
 org uuid; matches integer; owner_id uuid; deal uuid; contribution uuid;
 project_id uuid; milestone_id uuid; task_id uuid; chosen_stage text; business_lead uuid; task_data jsonb; assignee_email text; assignee_id uuid;
 cash bigint; inkind bigint; certainty integer; lvl text; detail text; invoice_history text;
begin
 perform pg_advisory_xact_lock(72704,12);
 select * into actor from identity.members where email=current_setting('helix.attio_import_actor') for share;
 if not found or not identity.member_has_feature(actor.id,'member_access.manage') or not coalesce((select pipeline from partner_deals.capabilities(actor.id,actor.google_sub,actor.email)),false) then raise exception 'attio_import_forbidden'; end if;
 select id,end_date into season,season_end from finance.seasons where code='S27' and status<>'closed' for share;
 if season is null or project_management.current_season()<>'S27' then raise exception 'attio_import_season_unavailable'; end if;
 select m.id into finance_lead from identity.members m join project_management.department_members dm on dm.member_id=m.id join project_management.departments d on d.id=dm.department_id
  where m.email='oskar.gabrielsen@helixnmbu.no' and d.name='Finance' and d.season='S27' and dm.access_level='lead';
 if finance_lead is null then raise exception 'attio_import_finance_lead_missing'; end if;
 if jsonb_typeof(payload)<>'array' or jsonb_array_length(payload)=0 then raise exception 'attio_import_invalid_snapshot'; end if;
 if exists(select 1 from jsonb_array_elements(payload) r group by r->>'id' having count(*)>1) then raise exception 'attio_import_duplicate_source'; end if;
 insert into identity.members(email,full_name,auth_user_id,google_sub,verified_at)
 values('linus.hanevik@helixnmbu.no','Linus Hanevik',null,null,null) on conflict(email) do nothing;
 select id into linus from identity.members where email='linus.hanevik@helixnmbu.no';
 for rec in select value from jsonb_array_elements(payload) loop
  if rec->>'season'<>'S27' or nullif(rec->>'id','') is null or nullif(btrim(rec->>'title'),'') is null or nullif(btrim(rec->>'company'),'') is null then raise exception 'attio_import_invalid_record'; end if;
  if exists(select 1 from partner_deals.import_sources where provider='attio' and external_id=rec->>'id') then continue; end if;
  select count(*),min(id::text)::uuid into matches,org from partner.organizations where lower(btrim(name))=lower(btrim(rec->>'company'));
  if matches>1 then raise exception 'attio_import_ambiguous_company'; end if;
  if org is null then insert into partner.organizations(name,active) values(btrim(rec->>'company'),false) returning id into org; end if;
  if exists(select 1 from partner_deals.deals d where d.organization_id=org and lower(btrim(d.title))=lower(btrim(rec->>'title'))) then raise exception 'attio_import_possible_duplicate'; end if;
  select id into owner_id from identity.members where email=rec->>'owner_email';
  if owner_id is null then raise exception 'attio_import_owner_missing'; end if;
  chosen_stage:=case rec->>'stage' when 'Lead' then 'lead' when 'Applications Backlog' then 'lead' when 'On Hold' then 'lead' when 'In Progress' then 'discussion' when 'Won 🎉' then 'won' when 'Lost' then 'lost' else null end;
  if chosen_stage is null then raise exception 'attio_import_unmapped_stage'; end if;
  cash:=nullif(rec->>'cash_ore','')::bigint; inkind:=nullif(rec->>'inkind_ore','')::bigint;
  certainty:=case rec->>'certainty' when 'Under 50%' then 25 when 'Over 50%' then 75 when 'Closed' then 100 else null end;
  lvl:=case rec->>'level' when 'Service' then 'service' when 'Bronze' then 'bronze' when 'Silver' then 'silver' when 'Gold' then 'gold' when 'Main' then 'main' else null end;
  detail:=concat_ws(E'\n\n',nullif(rec->>'notes',''), 'Imported from Attio. Original stage: '||(rec->>'stage')||'. Season: S27.', 'Attio deal ID: '||(rec->>'id'));
  insert into partner_deals.deals(organization_id,title,stage,primary_season_id,owner_member_id,contact_name,contact_email,negotiation_notes,probability,sponsor_level,won_at,won_by_member_id,created_by_member_id,updated_by_member_id)
  values(org,btrim(rec->>'title'),chosen_stage,season,owner_id,coalesce(rec->>'contact_name',''),coalesce(rec->>'contact_email',''),detail,certainty,lvl,case when chosen_stage='won' then now() end,case when chosen_stage='won' then actor.id end,actor.id,actor.id) returning id into deal;
  insert into partner_deals.import_sources(provider,external_id,deal_id,source_data,imported_by) values('attio',rec->>'id',deal,rec,actor.id);
  if cash>0 then
   insert into partner_deals.contributions(deal_id,season_id,kind,amount_ore,invoice_date,description) values(deal,season,'cash',cash,null,'Imported from Attio; invoice date was not provided.') returning id into contribution;
  end if;
  if inkind>0 then
   insert into partner_deals.contributions(deal_id,season_id,kind,amount_ore,invoice_date,description)
   values(deal,season,case when coalesce(rec->>'types','') like '%Materials / Products%' then 'product' else 'service' end,inkind,null,coalesce(nullif(rec->>'types',''),'In-kind contribution imported from Attio.'));
  end if;
  if chosen_stage='won' and cash>0 then
   select string_agg(value->>'content', '; ') into invoice_history from jsonb_array_elements(coalesce(rec->'task_history','[]'::jsonb)) where value->>'completed'='true' and value->>'content' ilike '%fakturer%';
   project_id:=gen_random_uuid(); milestone_id:=gen_random_uuid(); task_id:=gen_random_uuid();
   insert into project_management.projects(id,season,name,description,category,departments,lead_ids)
    values(project_id,'S27',left((rec->>'company')||' funding review',200),'Reconcile an agreement imported from Attio.','operations',array['Finance'],array[finance_lead]);
   insert into project_management.tasks(id,season,title,description,category,project_id,deadline,status,priority,kind,partner_name)
    values(milestone_id,'S27','Imported agreement review','Review historical funding and decide whether any invoicing remains.','operations',project_id,season_end,'todo','normal','milestone',rec->>'company');
   insert into project_management.tasks(id,season,title,description,category,project_id,milestone_id,status,priority,kind,partner_name)
    values(task_id,'S27',left('Reconcile '||(rec->>'company')||' funding',200),left('This agreement was already Won in Attio. Recorded cash: NOK '||finance.format_ore(cash)||'. Verify whether the contribution was invoiced or received, reconcile it in Financing, and create an invoice task only if one is still needed. The invoice date and payment status were not supplied by Attio.'||case when invoice_history is null then '' else ' Attio has a completed task: '||invoice_history||'. The completion date is unknown.' end,2000),'operations',project_id,milestone_id,'todo','normal','task',rec->>'company');
   insert into project_management.task_assignees(task_id,member_id) values(task_id,finance_lead);
   insert into partner_deals.task_links(deal_id,task_id,season_id,contribution_id,kind) values(deal,task_id,season,contribution,'finance_review');
  end if;
  if rec->'import_open_tasks' = 'true'::jsonb then
   for task_data in select value from jsonb_array_elements(coalesce(rec->'task_history','[]'::jsonb)) where value->>'completed'='false' loop
    select m.id into business_lead from identity.members m join project_management.department_members dm on dm.member_id=m.id join project_management.departments dep on dep.id=dm.department_id
     where m.email='aslan.yelli@helixnmbu.no' and dep.name='Business & Marketing' and dep.season='S27' and dm.access_level='lead';
    if business_lead is null then raise exception 'attio_import_business_lead_missing'; end if;
    if jsonb_typeof(task_data->'assignee_emails') is distinct from 'array' then raise exception 'attio_import_task_owner_missing'; end if;
    project_id:=gen_random_uuid(); milestone_id:=gen_random_uuid(); task_id:=gen_random_uuid();
    insert into project_management.projects(id,season,name,description,category,departments,lead_ids)
     values(project_id,'S27',left((rec->>'company')||' follow-up',200),'Follow-up work imported from Attio.','operations',array['Business & Marketing'],array[business_lead]);
    insert into project_management.tasks(id,season,title,description,category,project_id,deadline,status,priority,kind,partner_name)
     values(milestone_id,'S27','Partner follow-up','Complete the imported follow-up work.','operations',project_id,coalesce(nullif(task_data->>'deadline','')::date,season_end),'todo','normal','milestone',rec->>'company');
    insert into project_management.tasks(id,season,title,description,category,project_id,milestone_id,deadline,status,priority,kind,partner_name)
     values(task_id,'S27',left(task_data->>'content',200),'Imported from Attio. Source task ID: '||(task_data->>'id'),'operations',project_id,milestone_id,nullif(task_data->>'deadline','')::date,'todo','normal','task',rec->>'company');
    for assignee_email in select value from jsonb_array_elements_text(task_data->'assignee_emails') loop
     select id into assignee_id from identity.members where email=assignee_email;
     if assignee_id is null then raise exception 'attio_import_task_owner_missing'; end if;
     insert into project_management.task_assignees(task_id,member_id) values(task_id,assignee_id) on conflict do nothing;
    end loop;
    insert into partner_deals.task_links(deal_id,task_id,kind) values(deal,task_id,'follow_up');
   end loop;
  end if;
  insert into partner_deals.audit(deal_id,actor_member_id,action,after_snapshot) values(deal,actor.id,'attio_import',jsonb_build_object('sourceId',rec->>'id','sourceStage',rec->>'stage','invoiceDateKnown',false,'wonAtIsImportTime',chosen_stage='won'));
 end loop;
end $$;
