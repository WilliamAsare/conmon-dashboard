"use client";

import { useActionState } from "react";
import { signIn, sendMagicLink } from "./actions";
import type { AuthActionState } from "./actions";

const initialState: AuthActionState = { status: "idle" };

export function LoginForm() {
  const [signInState, signInAction, signInPending] = useActionState(
    signIn,
    initialState
  );
  const [magicState, magicAction, magicPending] = useActionState(
    sendMagicLink,
    initialState
  );

  return (
    <div className="space-y-4">
      {/* Email/password form */}
      <form action={signInAction} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="you@agency.gov"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        {signInState.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {signInState.message}
          </p>
        )}

        <button
          type="submit"
          disabled={signInPending}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {signInPending ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs text-muted-foreground">
          <span className="bg-background px-2">or</span>
        </div>
      </div>

      {/* Magic link form */}
      <form action={magicAction} className="space-y-4">
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-label="Email for magic link"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Email for magic link"
        />

        {magicState.status === "error" && (
          <p role="alert" className="text-sm text-destructive">
            {magicState.message}
          </p>
        )}
        {magicState.status === "success" && (
          <p role="status" className="text-sm text-green-600">
            Check your inbox for a sign-in link.
          </p>
        )}

        <button
          type="submit"
          disabled={magicPending}
          className="w-full rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {magicPending ? "Sending..." : "Send magic link"}
        </button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <a href="/signup" className="underline underline-offset-4 hover:text-foreground">
          Create one
        </a>
      </p>
    </div>
  );
}
