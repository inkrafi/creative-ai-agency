# AI Creative Agency Platform — Phase 0 + Phase 1

Backend for `ai-creative-agency-system-design.md`. Phase 0 (§5 "Foundations"):
auth, org/tenant model with Postgres Row-Level Security from day one, basic
project/task CRUD. Phase 1 ("MVP"): AI text generation streamed into the
brief → draft → approve workflow, with per-tenant cost accounting from the
first request.

Frontend (Next.js) is not part of either phase yet — see the design doc's
phased roadmap.

## Stack

- NestJS (TypeScript) — `apps/api`
- Postgres 16 with Row-Level Security, Prisma ORM
- Redis (provisioned now for Phase 2's realtime pub-sub; no application code
  uses it yet in Phase 1 — see design doc §6 Dependencies)
- Anthropic Claude API (primary) with a Gemini fallback for AI generation
- pnpm workspaces (room for `apps/web` later)

## How multi-tenancy works here

Every tenant-scoped table (`users`, `projects`, `tasks`, `briefs`, `assets`,
`generation_jobs`, `credit_ledger_entries`) has an `organization_id` column
and a Postgres RLS policy that filters on it. The app never has to remember
to add `WHERE organization_id = ...` — Postgres enforces it even against a
raw, unfiltered query. See:

- `apps/api/prisma/migrations/*_rls_policies/migration.sql` and
  `*_phase1_generation_models/migration.sql` — the actual SQL policies
- `apps/api/src/prisma/prisma.service.ts` — how the current tenant gets set
  per-request via `SET LOCAL app.tenant_id`, driven by the JWT's `tenantId`
  claim through `TenantContextGuard` + `nestjs-cls`
- `apps/api/test/tenant-isolation.e2e-spec.ts` — automated proof, run in CI,
  that cross-tenant reads/writes are blocked at the DB layer

Two Postgres roles are used: `app_rls` (RLS-restricted, everything normal
runs as this) and a narrow `app_auth_bypass` (BYPASSRLS, used only by
`AuthService` for the pre-tenant-context email lookup at login/signup).

## AI generation (Phase 1)

`POST /briefs` creates a Brief + its first Task. `GET /briefs/:id/generate`
(SSE) streams a draft back token-by-token while logging cost — see design
doc §4.1: *"Text can stream directly for UX, but is still logged as a job
for cost accounting."*

- `apps/api/src/ai/model-router.service.ts` — provider-agnostic abstraction
  (design doc §7: *"Model Router abstraction from day one"*). Tries
  Anthropic first; falls back to Gemini only if Anthropic's quota/credit is
  exhausted **before** any text has streamed (a mid-stream failure is a
  hard failure, not a silent provider switch — see the file's comments for
  why). Real providers live in `src/ai/providers/`.
- `apps/api/src/generation/credit-ledger.service.ts` — append-only
  hold-then-settle ledger (like a card authorization): a `PENDING` debit is
  reserved *before* the model is ever called, using a `Serializable`
  transaction to prevent two concurrent requests from double-spending the
  same balance. Settled to the real cost after, or released on failure.
- `apps/api/src/ai/model-pricing.ts` — per-token pricing table, source of
  the cost math (fetched from live provider docs, not memorized).

**Every failure from `/briefs/:id/generate` is an SSE `event: error`, never
an HTTP error status.** Nest's `@Sse()` commits the response as
`200 text/event-stream` as soon as the route is invoked, before the handler
resolves -- an `HttpException` thrown before returning the `Observable`
does *not* reach the client as a real 402/404 (confirmed by
`test/briefs.e2e-spec.ts`, which caught this returning a bare `200` with an
empty body). So `BriefsService.generateStream()` never throws outward; it
does all its work inside the `Observable`'s subscribe callback and reports
every failure -- not found, insufficient credit, mid-stream provider
failure -- the same way. Clients must listen for `error` vs `done` SSE
events, not branch on HTTP status.

**A note on the Gemini integration**: its Node SDK (`@google/genai`) changed
its streaming event-type names between major versions while this was being
built (`content.delta`/`interaction.complete` on 1.x vs
`step.delta`/`interaction.completed` on 2.x) — confirmed by reading the
installed package's own `.d.ts` rather than trusting docs or memory. If
Gemini's SDK is ever upgraded, re-check `src/ai/providers/gemini.provider.ts`
against the new `.d.ts` before assuming the event names still match.

## Local setup

Requires Docker Desktop and Node 20+.

```bash
corepack enable                 # gives you pnpm without a separate install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
# then edit apps/api/.env: set ANTHROPIC_API_KEY (required) and
# GEMINI_API_KEY (optional -- fallback provider only)

docker compose up -d             # starts Postgres (5433) and Redis (6379)
pnpm install

pnpm --filter api prisma:deploy   # creates tables + RLS policies + roles
pnpm --filter api prisma:generate
pnpm --filter api prisma:seed     # creates a demo org + admin user + starting credit, prints curl commands

pnpm dev                          # starts the API on :3000
```

Postgres is mapped to host port **5433**, not 5432 -- see the comment in
`docker-compose.yml` (avoids clashing with a native Postgres install).

Then, using the credentials printed by the seed script:

```bash
curl -X POST localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@demo-agency.test","password":"password123"}'
# -> { "accessToken": "..." }

curl localhost:3000/projects -H "Authorization: Bearer <accessToken>"

# Phase 1: create a brief, then stream a draft
curl -X POST localhost:3000/briefs -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"projectId":"<projectId>","title":"Ad copy","instructions":"Write a 2-sentence playful ad for a skincare serum."}'
curl -N localhost:3000/briefs/<briefId>/generate -H "Authorization: Bearer <accessToken>"
```

## Tests

```bash
pnpm --filter api test       # unit tests -- no DB, no network
pnpm --filter api test:e2e   # integration/e2e -- needs the running Postgres
```

Both run in CI on every push (`.github/workflows/ci.yml`) against a real
Postgres service container — no `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` needed
there, see below.

- `src/ai/model-router.service.spec.ts` (unit) — the fallback-chain logic
  (pre-stream quota failure switches provider; mid-stream failure and
  non-quota errors don't), using fake `AiProvider` implementations. No real
  API calls.
- `test/tenant-isolation.e2e-spec.ts` — raw-SQL proof that RLS blocks
  cross-tenant access at the DB layer, not just in app code. This is the
  "automated isolation tests in CI" mitigation named in the design doc's
  risk table.
- `test/auth-flow.e2e-spec.ts` — black-box HTTP cross-tenant test for
  projects.
- `test/credit-ledger.e2e-spec.ts` (integration, real Postgres) — reserve/
  settle/release correctness, plus firing two concurrent `reserve()` calls
  at a balance that can't cover both to prove the `Serializable` isolation
  actually prevents a double-spend (a plain `READ COMMITTED`
  check-then-insert would let both through).
- `test/briefs.e2e-spec.ts` — full HTTP flow (tenant isolation for briefs,
  successful generation's side effects, insufficient credit, mid-stream
  failure) with `ModelRouterService` swapped for a fake via
  `.overrideProvider()` — no real Anthropic/Gemini calls, no cost, and it
  still exercises the real controller/guard/RLS/ledger path.

**No API keys needed to run any of this.** `AnthropicProvider` and
`GeminiProvider` still get constructed by Nest's DI container in these
tests (only `ModelRouterService` itself is swapped), but both SDKs
construct lazily without throwing when no key is present — confirmed by
running the full e2e suite with `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` unset
before trusting CI not to need them as secrets.

The one thing intentionally *not* covered by an automated test: an actual
network call to Anthropic or Gemini succeeding. That was verified manually,
end-to-end, against the real APIs (see git history) — not practical to run
on every CI push without incurring real cost.

## What's deliberately not here yet

Per the doc's phased roadmap — not oversights:

- **OIDC/SSO** — self-issued JWTs (email+password) for now. Doc names real
  OIDC/SSO as a Phase 4 "Enterprise-ready" item.
- **Comment / Approval models** — approval is currently just `Task.status`
  transitioning to `IN_REVIEW`; a dedicated model comes with the Client
  Portal in Phase 2/3.
- **Image/video generation, BullMQ job queue, semantic cache** — Phase 2–3.
  Redis is provisioned already (cheap to add early per doc §6) but nothing
  uses it yet — there's no queue consumer until async (non-text) generation
  exists.
- **Realtime (WebSocket pub-sub)** — Phase 2.
- **Client Portal / `client-approver` & `client-viewer` role UX** — the
  roles exist in the schema (so the enum doesn't need a breaking change
  later), but no portal-specific routes exist yet.

## Repo layout

```
apps/
  api/            NestJS backend (this phase's only app)
    prisma/       schema + hand-authored SQL migrations (incl. RLS policies)
    src/
      prisma/     PrismaService (tenant-scoped client) + AuthBypassPrismaService
      common/     guards (JWT auth, tenant context, roles) + decorators
      auth/       signup/login, JWT issuance
      ai/         ModelRouterService + Anthropic/Gemini providers + pricing
      generation/ CreditLedgerService (hold-then-settle)
      organizations/ users/ projects/ tasks/ briefs/   CRUD modules
    test/         e2e tests, incl. tenant isolation proof
```
