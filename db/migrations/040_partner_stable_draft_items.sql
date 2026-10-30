-- Retain stable draft item identities and reject unsafe changes to linked funding.
begin;
create or replace function partner_deals.save_deal(p_member uuid,p_sub text,p_email text,p_command jsonb)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare
 d partner_deals.deals%rowtype; target uuid; old_snapshot jsonb; new_snapshot jsonb; c jsonb; item jsonb;
 previous partner_deals.contributions%rowtype; previous_deliverable partner_deals.deliverables%rowtype;
 contribution_id uuid; deliverable_id uuid; kept_contributions uuid[]:='{}'::uuid[]; kept_deliverables uuid[]:='{}'::uuid[]; supplied_contributions uuid[]:='{}'::uuid[];
 next_org uuid; next_season uuid; next_kind text; next_amount bigint; next_invoice date; org_changed boolean:=false;
begin
 perform partner_deals.lock_actor(p_member);
 if not coalesce((select pipeline from partner_deals.capabilities(p_member,p_sub,p_email)),false) then raise exception 'deal_forbidden' using errcode='42501'; end if;
 if jsonb_typeof(p_command)<>'object' or jsonb_typeof(p_command->'contributions')<>'array' or jsonb_typeof(p_command->'deliverables')<>'array' then raise exception 'deal_invalid' using errcode='22023'; end if;
 if p_command->>'stage' not in ('lead','contacted','discussion','proposal','lost') then raise exception 'deal_invalid_stage' using errcode='22023'; end if;
 next_org:=(p_command->>'organizationId')::uuid;
 if p_command->>'id' is null then
   insert into partner_deals.deals(organization_id,title,stage,owner_member_id,contact_name,contact_email,starts_on,ends_on,agreement_link,negotiation_notes,created_by_member_id,updated_by_member_id)
   values(next_org,btrim(p_command->>'title'),p_command->>'stage',nullif(p_command->>'ownerMemberId','')::uuid,coalesce(p_command->>'contactName',''),coalesce(p_command->>'contactEmail',''),nullif(p_command->>'startsOn','')::date,nullif(p_command->>'endsOn','')::date,coalesce(p_command->>'agreementLink',''),coalesce(p_command->>'negotiationNotes',''),p_member,p_member) returning * into d;
 else
   target:=(p_command->>'id')::uuid;
   select * into d from partner_deals.deals where id=target for update;
   if not found then raise exception 'deal_not_found' using errcode='P0002'; end if;
   if d.stage='won' then raise exception 'deal_won_locked' using errcode='55000'; end if;
   if d.revision is distinct from (p_command->>'expectedRevision')::integer then raise exception 'deal_conflict' using errcode='40001'; end if;
   old_snapshot:=jsonb_build_object('deal',to_jsonb(d),'contributions',coalesce((select jsonb_agg(to_jsonb(x)) from partner_deals.contributions x where x.deal_id=d.id),'[]'::jsonb),'deliverables',coalesce((select jsonb_agg(to_jsonb(x)) from partner_deals.deliverables x where x.deal_id=d.id),'[]'::jsonb));
   org_changed:=d.organization_id is distinct from next_org;
   if org_changed and exists(select 1 from partner_deals.funding_links fl join partner_deals.contributions x on x.id=fl.contribution_id where x.deal_id=d.id) then raise exception 'deal_linked_contribution' using errcode='55000'; end if;
   if org_changed then delete from partner_deals.separate_funding_approvals where contribution_id in (select id from partner_deals.contributions where deal_id=d.id); end if;
   update partner_deals.deals set organization_id=next_org,title=btrim(p_command->>'title'),stage=p_command->>'stage',owner_member_id=nullif(p_command->>'ownerMemberId','')::uuid,contact_name=coalesce(p_command->>'contactName',''),contact_email=coalesce(p_command->>'contactEmail',''),starts_on=nullif(p_command->>'startsOn','')::date,ends_on=nullif(p_command->>'endsOn','')::date,agreement_link=coalesce(p_command->>'agreementLink',''),negotiation_notes=coalesce(p_command->>'negotiationNotes',''),revision=revision+1,updated_by_member_id=p_member,updated_at=now() where id=target returning * into d;
 end if;
 -- Validate ownership and protect linked rows before removing omitted items.
 -- Removing old rows first also permits replacing an unlinked cash item in the same season.
 for c in select value from jsonb_array_elements(p_command->'contributions') loop
   contribution_id:=nullif(c->>'id','')::uuid;
   if contribution_id is not null then
     if contribution_id=any(supplied_contributions) or not exists(select 1 from partner_deals.contributions x where x.id=contribution_id and x.deal_id=d.id) then raise exception 'deal_invalid_item' using errcode='22023'; end if;
     supplied_contributions:=array_append(supplied_contributions,contribution_id);
   end if;
 end loop;
 if exists(select 1 from partner_deals.contributions x join partner_deals.funding_links fl on fl.contribution_id=x.id where x.deal_id=d.id and not (x.id=any(supplied_contributions))) then raise exception 'deal_linked_contribution' using errcode='55000'; end if;
 delete from partner_deals.contributions where deal_id=d.id and not (id=any(supplied_contributions));
 for c in select value from jsonb_array_elements(p_command->'contributions') loop
   contribution_id:=nullif(c->>'id','')::uuid;
   next_season:=(c->>'seasonId')::uuid; next_kind:=c->>'kind'; next_amount:=nullif(c->>'amountOre','')::bigint; next_invoice:=nullif(c->>'invoiceDate','')::date;
   if contribution_id is null then
     insert into partner_deals.contributions(deal_id,season_id,kind,description,amount_ore,invoice_date) values(d.id,next_season,next_kind,coalesce(c->>'description',''),next_amount,next_invoice) returning id into contribution_id;
   else
     if contribution_id=any(kept_contributions) then raise exception 'deal_invalid_item' using errcode='22023'; end if;
     select * into previous from partner_deals.contributions where id=contribution_id and deal_id=d.id for update;
     if not found then raise exception 'deal_invalid_item' using errcode='22023'; end if;
     if (previous.season_id,previous.kind,previous.amount_ore) is distinct from (next_season,next_kind,next_amount) then
       if exists(select 1 from partner_deals.funding_links where funding_links.contribution_id=previous.id) then raise exception 'deal_linked_contribution' using errcode='55000'; end if;
       delete from partner_deals.separate_funding_approvals where separate_funding_approvals.contribution_id=previous.id;
     end if;
     update partner_deals.contributions set season_id=next_season,kind=next_kind,amount_ore=next_amount,invoice_date=next_invoice,description=coalesce(c->>'description','') where id=contribution_id;
   end if;
   kept_contributions:=array_append(kept_contributions,contribution_id);
 end loop;
 for item in select value from jsonb_array_elements(p_command->'deliverables') loop
   deliverable_id:=nullif(item->>'id','')::uuid;
   if deliverable_id is null then
     insert into partner_deals.deliverables(deal_id,title,description,due_date,owner_member_id) values(d.id,btrim(item->>'title'),coalesce(item->>'description',''),nullif(item->>'dueDate','')::date,nullif(item->>'ownerMemberId','')::uuid) returning id into deliverable_id;
   else
     if deliverable_id=any(kept_deliverables) then raise exception 'deal_invalid_item' using errcode='22023'; end if;
     select * into previous_deliverable from partner_deals.deliverables where id=deliverable_id and deal_id=d.id for update;
     if not found then raise exception 'deal_invalid_item' using errcode='22023'; end if;
     update partner_deals.deliverables set title=btrim(item->>'title'),description=coalesce(item->>'description',''),due_date=nullif(item->>'dueDate','')::date,owner_member_id=nullif(item->>'ownerMemberId','')::uuid where id=deliverable_id;
   end if;
   kept_deliverables:=array_append(kept_deliverables,deliverable_id);
 end loop;
 delete from partner_deals.deliverables where deal_id=d.id and not (id=any(kept_deliverables));
 new_snapshot:=jsonb_build_object('deal',to_jsonb(d),'contributions',coalesce((select jsonb_agg(to_jsonb(x)) from partner_deals.contributions x where x.deal_id=d.id),'[]'::jsonb),'deliverables',coalesce((select jsonb_agg(to_jsonb(x)) from partner_deals.deliverables x where x.deal_id=d.id),'[]'::jsonb));
 insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot) values(d.id,p_member,case when old_snapshot is null then 'created' else 'updated' end,old_snapshot,new_snapshot);
 return d.id;
end $$;
commit;
