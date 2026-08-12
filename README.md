# AI Creative Agency Platform — Phase 0 + Phase 1

Backend for `ai-creative-agency-system-design.md`. Phase 0 (§5 "Foundations"):
auth, org/tenant model with Postgres Row-Level Security from day one, basic
project/task CRUD. Phase 1 ("MVP"): AI text generation streamed into the
brief → draft → review workflow, with per-tenant cost accounting from the
first request.

There's now a real internal dashboard (`apps/web`, Next.js) covering
overview/projects/finance for agency staff — see "Frontend (apps/web)"
below. It's the Kravio-branded internal tool, not the client-facing portal
the design doc's phased roadmap describes (that's still not built). There's
also still a minimal dev-only test UI — see below.

## Stack

- NestJS (TypeScript) — `apps/api`
- Postgres 16 with Row-Level Security, Prisma ORM
- Redis (provisioned now for a possible future realtime pub-sub layer; no
  application code uses it yet — see design doc §6 Dependencies)
- Anthropic Claude API (primary) with a Gemini fallback for AI generation
- Next.js 16 (App Router, Tailwind CSS v4) — `apps/web`, the internal dashboard
- pnpm workspaces

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
- `POST /tasks/:id/request-revision` — `IN_REVIEW` → `IN_PROGRESS`. Body:
  `{ note: string }` — **required**, same reasoning as `deliverableUrl`
  above: a revision request with no explanation of what's wrong leaves the
  designer/developer with nothing to act on. Logged as a `RevisionRequest`
  row (`round` = a running count of requests so far, billable or not).
  Does **not** increment `Task.revisionsUsed` by itself anymore -- see
  "Revision classification" below. Blocked with `402` once
  `revisionsUsed` reaches `Task.maxRevisions` (default 2) — mirrors the
  credit ledger's "check before, not after" philosophy: unlimited free
  revisions is exactly the kind of scope creep that quietly erodes an
  agency's margin.
- `POST /tasks/:id/approve` — `IN_REVIEW` → `DONE`.

### Revision classification: not every request is the client's fault

Requesting a revision no longer costs the client one of their included
rounds by itself. Whether it *should* is a judgment call -- staff, not the
client, decides whether the request was genuinely new scope or Kravio's
own mistake, and free fixes for the agency's own errors shouldn't burn the
client's quota.

- `PATCH /tasks/:id/revision-requests/:requestId/classify` (staff-only):
  body `{ billable: boolean, note?: string }`. `billable: true` means the
  client asked for something new/out of scope and it counts;
  `billable: false` means it was Kravio's mistake and it's free.
  `RevisionRequest.billable` starts `null` ("not reviewed yet" is a real,
  visible state -- not indistinguishable from "reviewed and free").
- `Task.revisionsUsed` only changes here, as a delta from the request's
  previous classification to its new one -- so re-classifying (staff
  correcting an earlier call) adjusts the count in either direction
  instead of only ever adding to it.
- No dedicated review queue page yet -- `GET /projects/summary`'s
  `pendingRevisionClassifications` counter (see the Ringkasan overview)
  is the awareness mechanism for "something needs a decision."

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

## Payments (DP / pelunasan)

Manual bookkeeping, not a payment gateway integration -- staff records what
came in after the fact (bank transfer, cash, QRIS, whatever), the same way
an agency already tracks this outside any system. Lives on
`ProjectsController`/`ProjectsService`:

- `Project.totalPriceIdr` — the agreed total, in whole Rupiah (a plain
  `Int`, not the "micros" pattern `GenerationJob`/`CreditLedgerEntry` use --
  that exists for fractional per-token USD pricing, a different problem
  than a client-facing IDR total). Nullable: usually agreed after the
  initial brief discussion, not known at project creation. Set via
  `PATCH /projects/:id`.
- `POST /projects/:id/payments` — records one `Payment` row. Body:
  `{ type: "DP" | "PELUNASAN" | "OTHER", amountIdr: number, method: string, note?: string }`.
  Blocked with `400` if `totalPriceIdr` hasn't been set yet -- recording a
  payment against an unpriced project wouldn't mean anything. Staff-only
  (`AGENCY_ADMIN`/`AGENCY_EDITOR`); a client can see payment status but
  doesn't self-report a payment as received.
- `Payment` is append-only, same philosophy as `CreditLedgerEntry`: a
  project's paid-so-far amount is `SUM(payments)`, never a stored balance
  column that could drift from what was actually recorded. `type` is a
  label staff picks, not an enforced state machine -- no ordering or
  exclusivity between DP/PELUNASAN/OTHER is checked, since this is
  bookkeeping for an arrangement the agency already manages with the
  client, not a payment gateway's own state.
- `GET /projects/:id` returns two derived fields alongside the raw data:
  `totalPaidIdr` (the sum) and `paymentStatus` — `NO_PRICE` (no total set
  yet) / `UNPAID` / `PARTIAL` / `PAID`, computed fresh on every read in
  `ProjectsService.findOne()`, never stored.

## Client accounts, AI pricing, invoices & payment verification

Backend support for clients acting for themselves instead of staff relaying
their decisions -- now with a real frontend too, `apps/client` (see below).
Every endpoint below is role-gated.

- **Client accounts** — `POST /users` (`AGENCY_ADMIN` only): body
  `{ email, name, role }`, `role` restricted to `CLIENT_APPROVER` /
  `CLIENT_VIEWER`. Generates a random temporary password server-side and
  returns it **once** in the response — never emailed (that would be the
  actual security anti-pattern here); staff relay it out-of-band the same
  way every other client coordination already happens in this system.
- **Brief submission opens to clients** — `POST /briefs` now also accepts
  `CLIENT_APPROVER` (was staff-only). `CLIENT_VIEWER` stays excluded:
  viewing is not deciding, the same rule the review-cycle endpoints follow.
- **AI price suggestion** — `POST /briefs/:id/suggest-price` (staff-only).
  A synchronous (not SSE) call through the same `ModelRouterService` +
  hold-then-settle credit flow as draft generation, asking the model to
  weigh Indonesian market rate against the brief's complexity. Returns
  `{ priceIdr, reasoning }` and persists both onto the `Brief` row. This is
  a *suggestion* only — it never touches `Project.totalPriceIdr` on its
  own; staff review/edit the number before sending an invoice. Malformed
  model output fails loudly (`502`), never silently stored.
- **Invoices** — `POST /projects/:id/invoices` (staff-only): body
  `{ amountIdr, minDpPercent?, briefId? }`. This is the action that
  actually sets `Project.totalPriceIdr`/`minDpPercent` (kept as its own
  `Invoice` row, not just fields on `Project`, so a later re-invoice at a
  corrected price doesn't erase the prior amount). Emails *only the
  project's own client* (`Project.clientOwnerId`, see "Client isolation"
  below) via Resend, best-effort — a failed or skipped send (no
  `RESEND_API_KEY` set, or no client assigned yet) doesn't fail the
  request; the invoice still exists. `GET /projects/:id/invoices` lists
  history, open to all roles.
- **Client-submitted payment claims** — `POST /projects/:id/payments/claim`
  (`CLIENT_APPROVER` only): same shape as staff's `POST .../payments` plus
  `proofImageBase64` (stored inline as a data URI -- no object storage
  wired up yet, a known tradeoff). Creates a `Payment` with
  `verificationStatus: PENDING`, which does **not** count toward
  `totalPaidIdr` until staff calls
  `PATCH /projects/:id/payments/:paymentId/verify` with
  `{ decision: "VERIFIED" | "REJECTED", note? }`. `note` is **required**
  when rejecting (`400` without it) and persisted as `Payment.verificationNote`
  -- a client who submitted real proof deserves to know why it didn't
  count, not just that it didn't; optional/unused on `VERIFIED`, nothing
  to explain there. Staff-direct entries (the original `POST .../payments`
  flow) are unaffected -- they default straight to `VERIFIED`, since staff
  already confirmed the money arrived before recording it.

### Client isolation (different clients of the same Kravio org)

RLS separates Kravio's whole business from anyone else's, but it does
**not** separate one Kravio client from another -- they're all members of
the same Organization. That became a real problem once clients could
register themselves and create their own projects: without something
else in place, any client could see any other client's briefs, prices,
and payments.

- `Project.clientOwnerId` (nullable `User.id`) is the fix -- an app-level
  ownership layer *inside* the tenant boundary RLS already provides. Set
  automatically when a client creates their own project; null for
  staff-created ones (still supported) until explicitly assigned.
- `apps/api/src/common/client-project-access.ts`'s `assertClientOwnsProject()`
  is the enforcement point -- called at the top of every client-reachable
  path that touches a specific project (`GET /projects/:id`, briefs, tasks,
  payment claims, ...). Staff roles pass through unrestricted. Fails
  closed with `404`, same philosophy as RLS itself: a client gets no signal
  that a project they can't access even exists.
- `GET /projects` is role-aware: staff see every project in the org
  (unchanged); a client sees only `WHERE clientOwnerId = <themselves>`.
  `GET /projects/summary` is staff-only outright -- an org-wide aggregate
  was never meant for a single client's eyes.
- Staff can link a legacy (unowned) project to a client via
  `PATCH /projects/:id` with `{ clientOwnerId }`.
- **Self-registration** — `POST /auth/client-signup` (`@Public()`): body
  `{ name, email, password }`, no invite needed. Unlike `/auth/signup`
  (which spins up a brand-new Organization per call), this joins the one,
  already-known `KRAVIO_ORGANIZATION_ID` org as `CLIENT_APPROVER` --
  this deployment is Kravio's own single-tenant instance, not resold
  multi-agency SaaS, so there's one fixed org to join, set once via env
  var. The endpoint fails loudly if that's unset rather than guessing.

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

## Frontend (apps/web)

Real Next.js internal dashboard for Kravio staff: login, an overview with
quick-stat cards (`GET /projects/summary`), a project list + detail page
(create projects, set `totalPriceIdr`, record DP/pelunasan payments, view
payment history and task status), a finance page aggregating payment
status and recent transactions across every project, a brief detail page
(AI price estimate → approve/edit → send invoice), and a "Klien"/Akun Klien
page for provisioning `CLIENT_APPROVER`/`CLIENT_VIEWER` logins. Talks to
`apps/api` over plain bearer-token REST — no server-side rendering layer
against the API, every page is a client component fetching in `useEffect`.

The project detail page also surfaces a "Verifikasi Pembayaran" section
(image preview + approve/reject) whenever a client-submitted payment claim
is `PENDING` -- see "Client accounts, AI pricing, invoices & payment
verification" above for the backend side of this.

Two things worth knowing if you touch it:

- The JWT lives in `localStorage` (see `apps/web/lib/api.ts`), not an
  httpOnly cookie — a deliberate tradeoff, not an oversight (see the code
  comment there for why, and what would need to change to fix it).
- `apps/api`'s `main.ts` has `app.enableCors()` scoped to
  `CORS_ORIGIN` (comma-separated) or a localhost dev-port fallback — the API,
  `apps/web`, and `apps/client` all run on different ports even in local dev,
  which is a different origin as far as the browser's concerned. If you add
  a new dev port or deploy one of them somewhere, `CORS_ORIGIN` needs to
  include it or every request 404s at the CORS preflight.

Run it with `pnpm --filter web dev` (defaults to :3001 if :3000 is taken by
the API) after the API is up; it reads `NEXT_PUBLIC_API_BASE_URL`
(`apps/web/.env.local`, defaults to `http://localhost:3000`).

## Frontend (apps/client) — the client portal

The other half of "Client accounts, AI pricing, invoices & payment
verification" above: a real, much simpler Next.js app for the client side
of that flow, not just curl-able endpoints. Same stack and Kravio brand
tokens as `apps/web` (most of `lib/`/`components/ui.tsx` started as a copy
of it), but deliberately fewer, more form-oriented screens for a
non-technical audience instead of a dense staff dashboard:

- **Login** (`/login`) — plain email/password against the same
  `POST /auth/login` every other role uses. No demo credentials pre-filled
  here (unlike `apps/web`'s) since there's no seeded client account.
- **Home** (`/`) — lists every project in the client's org (RLS already
  guarantees they only ever see their own tenant's data at the DB layer,
  regardless of what this UI does or doesn't show).
- **Project hub** (`/projects/:id`) — the main screen: tasks currently
  `IN_REVIEW` surface at the top with an inline approve / request-revision
  form (reuses `POST /tasks/:id/approve` and `/request-revision`, which
  already permitted `CLIENT_APPROVER` before this app existed — the gap was
  only ever the missing UI), a payments section (current price, the
  min-DP percentage shown as the plain informational text it's meant to be,
  a form to submit a payment claim with an image), payment history with
  verification-status badges, and other tasks read-only.
- **Brief submission** (`/projects/:id/briefs/new`) — a Website/Desain
  toggle swaps between the two field sets `brief-context.ts` expects
  (`WebsiteBriefContext` / `DesignBriefContext`), posting straight to
  `POST /briefs`.

A staff member (`AGENCY_ADMIN`/`AGENCY_EDITOR`) who logs in here sees a
"this is the client portal" message instead of a client-shaped view of
their own tenant's data — this app is for clients, `apps/web` is for staff.

Run it with `pnpm --filter client dev` — fixed on **:3002**
(`apps/client/package.json`'s `dev` script), not port-fallback like
`apps/web`, so all three apps have stable, predictable local URLs when run
together.

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

# Set a price, then record a DP and a pelunasan payment against it
curl -X PATCH localhost:3000/projects/<projectId> -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"totalPriceIdr":10000000}'
curl -X POST localhost:3000/projects/<projectId>/payments -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"type":"DP","amountIdr":4000000,"method":"Transfer BCA","note":"Uang muka 40%"}'
curl -X POST localhost:3000/projects/<projectId>/payments -H "Authorization: Bearer <accessToken>" -H "Content-Type: application/json" \
  -d '{"type":"PELUNASAN","amountIdr":6000000,"method":"Cash"}'

# Provision a client login (admin token), get an AI price suggestion on
# their brief, send the invoice, then have the client claim a DP with proof
curl -X POST localhost:3000/users -H "Authorization: Bearer <adminAccessToken>" -H "Content-Type: application/json" \
  -d '{"email":"klien@example.com","name":"Klien","role":"CLIENT_APPROVER"}'
curl -X POST localhost:3000/briefs/<briefId>/suggest-price -H "Authorization: Bearer <adminAccessToken>"
curl -X POST localhost:3000/projects/<projectId>/invoices -H "Authorization: Bearer <adminAccessToken>" -H "Content-Type: application/json" \
  -d '{"amountIdr":10000000,"minDpPercent":30,"briefId":"<briefId>"}'
curl -X POST localhost:3000/projects/<projectId>/payments/claim -H "Authorization: Bearer <clientAccessToken>" -H "Content-Type: application/json" \
  -d '{"type":"DP","amountIdr":3000000,"method":"Transfer BCA","proofImageBase64":"data:image/png;base64,..."}'
curl -X PATCH localhost:3000/projects/<projectId>/payments/<paymentId>/verify -H "Authorization: Bearer <adminAccessToken>" -H "Content-Type: application/json" \
  -d '{"decision":"VERIFIED"}'
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
  request-revision / approve cycle: happy path, the *billable* revision
  limit's `402` once `maxRevisions` is reached (via classification, not
  the raw request count), rejecting actions on a task in the wrong state
  (e.g. approving something not in review), rejecting submit-for-review
  with no `deliverableUrl`, rejecting request-revision with no `note`,
  re-submitting after a revision creating a new `Deliverable` version
  instead of overwriting it, a logged `RevisionRequest` recording the
  note against its round number, classifying a revision request
  (`billable: true` increments `revisionsUsed`, `false` doesn't,
  re-classifying adjusts the delta in either direction), and the
  authorization-hole regressions: `PATCH` can't set `status` or inflate
  `maxRevisions`, and each role gets exactly the actions it should
  (`CLIENT_VIEWER` can read but not decide, `CLIENT_APPROVER` can decide but
  not create/delete, `AGENCY_EDITOR` can run the work but not delete).
- `test/project-payments.e2e-spec.ts` — `paymentStatus` transitions
  `NO_PRICE` → `UNPAID` → `PARTIAL` → `PAID` as `Payment` rows are added,
  rejecting a payment before a price is set, rejecting a non-positive
  amount, and that only agency staff (not `CLIENT_VIEWER`/`CLIENT_APPROVER`)
  can record one.
- `test/client-portal-flow.e2e-spec.ts` — client account provisioning
  (temporary password actually logs in, admin-only, rejects an agency role,
  rejects a duplicate email), `CLIENT_APPROVER` can submit a brief and
  `CLIENT_VIEWER` can't, AI price suggestion persists on the brief with the
  same fake-`ModelRouterService` pattern as `briefs.e2e-spec.ts` (plus a
  malformed-output case asserting `502` and that nothing gets stored),
  sending an invoice syncs `Project.totalPriceIdr`/`minDpPercent`, and a
  client's payment claim stays `PENDING` (excluded from `totalPaidIdr`)
  until staff verifies it -- including that a rejected claim never counts.
- `test/client-isolation.e2e-spec.ts` — `POST /auth/client-signup` produces
  a working login in the configured org (rejects a duplicate email); a
  self-registered client's `POST /projects` sets `clientOwnerId`
  automatically and they can brief it; client A gets `404` (not `403`) --
  reading, listing, briefing, task access, approve/request-revision,
  payment claims -- on anything belonging to client B; staff are
  unaffected by any of this; `GET /projects/summary` is staff-only; staff
  can `PATCH` a legacy project's `clientOwnerId` to make it visible to a
  specific client.

**No API keys needed to run any of this.** `AnthropicProvider` and
`GeminiProvider` still get constructed by Nest's DI container in these
tests (only `ModelRouterService` itself is swapped), but both SDKs
construct lazily without throwing when no key is present — confirmed by
running the full e2e suite with `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` unset
before trusting CI not to need them as secrets.

The one thing intentionally *not* covered by an automated test: an actual
network call to Anthropic or Gemini succeeding (draft generation and AI
price suggestion alike). Both were verified manually, end-to-end, against
the real APIs (see git history) — not practical to run on every CI push
without incurring real cost. The price-suggestion path also needed a real
call to catch a bug the fake provider couldn't: `PRICE_SUGGESTION_MAX_TOKENS`
was originally 500, and Claude's extended-thinking budget draws from that
same allocation even at `output_config.effort: "low"` — the visible JSON
was getting truncated before its closing brace. Bumped to 1024.

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
  A real comment model is a natural `apps/client` addition later, if it
  turns out one note per round isn't enough in practice.
- **Realtime (WebSocket pub-sub)** — deferred; Redis is provisioned (cheap
  to add early per doc §6) but nothing uses it yet.
- **Password reset / change** — doesn't exist for any role, client or
  staff. `POST /users`-provisioned client accounts get a one-time temporary
  password with no way to rotate it afterward. Fine for now, a real gap
  once the portal has actual users.

## Repo layout

```
apps/
  api/            NestJS backend
    public/       one-file dev test UI, static-served -- not the real frontend
    prisma/       schema + hand-authored SQL migrations (incl. RLS policies)
    src/
      prisma/     PrismaService (tenant-scoped client) + AuthBypassPrismaService
      common/     guards (JWT auth, tenant context, roles) + decorators
      auth/       signup/login, JWT issuance
      ai/         ModelRouterService + Anthropic/Gemini providers + pricing
      generation/ CreditLedgerService (hold-then-settle)
      notifications/ EmailService (Resend, optional -- invoice emails)
      organizations/ users/ projects/ briefs/   CRUD modules
      tasks/      CRUD + the review cycle (submit-for-review/request-revision/approve)
    test/         e2e tests, incl. tenant isolation proof + review cycle
  web/            Next.js internal dashboard (staff-only), port 3001
    app/
      login/          login page
      (dashboard)/    auth-guarded shell (sidebar) -- overview, projects, finance,
                       brief detail (AI price -> invoice), clients (provisioning)
    components/       shared UI kit + sidebar + hand-authored icons
    lib/               api client, auth context, format/status helpers, types
  client/         Next.js client portal, port 3002 -- most of lib/ and
    app/                                            components/ui.tsx started
      login/          login page                    as a copy of apps/web's
      (portal)/       auth-guarded shell (topbar) -- home, project hub
                       (tasks/payments), brief submission
```
