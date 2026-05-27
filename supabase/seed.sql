-- Seed: one organization, one Moderate system, three users.
-- Run with: supabase db seed  (or psql against local Supabase)
--
-- Auth users are created separately via the Supabase Auth API or
-- the local Studio UI. The UUIDs below must match auth.users.id.
--
-- For local development, use these pre-set UUIDs and create the
-- matching auth users in the local Studio (http://localhost:54323).

begin;

-- Fixed UUIDs for reproducible local dev.
do $$
declare
  v_org_id      uuid := 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  v_system_id   uuid := 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
  v_admin_id    uuid := 'c3d4e5f6-a7b8-9012-cdef-123456789012';
  v_isso_id     uuid := 'd4e5f6a7-b8c9-0123-def0-234567890123';
  v_auditor_id  uuid := 'e5f6a7b8-c9d0-1234-ef01-345678901234';
begin

  -- Organization
  insert into organizations (id, name)
  values (v_org_id, 'Acme Cloud Services')
  on conflict (id) do nothing;

  -- Users (auth.users rows must exist first — create in local Studio)
  insert into public.users (id, organization_id, role, full_name)
  values
    (v_admin_id,   v_org_id, 'admin',   'Alex Rivera'),
    (v_isso_id,    v_org_id, 'isso',    'Jordan Kim'),
    (v_auditor_id, v_org_id, 'auditor', 'Taylor Osei')
  on conflict (id) do nothing;

  -- System
  insert into systems (
    id, organization_id, name, short_code, fedramp_level,
    authorization_date, ato_expiration, agency_sponsor, status
  ) values (
    v_system_id,
    v_org_id,
    'Acme SaaS Platform',
    'ACME',
    'Moderate',
    '2024-03-15',
    '2027-03-15',
    'Department of Commerce',
    'active'
  )
  on conflict (id) do nothing;

end $$;

commit;
