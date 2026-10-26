-- Preserve administrator-owned identity.members.full_name on subsequent logins.
-- A new account starts with its verified Google name. Apply after migrations 001/002.
begin;

create or replace function identity.onboard_member(
  p_auth_user_id uuid,
  p_google_sub text,
  p_email text,
  p_name text,
  p_draft jsonb,
  p_sharing jsonb
) returns uuid
language plpgsql
set search_path = identity, cv, pg_temp
as $$
declare
  saved_id uuid;
begin
  if p_email is null or p_email <> lower(p_email) or p_email !~ '^[^[:space:]@]+@helixnmbu[.]no$'
    or p_google_sub is null or length(p_google_sub) < 1
    then raise exception 'Identity mismatch' using errcode = '42501'; end if;
  if not exists (
    select 1
    from neon_auth."user" u
    join neon_auth.account a on a."userId" = u.id
    where u.id = p_auth_user_id
      and lower(u.email) = p_email
      and u."emailVerified" is true
      and coalesce(u.banned, false) = false
      and a."providerId" = 'google'
      and a."accountId" = p_google_sub
  ) then raise exception 'Identity mismatch' using errcode = '42501'; end if;
  if exists (
    select 1 from identity.members
    where auth_user_id = p_auth_user_id and google_sub <> p_google_sub
  ) then raise exception 'Identity mismatch' using errcode = '42501'; end if;
  insert into identity.members (auth_user_id, google_sub, email, full_name)
  values (p_auth_user_id, p_google_sub, p_email, coalesce(p_name, ''))
  on conflict (auth_user_id) do update
    set email = excluded.email, verified_at = now()
  returning id into saved_id;
  insert into cv.documents (member_id, draft, sharing)
  values (saved_id, p_draft, p_sharing)
  on conflict (member_id) do nothing;
  return saved_id;
end
$$;

revoke all on function identity.onboard_member(uuid,text,text,text,jsonb,jsonb) from public;

commit;
