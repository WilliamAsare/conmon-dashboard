-- Migration: organizations, users, systems
-- RLS is enabled and policies are defined in this same file.
-- Do not edit this migration after it has been committed.
--
-- ORDERING NOTE: All tables are created first, then RLS policies are added.
-- Postgres validates policy expressions at CREATE POLICY time, so any policy
-- that references another table requires that table to already exist.

-- ============================================================
-- EXTENSIONS
-- ============================================================

create extension if not exists "uuid-ossp";

-- ============================================================
-- TYPES
-- ============================================================

create type user_role as enum ('admin', 'issm', 'isso', 'engineer', 'auditor');
create type fedramp_level as enum ('Low', 'Moderate', 'High');
create type system_status as enum ('active', 'sunset');

-- ============================================================
-- TABLE: organizations
-- ============================================================

create table organizations (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  created_at  timestamptz not null default now()
);

alter table organizations enable row level security;

-- ============================================================
-- TABLE: users  (extends auth.users)
-- ============================================================

create table public.users (
  id               uuid primary key references auth.users(id) on delete cascade,
  organization_id  uuid not null references organizations(id) on delete restrict,
  role             user_role not null default 'isso',
  full_name        text not null,
  created_at       timestamptz not null default now()
);

alter table public.users enable row level security;

-- ============================================================
-- TABLE: systems
-- ============================================================

create table systems (
  id                  uuid primary key default uuid_generate_v4(),
  organization_id     uuid not null references organizations(id) on delete restrict,
  name                text not null,
  short_code          text not null,
  fedramp_level       fedramp_level not null,
  authorization_date  date,
  ato_expiration      date,
  agency_sponsor      text,
  status              system_status not null default 'active',
  -- Sequence counter for POA&M numbering. Incremented by a database function.
  poam_sequence       integer not null default 0,
  created_at          timestamptz not null default now(),

  -- Short codes must be unique within an organization.
  unique (organization_id, short_code),

  constraint short_code_format check (
    short_code ~ '^[A-Z0-9]{2,10}$'
  )
);

alter table systems enable row level security;

-- ============================================================
-- RLS POLICIES: organizations
-- (defined after public.users exists so the subquery is valid)
-- ============================================================

-- Users may only read organizations they belong to.
create policy "users read own org"
  on organizations for select
  using (
    id in (
      select organization_id from public.users where id = auth.uid()
    )
  );

-- Organization creation is handled by the auth trigger (security definer).
-- No direct client INSERT is permitted.

-- ============================================================
-- RLS POLICIES: users
-- ============================================================

-- Users can read profiles in their own org.
create policy "users read own org members"
  on public.users for select
  using (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
  );

-- Users can update their own profile.
create policy "users update own profile"
  on public.users for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================
-- RLS POLICIES: systems
-- ============================================================

create policy "users read org systems"
  on systems for select
  using (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
  );

create policy "admin issm isso insert system"
  on systems for insert
  with check (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
    and (
      select role from public.users where id = auth.uid()
    ) in ('admin', 'issm', 'isso')
  );

create policy "admin issm update system"
  on systems for update
  using (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
    and (
      select role from public.users where id = auth.uid()
    ) in ('admin', 'issm')
  );

-- ============================================================
-- Helper: next POA&M sequence number (atomic increment)
-- ============================================================

create or replace function next_poam_sequence(p_system_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_next integer;
begin
  update systems
  set poam_sequence = poam_sequence + 1
  where id = p_system_id
  returning poam_sequence into v_next;

  if not found then
    raise exception 'System % not found', p_system_id;
  end if;

  return v_next;
end;
$$;

-- ============================================================
-- Indexes
-- ============================================================

create index on systems (organization_id);
create index on public.users (organization_id);
