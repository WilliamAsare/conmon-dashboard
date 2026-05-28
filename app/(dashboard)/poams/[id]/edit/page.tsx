import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import type { Database } from "@/types/supabase";
import { EditPoamForm } from "./edit-form";

export const metadata: Metadata = { title: "Edit POA&M" };

type PoamEditRow = Pick<
  Database["public"]["Tables"]["poam_items"]["Row"],
  | "id"
  | "poam_number"
  | "weakness_description"
  | "point_of_contact"
  | "resources_required"
  | "scheduled_completion"
  | "severity"
  | "status"
> & {
  systems: Pick<
    Database["public"]["Tables"]["systems"]["Row"],
    "id" | "name"
  > | null;
};

export default async function EditPoamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: poamRaw, error } = await supabase
    .from("poam_items")
    .select(`
      id, poam_number, weakness_description, point_of_contact,
      resources_required, scheduled_completion, severity, status,
      systems ( id, name )
    `)
    .eq("id", id)
    .single();

  if (error || !poamRaw) notFound();

  const poam = poamRaw as unknown as PoamEditRow;

  const isActive = poam.status === "open" || poam.status === "ongoing";
  if (!isActive) notFound(); // Don't allow editing completed/risk_accepted POA&Ms

  return (
    <div className="space-y-6 max-w-xl">
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
        <h1 className="text-2xl font-semibold mt-1">Edit POA&amp;M</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Update remediation details for{" "}
          <span className="font-mono font-medium">{poam.poam_number}</span>.
        </p>
      </div>

      <EditPoamForm
        poamId={id}
        defaultValues={{
          weakness_description: poam.weakness_description,
          point_of_contact:     poam.point_of_contact ?? "",
          resources_required:   poam.resources_required ?? "",
          scheduled_completion: poam.scheduled_completion,
        }}
      />
    </div>
  );
}
