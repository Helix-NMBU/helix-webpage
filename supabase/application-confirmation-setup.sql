-- Confirmation-email support — run once in the Supabase SQL editor,
-- after applications-setup.sql.
--
-- The anon key can't read public.applications (by design), so the
-- /api/apply-confirmation endpoint uses this security-definer function to
-- check that an application with the given id + email actually exists
-- before sending the "takk for din søknad" email. Without this check the
-- endpoint would be an open relay for sending the template to any address.
-- It returns the position title (null when no match) so the email's
-- {{{POSITION}}} variable comes from the database rather than the request.

-- Earlier revision of this file created a boolean-returning check.
drop function if exists public.application_exists(uuid, text);

create or replace function public.application_position(p_id uuid, p_email text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select position_title
  from public.applications
  where id = p_id
    and lower(email) = lower(p_email);
$$;

revoke all on function public.application_position(uuid, text) from public;
grant execute on function public.application_position(uuid, text) to anon, authenticated;
