# Aynat — Student Planner

A personal web app that keeps a student's life on one calendar:

- **Calendar + to-do list** — month/week/day views, drag to reschedule, tasks
  grouped by Overdue / Today / This week, drag to reorder, course color-coding.
- **Dump anything** — drop (or ⌘V-paste) a screenshot, photo, or PDF syllabus.
  An LLM extracts every dated task and event; a 10-page syllabus becomes a
  semester of deadlines in one upload.
- **Gmail sync (read-only)** — finds deadline-bearing school emails and turns
  them into proposed tasks. Nothing else is ever read or sent to a model.
- **Quality of life** — natural-language quick-add ("ps4 friday 5pm #cs201
  !high"), recurring tasks/events, a workload heat-map ("which weeks are
  crushing"), and browser reminders.

**The one rule everything is built around:** nothing extracted — from files
*or* email — is ever saved directly. Every extracted item becomes a
**proposal** you review, edit, and explicitly accept. Manual entry and
accepted proposals are the only two write paths into your calendar. This is
enforced by tests (`tests/api/gate.test.ts`).

Built with Next.js (App Router) · TypeScript · Tailwind · Prisma + Postgres ·
Auth.js (Google) · TanStack Query · FullCalendar · dnd-kit · Zod.

---

## Prerequisites

| What | Why | Install (macOS) |
|---|---|---|
| Node.js 20.19+ (or 22.12+ / 24+) and pnpm | runtime + package manager (Prisma's floor is higher than Next's) | `brew install node pnpm` |
| Docker | local Postgres | `brew install colima docker docker-compose && colima start`, then wire the compose plugin: `mkdir -p ~/.docker/cli-plugins && ln -sfn $(brew --prefix)/opt/docker-compose/bin/docker-compose ~/.docker/cli-plugins/docker-compose` — or just use Docker Desktop |
| A Google account | sign-in (and optional Gmail sync) | — |
| [Claude Code](https://claude.com/claude-code), signed in | AI extraction on your Claude subscription — no API key needed | see note below |

Linux works too (any Docker + Node setup); the auto-start script is macOS-only.

**About AI extraction:** the extractor runs behind a pluggable backend
(`EXTRACTION_BACKEND` in `.env`):

- `agent` *(default)* — drives your locally signed-in **Claude Code CLI**
  headlessly. Uses your Claude subscription; no API key, no per-call charges.
  Requires `claude` on your PATH and works only on the machine you're signed
  in on.
- `stub` — returns canned demo items. Zero setup; lets you try the full
  upload → review → accept flow without any AI account.
- `api` — reserved for a hosted deployment against the Anthropic API.
  **Not implemented yet.**

Everything except extraction (calendar, tasks, review UI, Gmail pre-filter)
involves no AI and no external calls.

---

## Quick start

```bash
git clone https://github.com/kabraryan/aynat_for_tans_.git
cd aynat_for_tans_
pnpm install                # also generates the Prisma client
docker compose up -d        # Postgres 16 on localhost:5432
cp .env.example .env        # then edit — see next section
pnpm prisma migrate dev     # create the schema
pnpm dev                    # http://localhost:3000
```

### Filling in `.env`

1. **`AUTH_SECRET`** — run `openssl rand -base64 32` and paste the output.
2. **Google OAuth client** (required for sign-in):
   1. Go to [console.cloud.google.com](https://console.cloud.google.com) →
      create a project.
   2. *APIs & Services → OAuth consent screen*: External, any app name, add
      **your own email as a test user**, leave publishing status *Testing*.
   3. *APIs & Services → Credentials → Create credentials → OAuth client ID*:
      **Web application**, authorized redirect URI
      `http://localhost:3000/api/auth/callback/google`.
   4. Copy the Client ID/Secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.
3. **`EXTRACTION_BACKEND`** — `agent` if you have Claude Code signed in,
   otherwise `stub` to explore.

Sign in at http://localhost:3000, add your courses under **Settings**, and
drop a syllabus onto the **Review** page.

### Optional: Gmail sync

1. Enable the **Gmail API** for your Google Cloud project
   ([direct link](https://console.cloud.google.com/apis/library/gmail.googleapis.com)).
2. Edit `src/config/gmail-filters.ts` — replace the school domain with yours
   and tune the keyword list. This pre-filter decides which emails are even
   *considered*; everything else never leaves your inbox.
3. In the app: *Settings → Connect Gmail* (grants read-only scope) → *Sync now*.

Note: OAuth apps in *Testing* mode get refresh tokens that expire every ~7
days — the app degrades to a one-click "Connect Gmail" re-consent, never data
loss.

### Optional: personalization

- **Timezone**: dates are stored in UTC and rendered in one configured IANA
  timezone (default `Asia/Kolkata`). Change the default in
  `prisma/schema.prisma` (`User.timezone`) before your first sign-in, or
  update your `User` row afterwards.
- **Extraction model** (agent backend): `EXTRACTION_MODEL` in `.env`.

---

## Always-on (macOS)

To have the whole stack (Docker → Postgres → app) start at login and restart
on crashes:

```bash
bash scripts/install-autostart.sh
```

The script refuses to install if the project lives under `~/Desktop`,
`~/Documents`, or `~/Downloads` — macOS privacy protection silently blocks
login services from reading those folders. Keep the project somewhere like
`~/aynat`.

The service starts Docker via Colima automatically (or launches Docker
Desktop if installed); with Docker Desktop it's simplest to also enable its
own "start at login" setting.

Manage the service:

```bash
launchctl kickstart -k gui/$(id -u)/com.aynat.serve   # restart (e.g. after schema changes)
launchctl bootout gui/$(id -u)/com.aynat.serve        # stop + uninstall
tail -f ~/Library/Logs/aynat.log                      # logs
```

---

## Commands

| Command | What |
|---|---|
| `pnpm dev` | dev server on port 3000 (pinned — the OAuth redirect URI depends on it) |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | the CI trio (tests need the Postgres container; they create a separate `aynat_test` database and use the free `stub` backend) |
| `pnpm eval` | score extraction quality against `fixtures/` (runs your real backend) |
| `pnpm prisma migrate dev` | create/apply schema migrations |
| `pnpm format` | prettier |

## Gotchas

- **Restart the dev server after any Prisma schema change.** The client is
  cached on `globalThis` and survives hot reload; stale clients throw
  `Cannot read properties of undefined (reading 'findMany')`.
- All timezone logic lives in `src/lib/dates/` — UTC in the DB, the user's
  timezone at the edges. Don't do date math anywhere else.
- The proposal gate: manual CRUD never accepts a `sourceId`; only proposal
  acceptance (`src/lib/proposals.ts`) introduces provenance (the
  recurring-task chain copies it forward to spawned occurrences). If you add
  a write path, extend `tests/api/gate.test.ts` to prove it can't bypass
  review.
- If you move the project folder, delete `.next` before restarting — the
  build cache bakes in absolute paths.

## Project docs

- [`aynat_spec.md`](aynat_spec.md) — the original product spec.
- [`docs/PLAN.md`](docs/PLAN.md) — the implementation plan the build followed
  (architecture, schema, decisions, risk register).

## License

[MIT](LICENSE)
