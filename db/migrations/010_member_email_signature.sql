begin;

create schema if not exists member_mail;
revoke all on schema member_mail from public;
create table if not exists member_mail.signature_settings (
  singleton boolean primary key default true check (singleton),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  revision integer not null default 1 check (revision > 0),
  updated_by uuid references identity.members(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table member_mail.signature_settings enable row level security;
revoke all on member_mail.signature_settings from public;

do $$
declare browser_role text;
begin
  for browser_role in select rolname from pg_roles where rolname in ('anon', 'anonymous', 'authenticated') loop
    execute format('revoke all on schema member_mail from %I', browser_role);
    execute format('revoke all on member_mail.signature_settings from %I', browser_role);
  end loop;
end $$;
grant usage on schema member_mail to current_user;
grant select, insert, update on member_mail.signature_settings to current_user;

commit;
