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
| Embeddings | Provider abstraction in `src/lib/embeddings/` (Phase 4) | `EmbeddingProvider` interface + OpenAI (`text-embedding-3-small`) adapter — its own abstraction, same reasoning as Transcription vs. AI. |
| Vector search | pgvector (Phase 4) | Same Postgres instance as everything else; `Unsupported("vector(1536)")` column + raw SQL for similarity queries, HNSW index for cosine distance. |
| AI assistant | Provider abstraction in `src/lib/assistant/` (Phase 5) | `AssistantProvider` interface + Claude adapter — its own abstraction (not new `AIProvider` methods), same reasoning as Transcription/Embeddings: different capability, independently swappable, even though currently the same vendor. |
| Universal capture | Provider abstraction in `src/lib/capture/` (Albo layer, Sub-Phase A/B) | `CaptureProvider` interface (`supports`/`capture`) + a registry, so adding a new source type (web, YouTube, GitHub, PDF, image) means writing one provider and registering it — no call-site changes to `POST /api/capture`. |
| Local/self-hosted models | `OpenAICompatibleAIProvider` / `OpenAICompatibleAssistantProvider` / `OpenAIEmbeddingProvider`'s `baseURL` option | Ollama and NVIDIA NIM both speak the OpenAI chat-completions and embeddings request shape, so one adapter per capability covers both vendors instead of two — selected per-capability via `AI_PROVIDER`/`ASSISTANT_PROVIDER`/`EMBEDDING_PROVIDER` env vars, defaulting to Claude/OpenAI unchanged. |

**Layering rule:** route handlers stay thin (parse request → call a service in
`src/lib/services` → return response). All business logic lives in services so
UI, API, and future background jobs can all call the same code path.

## Database schema

Phase 1 through Phase 5 are all migrated, plus Sub-Phase A of the
Albo-inspired layer (see [ALBO_ANALYSIS.md](./ALBO_ANALYSIS.md) /
[ALBO_INTEGRATION_PLAN.md](./ALBO_INTEGRATION_PLAN.md) for that layer's own
research and design). Everything below is additive — no existing model was
rewritten to build any of it.

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

-- Phase 4: semantic search --
Embedding        id, entityType (SAVED_ITEM|EXTRACTED_TASK|DECISION|QUESTION|ENTITY),
                 entityId, vector(1536), model, createdAt
                 @@unique([entityType, entityId])
                 — polymorphic across 5 entity types instead of 5 tables; all
                   reads/writes go through raw SQL (Prisma Client can't query
                   an Unsupported column). HNSW index on vector, added as a
                   follow-up migration since Prisma's schema DSL has no
                   operator-class syntax for vector indexes.

-- Phase 5: AI assistant --
Conversation     id, userId, title (nullable), createdAt, updatedAt
Message          id, conversationId, role (USER|ASSISTANT), content,
                 sourcesUsed (jsonb — see below), createdAt

-- Albo-inspired layer, Sub-Phase A --
Collection       id, userId, name, description, emoji, isAiSuggested,
                 createdAt, updatedAt — @@unique([userId, name])
                 — a lighter, more casual organizing layer than Project
SavedItemCollection savedItemId, collectionId, addedAt
SavedItem (additive): importanceScore (float, AI-estimated), saveReason
                 (AI-suggested "why this was saved," user-editable, never
                 silently overwritten by a reprocess), lastViewedAt (set on
                 item-detail view; powers "forgotten items," Sub-Phase D)

-- Superseded, never migrated --
RelatedItem      superseded by Phase 4 embedding similarity — see "Related
                 Items" in the Phase 4 section; no persisted graph or LLM call needed
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

**Two Phase 5 additions beyond the literal field list:** `userId` on
`Conversation` (ownership scoping — structurally required, the same judgment
call as every prior phase's necessary additions) and `conversationId` on
`Message` (the FK that makes "which conversation" mean anything). `sourcesUsed`
is one JSON blob — `{ sources, relatedItems, confidence, suggestedActions }`
— rather than separate columns for each, because they're produced together by
one assistant turn and read together by the UI on every reload.

## Folder structure

```
src/
├── app/
│   ├── (auth)/login, register            — public
│   ├── (app)/inbox, items/[id], (edit), projects, search, chat/[id], layout.tsx — authenticated
│   └── api/auth/*, items/*, tags, projects, search, audio/*, assistant/*
├── components/{layout, saved-items, projects, search, chat}
├── lib/
│   ├── db.ts                — Prisma client singleton
│   ├── auth/{password.ts, session.ts}
│   ├── services/            — business logic
│   │   ├── saved-items.ts, tags.ts, projects.ts
│   │   ├── processing.ts        — Phase 2 pipeline (job creation + execution)
│   │   ├── audio.ts             — Phase 3: upload + transcription, triggers processing.ts
│   │   ├── embedding-index.ts   — Phase 4: text-building + upsert/cleanup, called from processing.ts
│   │   ├── search.ts            — Phase 4: /api/search + related-items queries
│   │   ├── retrieval.ts         — Phase 5: multi-entity-type context retrieval for chat
│   │   ├── assistant-chat.ts    — Phase 5: RAG orchestration (retrieve, guard, call, persist)
│   │   ├── conversations.ts     — Phase 5: list/fetch conversations
│   │   ├── knowledge-actions.ts — Phase 5: the only place a confirmed suggested action writes to the DB
│   │   ├── collections.ts       — Albo layer: Collection CRUD, add/remove items
│   │   └── capture.ts           — Albo layer: dispatches through CaptureProvider registry, then createSavedItem
│   ├── validation/          — zod schemas (auth, saved-item, search, assistant, collections, capture)
│   ├── ai/                  — Phase 2: AIProvider abstraction
│   │   ├── types.ts         — AIProvider interface
│   │   ├── extraction.ts    — zod schemas + strict-JSON response parsing
│   │   ├── prompts.ts       — prompt templates per capability
│   │   ├── claude-provider.ts
│   │   ├── errors.ts        — AIProviderError, AIResponseValidationError
│   │   └── index.ts         — getAIProvider() factory (the swap point)
│   ├── storage/             — Phase 3: StorageProvider abstraction
│   │   ├── types.ts, errors.ts, local-provider.ts, index.ts
│   ├── transcription/       — Phase 3: TranscriptionProvider abstraction
│   │   ├── types.ts, errors.ts, whisper-provider.ts, index.ts
│   ├── embeddings/          — Phase 4: EmbeddingProvider abstraction
│   │   ├── types.ts, errors.ts, openai-provider.ts, index.ts
│   └── assistant/           — Phase 5: AssistantProvider abstraction
│       ├── types.ts         — AssistantProvider interface, ContextSource, SuggestedAction
│       ├── schemas.ts       — zod schema + strict-JSON response parsing
│       ├── prompts.ts       — prompt templates per mode (answer/summarize/compare/find-conflicts)
│       ├── claude-assistant-provider.ts
│       ├── errors.ts        — AssistantProviderError, AssistantResponseValidationError
│       └── index.ts         — getAssistantProvider() factory
├── capture/                 — Albo layer: CaptureProvider abstraction
│   ├── types.ts             — CaptureProvider interface (supports/capture)
│   ├── errors.ts            — NoCaptureProviderError, CaptureProviderError
│   ├── registry.ts          — CaptureProviderRegistry (ordered, first-match dispatch)
│   ├── providers/note-provider.ts — the only concrete provider so far (plain text fallback)
│   └── index.ts             — getCaptureRegistry() factory
├── middleware.ts             — route protection
└── types/{saved-item.ts, search.ts, assistant.ts}
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

## Semantic search (Phase 4)

```
ProcessingJob → COMPLETED   (Phase 2's existing success path — no new trigger)
        ↓
  indexSavedItemEmbeddings(userId, savedItemId)
        ↓
  batch-embed SavedItem + its extracted tasks/decisions/questions/entities
  (one EmbeddingProvider.generateEmbeddings call, not one per object)
        ↓
  upsert SAVED_ITEM embedding (stable id → ON CONFLICT)
  garbage-collect orphaned embeddings (extracted rows get new ids every
  reprocess; DELETE ... WHERE NOT EXISTS against each parent table)
        ↓
  insert fresh embeddings for the current tasks/decisions/questions/entities
```

Wrapped in try/catch in `runProcessingJob`: an indexing failure never fails
the processing job — extraction succeeded, so the item is fully usable, just
temporarily unsearchable.

```
GET /api/search?q=...&type=&project=&tag=&from=&to=
        ↓
  guard: blank q → {items:[], relatedObjects:[]}, no embedding call spent
        ↓
  EmbeddingProvider.generateEmbedding(q) → query vector
        ↓
  primary: cosine similarity over SAVED_ITEM embeddings, userId + filters
           scoped, ORDER BY vector <=> query
  secondary: cosine similarity over TASK/DECISION/QUESTION/ENTITY embeddings
             (userId-scoped, no filters) → "related objects"
```

**"Highlighted relevant sections"** is the item's `summary` (or a leading
slice of `content`), not a semantically-located excerpt — there's one
embedding per entity here, not per chunk, so there's no sub-document span to
point at. True passage highlighting needs chunk-level embeddings, a bigger
schema change not made speculatively in this phase.

**Related Items** (`GET /api/items/:id/related`, and the item detail page's
"Related items" section) reuses the same embeddings with **no new API call**:
it runs the SAVED_ITEM similarity query using the item's *own* already-stored
vector as the query, filtered to similarity > 0.5 (a tunable heuristic) so a
small personal knowledge base doesn't surface noise as "related." This is also
the concrete answer to the `AIProvider.findRelationships()` gap flagged as
unwired back in Phase 2 — an LLM call per comparison would be slow and
expensive; embedding similarity gives the same "what's related" signal
instantly and for free (no embedding call, since the vectors already exist).
`findRelationships()` stays on `AIProvider` for a future higher-precision use
but nothing calls it.

**No backfill for pre-Phase-4 items:** `SavedItem`s from before this phase
have no embeddings until they're next (re)processed. Not written in this
phase since it wasn't asked for and is easy to add later (call
`processSavedItem` — or just `indexSavedItemEmbeddings` directly — over every
existing item once).

## AI assistant (Phase 5)

```
User question (+ conversationId if a follow-up)
        ↓
  persist as a USER Message; if this is a new conversation, its title
  becomes the first ~80 chars of the question
        ↓
  retrieveContextForQuestion: same 5-entity-type UNION ALL as Phase 4's
  /api/search, but returns full-length labels (not search highlights) and
  no filters — top 8 by cosine similarity, userId-scoped
        ↓
  guard: zero results → canned "I don't have saved information about that
         yet" answer, AssistantProvider never called
        ↓
  AssistantProvider.answerQuestion / summarizeKnowledge / compareKnowledge /
  findConflicts (dispatched by `mode`, all four share this same retrieval +
  persistence path — only the prompt differs)
        ↓
  strict JSON: { answer, sourceIndexes (1-based, into the numbered context
                 list), confidence, suggestedActions }
        ↓
  validateSourceIndexes: drop any index outside [1, context.length] — the
  concrete server-side defense against a fabricated citation
        ↓
  persist ASSISTANT Message; sourcesUsed = { sources: cited context entries,
  relatedItems: uncited context entries, confidence, suggestedActions }
```

**Why numbered indexes instead of asking the model to echo real ids:** models
reliably cite "source 2 and 4" from a list just shown to them, and
unreliably reproduce an exact opaque string id without typos. An index is
either in range or it isn't — trivial to validate, impossible to spoof past
that check.

**Retrieval reuses Phase 4's embeddings and Phase 4's multi-entity-type
query shape**, not a new index or a new embedding pass. A `Decision` or
`ExtractedTask` can be its own cited source, distinct from its parent
`SavedItem` — matching the phase's own example ("Sources: Recording from
July 12, GitHub repository, Decision entry," where the decision is listed
separately from its parent item).

**Hallucination prevention is three mechanisms, not one prompt request:**
1. The structural guard above — no retrieved context means the LLM is never
   called, so it's structurally unable to fill the gap from general
   knowledge, regardless of what the prompt says.
2. `validateSourceIndexes` — a citation outside the real, retrieved list is
   dropped server-side, never trusted into the rendered UI.
3. The system prompt's explicit instruction to answer only from the
   numbered sources and say so plainly when they're insufficient — the
   weakest of the three, since a prompt instruction can be ignored, which is
   exactly why (1) and (2) don't depend on the model cooperating.

`confidence` is model-self-reported, not independently calibrated — worth
being honest about in the UI copy, not just in this doc.

**Context limits** (why 8 sources, not more): Claude's actual context window
is large enough that more sources wouldn't overflow it — the real cost is
relevance dilution (a well-known RAG failure mode where marginal sources
distract the model instead of it just saying "that's all I have"), per-call
cost, and latency. History is capped at the last 10 messages (5 turns) for
the same reason. There is deliberately no query-rewriting/condensation step —
each turn retrieves fresh using that turn's raw question text; multi-turn
coherence relies on the model having prior turns in-prompt, not on smarter
retrieval. A follow-up like "why did we choose that?" works because the
model sees the prior turn, not because retrieval understood "that" refers to
the previous answer.

**Knowledge actions never execute from the chat path.** A `suggestedAction`
is a label + payload the assistant proposes in its JSON response; nothing
reaches the database until `POST /api/assistant/actions/confirm` is called,
which only happens from an explicit button click in the UI. Three of the
four action types write to existing models with no new schema: `CREATE_PROJECT`
→ the existing `Project` model directly; `CREATE_TASK` and `CREATE_DECISION`
→ `ExtractedTask`/`Decision`, anchored to a `savedItemId` the user (or the
suggested payload) specifies, with `confidence: 1` since it's user-confirmed,
not AI-inferred; `ADD_REMINDER` → also `ExtractedTask`, using its existing
`dueDate` field, since a reminder is structurally just a task with a
deadline and this phase's schema section didn't ask for a dedicated
`Reminder` model.

**Data privacy, named explicitly:** retrieval and conversations are
`userId`-scoped throughout, same as everywhere else in the app. This phase
sends more of a user's saved content to Anthropic per call than Phase 2 did
(several sources' text, not one item) — same vendor, same trust boundary
already established by Phase 2, but a larger slice per request, worth
naming rather than treating as a non-event. Conversations and messages are
stored in plaintext in our own Postgres, consistent with `SavedItem.content`
— no new encryption is introduced here, and none existed before.

## Local / self-hosted model backends (Ollama, NVIDIA NIM)

`AIProvider`, `AssistantProvider`, and `EmbeddingProvider` can each be pointed
independently at a local/self-hosted backend instead of Claude/OpenAI, via
`AI_PROVIDER`/`ASSISTANT_PROVIDER`/`EMBEDDING_PROVIDER=openai-compatible` (see
`.env.example`). This isn't three new adapters: Ollama's `/v1` compatibility
endpoint and NVIDIA NIM's endpoints both speak the same request/response shape
as OpenAI's chat-completions and embeddings APIs, so one
`OpenAICompatible*Provider` class per capability, configured with a
`baseURL` (`OPENAI_COMPATIBLE_BASE_URL`) and model name
(`OPENAI_COMPATIBLE_MODEL` / `OPENAI_COMPATIBLE_EMBEDDING_MODEL`), covers
both vendors. `src/lib/ai/openai-compatible-provider.ts` and
`src/lib/assistant/openai-compatible-assistant-provider.ts` are new classes
using the `openai` npm SDK's chat-completions call (the Claude adapters use
the Anthropic SDK's Messages API, a different enough shape that they couldn't
share a class); `EmbeddingProvider` didn't need a new class at all — it
already used the `openai` SDK, so a `baseURL` constructor option was enough.

Each switch defaults to unchanged behavior (Claude for AI/Assistant, OpenAI
for embeddings) — existing deployments need no config changes.

**The `dimensions` request parameter is OpenAI-specific** (only
`text-embedding-3-*` honor it) and most OpenAI-compatible local servers
reject an unrecognized field, so `OpenAIEmbeddingProvider` only sends it when
`baseURL` is unset (real OpenAI).

**Embedding-dimension mismatch is the one real migration cost of switching
embeddings.** `embeddings.vector` is a fixed-width `vector(1536)` column
(sized for OpenAI's `text-embedding-3-small`). A local embedding model with a
different output width — e.g. Ollama's `nomic-embed-text` at 768 dimensions —
needs the column resized to match before it'll accept inserts:
`ALTER TABLE embeddings ALTER COLUMN vector TYPE vector(768);` (adjust the
HNSW index rebuild per the recurring hand-rolled-index-migration hazard
below), and every already-indexed item needs re-embedding — there's no
automatic backfill or dimension-conversion path. Set
`OPENAI_COMPATIBLE_EMBEDDING_DIMENSIONS` to match whatever the migration set.

**Transcription (Whisper, Phase 3) has no local/NIM adapter yet.** Neither
Ollama nor NIM's chat/embedding NIMs do speech-to-text; NIM does offer
separate ASR NIMs (Parakeet/Canary) but with a different API shape than
OpenAI's `/v1/audio/transcriptions`, so `TranscriptionProvider` still
requires `OPENAI_API_KEY` regardless of these switches. A local Whisper-API-
compatible server (e.g. `faster-whisper`/`speaches`) could work today by
pointing `TranscriptionProvider`'s existing OpenAI client at a custom
`baseURL` the same way, but that adapter hasn't been built.

## Albo-inspired layer, Sub-Phase A (universal capture + collections)

Research and full design in [ALBO_ANALYSIS.md](./ALBO_ANALYSIS.md) and
[ALBO_INTEGRATION_PLAN.md](./ALBO_INTEGRATION_PLAN.md) — this section covers
what's actually built so far (Sub-Phase A of that plan; C-F are follow-up
work). Sub-Phase B (real Web/YouTube/GitHub capture providers) is covered in
its own section below.

```
POST /api/capture  { url? | text?, title?, tags?, projects? }
        ↓
  CaptureProviderRegistry.capture(input) — first registered provider whose
  supports() matches, tried in registration order: YouTubeCaptureProvider →
  GitHubCaptureProvider → WebCaptureProvider → NoteCaptureProvider (fallback,
  plain text with no url and no file)
        ↓
  createSavedItem() — the exact same function manual creation already uses;
  same tag/project handling, same automatic ProcessingJob queuing
```

This is deliberately the smallest possible slice that makes the
`CaptureProvider` abstraction real rather than aspirational: one concrete
provider today, proven end-to-end (register → dispatch → `SavedItem` →
existing processing pipeline), with the exact seam (`registry.register(...)`)
where Sub-Phase B's Web/YouTube/GitHub providers plug in without touching
`POST /api/capture` at all.

**Collections** (`Collection`/`SavedItemCollection`) are additive alongside
`Tag`/`Project`, not a replacement for either — a lighter, more casual
organizing layer (see ALBO_ANALYSIS.md for why Albo's collections don't map
1:1 onto `Project`). CRUD + add/remove-item endpoints under
`/api/collections`, a `/collections` list/detail UI, and an "Add to
collection" control on the item detail page.

**`importanceScore`/`saveReason`** extend the *existing* `AIProvider.analyze()`
strict-JSON schema — two new fields, not a new AI call. `saveReason` follows
the same non-clobbering principle as Phase 2's tag-merge: a reprocess never
overwrites a value that's already set (whether AI-set the first time or
user-edited afterward), since there's no way to distinguish "AI's original
guess" from "the user's edit" without a new flag not built in this
sub-phase — the closest safe default is simply "never overwrite a
non-null value."

**`lastViewedAt`** is set when the item detail page loads
(`markSavedItemViewed`), inside the page's server component, not the read
endpoint (`getSavedItem` stays a pure read) — this is what will power
"forgotten items" in Sub-Phase D's rediscovery system.

**Recurring migration hazard, hit again:** the Sub-Phase A migration for
`Collection`/`SavedItemCollection` auto-generated a `DROP INDEX` on the
Phase 4 hand-written HNSW vector index — the same issue flagged in Phase 5,
now confirmed as a genuine recurring pattern rather than a one-off. Every
future `prisma migrate dev` touching this schema needs the same manual
review of the generated SQL before applying it. Fixed the same way: strip
the erroneous drop, add a small restore migration.

## Albo-inspired layer, Sub-Phase B (real Web/YouTube/GitHub capture)

Three concrete `CaptureProvider`s, registered in `src/lib/capture/index.ts`
in this order (first match wins): `YouTubeCaptureProvider` →
`GitHubCaptureProvider` → `WebCaptureProvider` → `NoteCaptureProvider`. No
schema, API route, or registry changes were needed — this is exactly the
"write one provider, register it" extension point Sub-Phase A built.

**`WebCaptureProvider`** is the generic fallback for any input with a URL
that neither of the more specific providers claims. It fetches the page
(10s timeout, a real `User-Agent` since some sites block the default Node
one), rejects non-HTML content types (PDF/image links are Sub-Phase C's
job, not this provider's), and extracts title (`og:title` → `<title>`),
author, description, `og:site_name`, and up to 5 image URLs via `cheerio` —
no dependency on `@mozilla/readability` or a headless browser; `cheerio`'s
already-lightweight DOM parsing was enough for this level of extraction.
Main content is taken from `<article>` → `<main>` → `<body>` after
stripping `script`/`style`/`nav`/`header`/`footer`/`aside`, capped at 40,000
characters. **Classification (`LINK` vs `ARTICLE`) is a length heuristic**
(≥600 extracted characters → `ARTICLE`), decided after fetching, since
`WebCaptureProvider.type` is nominally `LINK` but `capture()`'s actual
output can be either — nothing else in the codebase treats `provider.type`
as a contract on what `capture()` returns.

**`YouTubeCaptureProvider`** gets title/author/thumbnail from YouTube's
public, unauthenticated oEmbed endpoint (`youtube.com/oembed?url=...`) —
that part is a real, documented API and a hard failure (any non-2xx) fails
the whole capture, since without it there's no metadata worth saving.
Transcript and description, by contrast, are **best-effort scraping**: the
watch page's HTML is fetched, `captionTracks` is regex-extracted out of the
embedded player-response JSON blob, and the first (preferring English)
track's `baseUrl` is fetched and stripped of XML tags for plain transcript
text; the description meta tag is parsed for chapter-looking lines
(`0:00 Intro` style) as a lightweight chapters list. **There is no
supported public API for either of these** — the real YouTube Data API's
`captions.download` requires OAuth as the video's own owner, so this is the
same unofficial approach most "youtube-transcript" npm packages use, and it
can silently degrade to `transcriptAvailable: false` (not throw) if YouTube
changes its markup or a video has no captions. Confirmed via a live smoke
test against a real video in this environment: oEmbed metadata capture
succeeded, but the transcript step returned no `captionTracks` match for
that particular fetch — the graceful degradation path is exercised for
real, not just in mocked tests, though transcript extraction itself
couldn't be positively confirmed working end-to-end here.

**`GitHubCaptureProvider`** matches any `github.com/{owner}/{repo}...` URL,
then calls three real GitHub REST endpoints — `GET /repos/{owner}/{repo}`
(hard failure on 404/non-2xx, mirroring YouTube's oEmbed-is-required
approach), `GET .../languages`, and `GET .../readme` (`Accept:
application/vnd.github.raw+json` for plain text instead of base64) — the
latter two are best-effort: a failure falls back to the repo's
`description` field for `content` and omits `languages` from metadata,
rather than failing the whole capture. `GITHUB_TOKEN` (optional) is sent as
a `Bearer` header when set, raising the anonymous rate limit and reaching
private repos the token can see; unset, it works for public repos subject
to GitHub's low anonymous per-IP limit. **Not independently verified against
the real GitHub API in this environment** — this development sandbox's own
network policy intercepts all `api.github.com` traffic and requires a
separate repo-scoping mechanism unrelated to this app's runtime, returning
a 401/403 that has nothing to do with GitHub's actual API — so the provider
was validated with mocked `fetch` responses matching GitHub's documented
REST API contract instead of a live call. Worth a real end-to-end check
once this runs somewhere without that sandbox-specific restriction.

**All three new providers share the same shape:** a `FETCH_TIMEOUT_MS`
(10s) `AbortController`-based timeout, a `CaptureProviderError` on hard
failures with a message specific enough to show the user directly (the
`/api/capture` route now catches `CaptureProviderError` generically and
returns its message as a 422, alongside the existing
`NoCaptureProviderError` 422 for genuinely unsupported input), and
best-effort/non-fatal handling for enrichment data that isn't essential to
having *something* worth saving.

## Risks

1. **AI cost/latency** — `analyze()` is one call per item, but there's no retry/backoff yet on transient upstream failures (a timeout just fails the job; the user has to manually re-trigger `/process`).
2. **pgvector at scale** — HNSW index is in place now; fine well past personal-app scale before it needs tuning (index build parameters, etc.).
3. **Entity resolution / duplicate detection**: `ExtractedEntity` rows aren't deduplicated across items yet (e.g. "LangGraph" saved from two different items are two separate rows, and two separate embeddings). Fine for now since nothing forces them to merge; matters if a future feature wants one canonical "LangGraph" node.
4. **Sync-only processing today** — `/api/items/:id/process`, `/api/items/:id/transcribe`, and now `/api/search` all block on a round-trip (Claude/Whisper/OpenAI embeddings respectively). Search is a single embedding call, much faster than the other two, but still synchronous. Acceptable for a personal tool used by one person at a time; not acceptable multi-user or high-traffic without the queue migration described in Phase 2.
5. **File uploads**: `/api/audio/upload` validates mime type (`audio/*`) and a 25MB size cap (matching Whisper's real limit) — boundary validation now actually implemented, not just a flagged risk.
6. **Original mime type isn't persisted**: `AudioAttachment` has no mime-type column (kept to the given field list), so transcription/serving guess it from the storage key's file extension. Works for common audio formats; an unusual upload with a misleading or missing extension could guess wrong.
7. **Search cost is per-query, not just per-save**: every `/api/search` call spends one embedding API call on the query text. Cheap per-call, but unlike the rest of the app (which only costs money when you save something), searching costs money every time you search. Not a real concern at `text-embedding-3-small` pricing, but worth knowing.
8. **No embeddings for items saved before Phase 4** — see "No backfill" above.
9. **Known dependency risk:** Next.js 14.2.x (latest patched release on that line) still carries two open high-severity advisories fixed only in the Next.js 16 major (SSRF via rewrites, internal Server Function disclosure — both require rewrites/Server Actions usage this app doesn't have yet). Tracked for a deliberate upgrade once the Next 16 line stabilizes.
10. **Deployment note:** `CREATE EXTENSION vector` needs a Postgres role with sufficient privilege. The docker-compose Postgres role already has it (it's that container's own superuser); a managed/restricted Postgres (some cloud providers) may need a DBA to run it once before migrations.
11. **Hand-rolled index migrations are fragile against Prisma's drift detection.** This bit us for real during Phase 5: a routine `prisma migrate dev` for the new `Conversation`/`Message` tables auto-generated a `DROP INDEX` on the hand-written HNSW index, because Prisma's diff engine has no schema-level knowledge that the index is supposed to exist. Caught before push by inspecting the generated migration, fixed by stripping the drop and adding a restore migration — but every future schema change touching this database needs the same manual review, indefinitely, until Prisma's DSL supports vector index operator classes natively.
12. **No query-rewriting for follow-up questions** — see "Context limits" above. A genuinely ambiguous follow-up ("what about the other one?") may retrieve poorly since retrieval doesn't benefit from conversation context, only the model's answer does.
13. **`confidence` is model-self-reported**, not an independently computed or calibrated score — treat it as the model's own hedge, not a statistical guarantee.
14. **Assistant-turn cost is the highest per-call cost in the app so far**: one embedding call (the question) plus one Claude call with several sources' worth of text in the prompt, per message. Still cheap in absolute terms at personal-app volume, but the most expensive single interaction available in the product.
15. **Hand-rolled index migrations, 2nd confirmed occurrence**: Sub-Phase A's `Collection`/`SavedItemCollection` migration hit the exact same auto-`DROP INDEX` issue described in risk #11, this time during a routine schema addition with no vector-related changes at all — proof it's not tied to touching embedding-adjacent models, but to *any* migration in a schema that contains the hand-written HNSW index. The mitigation (manual review + strip-and-restore) is unchanged, but the recurrence means this should be treated as a standing checklist item for every future migration, not a rare edge case.
16. **`CaptureProviderRegistry` has exactly one concrete provider (`NoteCaptureProvider`) as of Sub-Phase A** — any URL or file capture currently 422s with "nothing can capture this input yet." This is intentional scaffolding (Sub-Phase B adds `WebProvider`/`YouTubeProvider`/`GitHubProvider`), but it means `POST /api/capture` is not yet the universal entry point the Albo layer is aiming for.
17. **Local/self-hosted models are unvalidated against a real Ollama/NIM instance** — the `openai-compatible` adapters are tested against a mocked SDK client (correct request shape, error handling), not against a live Ollama or NIM server in this environment. A real local model's JSON-following discipline is typically weaker than Claude's for the strict extraction/assistant schemas this app validates against — expect a higher `AIResponseValidationError`/`AssistantResponseValidationError` rate than with Claude, with no fallback/retry-with-different-model logic built for that case yet.
18. **Switching `EMBEDDING_PROVIDER` after items are already indexed silently produces a mixed-dimension mess if the column isn't resized first** — see "Local / self-hosted model backends" above. There's no guard today that stops you from pointing `EMBEDDING_PROVIDER` at a different-width model without also migrating the column; it would simply fail at insert time (pgvector enforces the column's fixed width), not corrupt data, but the failure mode isn't a friendly one.
19. **`GitHubCaptureProvider` couldn't be smoke-tested against the real GitHub API** in this development environment — its sandbox's own network policy intercepts `api.github.com` and requires a separate repo-scoping step unrelated to this app, unlike `WebCaptureProvider` and `YouTubeCaptureProvider`'s target hosts which were reachable and verified live. The provider's logic matches GitHub's documented REST API contract and is covered by mocked-fetch tests, but a real end-to-end run (public and, separately, `GITHUB_TOKEN`-authenticated) is still outstanding.
20. **YouTube transcript scraping is inherently fragile** — it depends on an undocumented JSON blob YouTube embeds in the watch page's HTML, not a supported API. It degrades gracefully (no captions found → `transcriptAvailable: false`, capture still succeeds on oEmbed metadata alone) rather than failing the capture, but a YouTube markup change could silently drop transcript extraction entirely until the regex/parsing is updated.

## Implementation plan

- **Phase 1 (done):** Next.js scaffold, Postgres, Prisma schema (User/SavedItem/Tag/Project + joins/Attachment), auth, full CRUD for saved items with manual tags/projects, inbox + detail/edit UI.
- **Phase 2 (done):** `AIProvider`/`ClaudeProvider`, `ProcessingJob`/`ExtractedTask`/`ExtractedEntity`/`Decision`/`Question` tables, synchronous processing pipeline triggered via `POST /api/items/:id/process`, unit tests for response parsing/validation/empty-content/duplicate-tags/entity-extraction. No UI for any of this yet, by design — backend first.
- **Phase 3 (done):** `StorageProvider`/`LocalStorageProvider`, `TranscriptionProvider`/Whisper adapter, `AudioAttachment` table, `POST /api/audio/upload` + `POST /api/items/:id/transcribe` (auto-triggers the Phase 2 pipeline on success). Tests for successful/failed transcription, missing audio, and one live-DB-guarded pipeline-integration test. Still no UI — no recording/upload widget yet.
- **Phase 4 (done):** `EmbeddingProvider`/OpenAI adapter, `Embedding` table (pgvector, HNSW index), automatic indexing on processing completion, `GET /api/search` with type/project/tag/date filters, `GET /api/items/:id/related`, global search bar + `/search` results page + related-items section on the item detail page. Tests for text-building, embedding success/failure, empty queries, and one live-DB-guarded test proving real cosine-similarity ranking with a deterministic fake embedding.
- **Phase 5 (done):** `AssistantProvider`/Claude adapter, `Conversation`/`Message` tables, retrieval-augmented chat (`POST /api/assistant/messages`, `GET /api/assistant/conversations[/:id]`) with source-index validation against fabricated citations, `POST /api/assistant/actions/confirm` for user-confirmed knowledge actions (create task/decision/project, add reminder), a `/chat` page with conversation history, source/related-item cards, confidence, and confirm buttons. Tests for schema parsing, provider dispatch/failure per mode, source-index validation, and one live-DB-guarded test covering retrieval accuracy, missing-information short-circuiting, hallucination prevention, source attribution, and multi-turn conversation history.
- **Sub-Phase A (done):** Albo-inspired universal capture layer, first slice. `Collection`/`SavedItemCollection` schema plus additive `SavedItem` fields (`metadata`, `importanceScore`, `saveReason`, `lastViewedAt`); `CaptureProvider`/`CaptureProviderRegistry`/`NoteCaptureProvider` abstraction and `POST /api/capture`; Collections CRUD (`/api/collections[/:id][/items[/:savedItemId]]`) plus a `/collections` list/detail UI and an "Add to collection" control on the item detail page; `analyze()`'s schema extended with `importanceScore`/`saveReason` (non-clobbering on reprocess); `markSavedItemViewed` wired into the item detail page. Tests for registry dispatch/`NoteCaptureProvider` behavior, the new AI-response fields, and one live-DB-guarded collections-integration test. See `ALBO_ANALYSIS.md` and `ALBO_INTEGRATION_PLAN.md` for the research and full Sub-Phase A-F roadmap.
- **Local/self-hosted model backends (done):** `OpenAICompatibleAIProvider` and `OpenAICompatibleAssistantProvider` (new classes, `openai` SDK against a configurable `baseURL`) plus a `baseURL` option added to the existing `OpenAIEmbeddingProvider` — Ollama and NVIDIA NIM both speak the OpenAI chat-completions/embeddings dialect, so one adapter per capability covers both. Selected independently per capability via `AI_PROVIDER`/`ASSISTANT_PROVIDER`/`EMBEDDING_PROVIDER=openai-compatible` env vars, defaulting to unchanged Claude/OpenAI behavior. Tests cover request shape/error handling against a mocked SDK client and the env-var-driven factory selection logic in all three modules; no live Ollama/NIM instance was available to test against in this environment.
- **Sub-Phase B (done):** real `WebCaptureProvider` (generic HTML page extraction via `cheerio`: title/author/description/images, ARTICLE-vs-LINK length heuristic), `YouTubeCaptureProvider` (oEmbed metadata, best-effort transcript/chapter scraping), and `GitHubCaptureProvider` (repo metadata/languages/README via the GitHub REST API, optional `GITHUB_TOKEN`), registered ahead of `NoteCaptureProvider` — no schema, route, or registry-shape changes needed beyond registering the three new providers. `/api/capture` now also catches `CaptureProviderError` generically (422 with the provider's own message). Tests mock `fetch` for all three; `WebCaptureProvider` and `YouTubeCaptureProvider` were additionally verified with live smoke tests in this environment, `GitHubCaptureProvider` was not (this sandbox's own network policy blocks direct `api.github.com` access — see Risks). Image/screenshot/PDF capture (Sub-Phase C), rediscovery (D), further UI polish (E), and a final tests+docs pass (F) are not started.
- **Follow-up:** background queue worker (see migration path in Phase 2, now applies to `/process`, `/transcribe`, `/search`, and `/assistant/messages`); UI to surface extracted tasks/entities/decisions/questions and audio playback/recording; embedding backfill for pre-Phase-4 items; chunk-level embeddings for true passage highlighting; query-rewriting for follow-up questions; streaming assistant responses instead of waiting for the full answer; a live end-to-end check of `GitHubCaptureProvider` and the `openai-compatible` adapters outside this sandbox.
