import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { NewAssessmentForm } from "./new-assessment-form";

type SystemOption = { id: string; name: string };

export default async function NewAssessmentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profileRaw } = await supabase
    .from("users").select("role").eq("id", user.id).single();
  const role = (profileRaw as unknown as { role: string } | null)?.role ?? "";
  if (!["admin", "issm", "isso"].includes(role)) redirect("/assessments");

  const { data: systemsRaw } = await supabase
    .from("systems").select("id, name").order("name");
  const systems = (systemsRaw as unknown as SystemOption[] | null) ?? [];

  return <NewAssessmentForm systems={systems} />;
}
