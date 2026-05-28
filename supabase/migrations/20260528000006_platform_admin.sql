-- Migration: platform administration
-- Adds platform_admins table, cron_runs audit log, and org suspension.
-- Must run after migration 000005.

-- ============================================================
-- TABLE: platform_admins
-- ============================================================
-- Rows are inserted manually by the operator (Supabase dashboard or psql).
-- No SELECT RLS policy → readable only via the service role key.

create table platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid           references auth.users(id) on delete set null
);

alter table platform_admins enable row level security;

-- ============================================================
-- TABLE: cron_runs
-- ============================================================
-- Append-only log written by cron routes via service role.
-- No SELECT policy — platform admin UI reads via service role only.

create table cron_runs (
  id            uuid primary key default uuid_generate_v4(),
  cron_name     text        not null,             -- 'sla' | 'notify'
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text        not null default 'ok'
                check (status in ('ok', 'error')),
  result        jsonb,                             -- e.g. { notificationsCreated: 5 }
  error_message text
);

alter table cron_runs enable row level security;

-- ============================================================
-- TABLE: share_tokens  (client portal — referenced later)
-- ============================================================
-- Seeded here so the foreign-key chain is in place when migration 000007 runs.

create table share_tokens (
  id           uuid primary key default uuid_generate_v4(),
  system_id    uuid        not null references systems(id) on delete cascade,
  org_id       uuid        not null references organizations(id) on delete cascade,
  token        text        not null unique,
  label        text        not null default '',
  expires_at   timestamptz,
  created_by   uuid        references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);

alter table share_tokens enable row level security;

-- Org members can read their own tokens
create policy "org members read share tokens"
  on share_tokens for select
  using (
    org_id = (
      select organization_id from public.users where id = auth.uid()
    )
  );

-- Only admin/issm can manage tokens
create policy "admin issm manage share tokens"
  on share_tokens for all
  using (
    org_id = (
      select organization_id from public.users where id = auth.uid()
    )
    and (
      select role from public.users where id = auth.uid()
    ) in ('admin', 'issm')
  );

create index on share_tokens (token);
create index on share_tokens (system_id);

-- ============================================================
-- Organization suspension
-- ============================================================

alter table organizations
  add column status text not null default 'active'
  check (status in ('active', 'suspended'));

-- Rebuild the org read policy to exclude suspended orgs so their
-- users cannot reach the dashboard while suspended.
drop policy "users read own org" on organizations;

create policy "users read own org"
  on organizations for select
  using (
    status = 'active'
    and id in (
      select organization_id from public.users where id = auth.uid()
    )
  );

-- ============================================================
-- Indexes
-- ============================================================

create index on cron_runs (cron_name, started_at desc);
