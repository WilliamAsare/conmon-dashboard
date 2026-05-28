"use client";

/**
 * RealtimeRefresh
 *
 * Subscribes to INSERT/UPDATE/DELETE events on a Supabase table and calls
 * router.refresh() so the nearest Server Component re-fetches its data.
 *
 * Usage:
 *   <RealtimeRefresh table="poam_items" />
 *
 * Drop this anywhere inside a server component page. It renders nothing visible.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function RealtimeRefresh({ table }: { table: string }) {
  const supabase = createClient();
  const router   = useRouter();

  useEffect(() => {
    const channel = supabase
      .channel(`realtime:${table}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        () => { router.refresh(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [table]);

  return null;
}
