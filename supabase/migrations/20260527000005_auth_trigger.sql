-- Migration: auth trigger
-- When a new auth.users row is confirmed, create the Organization and
-- public.users profile using the metadata passed during sign-up.
--
-- This runs security definer (as the migration owner) so it can bypass RLS
-- for the initial org + user creation.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id   uuid;
  v_org_name text;
  v_role     user_role;
begin
  -- The metadata was set during auth.signUp({ options: { data: { ... } } }).
  v_org_name := coalesce(
    new.raw_user_meta_data->>'organization_name',
    split_part(new.email, '@', 2)  -- fallback: use email domain
  );

  -- Check if an organization with this name already exists for an invite flow.
  -- For sign-ups creating a new org, we always insert a fresh one.
  -- (Invite flows are handled separately via invite_user action.)
  insert into organizations (name)
  values (v_org_name)
  returning id into v_org_id;

  -- First user in a new org is always admin.
  v_role := 'admin';

  insert into public.users (id, organization_id, role, full_name)
  values (
    new.id,
    v_org_id,
    v_role,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );

  return new;
end;
$$;

-- Fire after email is confirmed (or immediately if confirmation is disabled).
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
