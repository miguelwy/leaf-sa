# SA Workspace

A personal workspace for a MongoDB Solutions Architect: accounts, opportunities, discovery,
SA notes and action items in one account-centric place. It is built so that meeting transcripts
can later be turned into reviewed, traceable account knowledge (Meeting Intelligence, Phase 2).

> **Status: Phase 1 (Foundation) and Phase 2 (Meeting Intelligence) are implemented.** The AI Account
> Copilot, Discovery Prep and Enablement are planned; Enablement's navigation entry is labelled
> *Planned* and shows no mock data.

## What works today

| Area | Capabilities |
| --- | --- |
| Authentication | First-run owner setup, email/password sign-in, HTTP-only signed session cookie, route protection, login rate limiting, cross-origin mutation blocking |
| Dashboard | My Focus (overdue/due tasks, upcoming meetings, milestones), follow-ups, accounts by AE, active opportunities by sales motion, discovery completeness, recently updated accounts |
| Account Executives | CRUD, territory/region, assigned accounts and opportunities per AE, filter by AE across the app |
| Accounts | CRUD, status, AE, contacts, next meeting/last interaction, internal notes, permanent deletion of all account data |
| Opportunities | Multiple per account; sales motion, Tiger route, stage, priority, complexity, timeline, workload, next milestone |
| Discovery | Business, technical and competitive discovery per opportunity, workloads with independent requirements; every value is an item with status (confirmed/tentative) and source |
| Technology Stack | Account-wide landscape (databases, clouds, languages, frameworks, pipelines, integrations) |
| Solution Fit | MongoDB capabilities per opportunity, each tied to a discovered customer problem, with status Identified/Proposed/Validated/Rejected |
| Architecture | Current/target state, decisions, assumptions, tradeoffs, components, integrations, links, Mermaid diagrams |
| SA Notes | Markdown with code blocks, tags, pinning, opportunity links, search, full editing history |
| Action Items | Global and per account, statuses To Do/In Progress/Blocked/Done, owners, due dates, overdue indicators |
| History | Field-level audit log of every change to an account and its records |
| Meetings | Per account and opportunity; transcript by paste or TXT/Markdown/DOCX/text-PDF upload, speaker/timestamp detection, transcript retention control |
| Meeting Intelligence | AI analysis (Anthropic or OpenAI, schema-validated) → summary, business/technical insights, decisions, action items, open questions, missing information, "what changed since last meeting" |
| AI Review | Transcript with highlighted evidence beside suggested updates (current vs suggested, confidence, stated/interpreted/recommended); approve, edit, reject, bulk-approve; conflicts need an explicit decision; approved facts keep the meeting and quote as source; every applied change is audited as *AI suggestion approved* |
| Search | Keyword search (text indexes + substring fallback) across accounts, opportunities, meetings/transcripts, notes, tasks, contacts and AEs; Ctrl/⌘+K palette |
| Settings | Editable enumerations (sales motions, Tiger routes, stages, closed stages, statuses, priorities, complexities, personas, MongoDB capabilities, meeting types); AI-processing and data-storage transparency |

## Tech stack

Next.js 16 (App Router, Route Handlers) · TypeScript · Tailwind CSS 4 · shadcn/ui (Radix) · Lucide ·
React Hook Form + Zod · MongoDB Node.js driver 6 · Vitest + mongodb-memory-server · Docker Compose
with MongoDB Atlas Local (supports Atlas Search and Vector Search for later phases).

## Getting started

Requirements: Node.js 20.9+ (22 LTS recommended), npm, Docker (or any MongoDB 7+/Atlas cluster).

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# then set AUTH_SECRET to a random value, e.g.: openssl rand -base64 48

# 3. Start MongoDB (Atlas Local in Docker)
docker compose up -d mongo

# 4. Create collections, validators and indexes (also done automatically on first request)
npm run db:setup

# 5. Run the app
npm run dev
```

Open http://localhost:3000. On first run you are redirected to **/setup** to create the owner account.

### Enabling meeting analysis

1. Add `ANTHROPIC_API_KEY=...` (or `OPENAI_API_KEY` + a model) to `.env.local` and restart `npm run dev`.
2. Settings → AI processing: choose the provider, read what is sent, switch on **Allow sending meeting data**, Save.
3. Account → Meetings → **New meeting**: paste or upload the transcript, keep *Analyze with AI* checked.
4. Review the suggestions next to the highlighted transcript and approve what is right. Discovery, solution
   fit, classification, contacts and action items update immediately; History records each change.

Optional: `npm run db:seed` inserts clearly-labelled demo data (fictional companies) into an empty
database.

### Running everything in Docker

```bash
# .env must contain AUTH_SECRET (Compose reads .env, not .env.local)
cp .env.example .env   # and set AUTH_SECRET
docker compose --profile app up -d --build
```

The app is published on http://localhost:3000 and MongoDB on 127.0.0.1:27017 (localhost only).

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `MONGODB_URI` | yes | — | MongoDB connection string (Atlas or local) |
| `MONGODB_DB` | no | `sa_workspace` | Database name |
| `AUTH_SECRET` | yes (app) | — | ≥32 random characters used to sign session cookies. Not needed by `db:*` scripts |
| `SESSION_TTL_HOURS` | no | `168` | Session lifetime |
| `MONGO_ROOT_USERNAME` / `MONGO_ROOT_PASSWORD` | Compose only | `sa` / `sa-local-password` | Credentials of the local MongoDB container; must match `MONGODB_URI` |
| `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` | for AI | — | Provider key, server-side only. Analysis also requires approval in Settings → AI processing |
| `AI_ANTHROPIC_MODEL` / `AI_OPENAI_MODEL` | no | `claude-opus-5-5` / — | Default model per provider (Settings can override). OpenAI has no default |
| `AI_PROCESSING_ENABLED` | no | `true` | Deployment kill switch; `false` disables AI regardless of Settings |
| `AI_PRICE_INPUT_PER_MTOK` / `AI_PRICE_OUTPUT_PER_MTOK` | no | — | USD prices for cost tracking of models without built-in prices |

In production (`NODE_ENV=production`) the session cookie is `Secure`, so serve the app over HTTPS
(or `localhost`).

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint |
| `npm test` | Unit and service tests (in-memory MongoDB, no Docker needed) |
| `npm run check` | Typecheck + lint + tests |
| `npm run db:setup` | Create collections, validators and indexes (idempotent) |
| `npm run db:seed` | Insert demo data into an empty database |

Tests download a MongoDB binary on first run (mongodb-memory-server). To use an existing server
instead, set `TEST_MONGODB_URI`.

## Project layout

```
src/
  app/(auth)        login and first-run setup
  app/(app)         authenticated pages (dashboard, accounts workspace, AEs, tasks, search, settings)
  app/api           Route Handlers — typed JSON contracts
  domain/           Zod schemas, types, enumerations, discovery field registry (shared client/server)
  server/           db (client, validators, indexes), auth, http (handler, errors), services
  components/       ui (shadcn), layout, common building blocks, feature components
  proxy.ts          session gate + CSRF origin check
tests/              Vitest suites
docs/ARCHITECTURE.md
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the data model, architecture, design system,
user journeys and the phased plan.

## Security and privacy notes

- All data access happens server-side; API keys (Phase 2) will never reach the browser.
- Every page and API route requires a session (checked in `proxy.ts` and again in each handler).
- Mutating API requests from another origin are rejected.
- Markdown is rendered without raw HTML; Mermaid runs in `strict` security mode.
- Account deletion permanently removes the account's opportunities, contacts, workloads, notes
  (with history), action items and audit entries.
- AI analysis is off until approved in Settings; the approval (who/when) is recorded. Only meetings you
  analyze are sent, server-side, to the selected provider. Emails/phone numbers are redacted by default.
- The transcript is treated as untrusted input in the prompt; the model output is schema-validated and
  never applied without review.
