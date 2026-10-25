-- Administrator-owned role title, separate from the member-editable CV headline
-- and the application's Admin/Member access role. Safe to run repeatedly.
begin;

alter table identity.members
  add column if not exists helix_role text
  constraint members_helix_role_check check (
    helix_role is null or (
      helix_role = btrim(helix_role) and char_length(helix_role) between 1 and 150
    )
  );

comment on column identity.members.helix_role is
  'Role at Helix, assigned by a system administrator. Member profile and CV APIs only read this field.';

commit;
