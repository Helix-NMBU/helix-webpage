-- The commercial level belongs to a deal; it does not grant partner portal access.
begin;
alter table partner_deals.deals add column if not exists sponsor_level text check (sponsor_level in ('partner','service','bronze','silver','gold','platinum','main'));
alter table partner_deals.deals add column if not exists probability integer check (probability between 0 and 100);
alter table partner_deals.deals add column if not exists follow_up_on date;
alter function partner_deals.save_deal(uuid,text,text,jsonb) rename to save_deal_before_sponsor_level;
create function partner_deals.save_deal(p_member uuid,p_sub text,p_email text,p_command jsonb) returns uuid language plpgsql set search_path=pg_catalog as $$
declare target uuid; previous text; requested text; previous_probability integer; previous_follow_up date; requested_probability integer; requested_follow_up date;
begin
 if p_command ? 'sponsorLevel' then
   requested := p_command->>'sponsorLevel';
   if requested is not null and requested not in ('partner','service','bronze','silver','gold','platinum','main') then raise exception 'deal_invalid' using errcode='22023'; end if;
 end if;
 if p_command ? 'probability' then
   if p_command->>'probability' is not null then
     if (p_command->>'probability') !~ '^([0-9]|[1-9][0-9]|100)$' then raise exception 'deal_invalid' using errcode='22023'; end if;
     requested_probability := (p_command->>'probability')::integer;
   end if;
 end if;
 if p_command ? 'followUpOn' then requested_follow_up := nullif(p_command->>'followUpOn','')::date; end if;
 if p_command->>'id' is not null then select sponsor_level,probability,follow_up_on into previous,previous_probability,previous_follow_up from partner_deals.deals where id=(p_command->>'id')::uuid; end if;
 target:=partner_deals.save_deal_before_sponsor_level(p_member,p_sub,p_email,p_command);
 if p_command ? 'sponsorLevel' and previous is distinct from requested then
   update partner_deals.deals set sponsor_level=requested where id=target;
   insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot) values(target,p_member,'sponsor_level_changed',jsonb_build_object('sponsorLevel',previous),jsonb_build_object('sponsorLevel',requested));
 end if;
 if (p_command ? 'probability' and previous_probability is distinct from requested_probability) or (p_command ? 'followUpOn' and previous_follow_up is distinct from requested_follow_up) then
   update partner_deals.deals set probability=case when p_command ? 'probability' then requested_probability else probability end, follow_up_on=case when p_command ? 'followUpOn' then requested_follow_up else follow_up_on end where id=target;
   insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot) values(target,p_member,'pipeline_details_changed',jsonb_build_object('probability',previous_probability,'followUpOn',previous_follow_up),jsonb_build_object('probability',case when p_command ? 'probability' then requested_probability else previous_probability end,'followUpOn',case when p_command ? 'followUpOn' then requested_follow_up else previous_follow_up end));
 end if;
 return target;
end $$;
revoke all on function partner_deals.save_deal_before_sponsor_level(uuid,text,text,jsonb) from public;
revoke all on function partner_deals.save_deal(uuid,text,text,jsonb) from public;
commit;
