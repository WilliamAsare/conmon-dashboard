import { redirect } from "next/navigation";

// /settings redirects to the primary settings section
export default function SettingsPage() {
  redirect("/settings/org");
}
