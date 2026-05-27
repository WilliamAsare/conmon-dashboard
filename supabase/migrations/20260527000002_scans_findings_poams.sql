-- Migration: scans, findings, poam_items
-- RLS enabled on all tables in this file.

-- ============================================================
-- TYPES
-- ============================================================

create type scan_type as enum ('os', 'webapp', 'database');

create type severity_level as enum ('high', 'moderate', 'low', 'informational');

create type finding_status as enum (
  'open',
  'remediated',
  'deviation_pending',
  'deviation_approved',
  'risk_accepted'
);

create type poam_source as enum ('scan', 'assessment', 'self_identified');

create type poam_status as enum (
  'open',
  'ongoing',
  'completed',
  'risk_accepted'
);

-- ============================================================
-- scans
-- ============================================================

create table scans (
  id              uuid primary key default uuid_generate_v4(),
  system_id       uuid not null references systems(id) on delete restrict,
  scan_type       scan_type not null,
  scanner_name    text not null,
  scan_date       date not null,
  total_findings  integer not null default 0,
  uploaded_by     uuid not null references public.users(id) on delete restrict,
  raw_file_url    text,
  created_at      timestamptz not null default now()
);

alter table scans enable row level security;

-- Read: any org member may read scans for their org's systems.
create policy "org members read scans"
  on scans for select
  using (
    system_id in (
      select id from systems
      where organization_id = (
        select organization_id from public.users where id = auth.uid()
      )
    )
  );

-- Insert: admin, issm, isso, engineer may upload scans.
create policy "uploaders insert scans"
  on scans for insert
  with check (
    system_id in (
      select id from systems
      where organization_id = (
        select organization_id from public.users where id = auth.uid()
      )
    )
    and (
      select role from public.users where id = auth.uid()
    ) in ('admin', 'issm', 'isso', 'engineer')
  );

-- ============================================================
-- findings
-- ============================================================

create table findings (
  id              uuid primary key default uuid_generate_v4(),
  scan_id         uuid not null references scans(id) on delete restrict,
  system_id       uuid not null references systems(id) on delete restrict,
  plugin_id       text not null,
  title           text not null,
  description     text,
  cvss_score      numeric(4,1),
  severity        severity_level not null,
  affected_asset  text not null,
  first_detected  date not null,
  last_detected   date not null,
  status          finding_status not null default 'open',
  created_at      timestamptz not null default now(),

  constraint cvss_range check (cvss_score is null or (cvss_score >= 0 and cvss_score <= 10))
);

alter table findings enable row level security;

create policy "org members read findings"
  on findings for select
  using (
    system_id in (
      select id from systems
      where organization_id = (
        select organization_id from public.users where id = auth.uid()
      )
    )
  );

create policy "uploaders insert findings"
  on findings for insert
  with check (
    system_id in (
      select id from systems
      where organization_id = (
        select organization_id from public.users where id = auth.uid()
      )
    )
    and (
      select role from public.users where id = auth.uid()
    ) in ('admin', 'issm', 'isso', 'engineer')
  );

-- Status updates by isso/issm/admin only.
create policy "isso update finding status"
  on findings for update
  using (
    system_id in (
      select id from systems
      where organization_id = (
        select organization_id from public.users where id = auth.uid()
      )
    )
    and (
      select role from public.users where id = auth.uid()
    ) in ('admin', 'issm', 'isso')
  );

-- ============================================================
-- poam_items
-- ============================================================

create table poam_items (
  id                    uuid primary key default uuid_generate_v4(),
  system_id             uuid not null references systems(id) on delete restrict,
  -- finding_id is nullable for non-scan-sourced POA&Ms (e.g., assessment findings).
  finding_id            uuid references findings(id) on delete set null,
  poam_number           text not null,
  weakness_description  text not null,
  source                poam_source not null default 'scan',
  severity              severity_level not null,
  identified_date       date not null,
  scheduled_completion  date not null,
  actual_completion     date,
  status                poam_status not null default 'open',
  -- JSON array of milestone objects: { date, description, completed }
  milestones            jsonb not null default '[]'::jsonb,
  point_of_contact      text,
  resources_required    text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- POA&M numbers are unique within a system.
  unique (system_id, poam_number),

  -- A finding can only have one POA&M.
  unique (finding_id)
);

alter table poam_items enable row level security;

create policy "org members read poams"
  on poam_items for select
  using (
    system_id in (
      select id from systems
      where organization_id = (
        select organization_id from public.users where id = auth.uid()
      )
    )
  );

create policy "isso insert poams"
  on poam_items for insert
  with check (
    system_id in (
      select id from systems
      where organization_id = (
        select organization_id from public.users where id = auth.uid()
      )
    )
    and (
      select role from public.users where id = auth.uid()
    ) in ('admin', 'issm', 'isso')
  );

create policy "isso update poams"
  on poam_items for update
  using (
    system_id in (
      select id from systems
      where organization_id = (
        select organization_id from public.users where id = auth.uid()
      )
    )
    and (
      select role from public.users where id = auth.uid()
    ) in ('admin', 'issm', 'isso')
  );

-- ============================================================
-- Auto-update poam_items.updated_at on every row change
-- ============================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger poam_items_updated_at
  before update on poam_items
  for each row execute function set_updated_at();

-- ============================================================
-- Function: auto-create a POA&M from a finding
-- Called by the scan ingestion server action (service role).
-- ============================================================

create or replace function create_poam_from_finding(
  p_finding_id    uuid,
  p_system_id     uuid,
  p_weakness      text,
  p_severity      severity_level,
  p_identified    date
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_sequence    integer;
  v_short_code  text;
  v_poam_number text;
  v_sla_days    integer;
  v_deadline    date;
  v_poam_id     uuid;
begin
  -- Determine SLA days from severity.
  v_sla_days := case p_severity
    when 'high'          then 30
    when 'moderate'      then 90
    when 'low'           then 180
    else null
  end;

  if v_sla_days is null then
    -- Informational findings do not get POA&Ms.
    return null;
  end if;

  v_deadline := p_identified + v_sla_days;

  -- Get and increment the system's POA&M sequence.
  v_sequence := next_poam_sequence(p_system_id);

  -- Get the system short code.
  select short_code into v_short_code from systems where id = p_system_id;

  v_poam_number := 'V-' || v_short_code || '-' || lpad(v_sequence::text, 4, '0');

  insert into poam_items (
    system_id,
    finding_id,
    poam_number,
    weakness_description,
    source,
    severity,
    identified_date,
    scheduled_completion,
    status
  ) values (
    p_system_id,
    p_finding_id,
    v_poam_number,
    p_weakness,
    'scan',
    p_severity,
    p_identified,
    v_deadline,
    'open'
  )
  returning id into v_poam_id;

  return v_poam_id;
end;
$$;

-- ============================================================
-- Indexes
-- ============================================================

create index on scans (system_id);
create index on scans (scan_date);
create index on findings (system_id);
create index on findings (scan_id);
create index on findings (plugin_id, affected_asset);
create index on findings (status);
create index on poam_items (system_id);
create index on poam_items (status);
create index on poam_items (scheduled_completion);
create index on poam_items (finding_id);
