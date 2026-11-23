-- Invoice tasks require evidence of sending and receipt before completion.
-- Existing completed tasks retain their history; no dates are inferred.
begin;
alter table partner_deals.task_links
  add column invoice_sent_date date,
  add column invoice_revision integer not null default 0;

create function partner_deals.can_update_invoice(p_member uuid,p_task uuid)
returns boolean language sql stable set search_path=pg_catalog as $$
 select project_management.can_access_task(p_member,p_task,true) or exists(
   select 1 from project_management.tasks t
   join project_management.task_assignees a on a.task_id=t.id and a.member_id=p_member
   join project_management.projects p on p.id=t.project_id
   join project_management.departments d on d.name=any(p.departments) and d.season=p.season
   join project_management.department_members dm on dm.department_id=d.id and dm.member_id=p_member and dm.access_level='member'
   where t.id=p_task and t.kind='task');
$$;

create function partner_deals.invoice_progress(p_member uuid,p_sub text,p_email text,p_task uuid)
returns jsonb language sql stable set search_path=pg_catalog as $$
 select jsonb_build_object('sentDate',l.invoice_sent_date,
   'receivedDate',case when f.status='received' then f.received_date else null end,
   'revision',l.invoice_revision,'fundingRevision',f.revision,
   'canRecordSent',s.status<>'closed' and partner_deals.can_update_invoice(p_member,p_task),
   'canRecordPayment',s.status<>'closed' and partner_deals.can_update_invoice(p_member,p_task)
     and coalesce((finance.capability_flags(p_member)->>'manageFunding')::boolean,false),
   'hasFunding',f.id is not null)
 from partner_deals.task_links l
 join finance.seasons s on s.id=l.season_id
 left join partner_deals.funding_links fl on fl.contribution_id=l.contribution_id
 left join finance.funding f on f.id=fl.funding_id
 join identity.members m on m.id=p_member
 join neon_auth."user" u on u.id=m.auth_user_id
 where l.task_id=p_task and l.kind='invoice' and project_management.can_access_task(p_member,p_task)
   and m.google_sub=p_sub and m.email=lower(p_email) and lower(u.email)=m.email
   and u."emailVerified" is true and u.banned is not true
   and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub);
$$;

create function partner_deals.save_invoice_progress(p_member uuid,p_sub text,p_email text,p_task uuid,
  p_revision integer,p_funding_revision integer,p_sent date,p_received date)
returns void language plpgsql set search_path=pg_catalog as $$
declare
  link partner_deals.task_links%rowtype;
  invoice_funding finance.funding%rowtype;
  previous_date date;
  season_state text;
  task_state text;
  can_pay boolean;
begin
  perform pg_advisory_xact_lock(72704,12);
  perform partner_deals.lock_actor(p_member);
  if partner_deals.invoice_progress(p_member,p_sub,p_email,p_task) is null
    or not partner_deals.can_update_invoice(p_member,p_task) then
    raise exception 'invoice_forbidden' using errcode='42501';
  end if;
  select * into link from partner_deals.task_links where task_id=p_task and kind='invoice' for update;
  perform pg_advisory_xact_lock(75982,hashtext(link.season_id::text));
  select status into season_state from finance.seasons where id=link.season_id for share;
  if season_state='closed' then raise exception 'invoice_closed' using errcode='42501'; end if;
  if link.invoice_revision is distinct from p_revision then raise exception 'invoice_conflict' using errcode='40001'; end if;
  if (p_sent is not null and (p_sent<date '2000-01-01' or p_sent>(clock_timestamp() at time zone 'Europe/Oslo')::date))
    or (p_received is not null and (p_received<date '2000-01-01' or p_received>(clock_timestamp() at time zone 'Europe/Oslo')::date)) then
    raise exception 'invoice_invalid_date' using errcode='22023';
  end if;
  select status into task_state from project_management.tasks where id=p_task for update;
  select f.* into invoice_funding from partner_deals.funding_links fl join finance.funding f on f.id=fl.funding_id
    where fl.contribution_id=link.contribution_id for update of f;
  if invoice_funding.revision is distinct from p_funding_revision then raise exception 'invoice_conflict' using errcode='40001'; end if;
  previous_date:=case when invoice_funding.status='received' then invoice_funding.received_date else null end;
  can_pay:=coalesce((finance.capability_flags(p_member)->>'manageFunding')::boolean,false);
  if p_received is distinct from previous_date then
    if not can_pay then raise exception 'invoice_payment_forbidden' using errcode='42501'; end if;
    if invoice_funding.id is null or invoice_funding.status not in ('secured','received') or partner_deals.linked_funding_mismatch(link.contribution_id) then
      raise exception 'invoice_funding_required' using errcode='40001';
    end if;
    if task_state='done' and p_received is null then raise exception 'invoice_completion_required' using errcode='23514'; end if;
    update finance.funding set status=case when p_received is null then 'secured' else 'received' end,
      received_date=p_received,revision=revision+1,updated_at=clock_timestamp(),updated_by_member_id=p_member
      where id=invoice_funding.id;
    perform finance.audit_change(p_member,'funding',invoice_funding.id::text,'status',invoice_funding.status,case when p_received is null then 'secured' else 'received' end);
    perform finance.audit_change(p_member,'funding',invoice_funding.id::text,'received_date',invoice_funding.received_date::text,p_received::text);
    perform finance.bump_view_version();
  end if;
  if task_state='done' and p_sent is null and link.invoice_sent_date is not null then
    raise exception 'invoice_completion_required' using errcode='23514';
  end if;
  update partner_deals.task_links set invoice_sent_date=p_sent,invoice_revision=invoice_revision+1 where id=link.id;
  insert into partner_deals.audit(deal_id,actor_member_id,action,before_snapshot,after_snapshot)
    values(link.deal_id,p_member,'invoice_progress',jsonb_build_object('taskId',p_task,'sentDate',link.invoice_sent_date,'receivedDate',previous_date),
      jsonb_build_object('taskId',p_task,'sentDate',p_sent,'receivedDate',p_received));
end;
$$;

-- Every task-writing path passes this guard, including full saves and estimates.
create function partner_deals.guard_invoice_completion()
returns trigger language plpgsql set search_path=pg_catalog as $$
declare link partner_deals.task_links%rowtype;
begin
  if new.status<>'done' or (tg_op='UPDATE' and old.status='done') then return new; end if;
  select * into link from partner_deals.task_links where task_id=new.id and kind='invoice';
  if not found then return new; end if;
  perform pg_advisory_xact_lock(75982,hashtext(link.season_id::text));
  if link.invoice_sent_date is null or not exists(
    select 1 from partner_deals.funding_links fl join finance.funding f on f.id=fl.funding_id
    where fl.contribution_id=link.contribution_id and f.status='received' and f.received_date is not null
      and not partner_deals.linked_funding_mismatch(link.contribution_id)) then
    raise exception 'invoice_completion_required' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger invoice_completion_required before insert or update on project_management.tasks
for each row execute function partner_deals.guard_invoice_completion();

-- Reopen the task before withdrawing its recorded payment.
create function partner_deals.guard_completed_invoice_payment()
returns trigger language plpgsql set search_path=pg_catalog as $$
begin
  if old.status='received' and old.received_date is not null and (new.status<>'received' or new.received_date is null)
    and exists(select 1 from partner_deals.funding_links fl
      join partner_deals.task_links l on l.contribution_id=fl.contribution_id and l.kind='invoice'
      join project_management.tasks t on t.id=l.task_id and t.status='done' where fl.funding_id=old.id) then
    raise exception 'invoice_completion_required' using errcode='23514';
  end if;
  return new;
end;
$$;
create trigger completed_invoice_payment before update on finance.funding
for each row execute function partner_deals.guard_completed_invoice_payment();

update identity.platform_roles set label='Finance' where role_key='financials';
revoke all on function partner_deals.can_update_invoice(uuid,uuid) from public;
revoke all on function partner_deals.invoice_progress(uuid,text,text,uuid) from public;
revoke all on function partner_deals.save_invoice_progress(uuid,text,text,uuid,integer,integer,date,date) from public;
commit;
