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
| File storage | Storage abstraction in `src/lib/storage/` (Phase 3) | `StorageProvider` interface + `LocalStorageProvider`; local disk in dev, swaps to S3/R2 behind the same interface. |
| Transcription | Provider abstraction in `src/lib/transcription/` (Phase 3) | `TranscriptionProvider` interface + Whisper adapter — deliberately separate from `AIProvider` since it's a different capability from a different vendor. |

**Layering rule:** route handlers stay thin (parse request → call a service in
`src/lib/services` → return response). All business logic lives in services so
UI, API, and future background jobs can all call the same code path.

## Database schema

Phase 1 + Phase 2 + Phase 3 are migrated today; the rest is the planned shape
for later phases so schema changes stay additive, not restructuring.

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

-- Phase 3: voice capture --
AudioAttachment  id, savedItemId (unique, 1:1), fileUrl, duration (seconds),
                 transcript, transcriptionStatus (ProcessingStatus), createdAt, updatedAt
                 — reuses ProcessingStatus for transcriptionStatus: same
                   PENDING→PROCESSING→COMPLETED/FAILED state machine, different step

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

**Two Phase 3 naming notes, called out rather than silently decided:**
- `AudioAttachment.fileUrl` actually stores the *storage key* (the opaque
  reference `StorageProvider.upload()` returns), not a literal browser URL.
  `StorageProvider.getUrl(key)` is called on demand to compute a servable URL
  when one is needed (the `GET /api/audio/file/:key` route). This avoids
  persisting a URL that would need reversing back into a key for `read()`/
  `delete()` — and for a future signed-URL S3 provider, persisting a
  long-lived "url" would be actively wrong, since presigned URLs expire.
- `AudioAttachment` has no `error` column, unlike `ProcessingJob`. The given
  field list didn't include one; a failed transcription's reason surfaces in
  the API response but isn't persisted. Worth adding if debugging failed
  transcriptions becomes a real need — same pattern as `ProcessingJob.error`.

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
│   │   ├── processing.ts    — Phase 2 pipeline (job creation + execution)
│   │   └── audio.ts         — Phase 3: upload + transcription, triggers processing.ts
│   ├── validation/          — zod schemas (auth, saved-item)
│   ├── ai/                  — Phase 2: AIProvider abstraction
│   │   ├── types.ts         — AIProvider interface
│   │   ├── extraction.ts    — zod schemas + strict-JSON response parsing
│   │   ├── prompts.ts       — prompt templates per capability
│   │   ├── claude-provider.ts
│   │   ├── errors.ts        — AIProviderError, AIResponseValidationError
│   │   └── index.ts         — getAIProvider() factory (the swap point)
│   ├── storage/             — Phase 3: StorageProvider abstraction
│   │   ├── types.ts, errors.ts, local-provider.ts, index.ts
│   └── transcription/       — Phase 3: TranscriptionProvider abstraction
│       ├── types.ts, errors.ts, whisper-provider.ts, index.ts
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

## Voice capture pipeline (Phase 3)

```
POST /api/audio/upload  (multipart: field "audio", plus title/tags/projects)
        ↓
  StorageProvider.upload() → key
        ↓
  SavedItem(type=VOICE, content=null, status=PENDING) + AudioAttachment(transcriptionStatus=PENDING)
        ↓
POST /api/items/:id/transcribe
        ↓
  StorageProvider.read(key) → audio bytes
        ↓
  TranscriptionProvider.transcribe() → { text, duration } | throws
        ↓
  success: AudioAttachment.transcript/duration/transcriptionStatus=COMPLETED,
           SavedItem.content = transcript
           → processSavedItem() runs automatically (unlike plain create/update,
             which only queue a job — this step explicitly triggers it)
  failure: AudioAttachment.transcriptionStatus=FAILED, SavedItem.content untouched
```

The critical design constraint here — "do not create a separate AI system" —
is satisfied structurally: once `transcribe()` returns text, `processSavedItem`/
`runProcessingJob` from Phase 2 run completely unchanged. A voice item and a
pasted note are indistinguishable to the pipeline from that point on.

`runTranscriptionSafely` mirrors Phase 2's `runExtractionSafely` — same
discriminated-result pattern, same reason (normalize every provider failure
mode into one shape instead of scattering try/catch across callers).

One deviation worth flagging: `StorageProvider` gained a **`read(key)`** method
beyond the specified upload/delete/getUrl — transcription needs the raw bytes
back, and no other method provides them. Same judgment call as Phase 2's
`analyze()`: an interface gap that's structurally necessary, not scope creep.

## Risks

1. **AI cost/latency** — `analyze()` is one call per item, but there's no retry/backoff yet on transient upstream failures (a timeout just fails the job; the user has to manually re-trigger `/process`).
2. **pgvector at scale** — fine for personal-scale data; needs an HNSW index if this grows large.
3. **Entity resolution / duplicate detection**: `ExtractedEntity` rows aren't deduplicated across items yet (e.g. "LangGraph" saved from two different items are two separate rows). Fine for now since nothing consumes them cross-item; matters once `RelatedItem` linking is built.
4. **Sync-only processing today** — `/api/items/:id/process` and `/api/items/:id/transcribe` both block on the full round-trip (Claude, and now Whisper too). Acceptable for a personal tool triggering one item at a time; not acceptable multi-user or bulk-triggered without the queue migration described in Phase 2.
5. **File uploads**: `/api/audio/upload` validates mime type (`audio/*`) and a 25MB size cap (matching Whisper's real limit) — boundary validation now actually implemented, not just a flagged risk.
6. **Original mime type isn't persisted**: `AudioAttachment` has no mime-type column (kept to the given field list), so transcription/serving guess it from the storage key's file extension. Works for common audio formats; an unusual upload with a misleading or missing extension could guess wrong.
7. **Known dependency risk:** Next.js 14.2.x (latest patched release on that line) still carries two open high-severity advisories fixed only in the Next.js 16 major (SSRF via rewrites, internal Server Function disclosure — both require rewrites/Server Actions usage this app doesn't have yet). Tracked for a deliberate upgrade once the Next 16 line stabilizes.

## Implementation plan

- **Phase 1 (done):** Next.js scaffold, Postgres, Prisma schema (User/SavedItem/Tag/Project + joins/Attachment), auth, full CRUD for saved items with manual tags/projects, inbox + detail/edit UI.
- **Phase 2 (done):** `AIProvider`/`ClaudeProvider`, `ProcessingJob`/`ExtractedTask`/`ExtractedEntity`/`Decision`/`Question` tables, synchronous processing pipeline triggered via `POST /api/items/:id/process`, unit tests for response parsing/validation/empty-content/duplicate-tags/entity-extraction. No UI for any of this yet, by design — backend first.
- **Phase 3 (done):** `StorageProvider`/`LocalStorageProvider`, `TranscriptionProvider`/Whisper adapter, `AudioAttachment` table, `POST /api/audio/upload` + `POST /api/items/:id/transcribe` (auto-triggers the Phase 2 pipeline on success). Tests for successful/failed transcription, missing audio, and one live-DB-guarded pipeline-integration test. Still no UI — no recording/upload widget yet.
- **Phase 4:** `Embedding` table + pgvector, chunking/embedding on save, semantic search.
- **Phase 5:** Chat UI over saved items using Phase 4 retrieval + Claude, with citations.
- **Follow-up:** `RelatedItem` table + wiring `findRelationships()` into the pipeline; background queue worker (see migration path above, now applies to `/process` and `/transcribe` both); UI to surface Phase 2/3's extracted tasks/entities/decisions/questions/audio playback + recording.
