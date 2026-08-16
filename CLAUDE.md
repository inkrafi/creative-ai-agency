# Project rules for Claude

## Workflow

- Don't run builds, lint, or test suites after every prompt/instruction by default -- implement the requested change and stop there. Only verify (build/lint/e2e) when the user explicitly asks for it, or right before creating a commit.
- Never `git push` without asking first -- every push needs its own confirmation, even right after a commit, even if a previous push in the same session was approved.
- For changes that remove or restructure a user-facing concept (not just visual polish -- e.g. dropping a whole flow/entity from the UI), confirm scope with AskUserQuestion before implementing. This project has been through several rounds of UX rework already; confirming direction first avoids redoing work.

## Dev environment

- Three dev servers typically run locally: apps/api on :3000, apps/web (staff dashboard) on :3001, apps/client (client portal) on :3002. Check if they're already running (or check with the user) before starting new ones.
- On Windows, after `prisma migrate` / `prisma generate`, the query engine DLL can get locked by a running `nest start --watch` process (`EPERM` renaming `query_engine-windows.dll.node.tmp`). Fix: find the stale `node.exe` processes running apps/api's dev server (`Get-CimInstance Win32_Process -Filter "Name='node.exe'"`, look for `nest` or `--filter api` in the command line), kill them, retry `prisma generate`, then restart the dev server.

## This project

- apps/api: NestJS + Prisma + Postgres, RLS-based tenant isolation. apps/web: staff/internal dashboard (blue-on-white brand). apps/client: customer-facing portal for non-technical small-business clients (fuller palette -- cream/navy alongside the blue/lime brand colors -- for a warmer, friendlier tone). Keep these two frontends' visual identities distinct; don't carry apps/web's styling into apps/client or vice versa.
- All user-facing copy is in Bahasa Indonesia.
- The client portal's IA is Brief-centric, not Project-centric: a client submits a Brief directly, with no separate "create a project" step. A Project is still created automatically behind the scenes to hold payment/invoice/task data, but it's never exposed to the client as its own concept. Keep new client-facing features consistent with this model.
