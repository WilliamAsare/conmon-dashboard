import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";
import { DeviationForm } from "./deviation-form";

export const metadata: Metadata = { title: "Request Deviation" };

type PoamRow = Pick<
  Database["public"]["Tables"]["poam_items"]["Row"],
  "id" | "poam_number" | "weakness_description" | "severity" | "status"
> & {
  systems: Pick<
    Database["public"]["Tables"]["systems"]["Row"],
    "id" | "name"
  > | null;
};

export default async function NewDeviationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: poamRaw, error } = await supabase
    .from("poam_items")
    .select(`
      id, poam_number, weakness_description, severity, status,
      systems ( id, name )
    `)
    .eq("id", id)
    .single();

  if (error || !poamRaw) notFound();

  const poam = poamRaw as unknown as PoamRow;

  // Only allow deviation requests for open POA&Ms
  if (poam.status !== "open" && poam.status !== "ongoing") notFound();

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/poams" className="hover:underline">POA&amp;Ms</Link>
          {poam.systems && (
            <>
              {" / "}
              <Link href={`/systems/${poam.systems.id}`} className="hover:underline">
                {poam.systems.name}
              </Link>
            </>
          )}
          {" / "}
          <Link href={`/poams/${id}`} className="hover:underline">
            {poam.poam_number}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold mt-1">Request Deviation</h1>
        <p className="text-sm text-muted-foreground mt-0.5 max-w-prose">
          Submit a deviation request to your ISSO. FedRAMP recognizes three
          types: Risk Adjustment (RA), False Positive (FP), and Operational
          Requirement (OR).
        </p>
      </div>

      {/* Context card */}
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
          POA&amp;M context
        </p>
        <p className="text-sm font-medium font-mono">{poam.poam_number}</p>
        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
          {poam.weakness_description}
        </p>
        <p className="text-xs text-muted-foreground mt-1 capitalize">
          Severity: {poam.severity}
        </p>
      </div>

      <DeviationForm poamId={id} severity={poam.severity} />
    </div>
  );
}
