begin;
create table if not exists identity.member_preferences (
  member_id uuid primary key references identity.members(id) on delete cascade,
  space_order jsonb not null default '[]'::jsonb check (jsonb_typeof(space_order) = 'array')
);
revoke all on identity.member_preferences from public;
commit;
