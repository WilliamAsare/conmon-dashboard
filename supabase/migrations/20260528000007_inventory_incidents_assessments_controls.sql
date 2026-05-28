-- Migration: inventory_items, incidents, assessments, control mapping
-- Must run after migration 000006.

-- ============================================================
-- TABLE: inventory_items  (hardware + software)
-- ============================================================

create table inventory_items (
  id              uuid primary key default uuid_generate_v4(),
  system_id       uuid not null references systems(id)       on delete cascade,
  organization_id uuid not null references organizations(id) on delete restrict,
  item_type       text not null check (item_type in ('hardware', 'software')),
  name            text not null,
  vendor          text,
  version         text,
  -- hardware fields
  asset_tag       text,
  ip_address      text,
  mac_address     text,
  os_name         text,
  -- software fields
  cpe             text,   -- NIST Common Platform Enumeration identifier
  -- shared
  status          text not null default 'active'
                  check (status in ('active', 'inactive', 'decommissioned')),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table inventory_items enable row level security;

create policy "org members read inventory"
  on inventory_items for select
  using (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
  );

create policy "isso manage inventory"
  on inventory_items for all
  using (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
    and (
      select role from public.users where id = auth.uid()
    ) in ('admin', 'issm', 'isso', 'engineer')
  );

create trigger inventory_items_updated_at
  before update on inventory_items
  for each row execute function set_updated_at();

create trigger audit_inventory_items
  after insert or update or delete on inventory_items
  for each row execute function audit_log_trigger();

-- ============================================================
-- TABLE: incidents
-- ============================================================
-- FedRAMP requires reporting security incidents within 1 hour
-- of detection. The reported_within_sla column tracks compliance.

create table incidents (
  id                  uuid primary key default uuid_generate_v4(),
  system_id           uuid not null references systems(id)       on delete cascade,
  organization_id     uuid not null references organizations(id) on delete restrict,
  title               text not null,
  description         text not null,
  severity            text not null check (severity in ('high', 'moderate', 'low')),
  status              text not null default 'open'
                      check (status in ('open', 'investigating', 'contained', 'resolved', 'closed')),
  detected_at         timestamptz not null,
  reported_at         timestamptz not null default now(),
  contained_at        timestamptz,
  resolved_at         timestamptz,
  -- FedRAMP 1-hour reporting SLA
  reported_within_sla boolean generated always as (
    extract(epoch from (reported_at - detected_at)) / 3600.0 <= 1.0
  ) stored,
  affected_controls   text[] not null default '{}',
  reported_by         uuid references public.users(id) on delete set null,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table incidents enable row level security;

create policy "org members read incidents"
  on incidents for select
  using (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
  );

create policy "isso manage incidents"
  on incidents for all
  using (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
    and (
      select role from public.users where id = auth.uid()
    ) in ('admin', 'issm', 'isso')
  );

create trigger incidents_updated_at
  before update on incidents
  for each row execute function set_updated_at();

create trigger audit_incidents
  after insert or update or delete on incidents
  for each row execute function audit_log_trigger();

-- ============================================================
-- TABLE: assessments  (annual / significant-change / focused)
-- ============================================================

create table assessments (
  id               uuid primary key default uuid_generate_v4(),
  system_id        uuid not null references systems(id)       on delete cascade,
  organization_id  uuid not null references organizations(id) on delete restrict,
  assessment_type  text not null
                   check (assessment_type in ('annual', 'significant_change', 'focused')),
  assessor_name    text not null,
  status           text not null default 'planned'
                   check (status in ('planned', 'in_progress', 'completed', 'cancelled')),
  planned_start    date not null,
  planned_end      date not null,
  actual_start     date,
  actual_end       date,
  findings_count   integer not null default 0,
  report_url       text,
  notes            text,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint period_order check (planned_end >= planned_start)
);

alter table assessments enable row level security;

create policy "org members read assessments"
  on assessments for select
  using (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
  );

create policy "isso manage assessments"
  on assessments for all
  using (
    organization_id = (
      select organization_id from public.users where id = auth.uid()
    )
    and (
      select role from public.users where id = auth.uid()
    ) in ('admin', 'issm', 'isso')
  );

create trigger assessments_updated_at
  before update on assessments
  for each row execute function set_updated_at();

create trigger audit_assessments
  after insert or update or delete on assessments
  for each row execute function audit_log_trigger();

-- ============================================================
-- NIST 800-53 control mapping
-- ============================================================
-- Add control_ids to both findings and poam_items so findings and
-- weaknesses can be linked to specific NIST 800-53 Rev 5 controls.

alter table findings   add column control_ids text[] not null default '{}';
alter table poam_items add column control_ids text[] not null default '{}';

-- ============================================================
-- Indexes
-- ============================================================

create index on inventory_items (system_id);
create index on inventory_items (organization_id);
create index on inventory_items (item_type);
create index on incidents (organization_id);
create index on incidents (system_id);
create index on incidents (status);
create index on assessments (organization_id);
create index on assessments (system_id);
create index on assessments (status);
