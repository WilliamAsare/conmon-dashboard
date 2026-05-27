/**
 * Edge Function: sla-recalculate
 *
 * Scheduled daily. Calls the Postgres `recalculate_sla()` function which:
 *   1. Recomputes days_to_sla and sla_status for every open POA&M.
 *   2. Creates in-app notifications when items transition into the warning
 *      or overdue state.
 *
 * After the DB function runs, this function sends email notifications via
 * Resend for any new warning/overdue transitions.
 *
 * Schedule: configured in supabase/config.toml as "0 6 * * *" (06:00 UTC daily).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);
const FROM = Deno.env.get("RESEND_FROM_ADDRESS") ?? "noreply@conmon.local";

Deno.serve(async (_req) => {
  try {
    // 1. Run the SLA recalculation + notification creation.
    const { error: rpcError } = await supabase.rpc("recalculate_sla");
    if (rpcError) {
      throw new Error(`recalculate_sla failed: ${rpcError.message}`);
    }

    // 2. Fetch today's new (unread) SLA notifications to send emails.
    const today = new Date().toISOString().slice(0, 10);
    const { data: newNotifications, error: fetchError } = await supabase
      .from("notifications")
      .select(`
        id, type, title, body, user_id,
        users ( id, full_name )
      `)
      .in("type", ["sla_warning", "sla_overdue"])
      .gte("created_at", `${today}T00:00:00Z`)
      .is("read_at", null);

    if (fetchError) {
      throw new Error(`Failed to fetch notifications: ${fetchError.message}`);
    }

    // 3. Look up email addresses and send.
    const emailResults: Array<{ userId: string; status: string }> = [];

    for (const notification of newNotifications ?? []) {
      const { data: authUser } = await supabase.auth.admin.getUserById(
        notification.user_id
      );
      if (!authUser.user?.email) continue;

      const { error: emailError } = await resend.emails.send({
        from: FROM,
        to: authUser.user.email,
        subject: `ConMon: ${notification.title}`,
        html: `
          <p>Hello ${(notification.users as { full_name: string } | null)?.full_name ?? ""},</p>
          <p>${notification.body}</p>
          <p>
            <a href="${Deno.env.get("NEXT_PUBLIC_APP_URL") ?? ""}/poams">
              View POA&Ms
            </a>
          </p>
          <hr>
          <p style="font-size: 12px; color: #666;">
            You are receiving this because you are an admin, ISSM, or ISSO on a
            FedRAMP system tracked in ConMon. To stop receiving these alerts,
            contact your organization admin.
          </p>
        `,
      });

      emailResults.push({
        userId: notification.user_id,
        status: emailError ? `failed: ${emailError.message}` : "sent",
      });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        notificationsCreated: (newNotifications ?? []).length,
        emailResults,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sla-recalculate] error:", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
