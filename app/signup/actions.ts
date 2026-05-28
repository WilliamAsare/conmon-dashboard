"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type SignUpActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

const BaseSignUpSchema = z.object({
  full_name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(12, "Password must be at least 12 characters").max(128),
  // invite_token is present when accepting an invite; org name not needed then
  invite_token:      z.string().optional(),
  organization_name: z.string().max(200).optional(),
});

const SignUpSchema = BaseSignUpSchema.superRefine((data, ctx) => {
  if (!data.invite_token && !data.organization_name?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Organization name is required",
      path: ["organization_name"],
    });
  }
});

export async function signUp(
  _prev: SignUpActionState,
  formData: FormData
): Promise<SignUpActionState> {
  const result = SignUpSchema.safeParse({
    full_name:         formData.get("full_name"),
    organization_name: formData.get("organization_name"),
    email:             formData.get("email"),
    password:          formData.get("password"),
    invite_token:      formData.get("invite_token") || undefined,
  });

  if (!result.success) {
    const message = result.error.errors[0]?.message ?? "Invalid input";
    return { status: "error", message };
  }

  const { full_name, organization_name, email, password, invite_token } = result.data;
  const supabase = await createClient();

  // Build metadata — the DB trigger reads this to either:
  //   a) accept an invite and join an existing org (when invite_token present), or
  //   b) create a brand-new organization (normal signup).
  const metadata: Record<string, string> = { full_name };
  if (invite_token) {
    metadata["invite_token"] = invite_token;
  } else if (organization_name) {
    metadata["organization_name"] = organization_name;
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      data: metadata,
    },
  });

  if (authError) {
    return { status: "error", message: `Registration failed: ${authError.message}` };
  }

  if (!authData.user) {
    return { status: "error", message: "Registration failed. Please try again." };
  }

  return { status: "success" };
}
