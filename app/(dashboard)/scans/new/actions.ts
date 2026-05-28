"use server";

/**
 * Scan ingestion server action.
 *
 * Accepts a raw scan file upload (Nessus XML or Qualys CSV), parses it,
 * deduplicates findings against existing open findings for the system,
 * and auto-creates POA&M items for new non-informational findings.
 *
 * Deduplication key: (system_id, plugin_id, affected_asset)
 *   - Match found → update last_detected, link finding to new scan
 *   - No match    → insert new finding, then create POA&M via DB function
 *
 * NOTE: All query results use `as unknown as T` casts because the placeholder
 * types/supabase.ts lacks Relationships needed for Supabase select-string
 * type inference. Casts are removed once `supabase gen types` runs.
 */

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseNessus } from "@/lib/parsers/nessus";
import { parseQualys } from "@/lib/parsers/qualys";
import type { ParsedFinding } from "@/lib/parsers/types";
import type { Database } from "@/types/supabase";

export type IngestState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "success"; scanId: string; newFindings: number; updatedFindings: number; poamsCreated: number; warnings: string[] };

/** Maximum file size: 50 MB */
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Local row types
type UserRow = Pick<Database["public"]["Tables"]["users"]["Row"], "id" | "role" | "organization_id">;
type SystemRow = Pick<Database["public"]["Tables"]["systems"]["Row"], "id" | "name" | "short_code">;
type ScanInsertResult = Pick<Database["public"]["Tables"]["scans"]["Row"], "id">;
type FindingInsertResult = Pick<Database["public"]["Tables"]["findings"]["Row"], "id">;
type ExistingFinding = Pick<Database["public"]["Tables"]["findings"]["Row"], "id" | "plugin_id" | "affected_asset" | "first_detected" | "status">;

/**
 * Detect the scanner format from the file content.
 * Returns "nessus", "qualys", or null if unrecognized.
 */
function detectFormat(content: string, filename: string): "nessus" | "qualys" | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".nessus") || (content.trimStart().startsWith("<?xml") && content.includes("NessusClientData_v2"))) {
    return "nessus";
  }
  if (lower.endsWith(".csv") || content.includes("QID") || content.includes("CVSS3 Base")) {
    return "qualys";
  }
  if (content.includes("NessusClientData_v2")) return "nessus";
  return null;
}

export async function ingestScan(
  _prev: IngestState,
  formData: FormData
): Promise<IngestState> {
  // ── 1. Auth check ────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users")
    .select("id, role, organization_id")
    .eq("id", user.id)
    .single();

  const profile = profileRaw as unknown as UserRow | null;

  if (!profile) redirect("/login");
  if (!["admin", "issm", "isso", "engineer"].includes(profile.role)) {
    return { status: "error", message: "You do not have permission to upload scans." };
  }

  // ── 2. Validate form inputs ───────────────────────────────────────────────
  const systemId = formData.get("system_id");
  const scanType = formData.get("scan_type");
  const file = formData.get("file");

  if (!systemId || typeof systemId !== "string") {
    return { status: "error", message: "System is required." };
  }
  if (!scanType || !["os", "webapp", "database"].includes(scanType as string)) {
    return { status: "error", message: "Scan type must be one of: os, webapp, database." };
  }
  if (!file || !(file instanceof File)) {
    return { status: "error", message: "A scan file is required." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { status: "error", message: "File exceeds the 50 MB limit." };
  }

  // ── 3. Verify system belongs to this organization ─────────────────────────
  const { data: systemRaw, error: sysError } = await supabase
    .from("systems")
    .select("id, name, short_code")
    .eq("id", systemId)
    .eq("organization_id", profile.organization_id)
    .single();

  const system = systemRaw as unknown as SystemRow | null;

  if (sysError || !system) {
    return { status: "error", message: "System not found or you do not have access." };
  }

  // ── 4. Read and parse file ────────────────────────────────────────────────
  let content: string;
  try {
    content = await file.text();
  } catch {
    return { status: "error", message: "Could not read the uploaded file." };
  }

  const format = detectFormat(content, file.name);
  if (!format) {
    return {
      status: "error",
      message: "Unrecognized file format. Upload a .nessus file (Nessus v2 XML) or a .csv file (Qualys VMDR export).",
    };
  }

  let parseResult;
  try {
    parseResult = format === "nessus"
      ? parseNessus(content)
      : parseQualys(content);
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Failed to parse scan file.",
    };
  }

  const { findings, scanner_name, scan_date, warnings } = parseResult;

  // ── 5. Use service client for write operations ────────────────────────────
  // createServiceClient is synchronous (no cookies needed for service role)
  const svc = createServiceClient();

  // ── 6. Create scan record ─────────────────────────────────────────────────
  const { data: scanRaw, error: scanInsertError } = await svc
    .from("scans")
    .insert({
      system_id: systemId,
      scan_type: scanType as "os" | "webapp" | "database",
      scanner_name,
      scan_date,
      total_findings: 0,
      uploaded_by: user.id,
    } as Database["public"]["Tables"]["scans"]["Insert"])
    .select("id")
    .single();

  const scan = scanRaw as unknown as ScanInsertResult | null;

  if (scanInsertError || !scan) {
    return { status: "error", message: "Failed to create scan record: " + (scanInsertError?.message ?? "unknown error") };
  }

  const scanId = scan.id;

  // ── 7. Load existing open findings for deduplication ─────────────────────
  const { data: existingRaw } = await svc
    .from("findings")
    .select("id, plugin_id, affected_asset, first_detected, status")
    .eq("system_id", systemId)
    .in("status", ["open", "deviation_pending", "deviation_approved", "risk_accepted"]);

  const existingFindings = (existingRaw as unknown as ExistingFinding[] | null) ?? [];
  const existingMap = new Map<string, ExistingFinding>();
  for (const ef of existingFindings) {
    existingMap.set(`${ef.plugin_id}|${ef.affected_asset}`, ef);
  }

  // ── 8. Upsert findings & create POA&Ms ────────────────────────────────────
  let newFindings = 0;
  let updatedFindings = 0;
  let poamsCreated = 0;

  for (const finding of findings) {
    const dedupeKey = `${finding.plugin_id}|${finding.affected_asset}`;
    const existing = existingMap.get(dedupeKey);

    if (existing) {
      // ── Recurring finding: update last_detected and scan_id ───────────────
      await svc
        .from("findings")
        .update({
          scan_id: scanId,
          last_detected: finding.last_detected,
          ...(finding.first_detected < existing.first_detected
            ? { first_detected: finding.first_detected }
            : {}),
        } as Database["public"]["Tables"]["findings"]["Update"])
        .eq("id", existing.id);
      updatedFindings++;
    } else {
      // ── New finding: insert + auto-create POA&M ───────────────────────────
      const { data: insertedRaw } = await svc
        .from("findings")
        .insert({
          scan_id: scanId,
          system_id: systemId,
          plugin_id: finding.plugin_id,
          title: finding.title,
          description: finding.description || null,
          cvss_score: finding.cvss_score,
          severity: finding.severity,
          affected_asset: finding.affected_asset,
          first_detected: finding.first_detected,
          last_detected: finding.last_detected,
          status: "open",
        } as Database["public"]["Tables"]["findings"]["Insert"])
        .select("id")
        .single();

      const inserted = insertedRaw as unknown as FindingInsertResult | null;

      if (inserted) {
        newFindings++;

        // Auto-create POA&M for non-informational findings.
        // The DB function create_poam_from_finding handles SLA deadline
        // computation and POA&M number generation.
        if (finding.severity !== "informational") {
          const { error: poamErr } = await svc.rpc("create_poam_from_finding", {
            p_finding_id: inserted.id,
            p_system_id: systemId,
            p_weakness: finding.title,
            p_severity: finding.severity as "high" | "moderate" | "low",
            p_identified: finding.first_detected,
          });

          if (!poamErr) poamsCreated++;
        }
      }
    }
  }

  // ── 9. Update total_findings on scan record ───────────────────────────────
  await svc
    .from("scans")
    .update({ total_findings: findings.length } as Database["public"]["Tables"]["scans"]["Update"])
    .eq("id", scanId);

  return {
    status: "success",
    scanId,
    newFindings,
    updatedFindings,
    poamsCreated,
    warnings,
  };
}
