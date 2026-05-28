-- Migration 8: pg_cron scheduling, evidence storage, full-text search
-- Run in Supabase SQL Editor.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. pg_cron: schedule SLA recalculation directly in the database
--    Falls back silently if pg_cron is not available on the current plan.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- Remove any old schedule first (idempotent)
  PERFORM cron.unschedule('conmon-sla-recalc');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.schedule(
    'conmon-sla-recalc',
    '30 0 * * *',  -- 00:30 UTC daily, same as previous GitHub Actions schedule
    $job$
      INSERT INTO cron_runs (cron_name, started_at, status)
      VALUES ('sla', now(), 'ok');
      SELECT recalculate_sla();
    $job$
  );
EXCEPTION WHEN OTHERS THEN
  -- pg_cron not available on this plan; cron remains handled by GitHub Actions.
  RAISE NOTICE 'pg_cron not available: %', SQLERRM;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Supabase Storage: evidence-files bucket
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'evidence-files',
  'evidence-files',
  false,
  10485760,  -- 10 MB per file
  NULL       -- all mime types allowed
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: authenticated users in the right org can read/write
-- Path convention: {org_id}/{entity_type}/{entity_id}/{filename}
CREATE POLICY "evidence read own org" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'evidence-files'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "evidence insert own org" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'evidence-files'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM users WHERE id = auth.uid()
    )
  );

CREATE POLICY "evidence delete own org" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'evidence-files'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = (
      SELECT organization_id::text FROM users WHERE id = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. evidence_files: metadata table for uploaded evidence artifacts
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evidence_files (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type     text NOT NULL CHECK (entity_type IN ('poam_item', 'assessment', 'incident')),
  entity_id       uuid NOT NULL,
  file_name       text NOT NULL,
  file_path       text NOT NULL,  -- path in storage bucket
  file_size       bigint,
  mime_type       text,
  uploaded_by     uuid REFERENCES users(id),
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE evidence_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "evidence_files read own org" ON evidence_files
  FOR SELECT USING (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "evidence_files insert own org" ON evidence_files
  FOR INSERT WITH CHECK (
    organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "evidence_files delete issm" ON evidence_files
  FOR DELETE USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'issm', 'isso')
    AND organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
  );

-- Audit trigger for evidence_files
DROP TRIGGER IF EXISTS evidence_files_audit ON evidence_files;
CREATE TRIGGER evidence_files_audit
  AFTER INSERT OR UPDATE OR DELETE ON evidence_files
  FOR EACH ROW EXECUTE FUNCTION audit_log_trigger();


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Full-text search: tsvector columns + GIN indexes
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE findings
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(title,          '') || ' ' ||
      coalesce(description,    '') || ' ' ||
      coalesce(affected_asset, '') || ' ' ||
      coalesce(plugin_id,      '')
    )
  ) STORED;

ALTER TABLE poam_items
  ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(weakness_description, '') || ' ' ||
      coalesce(poam_number,          '') || ' ' ||
      coalesce(point_of_contact,     '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS findings_fts_idx    ON findings    USING GIN(fts);
CREATE INDEX IF NOT EXISTS poam_items_fts_idx  ON poam_items  USING GIN(fts);


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Add missing control_ids to poam_items (if not already added by migration 7)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE poam_items
  ADD COLUMN IF NOT EXISTS control_ids text[] NOT NULL DEFAULT '{}';
