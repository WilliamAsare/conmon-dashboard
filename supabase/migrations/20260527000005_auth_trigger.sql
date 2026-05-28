-- Migration: auth trigger
-- When a new auth.users row is created, create the Organization and
-- public.users profile using the metadata passed during sign-up.
--
-- Runs security definer so it can bypass RLS for initial org + user creation.
-- Errors are raised so they appear in Supabase logs rather than failing silently.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id   uuid;
  v_org_name text;
begin
  -- The metadata was set during auth.signUp({ options: { data: { ... } } }).
  v_org_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'organization_name'), ''),
    split_part(new.email, '@', 2)  -- fallback: use email domain as org name
  );

  -- Check if this user already has a profile (idempotent guard for re-runs).
  if exists (select 1 from public.users where id = new.id) then
    return new;
  end if;

  -- Create a new organization for this user.
  insert into organizations (name)
  values (v_org_name)
  returning id into v_org_id;

  -- Create the profile. First user of a new org is always admin.
  insert into public.users (id, organization_id, role, full_name)
  values (
    new.id,
    v_org_id,
    'admin',
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
      split_part(new.email, '@', 1)
    )
  );

  return new;

exception
  when others then
    -- Log the error so it appears in Supabase logs, then re-raise so the
    -- auth insert does not silently succeed while the profile is missing.
    raise exception 'handle_new_user failed for user %: % %',
      new.id, sqlerrm, sqlstate;
end;
$$;

-- Drop and recreate the trigger to pick up the updated function.
drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
