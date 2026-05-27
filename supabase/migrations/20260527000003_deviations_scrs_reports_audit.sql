-- Migration: deviation_requests, scrs, conmon_reports, audit_log, notifications
-- RLS enabled on all tables in this file.

-- ============================================================
-- TYPES
-- ============================================================

create type deviation_type as enum ('RA', 'FP', 'OR');

create type deviation_status as enum (
  'draft',
  'submitted',
  'approved',
  'rejected'
);

create type scr_status as enum (
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'withdrawn'
);

-- ============================================================
-- deviation_requests
-- ============================================================

create table deviation_requests (
  id               uuid primary key default uuid_generate_v4(),
  -- organization_id is denormalized here for efficient RLS without a join.
  organization_id  uuid not null references organizations(id) on delete restrict,
  poam_id          uuid not null references poam_items(id) on delete restrict,
  deviation_type   deviation_type not null,
  -- Justification stored as JSONB; shape validated at the application layer via Zod.
  justification    jsonb not null,
  evidence_file_url text,
  requested_by     uuid not null references public.users(id) on delete restrict,
  requested_date   timestamptz not null default now(),
  status           deviation_status not null default 'draft',
  reviewer_id      uuid references public.users(id) on delete set null,
  review_date      timestamptz,
  review_notes     text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table deviation_requests enable row level security;

create policy "org members read deviations"
  on deviation_requests for select
  using (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
  );

create policy "isso insert deviation"
  on deviation_requests for insert
  with check (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
    and (
      select role from public.users where id = auth.uid()
    ) in ('admin', 'issm', 'isso')
    and requested_by = auth.uid()
  );

-- Submitter may update their own draft deviations.
create policy "requester update own draft"
  on deviation_requests for update
  using (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
    and (
      -- Submitter can edit drafts.
      (requested_by = auth.uid() and status = 'draft')
      -- Reviewer (issm/admin) can approve or reject submitted deviations.
      or (
        (select role from public.users where id = auth.uid()) in ('admin', 'issm')
        and status = 'submitted'
      )
    )
  );

create trigger deviation_requests_updated_at
  before update on deviation_requests
  for each row execute function set_updated_at();

-- ============================================================
-- scrs (Significant Change Requests)
-- ============================================================

create table scrs (
  id                 uuid primary key default uuid_generate_v4(),
  organization_id    uuid not null references organizations(id) on delete restrict,
  system_id          uuid not null references systems(id) on delete restrict,
  title              text not null,
  description        text not null,
  change_type        text not null,
  controls_impacted  text[] not null default '{}',
  submitted_date     timestamptz,
  status             scr_status not null default 'draft',
  approval_date      timestamptz,
  created_by         uuid not null references public.users(id) on delete restrict,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table scrs enable row level security;

create policy "org members read scrs"
  on scrs for select
  using (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
  );

create policy "isso insert scrs"
  on scrs for insert
  with check (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
    and (
      select role from public.users where id = auth.uid()
    ) in ('admin', 'issm', 'isso')
  );

create policy "isso update scrs"
  on scrs for update
  using (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
    and (
      select role from public.users where id = auth.uid()
    ) in ('admin', 'issm', 'isso')
  );

create trigger scrs_updated_at
  before update on scrs
  for each row execute function set_updated_at();

-- ============================================================
-- conmon_reports
-- ============================================================

create table conmon_reports (
  id                     uuid primary key default uuid_generate_v4(),
  organization_id        uuid not null references organizations(id) on delete restrict,
  system_id              uuid not null references systems(id) on delete restrict,
  reporting_period_start date not null,
  reporting_period_end   date not null,
  report_file_url        text,
  generated_at           timestamptz not null default now(),
  generated_by           uuid not null references public.users(id) on delete restrict,

  constraint period_order check (reporting_period_end >= reporting_period_start)
);

alter table conmon_reports enable row level security;

create policy "org members read reports"
  on conmon_reports for select
  using (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
  );

create policy "isso insert reports"
  on conmon_reports for insert
  with check (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
    and (
      select role from public.users where id = auth.uid()
    ) in ('admin', 'issm', 'isso')
  );

-- ============================================================
-- audit_log
-- Append-only. No UPDATE or DELETE ever. Enforced by RLS.
-- Written by Postgres triggers, not the application layer.
-- ============================================================

create table audit_log (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete restrict,
  user_id          uuid references public.users(id) on delete set null,
  action           text not null,        -- e.g. 'INSERT', 'UPDATE', 'DELETE'
  entity_type      text not null,        -- table name
  entity_id        uuid not null,
  -- JSON diff: { before: {...}, after: {...} } for updates; full record for inserts.
  diff             jsonb,
  created_at       timestamptz not null default now()
);

alter table audit_log enable row level security;

-- All org members can read the audit log (auditor role has read-only access everywhere).
create policy "org members read audit log"
  on audit_log for select
  using (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
  );

-- No INSERT from the client — only the trigger function (security definer) writes here.
-- No UPDATE or DELETE ever.
create policy "deny direct insert audit log"
  on audit_log for insert
  with check (false);

-- ============================================================
-- notifications
-- ============================================================

create type notification_type as enum (
  'sla_warning',     -- POA&M entering 7-day window
  'sla_overdue',     -- POA&M past SLA deadline
  'deviation_submitted',
  'deviation_reviewed',
  'scan_uploaded'
);

create table notifications (
  id               uuid primary key default uuid_generate_v4(),
  organization_id  uuid not null references organizations(id) on delete restrict,
  user_id          uuid not null references public.users(id) on delete cascade,
  type             notification_type not null,
  title            text not null,
  body             text not null,
  entity_type      text,
  entity_id        uuid,
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);

alter table notifications enable row level security;

-- Users can only see their own notifications.
create policy "users read own notifications"
  on notifications for select
  using (user_id = auth.uid());

-- Only the SLA edge function (service role) inserts notifications.
-- Application code uses the service role key server-side only.
create policy "deny client insert notifications"
  on notifications for insert
  with check (false);

-- Users can mark their own notifications read.
create policy "users update own notifications"
  on notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- Audit trigger helper: write an audit log entry
-- ============================================================

create or replace function audit_log_trigger()
returns trigger
language plpgsql
security definer
as $$
declare
  v_organization_id uuid;
  v_entity_id       uuid;
  v_diff            jsonb;
  v_user_id         uuid;
begin
  v_user_id := auth.uid();

  if tg_op = 'INSERT' then
    v_entity_id := new.id;
    -- Try to get organization_id from the new row directly or via system_id.
    v_organization_id := coalesce(
      (new::jsonb->>'organization_id')::uuid,
      (select organization_id from systems where id = (new::jsonb->>'system_id')::uuid)
    );
    v_diff := jsonb_build_object('after', to_jsonb(new));

  elsif tg_op = 'UPDATE' then
    v_entity_id := new.id;
    v_organization_id := coalesce(
      (new::jsonb->>'organization_id')::uuid,
      (select organization_id from systems where id = (new::jsonb->>'system_id')::uuid)
    );
    v_diff := jsonb_build_object(
      'before', to_jsonb(old),
      'after',  to_jsonb(new)
    );

  elsif tg_op = 'DELETE' then
    v_entity_id := old.id;
    v_organization_id := coalesce(
      (old::jsonb->>'organization_id')::uuid,
      (select organization_id from systems where id = (old::jsonb->>'system_id')::uuid)
    );
    v_diff := jsonb_build_object('before', to_jsonb(old));
  end if;

  if v_organization_id is not null then
    insert into audit_log (
      organization_id, user_id, action, entity_type, entity_id, diff
    ) values (
      v_organization_id, v_user_id, tg_op, tg_table_name, v_entity_id, v_diff
    );
  end if;

  return coalesce(new, old);
end;
$$;

-- Attach audit triggers to all business tables.
create trigger audit_poam_items
  after insert or update or delete on poam_items
  for each row execute function audit_log_trigger();

create trigger audit_findings
  after insert or update or delete on findings
  for each row execute function audit_log_trigger();

create trigger audit_deviation_requests
  after insert or update or delete on deviation_requests
  for each row execute function audit_log_trigger();

create trigger audit_scrs
  after insert or update or delete on scrs
  for each row execute function audit_log_trigger();

create trigger audit_scans
  after insert or update or delete on scans
  for each row execute function audit_log_trigger();

create trigger audit_conmon_reports
  after insert or update or delete on conmon_reports
  for each row execute function audit_log_trigger();

-- ============================================================
-- Indexes
-- ============================================================

create index on deviation_requests (organization_id);
create index on deviation_requests (poam_id);
create index on deviation_requests (status);
create index on scrs (organization_id);
create index on scrs (system_id);
create index on conmon_reports (system_id);
create index on audit_log (organization_id);
create index on audit_log (entity_type, entity_id);
create index on audit_log (created_at desc);
create index on notifications (user_id);
create index on notifications (read_at) where read_at is null;
