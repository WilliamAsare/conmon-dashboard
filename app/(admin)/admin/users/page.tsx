/**
 * /admin/users — All users across every organization.
 *
 * Joins public.users (role, org) with auth.users (email) via the admin API.
 * Limited to 1 000 auth users per page; paginate if needed.
 */

import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { format } from "date-fns";
import type { Database } from "@/types/supabase";

type PubUser = Pick<
  Database["public"]["Tables"]["users"]["Row"],
  "id" | "full_name" | "role" | "organization_id" | "created_at"
> & {
  organizations: { name: string } | null;
};

// Minimal shape returned by svc.auth.admin.listUsers
type AuthUser = { id: string; email?: string };
type AuthListResult = { data: { users: AuthUser[] } };

const ROLE_COLOR: Record<string, string> = {
  admin:    "#2B5EA7",
  issm:     "#996600",
  isso:     "#2E7D32",
  engineer: "#A5B4C8",
  auditor:  "#6B7280",
};

export default async function AdminUsersPage() {
  const svc = createServiceClient();

  const [{ data: pubUsersRaw }, authResult] = await Promise.all([
    svc
      .from("users")
      .select("id, full_name, role, organization_id, created_at, organizations(name)")
      .order("created_at", { ascending: false }),
    // Cast to AuthListResult — svc.auth.admin is not in the generated types
    (svc.auth.admin as unknown as {
      listUsers: (opts: { page: number; perPage: number }) => Promise<AuthListResult>;
    }).listUsers({ page: 1, perPage: 1000 }),
  ]);

  const pubUsers  = (pubUsersRaw as unknown as PubUser[] | null) ?? [];
  const authUsers = authResult.data?.users ?? [];

  const emailMap = new Map<string, string>();
  for (const au of authUsers) {
    if (au.email) emailMap.set(au.id, au.email);
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Users</h1>
        <p className="text-sm mt-1" style={{ color: "#A5B4C8" }}>
          {pubUsers.length} user{pubUsers.length !== 1 ? "s" : ""} across all organizations
        </p>
      </div>

      <div
        className="rounded-lg border overflow-hidden"
        style={{ borderColor: "rgba(165,180,200,.2)" }}
      >
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "rgba(30,58,95,.6)" }}>
              {["Name", "Email", "Organization", "Role", "Joined"].map((h) => (
                <th
                  key={h}
                  className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-widest"
                  style={{ color: "#A5B4C8" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pubUsers.map((u, i) => (
              <tr
                key={u.id}
                style={{
                  borderTop: "1px solid rgba(165,180,200,.15)",
                  background: i % 2 === 1 ? "rgba(255,255,255,.02)" : undefined,
                }}
              >
                <td className="px-4 py-2.5 text-white font-medium">{u.full_name}</td>
                <td className="px-4 py-2.5 text-xs" style={{ color: "#A5B4C8" }}>
                  {emailMap.get(u.id) ?? "—"}
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/organizations/${u.organization_id}`}
                    className="hover:underline"
                    style={{ color: "#A5B4C8" }}
                  >
                    {u.organizations?.name ?? "—"}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <span
                    className="text-xs font-bold uppercase"
                    style={{ color: ROLE_COLOR[u.role] ?? "#A5B4C8" }}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs" style={{ color: "#A5B4C8" }}>
                  {format(new Date(u.created_at), "MMM d, yyyy")}
                </td>
              </tr>
            ))}
            {pubUsers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm" style={{ color: "#6B7280" }}>
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
