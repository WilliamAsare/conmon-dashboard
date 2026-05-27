# ConMon Dashboard — Living Plan

Last updated: 2026-05-27

---

## Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | Next.js 15 (App Router) | SSR, server actions, RSC by default — see ADR 0001 |
| Components | shadcn/ui + Tailwind CSS | Owned, accessible primitives |
| Backend | Supabase (Pro) | Auth, RLS, Edge Functions, Storage, Postgres |
| Type safety | `supabase gen types typescript` committed on every migration | |
| Validation | Zod — shared between server actions and client forms | |
| Email | Resend | |
| Deployment | Vercel | |
| Testing | Vitest (unit) + Playwright (e2e critical path) | |

---

## Phase Breakdown

### Phase 1: Foundation
**Goal:** Working auth, full schema with RLS, local Supabase running, seed data in place.

Tasks:
- [ ] `npx create-next-app@latest` with TypeScript, Tailwind, App Router
- [ ] `supabase init`, configure local dev with `supabase start`
- [ ] Write migration 001: organizations, users, systems — with RLS policies
- [ ] Write migration 002: scans, findings, poam_items — with RLS policies
- [ ] Write migration 003: deviation_requests, scrs, conmon_reports, audit_log — with RLS
- [ ] Postgres triggers for audit_log (every INSERT/UPDATE/DELETE on business tables)
- [ ] `lib/fedramp/sla.ts` — SLA constants
- [ ] `lib/fedramp/severity.ts` — CVSS-to-severity conversion
- [ ] `lib/fedramp/deviations.ts` — deviation type field definitions
- [ ] `lib/fedramp/poam.ts` — POA&M number generation helper
- [ ] Seed script: one org, one Moderate system, three users (admin, isso, auditor)
- [ ] Auth flows: email/password + magic link, first-user org creation, invite flow
- [ ] `supabase gen types typescript` → commit `/types/supabase.ts`
- [ ] RLS isolation test: prove cross-org reads are blocked

**Checkpoint:** Sign up, create org, invite user, RLS prevents cross-org reads. Test proves it.

---

### Phase 2: Scan Ingestion and Findings
**Goal:** Upload Nessus XML and Qualys CSV, parse them, deduplicate, auto-create POA&Ms.

Tasks:
- [ ] `lib/parsers/nessus.ts` — Nessus XML parser (pure function, no I/O)
- [ ] `lib/parsers/qualys.ts` — Qualys CSV parser (pure function)
- [ ] `fixtures/sample-scan.nessus` — 50+ realistic findings
- [ ] `fixtures/sample-qualys.csv` — 20+ realistic findings
- [ ] Deduplication logic: same plugin_id + asset = recurring finding
- [ ] Auto-POA&M creation on ingestion (server action)
- [ ] Upload UI with parsing summary (new / recurring / resolved counts)
- [ ] Findings list view with filters (severity, status, asset, scan type)
- [ ] Parser unit tests with high coverage
- [ ] Nessus fixture produces expected findings and POA&Ms

**Checkpoint:** Upload sample-scan.nessus, verify expected findings and auto-created POA&Ms.

---

### Phase 3: POA&M and Deviations
**Goal:** Full POA&M lifecycle including deviation request workflow.

Tasks:
- [ ] POA&M table: sortable/filterable by severity, status, days-to-SLA, asset
- [ ] POA&M detail view with milestone editor (JSON-backed timeline)
- [ ] Bulk actions: mark remediated, request deviation
- [ ] Deviation request form (RA / FP / OR with type-specific required fields)
- [ ] Evidence upload to Supabase Storage (size + MIME validation)
- [ ] Reviewer queue for ISSM/admin role
- [ ] Approval flow: updates POA&M status, stops SLA clock, writes audit log
- [ ] FedRAMP XLSX export using actual template column structure

**Checkpoint:** Scan upload → POA&M auto-created → deviation submitted → reviewer approves → POA&M status updates.

---

### Phase 4: SLA Engine and Notifications
**Goal:** Nightly SLA calculation, in-app notifications, email alerts.

Tasks:
- [ ] Postgres function `calculate_sla_status()` — computes days_to_sla for all open POA&Ms
- [ ] Scheduled Edge Function (daily) calling the Postgres function
- [ ] In-app notifications table + UI (bell icon, unread count, list)
- [ ] Email via Resend: 7-day warning, overdue alert
- [ ] Audit log entries on every status change (via triggers already in place)
- [ ] Notification preferences (opt-out per type, per role)

**Checkpoint:** POA&M with scheduled_completion 5 days away triggers notification on next nightly run.

---

### Phase 5: Reporting and Polish
**Goal:** Monthly ConMon report PDF, audit log viewer, dashboard charts, production-ready UX.

Tasks:
- [ ] ConMon report PDF with `@react-pdf/renderer`: system header, executive summary, scan coverage, POA&M aging, new/closed findings, deviations summary
- [ ] Store PDFs in Supabase Storage, list historical reports per system
- [ ] Audit log viewer: filterable by user, entity type, date range
- [ ] Dashboard charts: POA&M aging by severity, scan trend over 6 months
- [ ] Empty states on every route that fetches data
- [ ] Loading states (`loading.tsx`) on every route
- [ ] Error boundaries (`error.tsx`) on every route
- [ ] Playwright e2e: full critical path (upload → POA&M → deviation → approval)
- [ ] Final accessibility pass: keyboard navigation, focus management, color-independent severity signals

**Checkpoint:** Generate a monthly ConMon report PDF that an ISSO would not be embarrassed to send to an AO.

---

## Clarifying Questions

These are open questions I want resolved before or early in Phase 1. I will not make assumptions on them.

1. **Supabase project:** Should I set up a new Supabase project from scratch (with a fresh project URL and anon key), or is there an existing project I should connect to? I need the project URL, anon key, and service role key to wire up `.env.local`.

2. **System short code for POA&M numbering:** The format is `V-{system_short_code}-{sequential_number}`. Is the short code user-defined when creating a System, or derived from the system name (e.g., first word, uppercased)? I will make it a required field on the `systems` table unless told otherwise.

3. **FedRAMP XLSX template:** The export must match the actual FedRAMP POA&M template column structure. Do you have the template file, or should I source the current version from fedramp.gov? The column names and order matter for AO review.

4. **Vercel deployment:** Should I set up the Vercel project now (linking the GitHub repo) or defer that to the end? It affects whether I configure environment variables in Vercel from day one.

5. **Resend API key:** Do you have a Resend account and API key, or should I stub the email integration with console logging for now and wire the real key later?

---

## Decisions Made

| Date | Decision | Reason |
|---|---|---|
| 2026-05-27 | Next.js 15 App Router | See ADR 0001 |
| 2026-05-27 | shadcn/ui + Tailwind | Owned accessible primitives, no black-box dependency |

---

## Completed Work

Nothing yet. Awaiting approval of ADR 0001 and this plan before Phase 1 begins.
