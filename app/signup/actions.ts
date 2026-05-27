"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type SignUpActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

const SignUpSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(100),
  organization_name: z.string().min(1, "Organization name is required").max(200),
  email: z.string().email("Enter a valid email address"),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .max(128),
});

export async function signUp(
  _prev: SignUpActionState,
  formData: FormData
): Promise<SignUpActionState> {
  const result = SignUpSchema.safeParse({
    full_name: formData.get("full_name"),
    organization_name: formData.get("organization_name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!result.success) {
    const message = result.error.errors[0]?.message ?? "Invalid input";
    return { status: "error", message };
  }

  const { full_name, organization_name, email, password } = result.data;
  const supabase = await createClient();

  // 1. Create the auth user. Supabase will send a confirmation email.
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      // Pass metadata so the database trigger can create the org and profile.
      data: {
        full_name,
        organization_name,
      },
    },
  });

  if (authError) {
    return { status: "error", message: `Registration failed: ${authError.message}` };
  }

  if (!authData.user) {
    return { status: "error", message: "Registration failed. Please try again." };
  }

  // 2. The auth trigger (see migration) handles creating the Organization and
  //    the public.users row. We do not do it here to avoid a race condition
  //    and to ensure it runs with the correct permissions.
  //
  //    If email confirmation is disabled (local dev), the user is immediately
  //    active and the trigger will have fired. In production, the trigger fires
  //    after email confirmation.

  return { status: "success" };
}
