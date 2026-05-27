"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthActionState =
  | { status: "idle" }
  | { status: "success"; message?: string }
  | { status: "error"; message: string };

const SignInSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

const MagicLinkSchema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export async function signIn(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const result = SignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!result.success) {
    const message = result.error.errors[0]?.message ?? "Invalid input";
    return { status: "error", message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(result.data);

  if (error) {
    // Normalize the error message — never leak internal details.
    return {
      status: "error",
      message:
        error.message === "Invalid login credentials"
          ? "Email or password is incorrect."
          : `Sign-in failed: ${error.message}`,
    };
  }

  redirect("/dashboard");
}

export async function sendMagicLink(
  _prev: AuthActionState,
  formData: FormData
): Promise<AuthActionState> {
  const result = MagicLinkSchema.safeParse({ email: formData.get("email") });

  if (!result.success) {
    const message = result.error.errors[0]?.message ?? "Invalid input";
    return { status: "error", message };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: result.data.email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) {
    return { status: "error", message: `Could not send link: ${error.message}` };
  }

  return { status: "success" };
}
