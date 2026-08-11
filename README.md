# AI Creative Agency Platform — Phase 0 + Phase 1

Backend for `ai-creative-agency-system-design.md`. Phase 0 (§5 "Foundations"):
auth, org/tenant model with Postgres Row-Level Security from day one, basic
project/task CRUD. Phase 1 ("MVP"): AI text generation streamed into the
brief → draft → review workflow, with per-tenant cost accounting from the
first request.

The real frontend (Next.js) is not part of either phase yet — see the design
doc's phased roadmap. There is a minimal dev-only test UI, though — see
below.

## Stack

- NestJS (TypeScript) — `apps/api`
- Postgres 16 with Row-Level Security, Prisma ORM
- Redis (provisioned now for a possible future realtime pub-sub layer; no
  application code uses it yet — see design doc §6 Dependencies)
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

**The AI draft is a starting point for a human, never the deliverable.**
For both brief types, the AI's output is written direction -- for `WEBSITE`
briefs, a sitemap + draft copy for the agency's own developer to build from;
for `DESIGN` briefs, mood/palette/layout direction (explicitly *not* an
image) for the agency's own designer to execute. A human always does the
actual creative/dev work from there -- see "Review & revision cycle" below
for what happens next. This is why a successful generation moves the task
to `IN_PROGRESS`, not `IN_REVIEW`: the AI finishing is the start of the
human's work, not the end of it.

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

## Review & revision cycle

Once a human has done their part (built the page, made the design), someone
on the agency submits it for the client to look at. The client either
approves it or asks for changes -- up to a set number of times before it's
a new arrangement, not a free revision. All three actions are on
`TasksController`/`TasksService`:

- `POST /tasks/:id/submit-for-review` — `TODO`/`IN_PROGRESS` → `IN_REVIEW`.
  Body: `{ deliverableUrl: string, deliverableNote?: string }`. The URL is
  **required** -- "review this" with nothing concrete for the client to
  open isn't a real review request. Each call creates a new `Deliverable`
  row (versioned like `Asset`, see its schema comment) rather than
  overwriting the last one, so re-submitting after a revision round doesn't
  erase what was shown in the previous round.
- `POST /tasks/:id/request-revision` — `IN_REVIEW` → `IN_PROGRESS`, and
  increments `Task.revisionsUsed`. Body: `{ note: string }` — **required**,
  same reasoning as `deliverableUrl` above: a revision request with no
  explanation of what's wrong leaves the designer/developer with nothing to
  act on. Logged as a `RevisionRequest` row (`round` = the new
  `revisionsUsed` value), so the full history of what was asked for each
  round is on record, not just the latest note. Blocked with `402` once
  `revisionsUsed` reaches `Task.maxRevisions` (default 2) — mirrors the
  credit ledger's "check before, not after" philosophy: unlimited free
  revisions is exactly the kind of scope creep that quietly erodes an
  agency's margin.
- `POST /tasks/:id/approve` — `IN_REVIEW` → `DONE`.

**Status is not directly settable.** `PATCH /tasks/:id` deliberately does
not accept `status` -- the transitions above are the only way it changes,
because they're what enforce the rules that make the status mean anything
(no `IN_REVIEW` without a deliverable, no approving something not in
review, no exceeding the revision allowance). An earlier version did accept
it, and a single `PATCH {"status":"DONE"}` walked a task from `TODO` to
`DONE` past all of it. `test/task-review-flow.e2e-spec.ts` has a regression
test that fails if the field ever comes back.

**Roles** (`TasksController`, mirroring `ProjectsController`): create/update
and submit-for-review are agency staff only; delete is admin-only; reads are
open to every authenticated tenant member, which is the whole point of
`CLIENT_VIEWER`. `approve` and `request-revision` additionally allow
`CLIENT_APPROVER` — they're the client's decisions — while still permitting
staff, since today a staff member records a decision the client relayed
out-of-band. `CLIENT_VIEWER` is excluded from both: viewing is not deciding.

## Dev test UI

Open **http://localhost:3000/** after `pnpm dev` — a single static HTML page
(`apps/api/public/index.html`) with login/signup, project + brief creation,
a "Generate" button that streams the draft live, and per-task
submit-for-review / request-revision / approve buttons that drive the cycle
above (standing in for the client, since there's no portal for a client to
do this themselves yet). It calls the exact same API as the curl examples
below; it's a testing convenience, not the product's real frontend (no
build step, no framework, plain JS).

Two things worth knowing if you touch it:

- It's served via `app.useStaticAssets()` (Express static middleware) in
  `main.ts`, not a Nest controller -- deliberately, so loading the page
  doesn't get rejected by `JwtAuthGuard` for having no token yet.
- The native browser `EventSource` API can't set an `Authorization` header,
  and `/briefs/:id/generate` requires a Bearer token -- so the page reads
  the SSE stream manually via `fetch()` + `response.body.getReader()`
  instead, parsing `event:`/`data:` lines itself. If you add another SSE
  endpoint, reuse that same parsing code rather than switching to
  `EventSource` (it will silently 401).

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

# Create a WEBSITE brief, then stream a text draft
curl -X POST localhost:3000/briefs -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"projectId":"<projectId>","title":"Bakery site","type":"WEBSITE","context":{"businessType":"Local bakery","targetAudience":"Neighborhood families","painPoints":"No online presence","goals":"Simple site with menu and location"}}'
curl -N localhost:3000/briefs/<briefId>/generate -H "Authorization: Bearer <accessToken>"

# Once a human has built/designed the real thing from that draft, submit it
# for review (deliverableUrl is required -- a link to the real work), then
# approve (or request changes -- up to maxRevisions times)
curl -X POST localhost:3000/tasks/<taskId>/submit-for-review -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"deliverableUrl":"https://staging.example.com/preview","deliverableNote":"Footer still pending"}'
curl -X POST localhost:3000/tasks/<taskId>/approve -H "Authorization: Bearer <accessToken>"
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
  risk table. Beyond the behavioural cases it asserts two schema-wide
  invariants, derived from `information_schema`/`pg_policies` rather than a
  hardcoded table list: every tenant-scoped table has RLS **enabled and
  forced**, and every policy goes through `current_tenant_id()` rather than
  a raw `current_setting(...)::uuid`. Those exist because `deliverables` and
  `revision_requests` shipped with the raw pattern the
  `fix_rls_null_handling` migration had already replaced — the behavioural
  test only looked at `projects`, so it stayed green. Deriving the table
  list from the database means a future table is covered automatically.
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
- `test/task-review-flow.e2e-spec.ts` — the submit-for-review /
  request-revision / approve cycle: happy path, the revision limit's `402`
  once `maxRevisions` is reached, rejecting actions on a task in the wrong
  state (e.g. approving something not in review), rejecting
  submit-for-review with no `deliverableUrl`, rejecting request-revision
  with no `note`, re-submitting after a revision creating a new
  `Deliverable` version instead of overwriting it, and a logged
  `RevisionRequest` recording the note against its round number.

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

Per the doc's phased roadmap, or per how this agency actually works — not
oversights:

- **AI image/video generation** — tried, then removed. The team's actual
  workflow always has a human designer executing the visual work from the
  AI's written direction (see "AI generation" above) — an AI-generated
  image was never going to be the deliverable, so generating one wasn't
  worth its real per-image cost. Not a deferred phase; a decision.
- **OIDC/SSO** — self-issued JWTs (email+password) for now. Doc names real
  OIDC/SSO as a Phase 4 "Enterprise-ready" item.
- **Threaded comments/annotations** — `RevisionRequest.note` captures one
  piece of feedback per revision round, but there's no back-and-forth
  thread, no commenting on a specific part of the deliverable, no replies.
  A real comment model comes with the Client Portal, if it turns out one
  note per round isn't enough in practice.
- **Realtime (WebSocket pub-sub)** — deferred; Redis is provisioned (cheap
  to add early per doc §6) but nothing uses it yet.
- **Client Portal / `client-approver` & `client-viewer` role UX** — the
  roles exist in the schema (so the enum doesn't need a breaking change
  later), and the review-cycle endpoints above are ready to be gated to
  them, but no portal-specific routes or client-facing auth exist yet. This
  is the real gap right now: clients currently can't interact with the
  system at all -- an agency staff member calls approve/request-revision on
  the client's behalf after hearing back from them out-of-band.
- **Real frontend (Next.js)** — `apps/api/public/index.html` is a one-file
  dev test page (see above), not the product's actual UI.

## Repo layout

```
apps/
  api/            NestJS backend (this phase's only app)
    public/       one-file dev test UI, static-served -- not the real frontend
    prisma/       schema + hand-authored SQL migrations (incl. RLS policies)
    src/
      prisma/     PrismaService (tenant-scoped client) + AuthBypassPrismaService
      common/     guards (JWT auth, tenant context, roles) + decorators
      auth/       signup/login, JWT issuance
      ai/         ModelRouterService + Anthropic/Gemini providers + pricing
      generation/ CreditLedgerService (hold-then-settle)
      organizations/ users/ projects/ briefs/   CRUD modules
      tasks/      CRUD + the review cycle (submit-for-review/request-revision/approve)
    test/         e2e tests, incl. tenant isolation proof + review cycle
```
