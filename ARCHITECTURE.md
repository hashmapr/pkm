# Architecture

Personal AI knowledge capture app. Everything you save — voice, links, articles,
YouTube videos, GitHub repos, screenshots, PDFs, images, notes — becomes a
structured, searchable **Saved Item**.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend + Backend | Next.js 14 (App Router, TypeScript) | One codebase; Route Handlers act as the API. Modularity comes from internal layering, not process boundaries. |
| Database | PostgreSQL (+ pgvector from Phase 4) | Structured relational data, JSONB for flexible AI fields, native vector columns for embeddings — one engine instead of three. |
| ORM | Prisma | Type-safe schema/migrations. Raw SQL only for vector similarity search. |
| Auth | Hand-rolled email/password (bcrypt + JWT httpOnly cookie) | No third-party session dependency to outgrow. |
| AI | Provider abstraction in `src/lib/ai/` (Phase 2) | `AIProvider` interface + `ClaudeProvider` adapter; swapping models means writing one adapter, not touching call sites. |
| File storage | Storage abstraction in `src/lib/storage/` (Phase 3+) | Local disk in dev, swaps to S3/R2 in production behind the same interface. |

**Layering rule:** route handlers stay thin (parse request → call a service in
`src/lib/services` → return response). All business logic lives in services so
UI, API, and future background jobs can all call the same code path.

## Database schema

Phase 1 + Phase 2 are migrated today; the rest is the planned shape for later
phases so schema changes stay additive, not restructuring.

```
User             id, email, passwordHash, name, createdAt

SavedItem        id, userId, type (enum), title, source, content, summary,
                 keyPoints (text[]), status (ProcessingStatus), metadata (jsonb),
                 createdAt, updatedAt

Attachment       id, savedItemId, storagePath, mimeType, sizeBytes, createdAt

Tag              id, userId, name (unique per user)
SavedItemTag     savedItemId, tagId

Project          id, userId, name, description, createdAt
SavedItemProject savedItemId, projectId

-- Phase 2: AI processing pipeline --
ProcessingStatus (enum) PENDING | PROCESSING | COMPLETED | FAILED
                 — shared by SavedItem.status (denormalized, for cheap list
                   filtering) and ProcessingJob.status (the authoritative run record)

ProcessingJob    id, savedItemId, status, error, startedAt, completedAt, createdAt
                 — one row per processing attempt; an append-only run history a
                   future queue worker will consume instead of the API route

ExtractedTask    id, savedItemId, title, description, priority (LOW|MEDIUM|HIGH),
                 dueDate, confidence, createdAt
ExtractedEntity  id, savedItemId, name, type (PERSON|COMPANY|TECHNOLOGY|PROJECT|
                 BOOK|URL|CONCEPT), confidence, createdAt
Decision         id, savedItemId, statement, reasoning, confidence, createdAt
Question         id, savedItemId, question, status (OPEN|ANSWERED|DISMISSED), createdAt

-- Planned, not yet migrated --
RelatedItem      (Phase 2 follow-up) itemId, relatedItemId, score, relationType —
                 needs a candidate-set query strategy; AIProvider.findRelationships()
                 exists today but isn't wired to storage yet
Embedding        (Phase 4) savedItemId, chunkIndex, chunkText, vector(1536)
ChatSession /
ChatMessage      (Phase 5) userId, role, content, citations (jsonb)
```

**Change from the original Phase 2 plan:** the first sketch had entities as
shared nodes (`Entity` + `SavedItemEntity`) so items could link through a common
entity. The actual schema keeps `ExtractedEntity` scoped to one `savedItemId` —
simpler, and cross-item lookup ("what else mentions LangGraph?") is just
`WHERE name ILIKE X AND savedItemId != this`, no shared table required.

## Folder structure

```
src/
├── app/
│   ├── (auth)/login, register            — public
│   ├── (app)/inbox, items/[id], (edit), projects, layout.tsx  — authenticated
│   └── api/auth/*, items/*, tags, projects/route.ts
├── components/{layout, saved-items, projects}
├── lib/
│   ├── db.ts                — Prisma client singleton
│   ├── auth/{password.ts, session.ts}
│   ├── services/            — business logic
│   │   ├── saved-items.ts, tags.ts, projects.ts
│   │   └── processing.ts    — Phase 2 pipeline (job creation + execution)
│   ├── validation/          — zod schemas (auth, saved-item)
│   ├── ai/                  — Phase 2: AIProvider abstraction
│   │   ├── types.ts         — AIProvider interface
│   │   ├── extraction.ts    — zod schemas + strict-JSON response parsing
│   │   ├── prompts.ts       — prompt templates per capability
│   │   ├── claude-provider.ts
│   │   ├── errors.ts        — AIProviderError, AIResponseValidationError
│   │   └── index.ts         — getAIProvider() factory (the swap point)
│   └── storage/             — Phase 3+
├── middleware.ts             — route protection
└── types/saved-item.ts
```

## Processing pipeline (Phase 2)

```
createSavedItem / updateSavedItem
        ↓
  ProcessingJob created (status: PENDING)   ← always happens, no AI call yet
        ↓
POST /api/items/:id/process                 ← explicit trigger, synchronous today
        ↓
  runProcessingJob: PENDING → PROCESSING
        ↓
  guard: empty/blank content → FAILED, stop (no AI call spent)
        ↓
  provider.analyze(item) → raw text → zod-validated → AIExtractionResult | throws
        ↓
  success: persist summary/keyPoints/tags(merged)/tasks/entities/decisions/questions
           in one transaction → SavedItem + ProcessingJob → COMPLETED
  failure: ProcessingJob.error = message → SavedItem + ProcessingJob → FAILED
```

`AIProvider` (Phase 2) exposes `summarize`, `extractEntities`, `extractTasks`,
`classifyItem`, `generateTags`, `findRelationships` as independently callable,
independently testable capabilities. The pipeline itself calls a 7th method,
`analyze()`, which returns the full combined JSON in a single model call —
calling all six separately per item would mean 5-6 Claude requests per save
for no benefit the model can't already give in one read of the content. The
granular methods stay on the interface for standalone future use (e.g.
re-tagging one item); `findRelationships()` is implemented and unit-tested but
not wired into the automatic pipeline yet since there's no `RelatedItem` table
to store its output.

Reprocessing merges in new AI tags (`skipDuplicates`) rather than replacing the
tag set — an earlier draft of this deleted-and-recreated all tags on every run,
which silently erased tags the user had added by hand. Extracted
tasks/entities/decisions/questions, on the other hand, are fully replaced on
each run (simplest correct behavior until there's a UI that lets a user edit
one, at which point overwriting would need to become a smarter merge).

**Future migration to background workers:** `processSavedItem` (create + run a
job) and `runProcessingJob` (run an existing job) are already split. A queue
worker doesn't change this pipeline — it replaces "the API route calls
`runProcessingJob` synchronously" with "a worker polls
`ProcessingJob WHERE status='PENDING'` and calls `runProcessingJob(job.id)`."
No business logic moves; the API route would just create the job and return
202 instead of awaiting completion.

## Risks

1. **AI cost/latency** — `analyze()` is one call per item, but there's no retry/backoff yet on transient upstream failures (a timeout just fails the job; the user has to manually re-trigger `/process`).
2. **pgvector at scale** — fine for personal-scale data; needs an HNSW index if this grows large.
3. **Entity resolution / duplicate detection**: `ExtractedEntity` rows aren't deduplicated across items yet (e.g. "LangGraph" saved from two different items are two separate rows). Fine for now since nothing consumes them cross-item; matters once `RelatedItem` linking is built.
4. **Sync-only processing today** — `/api/items/:id/process` blocks on the full Claude round-trip. Acceptable for a personal tool triggering processing on one item at a time; not acceptable if this became multi-user or bulk-triggered without the queue migration above.
5. **File uploads** (Phase 3) need size/type validation even in a personal app.
6. **Known dependency risk:** Next.js 14.2.x (latest patched release on that line) still carries two open high-severity advisories fixed only in the Next.js 16 major (SSRF via rewrites, internal Server Function disclosure — both require rewrites/Server Actions usage this app doesn't have yet). Tracked for a deliberate upgrade once the Next 16 line stabilizes.

## Implementation plan

- **Phase 1 (done):** Next.js scaffold, Postgres, Prisma schema (User/SavedItem/Tag/Project + joins/Attachment), auth, full CRUD for saved items with manual tags/projects, inbox + detail/edit UI.
- **Phase 2 (done):** `AIProvider`/`ClaudeProvider`, `ProcessingJob`/`ExtractedTask`/`ExtractedEntity`/`Decision`/`Question` tables, synchronous processing pipeline triggered via `POST /api/items/:id/process`, unit tests for response parsing/validation/empty-content/duplicate-tags/entity-extraction. No UI for any of this yet, by design — backend first.
- **Phase 3:** Audio recording/upload UI + `lib/storage`, transcription via the AI adapter, feeding the Phase 2 pipeline.
- **Phase 4:** `Embedding` table + pgvector, chunking/embedding on save, semantic search.
- **Phase 5:** Chat UI over saved items using Phase 4 retrieval + Claude, with citations.
- **Follow-up:** `RelatedItem` table + wiring `findRelationships()` into the pipeline; background queue worker (see migration path above); UI to surface Phase 2's extracted tasks/entities/decisions/questions.
