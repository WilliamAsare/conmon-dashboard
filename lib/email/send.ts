/**
 * Resend email sender.
 *
 * Lazily initialises the Resend client on first call so that importing
 * this module never throws when RESEND_API_KEY is absent (the cron route
 * guards against that before calling sendSlaDigestEmail).
 */

import { Resend } from "resend";
import { format } from "date-fns";
import { slaDigestHtml, slaDigestText, type SlaEmailItem } from "./templates";

// ── Invite email ─────────────────────────────────────────────────────────────

export async function sendInviteEmail(params: {
  to:          string;
  inviterName: string;
  orgName:     string;
  role:        string;
  inviteUrl:   string;
}): Promise<{ ok: boolean; error?: string }> {
  const from = process.env["RESEND_FROM_ADDRESS"] ?? "noreply@example.com";
  const roleLabel = params.role.charAt(0).toUpperCase() + params.role.slice(1);

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;max-width:520px;margin:40px auto;color:#111;line-height:1.6">
  <h2 style="font-size:20px;margin-bottom:4px">You've been invited to ConMon</h2>
  <p style="color:#555;margin-top:0">${params.inviterName} invited you to join
     <strong>${params.orgName}</strong> as <strong>${roleLabel}</strong>.</p>
  <a href="${params.inviteUrl}"
     style="display:inline-block;margin:24px 0;padding:10px 24px;background:#2563eb;
            color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
    Accept invitation
  </a>
  <p style="color:#888;font-size:13px">
    This link expires in 7 days. If you weren't expecting this, you can ignore it.
  </p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0"/>
  <p style="color:#aaa;font-size:12px">ConMon · FedRAMP Continuous Monitoring</p>
</body>
</html>`;

  const text = `You've been invited to join ${params.orgName} on ConMon as ${roleLabel}.\n\nAccept your invitation: ${params.inviteUrl}\n\nThis link expires in 7 days.`;

  try {
    const { error } = await resendClient().emails.send({
      from,
      to:      params.to,
      subject: `You're invited to join ${params.orgName} on ConMon`,
      html,
      text,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unknown send error" };
  }
}

export type { SlaEmailItem };

let _client: Resend | null = null;

function resendClient(): Resend {
  if (!_client) {
    const key = process.env["RESEND_API_KEY"];
    if (!key) throw new Error("RESEND_API_KEY environment variable is not set");
    _client = new Resend(key);
  }
  return _client;
}

export async function sendSlaDigestEmail(params: {
  to:       string;
  userName: string;
  items:    SlaEmailItem[];
}): Promise<{ ok: boolean; error?: string }> {
  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "";
  const from   = process.env["RESEND_FROM_ADDRESS"] ?? "noreply@example.com";

  const overdueCount = params.items.filter((i) => i.slaStatus === "overdue").length;
  const warningCount = params.items.filter((i) => i.slaStatus === "warning").length;

  const subjectParts: string[] = [];
  if (overdueCount > 0) subjectParts.push(`${overdueCount} overdue`);
  if (warningCount > 0) subjectParts.push(`${warningCount} at risk`);
  const subject = `ConMon SLA Alert — ${subjectParts.join(", ")} POA&M${
    params.items.length !== 1 ? "s" : ""
  }`;

  const generatedOn = format(new Date(), "MMMM d, yyyy 'at' HH:mm 'UTC'");

  try {
    const { error } = await resendClient().emails.send({
      from,
      to:      params.to,
      subject,
      html:    slaDigestHtml({ userName: params.userName, items: params.items, appUrl, generatedOn }),
      text:    slaDigestText({ userName: params.userName, items: params.items, appUrl }),
    });

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok:    false,
      error: err instanceof Error ? err.message : "unknown send error",
    };
  }
}
