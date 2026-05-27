/**
 * Auth callback handler.
 *
 * Supabase redirects here after:
 *   - Email confirmation (sign-up)
 *   - Magic link sign-in
 *   - Password reset
 *
 * Exchanges the one-time code for a session, then redirects the user
 * to the dashboard (or wherever they were trying to go).
 */

import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(
      `${origin}/login?error=Missing+confirmation+code`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession error:", error.message);
    return NextResponse.redirect(
      `${origin}/login?error=Confirmation+link+is+invalid+or+expired`
    );
  }

  return NextResponse.redirect(`${origin}${next}`);
}
