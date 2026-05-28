/**
 * GET /api/cron/sla
 *
 * Recalculates SLA status for all open POA&M items.
 * Called by Vercel Cron (see vercel.json) once per day at 00:30 UTC.
 * Logs each run to the cron_runs table for the platform admin health view.
 *
 * Security: protected by CRON_SECRET env variable.
 * Vercel sets Authorization: Bearer <CRON_SECRET> on every cron invocation.
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization");
  const expected   = `Bearer ${process.env["CRON_SECRET"] ?? ""}`;

  if (!process.env["CRON_SECRET"] || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc       = createServiceClient();
  const startedAt = new Date();

  // Call the DB function that recomputes days_to_sla and sla_status
  // for all open POA&M items.
  const { error } = await svc.rpc("recalculate_sla");
  const finishedAt = new Date();

  // Log the run result (non-blocking — we don't await an error from this)
  void svc.from("cron_runs").insert({
    cron_name:     "sla",
    started_at:    startedAt.toISOString(),
    finished_at:   finishedAt.toISOString(),
    status:        error ? "error" : "ok",
    result:        error ? null : { ok: true },
    error_message: error?.message ?? null,
  });

  if (error) {
    console.error("[cron/sla] recalculate_sla error:", error.message);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  console.log("[cron/sla] SLA recalculation complete");
  return NextResponse.json({ ok: true, timestamp: finishedAt.toISOString() });
}
