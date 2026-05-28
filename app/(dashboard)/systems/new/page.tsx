import { Metadata } from "next";
import { NewSystemForm } from "./new-system-form";

export const metadata: Metadata = { title: "Add System" };

export default function NewSystemPage() {
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Add system</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Register a FedRAMP-authorized system for continuous monitoring.
        </p>
      </div>
      <NewSystemForm />
    </div>
  );
}
