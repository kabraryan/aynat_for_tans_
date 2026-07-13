# PROJECT_SPEC.md — Student Planner (working title)

**Purpose of this file.** This is the source-of-truth brief for Claude Code. Read this entire file, then produce a detailed implementation plan **before writing any application code**. Section 12 defines exactly what the plan must contain. Section 13 lists open questions you must resolve or surface.

**How the human will use this file:** placed at the repo root; Claude Code will be started in plan mode (or asked to plan first) with the instruction: *"Read PROJECT_SPEC.md and produce the implementation plan described in §12."* Claude Code docs: https://docs.claude.com/en/docs/claude-code/overview

---

## 1. Product summary

A personal web app that helps a student manage time and tasks. Three pillars:

1. **Calendar + to-do list** — the core daily views.
2. **"Dump anything" extraction** — drop in screenshots, photos, or PDFs (e.g. a syllabus) and the app extracts tasks/events using a vision-capable LLM.
3. **Gmail sync** — connects to Gmail read-only, finds deadline-bearing emails (LMS notifications, professor emails), and proposes tasks/events automatically.

**The single most important design rule:** nothing extracted — from files *or* email — is ever saved directly. All extracted items become **proposals** that the user reviews, edits, and confirms on a review screen. Manual entry and confirmed proposals are the *only two write paths* into tasks/events. Every architectural decision must preserve this gate.

Audience: a single user (the developer). No multi-tenant features in v1, but put `userId` on every table from day one so adding users later is not painful.

---

## 2. Goals and non-goals (v1)

### Goals
- Month + week calendar views and a day agenda.
- To-do list: create/edit/complete tasks, course tags, priorities, due dates, drag-to-reorder.
- Upload via drag-and-drop **and paste-from-clipboard** (students screenshot everything) → extraction → review → confirm.
- Syllabus mode: one PDF in, a semester of dated items out.
- Gmail read-only sync feeding the same review gate.
- Google sign-in (required for Gmail anyway).
- Responsive layout usable on a phone browser.

### Non-goals (v1)
- Native mobile apps (PWA is a later phase).
- Collaboration, sharing, multi-user UI.
- Two-way Google Calendar sync (the app keeps its own events in v1).
- Push notifications/reminders (Phase 5).
- Editing/replying to email. Read-only, always.

---

## 3. Tech stack (decided — do not relitigate, but flag genuine blockers)

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router) + TypeScript | One repo, one deploy; API routes as backend |
| Styling | Tailwind CSS | |
| Calendar UI | FullCalendar React **or** react-big-calendar | Plan must pick one and justify (licensing, recurring-event support, mobile behavior) |
| Drag & drop | dnd-kit | Task reordering |
| Uploads | react-dropzone + a paste handler | Paste-from-clipboard is a must-have |
| Server state | TanStack Query | |
| Validation | Zod at every API boundary | Schemas shared with the extraction layer |
| DB | Postgres + Prisma | Local Postgres in dev (docker-compose) |
| Auth | Auth.js (NextAuth) with Google provider | Also carries Gmail OAuth scopes |
| LLM | Anthropic Messages API, vision input, tool-use/structured output | Model string in env (`EXTRACTION_MODEL`, default `claude-sonnet-4-6`); verify current models at https://docs.claude.com/en/api/overview |
| File storage | Local `./storage` in dev; S3-compatible interface behind an adapter | Don't hardcode local paths in business logic |
| Jobs | None in v1; Gmail sync is a manually triggered route, cron later | Keep sync callable as a plain function |

---

## 4. Architecture overview

```
 manual entry ─────────────────────────────┐
                                           ▼
 file/screenshot upload ─▶ Source ─▶ Extraction (LLM) ─▶ Proposals ─▶ REVIEW SCREEN ─▶ Tasks / Events ─▶ Calendar + To-do views
                                           ▲                              (user confirms/edits/rejects)
 Gmail sync (read-only) ─▶ Source ─────────┘
```

- **Source** = the raw artifact (uploaded file or email) an item came from. Never deleted when proposals resolve; the UI can always answer "where did this come from?"
- **Extraction** is idempotent per Source: re-running replaces that Source's *pending* proposals, never touches accepted/rejected ones.
- LLM calls happen **server-side only**. The API key never reaches the client.
- The review screen operates on Proposals. Accepting one creates a Task or Event and marks the proposal `accepted`.

---

## 5. Data model (Prisma sketch — plan must finalize)

```prisma
model User    { id, email @unique, name?, image?, timezone (IANA string, default "America/New_York"), ...Auth.js relations }

model Course  { id, userId, name, code?, color, term? }

model Task    { id, userId, courseId?, title, notes?, dueAt? (DateTime, UTC), allDayDue Boolean,
                priority (LOW|MEDIUM|HIGH), status (TODO|DONE), sortOrder Int,
                sourceId?, createdAt, completedAt? }

model Event   { id, userId, courseId?, title, startAt, endAt, allDay Boolean, location?, notes?, sourceId? }

model Source  { id, userId, type (UPLOAD|EMAIL), fileKey?, mimeType?, originalName?,
                gmailMessageId? @unique, excerpt? (first ~500 chars for display),
                status (PENDING|EXTRACTED|FAILED), error?, createdAt }

model Proposal { id, userId, sourceId, kind (TASK|EVENT), payload Json,   // matches ExtractedItem schema in §7
                 confidence Float, status (PENDING|ACCEPTED|REJECTED),
                 createdAt, resolvedAt? }

model GmailSyncState { userId @id, lastSyncAt?, historyId? }
```

Conventions: store all datetimes in UTC; render in `User.timezone`. `Source.gmailMessageId @unique` is the dedupe mechanism preventing an email from being processed twice.

---

## 6. Core features and acceptance criteria

### 6.1 Calendar
- Month and week views; click a day to see agenda; click empty slot to create an event.
- Events colored by course. Tasks with due dates appear on the calendar as all-day chips, visually distinct from events.
- **Done when:** I can create, edit, drag-reschedule, and delete events; task due dates show on the correct day in my timezone.

### 6.2 To-do list
- Grouped by due date (Overdue / Today / This week / Later / No date); filter by course; drag-to-reorder within groups.
- Quick-add input at the top (plain text in v1; NL parsing is Phase 5+).
- **Done when:** full CRUD, complete/uncomplete with strikethrough + `completedAt`, reorder persists across reloads.

### 6.3 Upload → extraction → review (the differentiator)
- Drop zone accepts png/jpg/webp/pdf up to 15 MB; paste-from-clipboard works anywhere in the app.
- Upload creates a Source, kicks off extraction, and routes the user to the review screen when proposals are ready (poll or simple SSE; plan decides).
- Review screen: one card per proposal showing title, kind, resolved date/time, course guess, confidence, and the `sourceQuote` (verbatim snippet it came from). Every field editable inline. Buttons: accept, reject, accept-all. Confidence below 0.7 renders a visible "check this" badge.
- **Done when:** I paste a screenshot of an assignment page and, within ~15 seconds, confirm a correctly dated task onto my list without touching a form.

### 6.4 Syllabus mode
- Same pipeline, tuned for many-item documents: multi-page PDF handling, batch review UI (table-style accept/edit), course assignment applied to all items at once.
- **Done when:** a real 10-page syllabus PDF yields ≥ 90% of its dated deliverables as proposals, and confirming all of them takes under two minutes.

### 6.5 Gmail sync (read-only)
- OAuth scope: `gmail.readonly` only. Manual "Sync now" button in v1 (route callable later by cron).
- Pre-filter **before** any LLM call: sender domain allowlist (`.edu`, canvas/instructure, blackboard, moodle, gradescope) OR subject/body keywords (due, deadline, assignment, exam, quiz, submit). Everything else is skipped and never sent to the model.
- Matched emails become Sources (dedup by `gmailMessageId`) → same extraction → same review screen. **Never auto-commit.**
- **Done when:** syncing against my real inbox produces proposals only from school-related mail, and re-syncing creates zero duplicates.

### 6.6 Later phases (do not build in v1; plan should reserve space)
Reminders/notifications, recurring tasks, workload heat-map view ("which weeks are crushing"), natural-language quick-add, PWA install.

---

## 7. Extraction module spec

**Structured output contract** (Zod; shared between API validation and the LLM tool schema):

```ts
const ExtractedItem = z.object({
  kind: z.enum(["task", "event"]),
  title: z.string().max(120),
  dueAt: z.string().datetime().nullable(),     // tasks; null if undated
  startAt: z.string().datetime().nullable(),   // events
  endAt: z.string().datetime().nullable(),
  allDay: z.boolean().default(false),
  courseGuess: z.string().nullable(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  confidence: z.number().min(0).max(1),
  sourceQuote: z.string().max(300),            // verbatim text the item was derived from
});
const ExtractionResult = z.object({ items: z.array(ExtractedItem).max(60) });
```

**Prompting requirements**
- Always inject current date-time and the user's IANA timezone into the prompt.
- Relative dates ("next Friday", "end of week") resolve against the injected date. Dates missing a year resolve to the nearest **future** occurrence.
- Never invent times: a deadline with no stated time becomes a date-only (`allDay`) due.
- Ambiguity lowers `confidence`; the model must not guess silently.
- Use tool-use / structured output so the response is schema-conformant JSON, not prose. (Verify current API mechanics at https://docs.claude.com/en/api/overview before implementing.)

**Mechanics**
- Images: pass directly as vision input. PDFs: pass as document input; if page count is large, chunk and merge results (plan decides threshold).
- Cache extraction results keyed by file content hash to avoid re-paying for re-uploads.
- Wrap the whole module behind one function: `extractFromSource(sourceId): Promise<Proposal[]>` — nothing else in the app talks to the LLM.

---

## 8. API surface (App Router route handlers)

```
POST   /api/uploads                    multipart → creates Source, starts extraction
POST   /api/sources/:id/extract       re-run extraction (replaces pending proposals only)
GET    /api/proposals?status=pending
PATCH  /api/proposals/:id             { action: "accept" | "reject", edits?: Partial<ExtractedItem> }
POST   /api/proposals/accept-all      { sourceId }
CRUD   /api/tasks   /api/events   /api/courses
POST   /api/gmail/sync                manual trigger
GET/POST /api/auth/[...nextauth]
```

All handlers: Zod-validate input, scope every query by the session's `userId`, return typed JSON errors.

---

## 9. Build phases (strict order; each phase ends demoable)

- **Phase 0 — Scaffold.** Next.js + TS + Tailwind, Prisma + local Postgres via docker-compose, Auth.js Google sign-in, CI running typecheck/lint/test. *DoD: I can sign in and see an empty authenticated shell.*
- **Phase 1 — Manual core.** Calendar (6.1) + to-do list (6.2) + courses CRUD. *DoD: criteria in 6.1 and 6.2.*
- **Phase 2 — Upload → extract → review.** Feature 6.3 end to end for images and single-page PDFs. *DoD: criterion in 6.3.*
- **Phase 3 — Syllabus mode.** Multi-page PDFs, batch review UI. *DoD: criterion in 6.4.*
- **Phase 4 — Gmail.** Read-only sync through the review gate. *DoD: criterion in 6.5.*
- **Phase 5 — Quality of life.** Reminders, recurring tasks, workload view, NL quick-add, PWA. Scope with the user first.

---

## 10. Engineering principles

1. The proposal gate is inviolable: no code path writes Tasks/Events except manual CRUD and proposal acceptance.
2. Server-only secrets; the browser never calls the LLM or Google APIs directly.
3. UTC in the database, user timezone at the edges, tested explicitly.
4. Extraction is deterministic-ish and testable: fixtures in `/fixtures` (sample syllabi, screenshots, emails) with expected-output JSON, plus a scoring script (see §12.6).
5. Every table row carries `userId`; every query filters by it.
6. Prefer boring code over cleverness; this is a solo-maintained app.

---

## 11. Environment and secrets

```
DATABASE_URL=
NEXTAUTH_SECRET=            NEXTAUTH_URL=
GOOGLE_CLIENT_ID=           GOOGLE_CLIENT_SECRET=
ANTHROPIC_API_KEY=
EXTRACTION_MODEL=claude-sonnet-4-6
STORAGE_DIR=./storage       # dev; S3 vars reserved for later
```

**Known Google OAuth gotcha to plan around:** `gmail.readonly` is a restricted scope. For a personal app, keep the OAuth consent screen in *Testing* mode with the developer as a test user to avoid the verification process — but check current Google policy on refresh-token expiry for apps in Testing mode and design the auth flow so re-consent is a one-click annoyance, not a data-loss event.

---

## 12. What your implementation plan must include (Claude Code: this is your deliverable)

1. **Restated understanding** of the architecture in your own words, flagging anything in this spec that is contradictory, ambiguous, or unwise — before proposing solutions.
2. **Repo file tree** for the finished Phase-2 state, with one-line purpose per directory.
3. **Finalized Prisma schema** (complete, migration-ready), noting deviations from §5 and why.
4. **Milestone plan** mapped to Phases 0–4: tasks sized at ≤ half a day each, ordered, with each phase's Definition of Done copied in and a short "demo script" describing how the user verifies the phase by hand.
5. **Extraction module design:** the actual system prompt draft, the tool/JSON schema, function signatures, PDF chunking approach, and the caching strategy.
6. **Test strategy:** unit tests for date resolution (relative dates, missing years, timezone edges); a fixture-based extraction evaluation script with a simple accuracy score; API route tests for the proposal gate (prove nothing bypasses it).
7. **Risk register** (top 5) with mitigations — at minimum: date-parsing errors, Google OAuth verification/testing-mode limits, LLM cost on large PDFs, calendar-library fit, scope creep.
8. **Decision points** where you chose between options (e.g. calendar library, polling vs. SSE), each with a one-paragraph justification.
9. **Batched open questions** for the user (including §13), asked once, not dribbled out.

Do **not** write application code until the user approves the plan.

---

## 13. Open questions (resolve in the plan or ask)

1. Single-timezone assumption OK for v1 (store UTC, render in one configured zone)?
2. Is a `Term`/semester entity needed in v1, or is a plain `Course.term` string enough?
3. FullCalendar vs. react-big-calendar — pick after checking licensing and recurring-event needs.
4. Hosting target: local-only to start, or deploy from day one (e.g. Vercel + hosted Postgres)? Affects storage adapter and cron choices.
5. Proposal-readiness UX: polling vs. SSE for "extraction finished."
