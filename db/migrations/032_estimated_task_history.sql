-- Estimates are separate from the immutable observed event log.
begin;
create table project_management.task_history_estimates (
  id bigint generated always as identity primary key,
  task_id uuid not null,
  created_date date not null,
  completed_date date not null,
  basis text not null check (length(trim(basis)) between 1 and 1000),
  recorded_at timestamptz not null default clock_timestamp(),
  recorded_by uuid not null,
  check (created_date <= completed_date)
);
create index task_history_estimates_task_idx on project_management.task_history_estimates(task_id, id desc);
create trigger task_history_estimates_immutable before update or delete or truncate on project_management.task_history_estimates
  for each statement execute function project_management.keep_task_progress_immutable();
revoke all on project_management.task_history_estimates from public;
grant select, insert on project_management.task_history_estimates to current_user;
grant usage, select on sequence project_management.task_history_estimates_id_seq to current_user;

create or replace function project_management.estimate_task_history(p_member_id uuid, p_google_sub text, p_email text, p_change jsonb)
returns uuid language plpgsql security invoker set search_path=pg_catalog as $$
declare
  target uuid := (p_change->>'id')::uuid;
  expected integer := (p_change->>'expectedRevision')::integer;
  created date := (p_change->>'createdDate')::date;
  completed date := (p_change->>'completedDate')::date;
  item project_management.tasks;
begin
  perform pg_advisory_xact_lock(72704,12);
  perform m.id from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=p_member_id and m.google_sub=p_google_sub and m.email=p_email
      and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub)
    for share of m;
  if not found then raise exception 'project_forbidden'; end if;
  select * into item from project_management.tasks where id=target and season='S27' for update;
  if not found then raise exception 'project_not_found'; end if;
  if not project_management.can_access_task(p_member_id,target,true) then raise exception 'project_task_lead_required'; end if;
  if item.revision <> expected then raise exception 'project_conflict'; end if;
  if item.kind <> 'task' or created is null or completed is null or length(trim(coalesce(p_change->>'basis',''))) not between 1 and 1000 or created < date '2000-01-01'
    or created > completed or completed > (now() at time zone 'Europe/Oslo')::date then raise exception 'project_invalid'; end if;
  update project_management.tasks set status='done', blocked_reason='', completed_at=coalesce(item.completed_at,now()),
    revision=revision+1, updated_at=now() where id=target;
  insert into project_management.task_history_estimates(task_id,created_date,completed_date,basis,recorded_by)
    values(target,created,completed,trim(p_change->>'basis'),p_member_id);
  return target;
end;
$$;
revoke all on function project_management.estimate_task_history(uuid,text,text,jsonb) from public;
grant execute on function project_management.estimate_task_history(uuid,text,text,jsonb) to current_user;
commit;
