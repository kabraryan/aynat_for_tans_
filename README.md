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
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | the CI trio |
| `pnpm prisma migrate dev` | create/apply migrations |
| `pnpm format` | prettier |

## Gotchas

- **Restart `pnpm dev` after any schema change.** The Prisma client singleton
  is cached on `globalThis` and survives hot reload — stale clients throw
  `Cannot read properties of undefined (reading 'findMany')` on new models.
- All timezone logic lives in `src/lib/dates/` — UTC in the DB, the user's
  IANA timezone (default `Asia/Kolkata`) at the edges. Don't do date math
  elsewhere.
- The proposal gate (spec §10.1): manual CRUD never accepts `sourceId`;
  only proposal acceptance (Phase 2, `src/lib/proposals.ts`) sets it.
