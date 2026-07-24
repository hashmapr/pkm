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
| AI | Provider abstraction in `src/lib/ai/` (Phase 2+) | One interface (chat, embeddings, transcription); swapping models means writing one adapter, not touching call sites. |
| File storage | Storage abstraction in `src/lib/storage/` (Phase 3+) | Local disk in dev, swaps to S3/R2 in production behind the same interface. |

**Layering rule:** route handlers stay thin (parse request → call a service in
`src/lib/services` → return response). All business logic lives in services so
UI, API, and future background jobs can all call the same code path.

## Database schema

Only the Phase 1 subset is migrated today; the rest is the planned shape for
later phases so schema changes are additive, not restructuring.

```
User             id, email, passwordHash, name, createdAt

SavedItem        id, userId, type (enum), title, source, content, summary,
                 status (NEW|PROCESSING|PROCESSED|FAILED), metadata (jsonb),
                 createdAt, updatedAt

Attachment       id, savedItemId, storagePath, mimeType, sizeBytes, createdAt

Tag              id, userId, name (unique per user)
SavedItemTag     savedItemId, tagId

Project          id, userId, name, description, createdAt
SavedItemProject savedItemId, projectId

-- Planned, not yet migrated --
AIExtraction     (Phase 2) keyPoints, actionItems, decisions, questions, ideas,
                 deadlines, confidence, modelUsed — one row per processed item
Entity           (Phase 2) userId, name, type (person|company|technology)
SavedItemEntity  (Phase 2) join table — how items about the same entity connect
RelatedItem      (Phase 2) itemId, relatedItemId, score, relationType
Embedding        (Phase 4) savedItemId, chunkIndex, chunkText, vector(1536)
ChatSession /
ChatMessage      (Phase 5) userId, role, content, citations (jsonb)
```

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
│   ├── services/            — business logic (saved-items, tags, projects)
│   ├── validation/          — zod schemas
│   ├── ai/                  — Phase 2+
│   └── storage/             — Phase 3+
├── middleware.ts             — route protection
└── types/saved-item.ts
```

## Risks

1. **AI cost/latency** (Phase 2+) — mitigated by the provider abstraction, but per-item processing needs a cap/backoff.
2. **pgvector at scale** — fine for personal-scale data; needs an HNSW index if this grows large.
3. **Entity resolution / duplicate detection** (Phase 2) is inherently fuzzy — false-positive links are worse UX than missed ones, so this needs a confidence threshold and a manual unlink control.
4. **Sync-only processing today** — Phase 1 CRUD is synchronous by design. Phase 2/3 (AI extraction, transcription) are slow and will need to run out-of-band (queue/background job), not inline in the request.
5. **File uploads** (Phase 3) need size/type validation even in a personal app.
6. **Known dependency risk:** Next.js 14.2.x (latest patched release on that line) still carries two open high-severity advisories fixed only in the Next.js 16 major (SSRF via rewrites, internal Server Function disclosure — both require rewrites/Server Actions usage this app doesn't have yet). Tracked for a deliberate upgrade once the Next 16 line stabilizes, not a Phase 1 blocker.

## Implementation plan

- **Phase 1 (this change):** Next.js scaffold, Postgres, Prisma schema (User/SavedItem/Tag/Project + joins/Attachment), auth, full CRUD for saved items with manual tags/projects, inbox + detail/edit UI.
- **Phase 2:** `lib/ai` Claude adapter, `AIExtraction`/`Entity` tables, background processing on item create (summary, tags, key points, entities, related-item linking).
- **Phase 3:** Audio recording/upload UI + `lib/storage`, transcription via the AI adapter, feeding the Phase 2 pipeline.
- **Phase 4:** `Embedding` table + pgvector, chunking/embedding on save, semantic search.
- **Phase 5:** Chat UI over saved items using Phase 4 retrieval + Claude, with citations.
