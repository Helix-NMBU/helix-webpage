-- Free-form partner commitments are separate from cash and in-kind valuations.
-- NULL keeps existing contribution descriptions visible until the notes are edited.
begin;
alter table partner_deals.deals add column partner_notes text
 check (partner_notes is null or char_length(partner_notes) <= 8000);

-- Delegate authorization, Won locks, revisions and stable item IDs to the existing save.
alter function partner_deals.save_deal(uuid,text,text,jsonb) rename to save_deal_before_partner_notes;
create function partner_deals.save_deal(p_member uuid,p_sub text,p_email text,p_command jsonb)
returns uuid language plpgsql set search_path=pg_catalog as $$
declare target uuid; previous_notes text; requested_notes text;
begin
 if p_command ? 'partnerNotes' then
  if jsonb_typeof(p_command->'partnerNotes') is distinct from 'string'
   or char_length(p_command->>'partnerNotes') > 8000 then
   raise exception 'deal_invalid' using errcode='22023';
  end if;
  requested_notes:=p_command->>'partnerNotes';
 end if;
 target:=partner_deals.save_deal_before_partner_notes(p_member,p_sub,p_email,p_command);
 select partner_notes into previous_notes from partner_deals.deals where id=target;
 if p_command ? 'partnerNotes' and previous_notes is distinct from requested_notes then
  update partner_deals.deals set partner_notes=requested_notes where id=target;
  insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot)
   values(target,p_member,'partner_notes_changed',jsonb_build_object('partnerNotes',previous_notes),jsonb_build_object('partnerNotes',requested_notes));
 end if;
 return target;
end $$;
revoke all on function partner_deals.save_deal_before_partner_notes(uuid,text,text,jsonb) from public;
revoke all on function partner_deals.save_deal(uuid,text,text,jsonb) from public;
commit;
