"use client";

/**
 * /auth/mfa-verify
 *
 * Shown after login when the user has enrolled TOTP but the current session
 * hasn't completed the second factor (AAL1 → AAL2 upgrade).
 *
 * FedRAMP IA-2(1): Multi-factor authentication for privileged accounts.
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ShieldCheck } from "lucide-react";

export default function MfaVerifyPage() {
  const supabase = createClient();
  const router   = useRouter();

  const [factorId,  setFactorId]  = useState<string | null>(null);
  const [code,      setCode]      = useState("");
  const [error,     setError]     = useState<string | null>(null);
  const [pending,   setPending]   = useState(false);
  const [loading,   setLoading]   = useState(true);

  // Fetch the first verified TOTP factor
  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const totp = data?.all?.find(
        (f) => f.factor_type === "totp" && f.status === "verified"
      );
      if (!totp) {
        // No factor enrolled — skip to dashboard
        router.replace("/dashboard");
        return;
      }
      setFactorId(totp.id);
      setLoading(false);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setPending(true);
    setError(null);

    const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.replace(/\s/g, ""),
    });

    if (verifyError) {
      setError("Invalid code. Check your authenticator app and try again.");
      setPending(false);
      return;
    }

    // Session upgraded to AAL2 — redirect to original destination
    const params = new URLSearchParams(window.location.search);
    router.push(params.get("redirectTo") ?? "/dashboard");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <ShieldCheck size={40} className="text-primary" />
          </div>
          <h1 className="text-xl font-semibold">Two-factor authentication</h1>
          <p className="text-sm text-muted-foreground">
            Enter the 6-digit code from your authenticator app.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000 000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={7}
            required
            autoFocus
            className="w-full rounded-lg border border-border bg-background px-4 py-3 text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-primary"
          />

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={pending || code.replace(/\s/g, "").length < 6}
            className="w-full rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {pending ? "Verifying…" : "Verify"}
          </button>
        </form>

        <p className="text-xs text-center text-muted-foreground">
          Lost access to your authenticator?{" "}
          <a href="mailto:support@conmon.app" className="text-primary hover:underline">
            Contact your admin.
          </a>
        </p>
      </div>
    </div>
  );
}
