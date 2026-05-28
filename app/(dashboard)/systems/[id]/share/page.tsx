/**
 * /systems/[id]/share — Manage client portal share tokens for this system.
 *
 * Only admin and issm roles can access this page.
 * Shows existing tokens (active / revoked / expired) and a form to create new ones.
 */

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import { CreateTokenForm } from "./token-form";
import { revokeShareToken } from "./actions";
import type { Database } from "@/types/supabase";

type SystemRow = Pick<
  Database["public"]["Tables"]["systems"]["Row"],
  "id" | "name" | "fedramp_level"
>;

type TokenRow = Pick<
  Database["public"]["Tables"]["share_tokens"]["Row"],
  "id" | "token" | "label" | "expires_at" | "created_at" | "last_used_at" | "revoked_at"
>;

function tokenStatus(token: TokenRow): { label: string; color: string } {
  if (token.revoked_at) return { label: "Revoked", color: "#CC0000" };
  if (token.expires_at && new Date(token.expires_at) < new Date()) {
    return { label: "Expired", color: "#996600" };
  }
  return { label: "Active", color: "#2E7D32" };
}

export default async function SystemSharePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users")
    .select("role, organization_id")
    .eq("id", user.id)
    .single();
  const profile = profileRaw as { role: string; organization_id: string } | null;
  if (!profile) redirect("/login");

  if (!["admin", "issm"].includes(profile.role)) notFound();

  const { data: sysRaw } = await supabase
    .from("systems")
    .select("id, name, fedramp_level")
    .eq("id", id)
    .single();
  if (!sysRaw) notFound();
  const system = sysRaw as unknown as SystemRow;

  const svc = createServiceClient();
  const { data: tokensRaw } = await svc
    .from("share_tokens")
    .select("id, token, label, expires_at, created_at, last_used_at, revoked_at")
    .eq("system_id", id)
    .order("created_at", { ascending: false });

  const tokens = (tokensRaw as unknown as TokenRow[] | null) ?? [];

  const appUrl = process.env["NEXT_PUBLIC_APP_URL"] ?? "";

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href={`/systems/${id}`} className="hover:underline">{system.name}</Link>
          {" / Share"}
        </p>
        <h1 className="text-2xl font-semibold mt-1">Client Portal Links</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Generate shareable read-only links for agency sponsors, AOs, and 3PAOs.
          Each link provides a live compliance view without requiring a ConMon account.
        </p>
      </div>

      {/* Create form */}
      <section className="rounded-lg border border-border p-5">
        <h2 className="text-sm font-semibold mb-4">New Share Link</h2>
        <CreateTokenForm systemId={id} />
      </section>

      {/* Existing tokens */}
      {tokens.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold mb-3">Existing Links</h2>
          <div className="space-y-2">
            {tokens.map((token) => {
              const { label: statusLabel, color: statusColor } = tokenStatus(token);
              const active = statusLabel === "Active";

              return (
                <div
                  key={token.id}
                  className="rounded-lg border border-border p-4 flex items-start justify-between gap-4"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{token.label}</p>
                      <span className="text-xs font-bold" style={{ color: statusColor }}>
                        {statusLabel}
                      </span>
                    </div>
                    {active && (
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {appUrl}/portal/{token.token}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Created {format(new Date(token.created_at), "MMM d, yyyy")}
                      {token.expires_at &&
                        ` · Expires ${format(new Date(token.expires_at), "MMM d, yyyy")}`}
                      {token.last_used_at &&
                        ` · Last used ${format(new Date(token.last_used_at), "MMM d, yyyy")}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {active && (
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(`${appUrl}/portal/${token.token}`);
                        }}
                        className="text-xs px-2 py-1 rounded border border-border hover:bg-accent"
                      >
                        Copy
                      </button>
                    )}
                    {active && (
                      <form action={revokeShareToken}>
                        <input type="hidden" name="token_id"  value={token.id} />
                        <input type="hidden" name="system_id" value={id} />
                        <button
                          type="submit"
                          className="text-xs px-2 py-1 rounded border border-destructive/50 text-destructive hover:bg-destructive/10"
                        >
                          Revoke
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
