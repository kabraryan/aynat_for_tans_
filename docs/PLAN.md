# Implementation Plan — Student Planner ("aynat")

## Context

[aynat_spec.md](aynat_spec.md) defines a single-user student planner: calendar + to-do list, "dump anything" LLM extraction (screenshots/PDFs → proposals), and read-only Gmail sync — all funneled through an inviolable **proposal review gate**. The spec (§12) requires this plan before any application code. The directory contains only the spec; everything is greenfield (git init included in Phase 0).

**User decisions already collected (batched, per §12.9/§13):**
- **Hosting:** local-first, deploy-ready — docker-compose Postgres + `./storage` in dev, but DB/storage/LLM behind adapters so Vercel + hosted Postgres at Phase 3–4 is config, not refactor.
- **Timezone:** default render timezone **Asia/Kolkata** (deviation from spec sketch's America/New_York).
- **UI direction:** clean & minimal (Notion/Things-style) — whitespace, muted neutrals, course colors as accents.

---

## 1. Restated understanding + spec flags

**Architecture in one paragraph:** There are exactly two write paths into `Task`/`Event`: manual CRUD and proposal acceptance. Everything ingested (uploaded file or matched email) becomes a `Source` (never deleted), extraction turns a Source into `Proposal` rows (pending), and only an explicit user action on the review screen converts a proposal into a Task/Event. Extraction is idempotent per Source: re-running replaces only that Source's *pending* proposals. LLM and Google API calls are server-only. UTC in the DB, user timezone at the edges.

**Flags (ambiguities/refinements found in the spec — resolved as noted):**

1. **`dueAt: z.string().datetime()` vs. "never invent times" (§7).** An all-day due still needs a datetime string under the spec's schema. Resolution: keep the spec's shape; the prompt instructs the model to emit `dueAt` as ISO-8601 **UTC** (`Z` suffix — Zod's `.datetime()` rejects offsets by default) with the time set to `00:00:00` *in the user's timezone* when `allDay: true`; the server then treats only the date part as meaningful for all-day items. Explicit unit tests cover this edge.
2. **`Source.gmailMessageId @unique` is globally unique.** Since every table carries `userId` for future multi-user, this should be `@@unique([userId, gmailMessageId])`. Changed in the schema below.
3. **Re-extraction can duplicate already-resolved items.** "Replaces pending, never touches accepted/rejected" means re-running extraction on a source with accepted proposals would re-propose the same items as new pendings. Refinement: when creating proposals, skip any whose normalized payload hash matches an accepted/rejected proposal of the same source.
4. **Model default.** Spec says `EXTRACTION_MODEL` default `claude-sonnet-4-6` and to verify current models. Verified against the current API reference: `claude-sonnet-4-6` is active, but the structured-outputs feature (which the extraction design relies on via `messages.parse()`) lists **`claude-sonnet-5`** as the supported Sonnet-tier model; Sonnet 5 also adds high-res vision (2576px — better for screenshots/syllabi). Default changed to `claude-sonnet-5`; still env-overridable.
5. **Gmail allowlist assumes US LMS ecosystem** (`.edu`, canvas, blackboard…). User's institution domains are unknown (and user is in IST). The pre-filter is config-driven (`src/config/gmail-filters.ts`) so real domains can be added at Phase 4 without code changes. *This is the one remaining open question — deferred to Phase 4 start (see §9).*
6. **Gmail scope timing.** Requesting the restricted `gmail.readonly` scope at first sign-in (Phase 0) would be premature. Sign-in uses basic scopes; Gmail is added via **incremental consent** ("Connect Gmail" button) in Phase 4. Tokens live in the Auth.js `Account` row; a lost/expired refresh token degrades to a one-click re-connect banner, never data loss (spec §11 requirement).

Nothing in the spec is contradictory enough to block; stack decisions are honored as-is.

---

## 2. Repo file tree (finished Phase-2 state)

```
aynat_app/
├─ aynat_spec.md
├─ docker-compose.yml            # local Postgres 16
├─ .env.example                  # every var from spec §11, documented
├─ next.config.ts  tailwind.config.ts  tsconfig.json  vitest.config.ts
├─ .github/workflows/ci.yml     # typecheck + lint + test on push
├─ prisma/
│  ├─ schema.prisma              # §3 below
│  └─ migrations/
├─ fixtures/                     # extraction eval inputs + expected JSON
│  ├─ screenshots/  pdfs/  emails/
│  └─ expected/*.json
├─ scripts/
│  └─ eval-extraction.ts         # fixture scoring script (§6)
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx  globals.css
│  │  ├─ (auth)/signin/page.tsx
│  │  ├─ (app)/                  # authenticated shell (sidebar + topbar)
│  │  │  ├─ layout.tsx
│  │  │  ├─ calendar/page.tsx
│  │  │  ├─ todos/page.tsx
│  │  │  ├─ review/page.tsx            # pending proposals across sources
│  │  │  ├─ review/[sourceId]/page.tsx # per-source review
│  │  │  └─ settings/page.tsx          # courses CRUD, timezone
│  │  └─ api/
│  │     ├─ auth/[...nextauth]/route.ts
│  │     ├─ uploads/route.ts
│  │     ├─ sources/[id]/route.ts          # GET status (polled)
│  │     ├─ sources/[id]/extract/route.ts  # POST re-run
│  │     ├─ proposals/route.ts             # GET ?status=
│  │     ├─ proposals/[id]/route.ts        # PATCH accept/reject+edits
│  │     ├─ proposals/accept-all/route.ts
│  │     ├─ tasks/route.ts  tasks/[id]/route.ts  tasks/reorder/route.ts
│  │     ├─ events/route.ts events/[id]/route.ts
│  │     └─ courses/route.ts courses/[id]/route.ts
│  ├─ components/
│  │  ├─ ui/                     # button, input, dialog, badge… (minimal, hand-rolled)
│  │  ├─ calendar/               # CalendarView, EventDialog, TaskChip
│  │  ├─ todos/                  # TodoList, TodoGroup, QuickAdd, TaskRow (dnd-kit)
│  │  ├─ upload/                 # DropZone, GlobalPasteHandler
│  │  └─ review/                 # ProposalCard, ConfidenceBadge, InlineFieldEditor
│  ├─ hooks/                     # TanStack Query hooks per resource + useSourcePolling
│  ├─ lib/
│  │  ├─ db.ts                   # Prisma singleton
│  │  ├─ auth.ts                 # Auth.js config + requireUser() helper
│  │  ├─ api.ts                  # route helpers: zod-parse, typed errors, userId scoping
│  │  ├─ dates/                  # ALL tz logic lives here (date-fns v4 + @date-fns/tz)
│  │  ├─ storage/                # FileStorage interface, LocalDiskStorage (S3 later)
│  │  ├─ extraction/
│  │  │  ├─ index.ts             # extractFromSource(sourceId) — the ONLY LLM entry point
│  │  │  ├─ prompt.ts            # system prompt (versioned: PROMPT_VERSION)
│  │  │  ├─ schema.ts            # ExtractedItem / ExtractionResult Zod (shared w/ API)
│  │  │  ├─ pdf.ts               # page count + chunk splitting (pdf-lib)
│  │  │  ├─ cache.ts             # content-hash cache (ExtractionCache table)
│  │  │  └─ merge.ts             # chunk merge + dedupe
│  │  └─ proposals.ts            # acceptProposal/rejectProposal — the gate, one place
│  └─ config/gmail-filters.ts    # (added Phase 4) allowlist domains + keywords
├─ storage/                      # dev file storage (gitignored)
└─ tests/
   ├─ unit/                      # dates, extraction schema, merge, cache
   └─ api/                       # route-handler tests incl. proposal-gate proofs
```

---

## 3. Finalized Prisma schema

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

enum Priority       { LOW MEDIUM HIGH }
enum TaskStatus     { TODO DONE }
enum SourceType     { UPLOAD EMAIL }
enum SourceStatus   { PENDING EXTRACTED FAILED }
enum ProposalKind   { TASK EVENT }
enum ProposalStatus { PENDING ACCEPTED REJECTED }

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  name          String?
  image         String?
  emailVerified DateTime?
  timezone      String    @default("Asia/Kolkata")   // IANA; deviation: user's tz
  accounts      Account[]
  sessions      Session[]
  courses       Course[]
  tasks         Task[]
  events        Event[]
  sources       Source[]
  proposals     Proposal[]
  gmailSync     GmailSyncState?
}

// Auth.js standard models (Account also stores Google refresh/access tokens
// used for Gmail in Phase 4 — that's why session strategy is "database")
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}
model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}
model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}

model Course {
  id     String  @id @default(cuid())
  userId String
  name   String
  code   String?
  color  String            // hex; picked from curated palette
  term   String?           // plain string — no Term entity in v1 (§8 decision)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tasks  Task[]
  events Event[]
  @@index([userId])
}

model Task {
  id          String     @id @default(cuid())
  userId      String
  courseId    String?
  title       String
  notes       String?
  dueAt       DateTime?          // UTC
  allDayDue   Boolean    @default(false)
  priority    Priority   @default(MEDIUM)
  status      TaskStatus @default(TODO)
  sortOrder   Int        @default(0)
  sourceId    String?            // provenance; set only via proposal acceptance
  createdAt   DateTime   @default(now())
  completedAt DateTime?
  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  course Course? @relation(fields: [courseId], references: [id], onDelete: SetNull)
  source Source? @relation(fields: [sourceId], references: [id], onDelete: SetNull)
  @@index([userId, status, dueAt])
  @@index([userId, courseId])
}

model Event {
  id       String   @id @default(cuid())
  userId   String
  courseId String?
  title    String
  startAt  DateTime          // UTC
  endAt    DateTime          // UTC
  allDay   Boolean  @default(false)
  location String?
  notes    String?
  sourceId String?
  user   User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  course Course? @relation(fields: [courseId], references: [id], onDelete: SetNull)
  source Source? @relation(fields: [sourceId], references: [id], onDelete: SetNull)
  @@index([userId, startAt])
}

model Source {
  id             String       @id @default(cuid())
  userId         String
  type           SourceType
  fileKey        String?      // storage adapter key (UPLOAD)
  mimeType       String?
  originalName   String?
  gmailMessageId String?      // (EMAIL)
  excerpt        String?      // first ~500 chars for display
  status         SourceStatus @default(PENDING)
  error          String?
  createdAt      DateTime     @default(now())
  user      User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  proposals Proposal[]
  tasks     Task[]
  events    Event[]
  @@unique([userId, gmailMessageId])   // deviation from §5: per-user, not global
  @@index([userId, status])
}

model Proposal {
  id          String         @id @default(cuid())
  userId      String
  sourceId    String
  kind        ProposalKind
  payload     Json           // validated ExtractedItem (§7 schema)
  payloadHash String         // sha256 of normalized payload — re-extract dedupe
  confidence  Float
  status      ProposalStatus @default(PENDING)
  createdAt   DateTime       @default(now())
  resolvedAt  DateTime?
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  source Source @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  @@index([userId, status])
  @@index([sourceId, status])
}

model GmailSyncState {
  userId     String    @id
  lastSyncAt DateTime?
  historyId  String?
}

model ExtractionCache {          // addition: §7 "cache by file content hash"
  contentHash String   @id      // sha256(fileBytes | model | PROMPT_VERSION)
  resultJson  Json               // validated ExtractionResult
  model       String
  createdAt   DateTime @default(now())
}
```

**Deviations from §5 and why:** (a) `timezone` default `Asia/Kolkata` — user's answer; (b) `@@unique([userId, gmailMessageId])` — multi-user-safe dedupe; (c) `Proposal.payloadHash` — enables re-extract dedupe against resolved proposals (flag #3); (d) `ExtractionCache` table — spec §7 requires content-hash caching but §5 omitted a home for it; (e) explicit Auth.js models spelled out; (f) indexes on the hot query paths (all scoped by `userId` first, per §10.5).

---

## 4. Milestone plan (Phases 0–4, tasks ≤ half-day, ordered)

### Phase 0 — Scaffold
> **DoD (spec):** "I can sign in and see an empty authenticated shell."

| # | Task |
|---|---|
| 0.1 | `git init`; scaffold latest Next.js (App Router) + TS + Tailwind; base layout, fonts, minimal design tokens (neutral palette, one accent) |
| 0.2 | docker-compose Postgres; Prisma init; User + Auth.js models; first migration; `lib/db.ts` |
| 0.3 | Auth.js v5 (Google provider, **database** session strategy, Prisma adapter, basic scopes only); sign-in page; `(app)` layout with auth guard + `requireUser()` helper |
| 0.4 | Vitest setup + one smoke test; ESLint/Prettier; GitHub Actions CI: typecheck, lint, test |

**Demo script:** `docker compose up -d && pnpm prisma migrate dev && pnpm dev` → visit `/` → redirected to sign-in → Google sign-in → land on empty shell with your name/avatar; CI green on push.

### Phase 1 — Manual core (calendar 6.1 + todos 6.2 + courses)
> **DoD (spec 6.1):** "I can create, edit, drag-reschedule, and delete events; task due dates show on the correct day in my timezone."
> **DoD (spec 6.2):** "full CRUD, complete/uncomplete with strikethrough + completedAt, reorder persists across reloads."

| # | Task |
|---|---|
| 1.1 | `lib/dates/` — UTC↔user-tz helpers (date-fns v4 + @date-fns/tz), grouping boundaries (today/this-week in user tz); **unit tests first** (TDD — these are the spec's tz edge cases) |
| 1.2 | Course model migration + `/api/courses` CRUD (Zod, userId-scoped, typed errors — establishes the route-handler pattern in `lib/api.ts`) |
| 1.3 | Settings page: course list, create/edit/delete, color palette picker, term string |
| 1.4 | Task model migration + `/api/tasks` CRUD + `/api/tasks/reorder` (array of ids → sortOrder rewrite within a group) |
| 1.5 | Todo list UI: grouped Overdue/Today/This week/Later/No date; quick-add (plain text); complete toggle w/ strikethrough + `completedAt`; course filter |
| 1.6 | dnd-kit drag-to-reorder within groups; optimistic update via TanStack Query; persists across reload |
| 1.7 | Event model migration + `/api/events` CRUD |
| 1.8 | FullCalendar: month + week views, events colored by course, task due dates as visually-distinct all-day chips; day-click → agenda panel |
| 1.9 | Event create (click empty slot) / edit / delete dialog; drag-reschedule + resize wired to PATCH |
| 1.10 | Responsive pass: sidebar → bottom tabs on phone; calendar defaults to list/day view under 640px |

**Demo script:** create 2 courses → quick-add 5 tasks with various due dates (verify grouping matches IST) → reorder, reload, order kept → complete one → calendar: create event by clicking a slot, drag it to another day, delete it → task chip appears on its IST-correct day.

### Phase 2 — Upload → extract → review (feature 6.3)
> **DoD (spec 6.3):** "I paste a screenshot of an assignment page and, within ~15 seconds, confirm a correctly dated task onto my list without touching a form."

| # | Task |
|---|---|
| 2.1 | `lib/storage/` FileStorage interface + LocalDiskStorage; Source migration; `POST /api/uploads` (formData, mime allowlist png/jpg/webp/pdf, 15 MB cap) → creates Source, kicks extraction via `after()` (post-response, keeps `extractFromSource` a plain callable fn per §3 jobs note) |
| 2.2 | DropZone (react-dropzone) + `GlobalPasteHandler` mounted in `(app)/layout` — paste image anywhere → upload → toast → navigate to review |
| 2.3 | `lib/extraction/schema.ts` (spec §7 Zod verbatim) + `prompt.ts` (system prompt below, `PROMPT_VERSION` const) + Anthropic client; `extractFromSource` for **images**: `client.messages.parse()` with `zodOutputFormat(ExtractionResult)`; validate → write proposals (transaction: delete source's PENDING proposals, insert new, skip payloadHash matches of resolved ones; set Source EXTRACTED/FAILED) |
| 2.4 | `lib/proposals.ts` gate: `acceptProposal(id, edits?)` — merge edits, re-validate through ExtractedItem, create Task/Event with `sourceId`, mark ACCEPTED + `resolvedAt`, all in one transaction; `rejectProposal`; `/api/proposals` GET + PATCH + accept-all routes |
| 2.5 | Review screen: one card per proposal — title, kind, resolved date/time (user tz), course guess → course picker, confidence, `sourceQuote`; every field inline-editable; accept / reject / accept-all; confidence < 0.7 → "check this" badge |
| 2.6 | Readiness: `GET /api/sources/[id]` + `useSourcePolling` (TanStack Query `refetchInterval: 1500` while PENDING); upload → review route shows spinner → cards appear; FAILED shows error + "retry extraction" (calls `/extract`) |
| 2.7 | Single-page PDF support (document content block) + `ExtractionCache` (sha256 short-circuit before LLM call) + `POST /api/sources/[id]/extract` re-run (replaces pending only) |
| 2.8 | Fixtures: 4–6 real screenshots + 2 single-page PDFs with `expected/*.json`; `scripts/eval-extraction.ts` v1 (scoring per §6) |

**Demo script:** screenshot an assignment page → Cmd-V anywhere in the app → toast → review screen populates in ≤15 s → fix the course on one card → accept → it's on the todo list dated correctly → re-paste the same image → cache hit (instant, no API spend, visible in logs).

### Phase 3 — Syllabus mode (feature 6.4)
> **DoD (spec 6.4):** "a real 10-page syllabus PDF yields ≥ 90% of its dated deliverables as proposals, and confirming all of them takes under two minutes."

| # | Task |
|---|---|
| 3.1 | `pdf.ts`: page count via pdf-lib; > 25 pages → split into 20-page chunks with 1-page overlap; chunk requests run sequentially; `merge.ts` dedupes overlap items (same date + normalized-title similarity) |
| 3.2 | Batch review UI: table layout (row per proposal: checkbox, title, kind, date, confidence), bulk select, bulk course-assign, accept-selected / accept-all |
| 3.3 | Prompt tuning for many-item docs (course inference from header, section-weight items excluded, recurring lecture slots → events); 2–3 real syllabus fixtures; iterate until eval ≥ 90% recall on dated deliverables |

**Demo script:** drop a real 10-page syllabus → batch table appears → select-all, assign course once, accept-all → stopwatch under 2 min → semester visible on calendar. Run `pnpm eval` → recall ≥ 0.9 printed.

### Phase 4 — Gmail sync (feature 6.5)
> **DoD (spec 6.5):** "syncing against my real inbox produces proposals only from school-related mail, and re-syncing creates zero duplicates."

| # | Task |
|---|---|
| 4.0 | *(unblock)* Collect user's actual school sender domains/keywords → `config/gmail-filters.ts`; set OAuth consent screen to Testing + user as test user |
| 4.1 | Incremental consent: "Connect Gmail" button → OAuth with `gmail.readonly`, `access_type=offline`, `prompt=consent`; store tokens on Account; token refresh helper; expired-refresh-token → non-blocking "Reconnect Gmail" banner (one-click re-consent, no data loss) |
| 4.2 | Gmail client: list messages since `lastSyncAt` (fallback 30 days), fetch metadata + text body; **pre-filter before any LLM call** (sender allowlist OR subject/body keywords from config); everything else skipped |
| 4.3 | Matched emails → Source (type EMAIL, `gmailMessageId` dedupe via `@@unique` upsert-skip, excerpt) → same `extractFromSource` (email text as text content) → same review gate; update GmailSyncState |
| 4.4 | `POST /api/gmail/sync` route wrapping a plain `syncGmail(userId)` fn (cron-ready later); "Sync now" button + last-synced timestamp + result toast ("3 new proposals from 2 emails, 41 skipped") |

**Demo script:** Connect Gmail (consent screen) → Sync now → review screen shows proposals only from school mail (spot-check skip count) → accept one → Sync now again → "0 new" (dedupe proven). Revoke token in Google account settings → banner appears → one-click reconnect works.

---

## 5. Extraction module design

**Single entry point (nothing else touches the LLM):**

```ts
// lib/extraction/index.ts
export async function extractFromSource(sourceId: string): Promise<Proposal[]>

// internals
function buildContent(source, fileBytes): ContentBlock[]        // image | document | email text
async function runExtraction(content, ctx: {now: Date; timezone: string}): Promise<ExtractionResult>
async function withCache(hashInputs, fn): Promise<ExtractionResult>   // cache.ts
function mergeChunks(results: ExtractionResult[]): ExtractionResult   // merge.ts
async function writeProposals(tx, source, items): Promise<Proposal[]> // replace-pending semantics
```

**API mechanics (verified against current Anthropic docs):** TypeScript SDK `@anthropic-ai/sdk`; `client.messages.parse()` with `output_config: { format: zodOutputFormat(ExtractionResult) }` — schema-enforced JSON, no prose, and the *same Zod object* validates API payloads (spec §7 requirement). Note: Zod constraints like `.max(120)` / `.min(0).max(1)` aren't supported by the API's schema subset; the SDK strips them from the wire schema and validates them client-side — exactly the behavior we want. Images: base64 `image` blocks. PDFs: base64 `document` blocks. `max_tokens: 16000`, non-streaming (bounded output: ≤ 60 items/call). Model from `EXTRACTION_MODEL` env, default `claude-sonnet-5`.

**System prompt draft (`prompt.ts`, `PROMPT_VERSION = 1`):**

```
You extract actionable calendar items from a student's document, screenshot,
or email. Return every task (something to submit or complete by a deadline)
and every event (something that occurs at a specific time: exam, lecture,
review session, office hours if explicitly dated).

Current date-time: {{nowISO}} ({{weekday}})
User timezone: {{timezone}}

Rules:
- Resolve relative dates ("next Friday", "end of week") against the current
  date-time above, in the user's timezone.
- Dates missing a year resolve to the NEAREST FUTURE occurrence.
- Output all datetimes as ISO 8601 UTC (with trailing "Z").
- NEVER invent a time. If a deadline has a date but no stated time, set
  allDay=true and set the time component to 00:00:00 in the user's timezone
  (converted to UTC).
- kind="task" for deliverables/deadlines; kind="event" for scheduled occurrences.
- courseGuess: the course name or code as written in the document, else null.
- sourceQuote: the verbatim snippet (≤300 chars) the item came from. Copy it
  exactly; do not paraphrase.
- confidence ∈ [0,1]: lower it when the date, year, time, or item identity is
  ambiguous. Do not guess silently — reflect uncertainty in the score.
- Skip: grading-policy percentages, generic advice, past-dated items (unless
  no year was given — then nearest-future rule applies), duplicates.
- If the document contains no extractable items, return {"items": []}.
```

`{{nowISO}}`/`{{timezone}}` are injected per call (spec §7 requirement). Prompt lives in code, versioned by `PROMPT_VERSION`, which participates in the cache key so prompt changes invalidate cached results.

**PDF chunking:** count pages with pdf-lib. ≤ 25 pages → single request. > 25 → 20-page chunks with 1-page overlap, run sequentially, merge with dedupe (equal resolved date + normalized-title token-overlap ≥ 0.6 → keep higher-confidence copy). Threshold rationale: a chunk stays well inside output limits (≤ 60 items) and keeps per-request cost/latency predictable; overlap prevents boundary-loss of items split across pages.

**Caching:** key = `sha256(fileBytes ‖ model ‖ PROMPT_VERSION)` in `ExtractionCache`. Checked before any API call; a hit still runs `writeProposals` (so re-extract semantics hold) but costs $0. Known caveat (accepted for v1): the injected current date isn't in the key, so a cached doc with *relative* dates re-uploaded much later could resolve stale — syllabi/screenshots are dominated by absolute dates, and the review gate catches the rest.

**Failure handling:** SDK typed errors (most-specific-first); any failure → Source `FAILED` + `error` message → review screen offers retry. `stop_reason` checked; `max_tokens` → treated as failure with a "document too dense, try splitting" error.

---

## 6. Test strategy

- **Unit — dates (`tests/unit/dates`)**: UTC↔IST conversion round-trips; "today/this week" group boundaries at IST midnight vs UTC date line (a task due 23:30 IST belongs to that IST day); all-day due rendering; relative-date fixtures for the eval prompt assumptions; DST-free IST plus one DST zone (America/New_York) to prove the util layer isn't IST-hardcoded.
- **Unit — extraction plumbing**: schema round-trips (payload → ExtractedItem → Task/Event fields); chunk merge dedupe; cache key stability; payloadHash normalization.
- **API routes (`tests/api`)** — Vitest calling route handlers directly with constructed `Request`s and a mocked session, against a disposable test DB. **Proposal-gate proofs**: (1) `POST /api/tasks` with a `sourceId` in the body → `sourceId` is stripped/rejected (manual CRUD can never claim provenance); (2) accepting a proposal is the only path that creates a Task with `sourceId`, marks ACCEPTED, sets `resolvedAt` — asserted atomically; (3) accepting an already-resolved proposal → 409, no duplicate Task; (4) re-extract deletes only PENDING proposals of that source; (5) every list endpoint returns nothing for a second user's rows (userId scoping); (6) edits passed to accept are re-validated through ExtractedItem (bad payload → 400, nothing written).
- **Extraction eval (`scripts/eval-extraction.ts`)**: for each fixture, run `extractFromSource` (live API — opt-in via `EVAL_LIVE=1`; cached results otherwise) and score against `expected/*.json`. Matching: same kind + same resolved date (IST day) + normalized-title token-overlap ≥ 0.6. Report per-fixture and aggregate **precision / recall / F1**; Phase 3 exit bar: recall ≥ 0.9 on syllabus fixtures. Also asserts every `sourceQuote` is a verbatim substring of the fixture text where text is available.
- **CI** runs typecheck, lint, unit + API tests on every push (eval script is manual — it costs money).

## 7. Risk register (top 5)

| Risk | Impact | Mitigation |
|---|---|---|
| **Date-parsing/timezone errors** (wrong day = user distrust) | High | All tz logic in one `lib/dates` module, TDD'd first (task 1.1); prompt forces UTC-Z output + nearest-future-year rule; review screen always shows the resolved local date before anything is saved; eval script scores dates exactly |
| **Google OAuth Testing-mode limits** — refresh tokens for restricted-scope apps in Testing expire after ~7 days | Recurring friction, worst-case perceived data loss | Design for it: tokens are disposable — expiry triggers a one-click "Reconnect Gmail" banner, never blocks the app, never loses data; sync state resumes from `lastSyncAt`; verify current Google policy at Phase 4 start; if intolerable, weigh Google's verification process then |
| **LLM cost on large PDFs** | Cost blowup on 100-page packets | 15 MB cap; page count check with confirm dialog above 40 pages; chunking caps per-request size; content-hash cache eliminates re-upload spend; Sonnet-tier (not Opus) model default |
| **Calendar library fit** (mobile drag, chip rendering) | Rework of the core view | FullCalendar's MIT plugins cover every v1 need (verified); calendar mounted in a single `CalendarView` component fed by library-agnostic query hooks — a swap to react-big-calendar touches one directory; mobile falls back to list/day view where drag is weakest |
| **Scope creep** (NL quick-add, reminders, PWA…) | v1 never ships | Spec's non-goals honored; each phase ends demoable and gets user sign-off before the next starts; Phase-5 ideas parked in a `LATER.md` |

## 8. Decision points

- **FullCalendar over react-big-calendar.** Both MIT for what v1 needs (FullCalendar's premium license only covers resource/timeline views — not needed). FullCalendar wins on: first-class drag-to-reschedule/resize via its interaction plugin with touch support; official React connector; built-in list view (clean phone fallback); rrule plugin ready for Phase-5 recurring events. react-big-calendar's DnD addon is HTML5-drag-based (weak on touch) and recurring events are fully DIY.
- **Polling over SSE.** Extraction completes in ~5–15 s; TanStack Query `refetchInterval: 1500` on the source-status endpoint is ~5 lines, has no long-lived-connection concerns, and survives the later Vercel deploy (serverless-friendly) — SSE buys sub-second latency nobody perceives here at the cost of infrastructure-sensitive plumbing. Kept behind a `useSourcePolling` hook so a swap is contained.
- **`claude-sonnet-5` as `EXTRACTION_MODEL` default** (spec said `claude-sonnet-4-6`). Verified against current docs: structured outputs — which the whole extraction contract leans on — lists Sonnet 5 as the supported Sonnet-tier model, and it adds high-res vision (2576px long edge), directly useful for dense screenshots and scanned syllabi. Same tier the spec chose, current generation; env-overridable either way.
- **Structured outputs (`messages.parse` + `zodOutputFormat`) over tool-use.** One Zod schema drives API validation *and* the wire schema (spec §7's "shared schemas" requirement, literally); no tool_use/stop_reason loop to handle for what is a single-shot extraction.
- **Extraction runs in-request via `after()`, no job system.** Upload responds immediately, extraction runs post-response, client polls — and `extractFromSource` stays a plain function per the spec's "keep sync callable as a plain function" note, so cron/queue later is additive.
- **Auth.js database sessions (not JWT).** Phase 4 needs stored Google refresh tokens; the Prisma-adapter `Account` row is the natural home, and DB sessions make token refresh/rotation server-side and inspectable.
- **date-fns v4 + @date-fns/tz over Luxon/Day.js.** Tree-shakable, first-class IANA tz via `TZDate`, pairs cleanly with FullCalendar; all usage confined to `lib/dates`.
- **No Term entity (§13.2).** A nullable `Course.term` string covers filtering/labeling for one user; promoting to an entity later is one migration. YAGNI.
- **Single-timezone v1 (§13.1): yes.** UTC storage + one configured render zone (`Asia/Kolkata`), per user's answer; `User.timezone` field means per-user zones later are data, not schema.
- **Tooling:** pnpm, Vitest (fast, first-class TS/ESM), ESLint+Prettier, GitHub Actions. Hand-rolled minimal `ui/` components over a kit — clean-minimal direction needs ~8 primitives and avoids fighting a theme.

## 9. Batched open questions — status

All five §13 questions plus hosting/UI/timezone were asked once (this session) or resolved in-plan: **hosting** local-first deploy-ready ✔ · **timezone** Asia/Kolkata ✔ · **UI** clean & minimal ✔ · **calendar** FullCalendar ✔ (§8) · **polling vs SSE** polling ✔ (§8) · **Term entity** no ✔ (§8) · **single-timezone** yes ✔ (§8).

**One deferred input (blocks nothing until Phase 4, task 4.0):** your actual school-related sender domains / LMS / keyword list for the Gmail pre-filter, plus creating the Google Cloud OAuth app (I'll provide click-by-click instructions then).

---

## Verification

- **Per phase:** run the demo script quoted under each phase (they map 1:1 to the spec's DoD lines) with the user driving; user signs off before the next phase begins.
- **Continuously:** `pnpm typecheck && pnpm lint && pnpm test` locally and in CI on every push.
- **Proposal gate:** the API test suite in §6 is the standing proof no code path bypasses it — runs in CI from Phase 2 on.
- **Extraction quality:** `pnpm eval` (opt-in live mode) prints precision/recall/F1 against fixtures; Phase 3 exits only at recall ≥ 0.9 on syllabus fixtures.
- **End-to-end (Phase 2+):** paste-screenshot → review → accept → task on list, timed ≤ 15 s, exercised in the in-app browser.
