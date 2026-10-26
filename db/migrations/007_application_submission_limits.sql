begin;
create table if not exists website.application_submission_limits (
  rate_key text primary key check (rate_key ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  request_count integer not null default 1 check (request_count > 0)
);
create index if not exists application_submission_limits_window_idx
  on website.application_submission_limits (window_started_at);
alter table website.application_submission_limits enable row level security;
revoke all on website.application_submission_limits from public;
grant select, insert, update, delete on website.application_submission_limits to current_user;
do $$
declare browser_role text;
begin
  for browser_role in select rolname from pg_roles where rolname in ('anon', 'anonymous', 'authenticated') loop
    execute format('revoke all on website.application_submission_limits from %I', browser_role);
  end loop;
end;
$$;
commit;
