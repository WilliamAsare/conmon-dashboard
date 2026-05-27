/**
 * Supabase browser client.
 *
 * Use this only in Client Components that need to interact with Supabase
 * after the initial server render (e.g., real-time subscriptions, auth state).
 *
 * For all data fetching, prefer the server client in server.ts.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/supabase";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Fill in .env.local and restart the dev server."
    );
  }

  return createBrowserClient<Database>(url, key);
}
