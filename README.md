# AI Creative Agency Platform — Phase 0 + Phase 1 + Phase 2 (partial)

Backend for `ai-creative-agency-system-design.md`. Phase 0 (§5 "Foundations"):
auth, org/tenant model with Postgres Row-Level Security from day one, basic
project/task CRUD. Phase 1 ("MVP"): AI text generation streamed into the
brief → draft → approve workflow, with per-tenant cost accounting from the
first request. Phase 2 ("Multi-modal + Realtime"), scoped down: AI image
generation via a BullMQ job queue, with WebSocket push notifications for job
status instead of polling. Video generation and general realtime
presence/comments are explicitly not in this slice — see "What's
deliberately not here yet" below.

The real frontend (Next.js) is not part of any phase yet — see the design
doc's phased roadmap. There is a minimal dev-only test UI, though — see
below.

## Stack

- NestJS (TypeScript) — `apps/api`
- Postgres 16 with Row-Level Security, Prisma ORM
- Redis: BullMQ job queue (image generation) + Socket.io pub-sub backing
- Anthropic Claude API (primary) with a Gemini fallback for AI text
  generation; Gemini (`gemini-3.1-flash-image`) for AI image generation
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

## Image generation + realtime (Phase 2)

Image generation only applies to `DESIGN`-type briefs (`WEBSITE` briefs stay
text-only). `POST /briefs/:id/generate-image` reserves credit synchronously
(same hold pattern as text) and returns `202 { jobId }` immediately — the
actual generation happens in a BullMQ worker, and the result arrives over
WebSocket, never in the HTTP response. This is not a stylistic choice: the
design doc is explicit that image/video generation must be "job +
webhook/websocket notification — never a blocking HTTP call" (§4.1), unlike
text which streams inline over SSE.

- `apps/api/src/ai/providers/gemini-image.provider.ts` — wraps
  `models.generateContent` with `responseModalities: ["IMAGE"]` (Gemini's
  `gemini-3.1-flash-image` / "Nano Banana" model family) — **not** the
  separate Imagen-only `models.generateImages` endpoint, and not
  `GeminiProvider`'s `interactions.create` (text path). Request/response
  shape confirmed directly against the installed `@google/genai` `.d.ts`.
  No free tier — roughly $0.067/image (see `model-pricing.ts`).
- `apps/api/src/generation/image-generation.processor.ts` — the BullMQ
  worker (`@nestjs/bullmq`'s `WorkerHost`). Runs outside any HTTP request,
  so every DB write goes through `prisma.runAsTenant()` explicitly (no CLS
  tenant context exists in a background job). On success: saves the image
  to disk, creates an `IMAGE` `Asset`, settles the credit hold, flips the
  task to `IN_REVIEW`. On failure: releases the hold, marks the
  `GenerationJob` `FAILED`. No automatic retries — see the file's comment
  on why a naive retry would double-handle an already-released credit hold.
- `apps/api/src/storage/local-image-storage.service.ts` — generated images
  are written to `apps/api/storage/generated/{organizationId}/` on local
  disk and served statically at `/generated/...`. A deliberate
  simplification for this local/portfolio deployment, not the intended
  production shape — the design doc calls for S3-compatible object storage
  (§8); swapping later only needs a new implementation of the same `save()`
  signature.
- `apps/api/src/realtime/realtime.gateway.ts` — a Socket.io gateway pushing
  `job:update` events (`PROCESSING` / `COMPLETED` / `FAILED`) to clients.
  Socket.io connections don't go through the HTTP Passport guard pipeline,
  so the JWT is verified manually from the handshake `auth` payload; clients
  join a room per `organizationId` (the WebSocket-layer equivalent of the
  RLS tenant boundary). Scoped intentionally to job-status only — there's no
  comment/presence data model yet for the fuller realtime vision in design
  doc §4.2.

**Testing note**: `test/image-generation.e2e-spec.ts` boots a real
`socket.io-client` against the app to assert the `job:update` event
actually arrives, not just that the enqueue call returns 202. Running the
full e2e suite requires `--runInBand` (already set in
`pnpm --filter api test:e2e`) — each e2e file boots its own full `AppModule`,
and therefore its own live BullMQ `Worker` on the same Redis queue; running
those worker processes concurrently across parallel Jest workers caused
severe contention in testing (one run took 35 minutes instead of ~9 seconds
serialized). This is a known tradeoff of every e2e file sharing one real
Redis instance, not a bug in the queue logic itself.

## Dev test UI

Open **http://localhost:3000/** after `pnpm dev` — a single static HTML page
(`apps/api/public/index.html`) with login/signup, project + brief creation,
a "Generate" button that streams the text draft live, and (for `DESIGN`
briefs) a "Generate Gambar" button that kicks off async image generation and
renders the result once a `job:update` WebSocket event reports it complete.
It calls the exact same API as the curl examples below; it's a testing
convenience, not the product's real frontend (no build step, no framework,
plain JS, Socket.io client served from the server itself at
`/socket.io/socket.io.js` — no CDN dependency).

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

# Phase 1: create a WEBSITE brief, then stream a text draft
curl -X POST localhost:3000/briefs -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"projectId":"<projectId>","title":"Bakery site","type":"WEBSITE","context":{"businessType":"Local bakery","targetAudience":"Neighborhood families","painPoints":"No online presence","goals":"Simple site with menu and location"}}'
curl -N localhost:3000/briefs/<briefId>/generate -H "Authorization: Bearer <accessToken>"

# Phase 2: create a DESIGN brief, then generate an image (async -- result
# arrives over WebSocket, not in this response; see the section above)
curl -X POST localhost:3000/briefs -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"projectId":"<projectId>","title":"Ramadan promo poster","type":"DESIGN","context":{"designType":"Poster","purpose":"Ramadan sale promotion","keyMessage":"30% off all pastries"}}'
curl -X POST localhost:3000/briefs/<briefId>/generate-image -H "Authorization: Bearer <accessToken>"
```

## Tests

```bash
pnpm --filter api test       # unit tests -- no DB, no network
pnpm --filter api test:e2e   # integration/e2e -- needs Postgres + Redis running, serialized (--runInBand)
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
- `test/image-generation.e2e-spec.ts` — the async image job path end-to-end,
  with `GeminiImageProvider` faked (no real cost) but everything else real:
  actual BullMQ job on actual Redis, actual `socket.io-client` asserting the
  `job:update` WebSocket event, insufficient-credit (402) and
  wrong-brief-type (400) rejections, and credit-release-on-failure.

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
- **Video generation** — deliberately cut from this Phase 2 slice. The
  design doc groups image + video together, but video generation is
  materially more expensive and slower, and isn't a fit for this platform's
  actual target use case (web dev + visual design services, not video
  production). Image generation's job-queue + realtime-notification
  machinery (BullMQ + WebSocket) is already the right shape to extend to
  video later if it's ever needed.
- **General realtime presence/comments** — the WebSocket gateway added in
  Phase 2 only pushes generation-job status. Presence ("someone is
  viewing/editing this") and comment threads need their own data model
  first (design doc §4.2) — not built yet.
- **Semantic caching** — Phase 3. Needs a vector store (pgvector), not
  provisioned yet.
- **Client Portal / `client-approver` & `client-viewer` role UX** — the
  roles exist in the schema (so the enum doesn't need a breaking change
  later), but no portal-specific routes exist yet.
- **Real frontend (Next.js)** — `apps/api/public/index.html` is a one-file
  dev test page (see above), not the product's actual UI.

## Repo layout

```
apps/
  api/            NestJS backend (this phase's only app)
    public/       one-file dev test UI, static-served -- not the real frontend
    storage/      generated images on local disk (gitignored), served at /generated
    prisma/       schema + hand-authored SQL migrations (incl. RLS policies)
    src/
      prisma/     PrismaService (tenant-scoped client) + AuthBypassPrismaService
      common/     guards (JWT auth, tenant context, roles) + decorators
      auth/       signup/login, JWT issuance
      ai/         ModelRouterService + Anthropic/Gemini text+image providers + pricing
      generation/ CreditLedgerService (hold-then-settle) + image-generation BullMQ processor
      queue/      root BullMQ (Redis) connection module
      realtime/   Socket.io gateway, pushes generation job:update events
      storage/    local disk storage for generated images
      organizations/ users/ projects/ tasks/ briefs/   CRUD modules
    test/         e2e tests, incl. tenant isolation proof + image generation
```
