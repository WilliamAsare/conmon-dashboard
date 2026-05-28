/**
 * Email templates for SLA digest notifications.
 *
 * Pure functions — no Resend or Next.js dependency.
 * Uses inline CSS throughout for broad email-client compatibility.
 */

export type SlaEmailItem = {
  poamNumber: string;
  weakness:   string;
  severity:   string;
  slaStatus:  "overdue" | "warning";
  /** Human-readable label: "3 days overdue" | "12 days remaining" */
  daysLabel:  string;
  href:       string;
};

// FedRAMP brand palette (mirrors lib/pdf/conmon-report.tsx)
const C = {
  navy:   "#1E3A5F",
  blue:   "#2B5EA7",
  red:    "#CC0000",
  orange: "#996600",
  green:  "#2E7D32",
  grey:   "#9CA3AF",
  text:   "#374151",
  border: "#E5E7EB",
  light:  "#F9FAFB",
  bg:     "#F3F4F6",
  white:  "#FFFFFF",
} as const;

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

export function slaDigestHtml(params: {
  userName:    string;
  items:       SlaEmailItem[];
  appUrl:      string;
  generatedOn: string;
}): string {
  const { userName, items, appUrl, generatedOn } = params;

  const overdueCount = items.filter((i) => i.slaStatus === "overdue").length;
  const warningCount = items.filter((i) => i.slaStatus === "warning").length;

  const summaryParts: string[] = [];
  if (overdueCount > 0)
    summaryParts.push(
      `<strong style="color:${C.red}">${overdueCount} overdue</strong>`
    );
  if (warningCount > 0)
    summaryParts.push(
      `<strong style="color:${C.orange}">${warningCount} at risk</strong>`
    );
  const summaryHtml = summaryParts.join(" and ");

  const rows = items
    .map((item, idx) => {
      const sevColor =
        item.severity === "high"
          ? C.red
          : item.severity === "moderate"
          ? C.orange
          : C.green;
      const slaColor  = item.slaStatus === "overdue" ? C.red : C.orange;
      const rowBg     = idx % 2 === 1 ? C.light : C.white;
      const weakness  =
        item.weakness.length > 90
          ? item.weakness.slice(0, 90) + "…"
          : item.weakness;

      return `
        <tr style="background-color:${rowBg}">
          <td style="padding:8px 12px;border-bottom:1px solid ${C.border};font-family:'Courier New',Courier,monospace;font-size:12px;white-space:nowrap">
            <a href="${item.href}" style="color:${C.blue};text-decoration:none;font-weight:700">${item.poamNumber}</a>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid ${C.border};font-size:12px;color:${C.text}">${weakness}</td>
          <td style="padding:8px 12px;border-bottom:1px solid ${C.border};font-size:12px;font-weight:700;color:${sevColor};white-space:nowrap">
            ${item.severity.charAt(0).toUpperCase() + item.severity.slice(1)}
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid ${C.border};font-size:12px;font-weight:700;color:${slaColor};white-space:nowrap">
            ${item.daysLabel}
          </td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>ConMon SLA Alert</title>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
         style="background-color:${C.bg};padding:32px 16px">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation"
               style="width:100%;max-width:600px;background-color:${C.white};border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.12)">

          <!-- Banner -->
          <tr>
            <td style="background-color:${C.navy};padding:28px 32px">
              <p style="margin:0 0 4px;font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:#A5B4C8">
                FedRAMP Continuous Monitoring
              </p>
              <h1 style="margin:0;font-size:20px;font-weight:700;color:${C.white}">
                SLA Alert &mdash; Action Required
              </h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:28px 32px">
              <p style="margin:0 0 12px;font-size:14px;color:${C.text}">Hi ${userName},</p>
              <p style="margin:0 0 20px;font-size:14px;color:${C.text};line-height:1.55">
                Your organization has ${summaryHtml} POA&amp;M
                item${items.length !== 1 ? "s" : ""} requiring attention today.
              </p>

              <!-- Items table -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation"
                     style="border:1px solid ${C.border};border-radius:6px;overflow:hidden;margin-bottom:24px">
                <tr style="background-color:${C.navy}">
                  <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;color:${C.white};text-transform:uppercase;letter-spacing:.6px;white-space:nowrap">
                    POA&amp;M #
                  </th>
                  <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;color:${C.white};text-transform:uppercase;letter-spacing:.6px">
                    Weakness
                  </th>
                  <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;color:${C.white};text-transform:uppercase;letter-spacing:.6px;white-space:nowrap">
                    Severity
                  </th>
                  <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;color:${C.white};text-transform:uppercase;letter-spacing:.6px;white-space:nowrap">
                    SLA
                  </th>
                </tr>
                ${rows}
              </table>

              <!-- CTA button -->
              <table cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="background-color:${C.blue};border-radius:6px">
                    <a href="${appUrl}/poams"
                       style="display:inline-block;padding:10px 24px;font-size:14px;font-weight:600;color:${C.white};text-decoration:none">
                      Review POA&amp;Ms &rarr;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:16px 32px;border-top:1px solid ${C.border};background-color:${C.light}">
              <p style="margin:0;font-size:11px;color:${C.grey};line-height:1.5">
                Generated by ConMon Dashboard on ${generatedOn}. You are receiving this alert
                because your organization has POA&amp;M items approaching or past their FedRAMP
                SLA deadlines.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Plain-text fallback
// ---------------------------------------------------------------------------

export function slaDigestText(params: {
  userName: string;
  items:    SlaEmailItem[];
  appUrl:   string;
}): string {
  const { userName, items, appUrl } = params;
  const lines: string[] = [
    "ConMon SLA Alert -- Action Required",
    "====================================",
    "",
    `Hi ${userName},`,
    "",
    `Your organization has ${items.length} POA&M item${items.length !== 1 ? "s" : ""} requiring attention:`,
    "",
    ...items.map(
      (i) =>
        `  * ${i.poamNumber.padEnd(14)} [${i.severity.toUpperCase().padEnd(12)}]  ${i.daysLabel.padEnd(22)}` +
        `  ${i.weakness.length > 65 ? i.weakness.slice(0, 65) + "..." : i.weakness}`
    ),
    "",
    `Review and remediate: ${appUrl}/poams`,
    "",
    "---",
    "This is an automated alert from the ConMon Dashboard.",
  ];
  return lines.join("\n");
}
