# Aynat — Student Planner

Personal planner: calendar + tasks, "dump anything" LLM extraction
(screenshots/PDFs → reviewed proposals), and read-only Gmail sync.
Spec: [aynat_spec.md](aynat_spec.md) · Implementation plan: [docs/PLAN.md](docs/PLAN.md)

## Stack

Next.js (App Router) · TypeScript · Tailwind 4 · Prisma 7 + Postgres 16 ·
Auth.js v5 (Google) · TanStack Query · FullCalendar · dnd-kit · Zod ·
Anthropic Messages API (Phase 2+)

## Dev setup

```bash
docker compose up -d          # Postgres 16 (Docker via Colima on this machine)
cp .env.example .env          # fill AUTH_GOOGLE_ID/SECRET, AUTH_SECRET, etc.
pnpm install                  # also runs prisma generate
pnpm prisma migrate dev       # apply migrations
pnpm dev                      # http://localhost:3000
```

Google OAuth client (consent screen in *Testing* mode) needs redirect URI
`http://localhost:3000/api/auth/callback/google`.

## Commands

| Command | What |
|---|---|
| `pnpm dev` | dev server (port 3000 — pinned; OAuth redirect URI depends on it) |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | the CI trio (tests need the Postgres container: they use an `aynat_test` DB + the stub backend) |
| `pnpm eval` | score extraction against `fixtures/` (runs the real backend — agent by default) |
| `pnpm prisma migrate dev` | create/apply migrations |
| `pnpm format` | prettier |

## Always-on (start at login)

`scripts/serve.sh` boots the whole stack (Colima → Postgres → app). To run it
automatically at login via launchd:

```bash
cp scripts/com.aryankabra.aynat.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.aryankabra.aynat.plist
```

Manage it with:

```bash
launchctl kickstart -k gui/$(id -u)/com.aryankabra.aynat   # restart (e.g. after schema changes)
launchctl bootout gui/$(id -u)/com.aryankabra.aynat        # stop + disable
tail -f ~/Library/Logs/aynat.log                           # logs
```

## Gotchas

- **Restart `pnpm dev` after any schema change.** The Prisma client singleton
  is cached on `globalThis` and survives hot reload — stale clients throw
  `Cannot read properties of undefined (reading 'findMany')` on new models.
- All timezone logic lives in `src/lib/dates/` — UTC in the DB, the user's
  IANA timezone (default `Asia/Kolkata`) at the edges. Don't do date math
  elsewhere.
- The proposal gate (spec §10.1): manual CRUD never accepts `sourceId`;
  only proposal acceptance (`src/lib/proposals.ts`) sets it. The proofs live
  in `tests/api/gate.test.ts` and run in CI.
- Extraction backends (`EXTRACTION_BACKEND`): `agent` drives the locally
  signed-in Claude Code CLI headlessly (subscription, no API key — local
  only); `stub` returns canned items; `api` is reserved for the deploy path.
