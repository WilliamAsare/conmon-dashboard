# ADR 0001: Frontend Stack

**Date:** 2026-05-27  
**Status:** Proposed  
**Deciders:** Project lead

---

## Decision

Use **Next.js 15 (App Router)** with **TypeScript strict mode**, **Tailwind CSS**, and **shadcn/ui** as the component library.

## Rationale

Next.js App Router gives us React Server Components by default, which aligns directly with the CLAUDE.md rule that server components are the baseline and client components are opt-in. It provides first-class support for server actions (real form mutations, not ad-hoc fetch calls), which satisfies the form-action requirement, and its TypeScript integration with the Supabase client is well-established via `@supabase/ssr`. Tailwind CSS keeps styling co-located and avoids a separate CSS layer to maintain, while shadcn/ui provides accessible, keyboard-navigable primitives (data tables, dialogs, command palettes) that we own in the codebase rather than depending on a black-box component package. The combination is also what most federal contractor toolchains already accept for review, which matters for the target audience.

## Alternatives Considered

- **Remix:** Comparable server-rendering story and good form semantics, but the Supabase SSR integration requires more manual wiring and the ecosystem for data tables (a critical UI primitive here) is thinner.
- **SvelteKit:** Smaller bundle, but end-to-end TypeScript type safety with Supabase (especially generated types flowing through load functions) is less mature, and the team pool for a FedRAMP-facing tool tends to expect React.
- **Vite SPA:** No server rendering, no server actions. Would require a separate API layer, adding surface area and complexity with no benefit for this use case.

## Consequences

- All routes under `/app` use the App Router file convention (`page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`).
- Data fetching happens in Server Components or Server Actions unless a specific browser API or real-time subscription requires a Client Component.
- shadcn/ui components are generated into `/components/ui` and treated as owned code, not a dependency to upgrade blindly.
- `@supabase/ssr` handles cookie-based session management on both server and client.
