import { redirect } from "next/navigation";

/**
 * Root route: redirect to the dashboard.
 * Middleware handles the unauthenticated case and redirects to /login.
 */
export default function RootPage() {
  redirect("/dashboard");
}
