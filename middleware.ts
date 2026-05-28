/**
 * Next.js middleware: refreshes the Supabase session on every request.
 *
 * This is the mechanism that keeps the user logged in across page navigations.
 * Without it, the session cookie would expire and the user would be silently
 * logged out.
 *
 * Protected routes redirect to /login when there is no active session.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/supabase";

const PUBLIC_ROUTES = ["/login", "/signup", "/auth/callback", "/auth/confirm", "/portal", "/auth/mfa-verify", "/invite"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    // Env vars not set yet (fresh checkout). Let the request through so the
    // developer sees the app rather than a redirect loop.
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Refresh the session. IMPORTANT: do not run user code between
  // createServerClient and getUser() — it would break the session refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicRoute = PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );

  if (!user && !isPublicRoute) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // MFA enforcement: if the user has enrolled a TOTP factor but hasn't
  // verified it this session (aal1 < aal2), redirect to the verify page.
  // FedRAMP IA-2(1): MFA required for privileged accounts.
  if (user && !isPublicRoute && pathname !== "/auth/mfa-verify") {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (
      aalData &&
      aalData.nextLevel === "aal2" &&
      aalData.currentLevel !== "aal2"
    ) {
      const mfaUrl = request.nextUrl.clone();
      mfaUrl.pathname = "/auth/mfa-verify";
      mfaUrl.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(mfaUrl);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
