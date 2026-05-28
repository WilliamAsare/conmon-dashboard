"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ShieldCheck, ShieldOff, QrCode, Copy, Check } from "lucide-react";
import Image from "next/image";

type Factor = {
  id: string;
  factor_type: string;
  status: "verified" | "unverified";
  created_at: string;
};

type EnrollData = {
  id: string;
  totp: {
    qr_code: string;   // SVG data URI
    secret:  string;
    uri:     string;
  };
};

export function MfaPanel({
  initialFactors,
  role,
}: {
  initialFactors: Factor[];
  role: string;
}) {
  const supabase = createClient();

  const [factors,    setFactors]    = useState<Factor[]>(initialFactors);
  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [error,      setError]      = useState<string | null>(null);
  const [pending,    setPending]    = useState(false);
  const [copied,     setCopied]     = useState(false);

  const verifiedFactor = factors.find(
    (f) => f.factor_type === "totp" && f.status === "verified"
  );
  const isPrivileged = ["admin", "issm", "isso"].includes(role);

  // ── Enroll ────────────────────────────────────────────────────────────────
  async function startEnroll() {
    setPending(true);
    setError(null);
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp" });
    setPending(false);
    if (err || !data) { setError(err?.message ?? "Failed to start enrollment"); return; }
    setEnrollData(data as unknown as EnrollData);
  }

  async function confirmEnroll() {
    if (!enrollData) return;
    setPending(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollData.id,
      code: verifyCode.replace(/\s/g, ""),
    });
    setPending(false);
    if (err) { setError("Invalid code — check your app and try again."); return; }
    // Success: refresh factors
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.all ?? []) as unknown as Factor[]);
    setEnrollData(null);
    setVerifyCode("");
  }

  async function cancelEnroll() {
    if (enrollData) {
      await supabase.auth.mfa.unenroll({ factorId: enrollData.id });
    }
    setEnrollData(null);
    setVerifyCode("");
    setError(null);
  }

  // ── Unenroll ──────────────────────────────────────────────────────────────
  async function unenroll(factorId: string) {
    if (!confirm("Remove two-factor authentication? Your account will be less secure.")) return;
    setPending(true);
    await supabase.auth.mfa.unenroll({ factorId });
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.all ?? []) as unknown as Factor[]);
    setPending(false);
  }

  function copySecret() {
    if (!enrollData) return;
    navigator.clipboard.writeText(enrollData.totp.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (enrollData) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <QrCode size={18} className="text-primary" />
          <h3 className="font-semibold">Set up authenticator app</h3>
        </div>

        <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Install an authenticator app (Google Authenticator, Authy, 1Password, etc.)</li>
          <li>Scan the QR code below or enter the secret manually</li>
          <li>Enter the 6-digit code to confirm</li>
        </ol>

        {/* QR code */}
        <div className="flex justify-center">
          <div
            className="rounded-lg border border-border bg-white p-4"
            dangerouslySetInnerHTML={{ __html: enrollData.totp.qr_code }}
          />
        </div>

        {/* Manual secret */}
        <div className="rounded-md bg-muted p-3 flex items-center justify-between gap-3">
          <code className="text-xs font-mono break-all">{enrollData.totp.secret}</code>
          <button onClick={copySecret} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors">
            {copied ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
          </button>
        </div>

        {/* Verify code input */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            Enter the code from your app to confirm
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000 000"
            value={verifyCode}
            onChange={(e) => setVerifyCode(e.target.value)}
            maxLength={7}
            autoFocus
            className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-center font-mono text-xl tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={confirmEnroll}
            disabled={pending || verifyCode.replace(/\s/g, "").length < 6}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm disabled:opacity-50"
          >
            {pending ? "Verifying…" : "Enable MFA"}
          </button>
          <button
            onClick={cancelEnroll}
            className="px-4 py-2 rounded-md border border-border text-sm hover:bg-accent"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {verifiedFactor ? (
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldCheck size={20} className="text-green-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Two-factor authentication is enabled</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your account is protected with a TOTP authenticator app.
              </p>
            </div>
          </div>
          <button
            onClick={() => unenroll(verifiedFactor.id)}
            disabled={pending}
            className="shrink-0 px-3 py-1.5 rounded-md border border-border text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <ShieldOff size={20} className="text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Two-factor authentication is not enabled</p>
              {isPrivileged && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5 font-medium">
                  FedRAMP IA-2(1) requires MFA for your role ({role}). Please enable it.
                </p>
              )}
            </div>
          </div>
          <button
            onClick={startEnroll}
            disabled={pending}
            className="shrink-0 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50 hover:opacity-90"
          >
            Enable MFA
          </button>
        </div>
      )}
    </div>
  );
}
