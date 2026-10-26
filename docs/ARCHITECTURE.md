# SA Workspace — Architecture

This document captures the requirements analysis, architecture, data model, design system and
phased plan for SA Workspace. It is the reference for anyone extending the codebase.

---

## 1. Requirements analysis

SA Workspace is a single-user (single Solutions Architect) productivity tool. The product's
differentiator is **Meeting Intelligence**: turning unstructured transcripts into structured,
reviewed, traceable account knowledge. Everything in Phase 1 is shaped so that Phase 2 can write
into it without remodelling:

| Requirement | Consequence for the design |
| --- | --- |
| Account-centric | Every customer entity carries `accountId`; the Account Workspace is the hub. |
| Opportunities and workloads are independent | Discovery, competitive landscape, architecture and solution fit live on the **opportunity**, not the account. Workloads are their own collection. One customer can run a PostgreSQL migration, an Atlas Search app and a Vector Search initiative in parallel, each with its own motion, requirements and next steps. |
| AI suggests, human approves | Discovery values are stored as **items with provenance** (`source.kind = manual | meeting`, optional `meetingId` + `excerpt`, `status = confirmed | tentative`). Phase 2 approval writes the same shape. |
| Source traceability | Each discovery item keeps its source. Every mutation writes an `account_change_history` entry with field-level diffs and an actor (`user` or `ai-approved`). |
| Never overwrite SA notes | Notes are a separate collection; AI never writes to it. Every edit snapshots the previous version into `note_revisions`. |
| Unclear business rules → configurable | Sales motions, Tiger routes, stages, statuses, priorities, complexities, MongoDB capabilities and meeting types are editable enumerations in `settings`. No classification logic is hardcoded. |
| Privacy by design | Auth on every route (proxy + per-handler check), server-only DB/AI access, AI processing disabled until explicitly configured (Phase 2). |

### Clarifications and decisions

- **Technology Stack vs Technical Discovery.** The account-wide technology *landscape* (databases,
  clouds, languages, frameworks, pipelines, integrations) is stored on the **account**. The
  *requirements* of a specific initiative (latency, availability, DR, compliance, volumes,
  constraints) are stored on the **opportunity** and on its **workloads**.
- **Business discovery is per opportunity.** Different initiatives at the same customer have
  different drivers, budgets and decision processes.
- **Enumeration values are plain strings.** Renaming a value in Settings does not rewrite existing
  records; records holding a value no longer in the list still display it and can be reclassified.
- **Default stage/status values are generic placeholders**, not MongoDB internal processes. They
  are meant to be edited in Settings.

---

## 2. Folder structure

```
src/
  app/
    (auth)/              login + first-run setup (public)
    (app)/               authenticated shell (sidebar + header)
      page.tsx           dashboard
      accounts/[accountId]/{overview,opportunities,discovery,stack,solution-fit,architecture,meetings,notes,actions}
      account-executives/[aeId]
      action-items/ meetings/ enablement/ search/ settings/
    api/                 Route Handlers (typed JSON contracts, all authenticated except auth/*)
  domain/                Isomorphic: Zod schemas, types, enumerations, discovery field registry
  server/                Server-only
    db/                  client, collection names, validators, indexes, init
    auth/                password hashing, session JWT
    http/                route-handler wrapper, typed errors
    services/            business logic per domain (accounts, opportunities, notes, …)
  components/
    ui/                  shadcn/ui primitives
    layout/              sidebar, header, page header, theme toggle, command palette
    common/              reusable building blocks (form fields, empty states, confirm dialog…)
    <domain>/            feature components (accounts, opportunities, discovery, notes, tasks…)
  lib/                   client utilities (api client, formatting, cn)
scripts/                 db:setup, db:seed
tests/                   vitest (unit + service tests against an in-memory MongoDB)
```

Rules:
- Presentation components never touch MongoDB. Server Components read through `server/services`;
  client components mutate through `/api/*` and then `router.refresh()`.
- Zod schemas in `domain/` are the single contract for forms (React Hook Form resolver) and
  Route Handlers (request validation).

---

## 3. Application architecture

Modular monolith on Next.js App Router.

```
Browser ──► proxy.ts (session check) ──► Server Components ──► services ──► MongoDB
   │                                                          ▲
   └── fetch /api/* ──► route handler wrapper ──► Zod parse ──┘
                         (auth, AppError → JSON, ZodError → 422)
```

- **Errors.** Services throw `AppError` subclasses (`NotFoundError`, `ValidationError`,
  `ConflictError`, `UnauthorizedError`). The handler wrapper maps them to
  `{ error: { code, message, details? } }` with the right status.
- **Audit.** Services that mutate account-scoped data call `recordChange()` with a diff computed
  by `diffObjects()`.
- **DB init.** `initDatabase()` is idempotent: creates collections with `$jsonSchema` validators
  (`validationLevel: moderate`), updates validators via `collMod`, and creates indexes. It runs
  once per process on first DB access and via `npm run db:setup`.
- **AI (Phase 2+).** A provider abstraction (`server/ai/provider.ts`) with OpenAI and Anthropic
  adapters, structured JSON output validated with Zod, prompt templates versioned in code
  (`prompts/<name>@v<n>`), token/cost tracking per call in `ai_processing_jobs`, retries with
  backoff. Disabled unless `AI_PROCESSING_ENABLED=true` **and** a provider is approved in Settings.

---

## 4. MongoDB data model

Access patterns drive the model: almost every read is "everything for account X" or "everything
for opportunity Y", plus dashboard aggregates and keyword search.

| Collection | Purpose | Key fields | Indexes |
| --- | --- | --- | --- |
| `users` | Authentication | `email` (unique), `passwordHash`, `name`, `role` | `email` unique |
| `settings` | Configurable enumerations, AI config | `_id: "enumerations"`, `values` | — |
| `account_executives` | AEs | `name`, `email`, `territory`, `region`, `notes` | `email` unique (sparse), text |
| `accounts` | Account root | `name`, `industry`, `website`, `region`, `aeId`, `status`, `description`, `internalNotes`, `lastInteractionAt`, `nextMeetingAt`, `techStack{field→items}` | `nameLower` unique, `aeId`, `status`, `updatedAt`, text |
| `contacts` | People at the customer | `accountId`, `name`, `title`, `email`, `persona`, `isPrimary` | `accountId+isPrimary` |
| `opportunities` | Initiatives | `accountId`, `aeId`, `salesMotion`, `tigerRoute`, `stage`, `businessPriority`, `technicalComplexity`, `nextMilestone{title,dueDate}`, `discovery{field→items}`, `solutionFit[]` (bounded) | `accountId`, `aeId`, `salesMotion`, text |
| `workloads` | Per-opportunity workloads with independent requirements | `accountId`, `opportunityId`, `name`, requirement fields | `opportunityId` |
| `sa_notes` | Manual SA notes (never AI-written) | `accountId`, `opportunityId?`, `meetingId?`, `title`, `body` (Markdown), `tags[]`, `pinned`, `revision` | `accountId+pinned+updatedAt`, `tags`, text |
| `note_revisions` | Edit history | `noteId`, `revision`, snapshot, `editedAt` | `noteId+revision` unique |
| `action_items` | Tasks | `title`, `accountId?`, `opportunityId?`, `meetingId?`, `owner`, `dueDate`, `priority`, `status`, `source`, `completedAt` | `status+dueDate`, `accountId+status`, text |
| `account_change_history` | Audit log | `accountId`, `entityType`, `entityId`, `action`, `changes[{field,from,to}]`, `actor`, `at` | `accountId+at`, `entityId+at` |
| `meetings` | Meetings + raw transcript | `accountId`, `opportunityId?`, `type`, `startsAt`, `participants[]`, `transcript{raw,format,fileName,segments[]}` (nullable for retention), `summary`, `analysisStatus`, `latestAnalysisId` | `accountId+startsAt`, text (title, summary, transcript) |
| `meeting_analyses` | One per analysis run | `meetingId`, `provider`, `model`, `promptVersion`, `output` (validated extraction), `suggestions[]` (type, target, value, kind, confidence, relation, relatedItemId, existingValue, conflict, blocker, evidence{excerpt,speaker,start,end}, status, resolution) | `meetingId+createdAt` |
| `ai_processing_jobs` | Job state, tokens, cost | `kind`, `status`, `attempts`, `provider`, `model`, `promptVersion`, `usage`, `costUsd`, `durationMs`, `error` | `status+createdAt`, `meetingId` |
| *Phase 3* `embeddings` | Account-scoped chunks for Vector Search | `accountId`, `sourceType`, `sourceId`, `text`, `embedding` | Atlas Vector Search index with `accountId` filter |
| *Phase 4* `enablement_paths`, `enablement_items` | Personal enablement | — | — |

### Discovery items (provenance-ready values)

```ts
type DiscoveryItem = {
  id: string;                 // stable id, used by Phase 2 to target updates
  text: string;               // Markdown allowed
  status: "confirmed" | "tentative";
  source: { kind: "manual" } | { kind: "meeting"; meetingId: string; excerpt?: string };
  createdAt: Date; updatedAt: Date;
};
// opportunity.discovery.painPoints: DiscoveryItem[]
// account.techStack.currentDatabases: DiscoveryItem[]
```

The field catalogue (business, technical, competitive, architecture, technology stack) is a
registry in `src/domain/discovery.ts`; the UI and API are generic over it. Lists are capped
(`MAX_ITEMS_PER_FIELD`) so the opportunity document stays bounded. Architecture decisions are
items with ids today; if they need their own lifecycle they can move to an
`architecture_decisions` collection without changing the UI contract.

### Why embed vs reference

- **Referenced** (grow independently, queried on their own): contacts, opportunities, workloads,
  notes, revisions, action items, history, meetings.
- **Embedded** (small, bounded, always read with the parent): discovery items, tech stack items,
  solution-fit entries, next milestone.

---

## 5. Core user journeys

1. **First run.** Open app → `/setup` creates the owner account → dashboard.
2. **Organise the book.** Create AEs → create accounts with an assigned AE → add opportunities
   with motion/route/stage.
3. **Capture discovery.** Account → Discovery → pick opportunity → add pain points, drivers,
   requirements inline; add workloads; record tech stack and competitive landscape.
4. **Take notes during a call.** Account → SA Notes → `N` / "New note" → Markdown with tags,
   linked opportunity; pin the important ones. Edits keep history.
5. **Track commitments.** Create action items from the account or globally; dashboard surfaces
   overdue and due-soon items.
6. **Find anything.** `Ctrl/⌘+K` or Search page → keyword search across accounts, opportunities,
   notes, action items and AEs.
7. *(Phase 2)* **Meeting → knowledge.** Upload transcript → analysis → AI Review (transcript left,
   suggestions right) → approve/edit/reject → discovery items written with `source.kind = meeting`
   and history entries with `actor.kind = ai-approved` → "What changed since last meeting".

---

## 6. Design system

- **Tokens** (`src/app/globals.css`): neutral oklch greyscale for surfaces, a single green brand
  accent (`--brand`), semantic `--success`, `--warning`, `--info`, `--destructive`. Light and dark
  values defined for every token; theme switched with `next-themes` (`class` strategy).
- **Typography:** Geist Sans / Geist Mono. Base 14px for dense UI; page titles 20px semibold;
  section titles 13px uppercase-tracking muted labels.
- **Surfaces:** 1px borders (`--border`), subtle `shadow-xs` on cards only, radius 10px.
- **Density:** compact tables (h-9 rows), inline editing, collapsible sections instead of long
  forms; dialogs only for create flows.
- **Components:** shadcn/ui (Radix) primitives + project components in `components/common`
  (`PageHeader`, `EmptyState`, `FormField`, `ConfirmDialog`, `StatusBadge`, `DateText`).
- **Icons:** Lucide only, 16px in UI chrome.

---

## 7. Phased implementation plan

| Phase | Scope | Status |
| --- | --- | --- |
| 1 — Foundation | Setup, design system, DB + validators + indexes, auth, dashboard, AEs, accounts, contacts, opportunities (classification, discovery, competitive, architecture incl. Mermaid, solution fit), workloads, tech stack, SA notes with history, action items, keyword search, configurable enumerations, audit history, tests, Docker | **Implemented** |
| 2 — Meeting Intelligence | Meetings CRUD, transcript ingestion (paste/TXT/MD/DOCX/PDF) behind an `IngestionSource` interface (audio later), AI provider abstraction, schema-validated extraction, AI Review UI, approval writes discovery items + history, conflict flagging, "What changed" | **Implemented** |
| 3 — Contextual AI | Embedding pipeline, Atlas Vector Search (account-filtered), Account Copilot with citations, Discovery Prep, gap analysis, briefings | Planned |
| 4 — Advanced | Diagram generation, Enablement, analytics, semantic global search, export/deletion tooling, calendar/drive integrations | Planned |

The Enablement sidebar entry is visible but labelled *Planned*; it renders an
explanation, not mock data.

---

## 8. API contracts (Phase 1)

All endpoints require a session except `auth/*` and `health`. Success: `{ data }`. Failure:
`{ error: { code, message, details? } }` where `details` is Zod's `{ formErrors, fieldErrors }`
for `validation_failed` (422). Other codes: `unauthorized` 401, `forbidden` 403 (cross-origin),
`not_found` 404, `conflict` 409 (duplicates, concurrent note edits), `rate_limited` 429.

| Resource | Endpoints |
| --- | --- |
| Auth | `POST /api/auth/setup`, `POST /api/auth/login`, `POST /api/auth/logout` |
| Settings | `GET/PUT /api/settings/enumerations` |
| AEs | `GET/POST /api/account-executives`, `GET/PATCH/DELETE /api/account-executives/:id` |
| Accounts | `GET/POST /api/accounts`, `GET/PATCH/DELETE /api/accounts/:id`, `GET/POST /api/accounts/:id/contacts`, `PUT /api/accounts/:id/tech-stack/:field`, `GET /api/accounts/:id/history` |
| Contacts | `PATCH/DELETE /api/contacts/:id` |
| Opportunities | `GET/POST /api/opportunities`, `GET/PATCH/DELETE /api/opportunities/:id`, `PUT /api/opportunities/:id/discovery/:field`, `POST /api/opportunities/:id/solution-fit`, `PATCH/DELETE /api/opportunities/:id/solution-fit/:entryId` |
| Workloads | `GET/POST /api/workloads`, `PATCH/DELETE /api/workloads/:id` |
| Notes | `GET/POST /api/notes`, `GET/PATCH/DELETE /api/notes/:id`, `GET /api/notes/:id/revisions` |
| Action items | `GET/POST /api/action-items`, `PATCH/DELETE /api/action-items/:id` |
| Search | `GET /api/search?q=&types=&accountId=&aeId=&limit=` |
| Health | `GET /api/health` |

Discovery updates (`PUT …/discovery/:field`, `PUT …/tech-stack/:field`) replace the item list of
one field. Items are matched by `id`; the server keeps each existing item's `source` and
`createdAt`, so provenance cannot be altered from the client. Phase 2 approvals will write items
with `source.kind = "meeting"` through the same service functions.

## 9. Implementation notes

- **Zod 4 defaults inside `.partial()`.** Zod 4 applies `.default()` even when a field is
  optional, so patch schemas are built from default-free field sets (see `domain/entities.ts`).
  A regression test covers this.
- **Closed stages are configurable** (`closedStages` enumeration) and drive "active opportunity"
  counts; nothing assumes stage names.
- **Solution fit requires a customer problem**, so recommendations stay grounded in discovery.
- **Follow-up heuristic.** An account needs follow-up when it has active opportunities and no
  interaction in 30 days, or has overdue action items (`FOLLOW_UP_AFTER_DAYS` in
  `server/services/dashboard.ts`).
- **Node compatibility.** Dependencies are pinned to versions that run on Node 20.9+ (MongoDB
  driver 6, mongodb-memory-server 10); the Docker image uses Node 22.

---

## 10. Meeting Intelligence (Phase 2)

```
New meeting -> ingestTranscript() -> meetings.transcript (raw + segments)
                (paste | txt | md | docx | pdf; IngestionSource registry: add audio here later)

Analyze -> startMeetingAnalysis(): checks Settings approval + key, atomically claims the meeting,
           inserts ai_processing_jobs{queued}; the route schedules run() with next/server after()
        -> runMeetingAnalysis(): builds context (account, opportunities, current profile items WITH ids,
           contacts, open tasks, configured enumerations, previous meeting digest), optional redaction,
           provider.generateStructured(zod schema) with 1 retry on truncated/invalid output,
           re-validates with Zod, buildSuggestions(), stores meeting_analyses, records usage/cost
UI polls /api/meetings/:id/status while analysing.

Review -> decideSuggestion()/bulkDecide(): claim suggestion (pending -> approved via arrayFilter),
          apply, store resolution; on failure revert to pending. Bulk skips conflicts and blocked items.
```

- **Providers** (`server/ai/`): `AiProvider.generateStructured()`. The Anthropic adapter uses
  `beta.messages.parse` with `betaZodOutputFormat`, effort `high`, a cached system prompt and the
  server-side refusal fallback; the OpenAI adapter uses `responses.parse` with `zodTextFormat` and
  `store: false`.
- **Prompt versioning:** `server/ai/prompts/meeting-analysis.ts` (`meeting-analysis@v1`), stored on
  every job and analysis.
- **Suggestion rules** (`buildSuggestions`): scope repair (stack fields are account-level), opportunity
  attribution (AI id, then the meeting's opportunity, then the only opportunity, else ask the user),
  related-item ids are verified, single-value fields that already hold a value and AI `conflicts`
  relations are flagged as conflicts, classifications/capabilities that are not configured are blocked
  until edited, duplicate capabilities/contacts are dropped, evidence quotes are located in the
  transcript (whitespace/case/quote tolerant).
- **Applying** (`meeting-review.ts`): discovery items are written with `source.kind = "meeting"` and the
  excerpt; stated facts with medium/high confidence become *confirmed*, everything else *tentative*;
  `confirms` confirms the related item; `resolves` removes the answered open question and records the
  answer; conflicts on list fields need *replace* or *keep both*. Classification, solution fit, contacts
  and action items go through the regular services with `actorKind: "ai-approved"`.
- **Retention:** deleting a transcript keeps the meeting and analysis; deleting a meeting removes its
  analyses and jobs; deleting an account removes all of it.

API additions: `GET/POST /api/meetings` (JSON or multipart `data` + `file`; `analyze: true` queues the
analysis), `GET/PATCH/DELETE /api/meetings/:id`, `PUT/DELETE /api/meetings/:id/transcript`,
`POST /api/meetings/:id/analyze`, `GET /api/meetings/:id/status`,
`POST /api/analyses/:id/suggestions/:suggestionId` (`approve|reject|reset`, optional `value`,
`resolution`, `opportunityId`), `POST /api/analyses/:id/bulk`, `GET/PUT /api/settings/ai`.
