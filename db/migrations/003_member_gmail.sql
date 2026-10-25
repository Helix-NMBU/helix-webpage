-- Private Gmail connection metadata for the member platform.
-- Apply with the direct/unpooled DATABASE_URL after migration 001.
-- Refresh tokens are encrypted by the API before they reach this table.

begin;

create table if not exists identity.gmail_connections (
  member_id uuid primary key references identity.members(id) on delete cascade,
  gmail_email text not null check (gmail_email = lower(gmail_email)),
  refresh_token_ciphertext text not null,
  granted_scope text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

revoke all on identity.gmail_connections from public;
grant select, insert, update, delete on identity.gmail_connections to current_user;

commit;
