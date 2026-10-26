-- Additive Neon setup. No legacy source records are copied.
begin;
create schema if not exists website;
create table if not exists website.contact_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 254),
  subject text not null check (char_length(subject) between 1 and 250),
  message text not null check (char_length(message) between 1 and 8000),
  email_status text not null default 'skipped' check (email_status in ('skipped', 'sent', 'failed'))
);
alter table website.contact_messages enable row level security;
revoke all on schema website from public;
revoke all on website.contact_messages from public;
do $$
declare browser_role text;
begin
  for browser_role in select rolname from pg_roles where rolname in ('anon', 'anonymous', 'authenticated') loop
    execute format('revoke all on website.contact_messages from %I', browser_role);
  end loop;
end;
$$;
grant usage on schema website to current_user;
grant select, insert, update, delete on website.contact_messages to current_user;
commit;
