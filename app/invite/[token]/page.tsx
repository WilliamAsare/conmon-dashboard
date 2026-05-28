import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { notFound } from "next/navigation";

type InviteRow = {
  organization_id:   string;
  organization_name: string;
  email:             string;
  role:              string;
  expires_at:        string;
  accepted_at:       string | null;
};

const ROLE_LABEL: Record<string, string> = {
  admin:    "Admin",
  issm:     "Information System Security Manager (ISSM)",
  isso:     "Information System Security Officer (ISSO)",
  engineer: "Engineer",
  auditor:  "Auditor",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Validate UUID format before hitting the DB
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(token)) notFound();

  const supabase = await createClient();

  // `as unknown as` cast: new RPC functions not yet in generated types
  const { data: rows } = await (supabase.rpc as unknown as (
    fn: string, args: Record<string, unknown>
  ) => Promise<{ data: unknown }>)(
    "get_invitation_by_token",
    { p_token: token }
  );

  const invite = (rows as unknown as InviteRow[] | null)?.[0];
  if (!invite) notFound();

  const isExpired  = new Date(invite.expires_at) < new Date();
  const isAccepted = !!invite.accepted_at;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo / brand */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">ConMon</h1>
          <p className="text-sm text-muted-foreground mt-0.5">FedRAMP Continuous Monitoring</p>
        </div>

        <div className="rounded-lg border border-border bg-card p-6 space-y-5">
          {isAccepted ? (
            <>
              <div className="text-center space-y-2">
                <div className="text-4xl">✅</div>
                <h2 className="text-lg font-semibold">Invite Already Accepted</h2>
                <p className="text-sm text-muted-foreground">
                  This invitation has already been used.
                </p>
              </div>
              <Link
                href="/login"
                className="block w-full text-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Sign in
              </Link>
            </>
          ) : isExpired ? (
            <>
              <div className="text-center space-y-2">
                <div className="text-4xl">⏰</div>
                <h2 className="text-lg font-semibold">Invite Expired</h2>
                <p className="text-sm text-muted-foreground">
                  This invitation has expired. Ask your admin to send a new one.
                </p>
              </div>
            </>
          ) : (
            <>
              <div className="text-center space-y-1">
                <p className="text-sm text-muted-foreground">You&apos;ve been invited to join</p>
                <h2 className="text-xl font-bold">{invite.organization_name}</h2>
                <p className="text-sm text-muted-foreground">
                  as <span className="font-medium text-foreground">
                    {ROLE_LABEL[invite.role] ?? invite.role}
                  </span>
                </p>
              </div>

              <div className="rounded-md bg-muted/50 border border-border px-4 py-3 text-sm space-y-1">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">
                  Invite sent to
                </p>
                <p className="font-medium">{invite.email}</p>
                <p className="text-xs text-muted-foreground">
                  You must sign up with this exact email address.
                </p>
              </div>

              <Link
                href={`/signup?invite=${token}&email=${encodeURIComponent(invite.email)}`}
                className="block w-full text-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-colors"
              >
                Create account &amp; join {invite.organization_name}
              </Link>

              <p className="text-center text-xs text-muted-foreground">
                Already have an account?{" "}
                <Link href="/login" className="underline hover:text-foreground">
                  Sign in
                </Link>
                {" "}— then ask your admin to re-invite you.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
