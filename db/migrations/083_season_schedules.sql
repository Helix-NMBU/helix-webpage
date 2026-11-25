begin;

create table project_management.season_schedules (
  season_code text primary key references finance.seasons(code),
  phases jsonb not null check (jsonb_typeof(phases) = 'array' and jsonb_array_length(phases) = 6),
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references identity.members(id)
);
alter table project_management.season_schedules enable row level security;
revoke all on project_management.season_schedules from public;

create function project_management.save_season_schedule(p_actor uuid,p_sub text,p_email text,p_change jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog as $$
declare
  season text := p_change->>'season';
  schedule_start date;
  schedule_end date;
  expected integer := (p_change->>'expectedRevision')::integer;
  submitted jsonb := p_change->'phases';
begin
  perform pg_advisory_xact_lock(72704,12);
  perform 1 from finance.settings where setting_key='current_season' for share;
  if not exists (
    select 1 from identity.members m join neon_auth."user" u on u.id=m.auth_user_id
    where m.id=p_actor and m.google_sub=p_sub and m.email=p_email
      and project_management.is_department_manager(m.id)
      and lower(u.email)=m.email and u."emailVerified" is true and u.banned is not true
      and exists(select 1 from neon_auth.account a where a."userId"=u.id and a."providerId"='google' and a."accountId"=m.google_sub)
  ) then raise exception 'project_forbidden'; end if;
  if season is distinct from project_management.current_season() then raise exception 'season_schedule_conflict'; end if;
  select s.start_date,s.end_date into schedule_start,schedule_end
    from finance.seasons s where s.code=season and s.status<>'closed' for share;
  if not found then raise exception 'season_schedule_conflict'; end if;
  if jsonb_typeof(submitted) is distinct from 'array' or jsonb_array_length(submitted)<>6 then
    raise exception 'season_schedule_invalid';
  end if;
  if exists (
    select 1 from jsonb_array_elements(submitted) with ordinality p(item,position)
    where item->>'id' is distinct from (array['recruitment','draft-concept','concept','design','construction','test'])[position]
       or coalesce(item->>'status','') not in ('planned','in_progress','done')
       or length(coalesce(item->>'note',''))>300
       or (item->>'startDate')::date not between schedule_start and schedule_end
       or (item->>'endDate')::date not between schedule_start and schedule_end
       or (item->>'startDate')::date>(item->>'endDate')::date
  ) or (submitted->4->>'endDate') is distinct from (submitted->5->>'startDate') then
    raise exception 'season_schedule_invalid';
  end if;

  if expected=0 then
    insert into project_management.season_schedules(season_code,phases,updated_by)
      values(season,submitted,p_actor) on conflict(season_code) do nothing;
  else
    update project_management.season_schedules set
      phases=submitted,revision=revision+1,updated_at=now(),updated_by=p_actor
      where season_code=season and revision=expected;
  end if;
  if not found then raise exception 'season_schedule_conflict'; end if;
end;
$$;
revoke all on function project_management.save_season_schedule(uuid,text,text,jsonb) from public;
grant execute on function project_management.save_season_schedule(uuid,text,text,jsonb) to current_user;

commit;
