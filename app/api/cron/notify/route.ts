/**
 * GET /api/cron/notify
 *
 * 1. Creates in-app notifications for SLA-critical POA&M items.
 * 2. Sends one Resend email digest per affected user listing their items.
 *
 * Called by Vercel Cron daily at 01:00 UTC (after the SLA recalc at 00:30).
 *
 * Deduplication — both in-app and email:
 *   A sla_warning / sla_overdue notification for the same entity is only
 *   created once per calendar day.  Email is sent only when at least one
 *   new (non-deduplicated) in-app notification was produced for the user,
 *   preventing duplicate emails if the cron re-runs within the same day.
 *
 * Email is silently skipped when RESEND_API_KEY or RESEND_FROM_ADDRESS is
 * absent so the cron works in staging environments without email config.
 *
 * Security: protected by CRON_SECRET env variable.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { sendSlaDigestEmail, type SlaEmailItem } from "@/lib/email/send";
import type { Database } from "@/types/supabase";

type PoamRow = Pick<
  Database["public"]["Tables"]["poam_items"]["Row"],
  "id" | "poam_number" | "weakness_description" | "severity" | "sla_status" | "days_to_sla"
> & {
  systems: {
    organization_id: string;
    name:            string;
  } | null;
};

type OrgUserRow = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "organization_id" | "full_name"
>;

// Shape returned by svc.auth.admin.getUserById — typed manually because
// the generated types don't expose the Admin API surface.
type AuthUserResult = {
  data: { user: { email?: string } | null };
};

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expected   = `Bearer ${process.env["CRON_SECRET"] ?? ""}`;

  if (!process.env["CRON_SECRET"] || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc    = createServiceClient();
  const today  = new Date().toISOString().split("T")[0]!;
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "";

  // ── 1. Fetch overdue and warning POA&Ms ───────────────────────────────────
  const { data: poamsRaw } = await svc
    .from("poam_items")
    .select(`
      id, poam_number, weakness_description, severity, sla_status, days_to_sla,
      systems ( organization_id, name )
    `)
    .in("status", ["open", "ongoing"])
    .in("sla_status", ["overdue", "warning"]);

  const poams = (poamsRaw as unknown as PoamRow[] | null) ?? [];
  if (poams.length === 0) {
    return NextResponse.json({ ok: true, notificationsCreated: 0, emailsSent: 0 });
  }

  // ── 2. Group POA&Ms by organization ───────────────────────────────────────
  const byOrg = new Map<string, PoamRow[]>();
  for (const poam of poams) {
    const orgId = poam.systems?.organization_id;
    if (!orgId) continue;
    const existing = byOrg.get(orgId) ?? [];
    existing.push(poam);
    byOrg.set(orgId, existing);
  }

  // ── 3. Fetch users for affected organizations ─────────────────────────────
  const orgIds = Array.from(byOrg.keys());
  const { data: usersRaw } = await svc
    .from("users")
    .select("id, organization_id, full_name")
    .in("organization_id", orgIds);

  const users = (usersRaw as unknown as OrgUserRow[] | null) ?? [];

  // ── 4. Dedup: collect entity IDs already notified today ───────────────────
  const { data: existingRaw } = await svc
    .from("notifications")
    .select("entity_id, type")
    .in("type", ["sla_warning", "sla_overdue"])
    .gte("created_at", `${today}T00:00:00Z`);

  const alreadyNotified = new Set(
    (existingRaw ?? []).map((n) => `${n.type}:${n.entity_id}`)
  );

  // ── 5. Build in-app notification rows + per-user email digest items ────────
  type NotifInsert = Database["public"]["Tables"]["notifications"]["Insert"];
  const notifications: NotifInsert[] = [];

  // userId → { userName, items[] } — only populated for users with NEW items
  const emailDigests = new Map<string, { userName: string; items: SlaEmailItem[] }>();

  for (const user of users) {
    const orgPoams = byOrg.get(user.organization_id) ?? [];

    for (const poam of orgPoams) {
      const type: "sla_warning" | "sla_overdue" =
        poam.sla_status === "overdue" ? "sla_overdue" : "sla_warning";

      const dedupeKey = `${type}:${poam.id}`;
      if (alreadyNotified.has(dedupeKey)) continue;

      const daysLabel =
        poam.days_to_sla !== null && poam.days_to_sla < 0
          ? `${Math.abs(poam.days_to_sla)} days overdue`
          : poam.days_to_sla !== null
          ? `${poam.days_to_sla} days remaining`
          : "";

      // In-app notification
      notifications.push({
        organization_id: user.organization_id,
        user_id:         user.id,
        type,
        title:
          type === "sla_overdue"
            ? `SLA overdue: ${poam.poam_number}`
            : `SLA warning: ${poam.poam_number}`,
        body:
          type === "sla_overdue"
            ? `${poam.poam_number} is past its FedRAMP SLA deadline (${daysLabel}). Immediate action required.`
            : `${poam.poam_number} SLA expires soon (${daysLabel}). Schedule remediation.`,
        entity_type: "poam_item",
        entity_id:   poam.id,
      });

      // Email digest accumulator
      const digest = emailDigests.get(user.id) ?? {
        userName: user.full_name,
        items:    [] as SlaEmailItem[],
      };
      digest.items.push({
        poamNumber: poam.poam_number,
        weakness:   poam.weakness_description,
        severity:   poam.severity,
        slaStatus:  poam.sla_status as "overdue" | "warning",
        daysLabel,
        href:       `${appUrl}/poams/${poam.id}`,
      });
      emailDigests.set(user.id, digest);
    }
  }

  // ── 6. Insert in-app notifications in batches of 100 ─────────────────────
  let created = 0;
  const BATCH = 100;
  for (let i = 0; i < notifications.length; i += BATCH) {
    const batch = notifications.slice(i, i + BATCH);
    const { error } = await svc.from("notifications").insert(batch);
    if (!error) created += batch.length;
    else console.error("[cron/notify] insert error:", error.message);
  }

  // ── 7. Send email digests ─────────────────────────────────────────────────
  let emailsSent  = 0;
  let emailErrors = 0;

  const resendConfigured =
    !!process.env["RESEND_API_KEY"] &&
    !!process.env["RESEND_FROM_ADDRESS"];

  if (resendConfigured && emailDigests.size > 0) {
    // Resolve auth emails for users who have new notifications.
    // getUserById is called in parallel — typically < 50 users per run.
    const userIds = Array.from(emailDigests.keys());

    const authResults = await Promise.allSettled(
      userIds.map(async (uid) => {
        // Cast to AuthUserResult — svc.auth.admin is not in the generated types
        const result = (await (svc.auth.admin as unknown as {
          getUserById: (id: string) => Promise<AuthUserResult>;
        }).getUserById(uid));
        return { uid, email: result.data.user?.email ?? null };
      })
    );

    const emailMap = new Map<string, string>(); // userId → email address
    for (const r of authResults) {
      if (r.status === "fulfilled" && r.value.email) {
        emailMap.set(r.value.uid, r.value.email);
      }
    }

    // Send up to 10 emails concurrently to stay within Resend rate limits
    const digestEntries = Array.from(emailDigests.entries());
    for (let i = 0; i < digestEntries.length; i += 10) {
      const chunk = digestEntries.slice(i, i + 10);
      const sendResults = await Promise.allSettled(
        chunk.map(async ([userId, digest]) => {
          const email = emailMap.get(userId);
          if (!email) {
            console.warn(`[cron/notify] no email address found for user ${userId}`);
            return { ok: false as const, error: "no email address" };
          }
          const result = await sendSlaDigestEmail({
            to:       email,
            userName: digest.userName,
            items:    digest.items,
          });
          if (!result.ok) {
            console.error(
              `[cron/notify] email failed for ${email}: ${result.error}`
            );
          }
          return result;
        })
      );

      for (const r of sendResults) {
        if (r.status === "fulfilled" && r.value.ok) emailsSent++;
        else emailErrors++;
      }
    }
  }

  const result = {
    notificationsCreated: created,
    emailsSent,
    ...(emailErrors > 0 ? { emailErrors } : {}),
  };

  // Log run to cron_runs table for platform admin health view
  void svc.from("cron_runs").insert({
    cron_name:   "notify",
    started_at:  today + "T01:00:00Z", // approximate; cron fires at 01:00 UTC
    finished_at: new Date().toISOString(),
    status:      "ok",
    result:      result as unknown as import("@/types/supabase").Json,
  });

  console.log(
    `[cron/notify] notifications=${created} emails_sent=${emailsSent}` +
      (emailErrors > 0 ? ` email_errors=${emailErrors}` : "")
  );
  return NextResponse.json({ ok: true, ...result });
}
