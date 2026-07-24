# Capabilities

A complete catalog of what this app can actually do today, end to end. For
*how* it does it (schema, architecture decisions, deliberate deviations from
spec) see [ARCHITECTURE.md](./ARCHITECTURE.md). For setup/usage examples see
[README.md](./README.md).

---

## 1. Universal inbox

- **9 saved item types:** `NOTE`, `LINK`, `ARTICLE`, `YOUTUBE`, `GITHUB`,
  `SCREENSHOT`, `PDF`, `IMAGE`, `VOICE`.
- Create, read, update, and delete any saved item — title, source URL,
  content, tags, and project assignments.
- Tags and projects are user-defined, many-to-many, and auto-created the
  first time you use a new name — no separate "create a tag" step.
- Full-text filtering in the inbox by type; search (below) covers everything
  else.
- Every saved item is scoped to its owner end to end — there is no
  cross-user visibility anywhere in the app.
- Email/password authentication with JWT session cookies (httpOnly,
  bcrypt-hashed passwords).

**Honest gap:** only `VOICE` has an automated *capture* pipeline (below). The
other 8 types exist as real, usable saved-item types — you can save a link,
an article, a GitHub repo, a screenshot, a PDF, an image, right now — but
there is no automated web-page scraper, YouTube transcript fetcher, GitHub
repo analyzer, OCR, or PDF text extractor behind them yet. You provide the
title/content yourself (e.g. paste the URL as the source and paste in a
summary or the text you want processed); the AI pipeline below then works on
whatever content you gave it, regardless of type.

## 2. AI knowledge processing

Once a saved item has content, it can be run through Claude to produce:

- **Summary** and **key points**
- **Tags** (AI-suggested tags are merged into your existing tags — never
  overwritten)
- **Extracted tasks** — title, description, priority, due date, confidence
- **Decisions** — statement, reasoning, confidence
- **Questions** — open/answered/dismissed
- **Entities** — people, companies, technologies, projects, books, URLs,
  concepts, each with a confidence score

Processing is tracked per item with a full job history
(`PENDING → PROCESSING → COMPLETED/FAILED`), triggered on demand
(`POST /api/items/:id/process`) or automatically the moment a voice
transcript lands. Every AI response is validated against a strict JSON
schema before anything touches the database — a malformed or incomplete
response fails that one job cleanly instead of corrupting your data.

## 3. Voice capture

- Upload an audio file (mime-type checked, 25MB cap — matches Whisper's real
  limit).
- Automatic transcription via OpenAI Whisper.
- The transcript is handed straight to the *same* AI processing pipeline
  used by every other item type — a voice memo and a pasted note are
  processed identically from that point on.
- Files are stored outside the public web root and served only to their
  owner through an authenticated route — not through a signed URL, not
  through `public/`.

## 4. Semantic search

- Search your entire knowledge base **by meaning**, not keyword matching —
  "AI agents," "startup ideas," "database decisions" all work even when the
  saved content doesn't contain those exact words.
- Filters: item type, project, tag, date range.
- Every result includes a similarity score and a text highlight.
- **Related objects:** matching tasks, decisions, questions, and entities
  surface alongside item results — a decision can be its own search hit,
  distinct from the item it came from.
- **Related items:** every item's detail page shows similar items you've
  already saved, computed for free from the item's own stored embedding (no
  extra AI call).
- Backed by pgvector (Postgres) with an HNSW index and OpenAI embeddings —
  one database, no separate vector store to run.

## 5. AI assistant (chat)

- Ask questions about your saved knowledge in natural language:
  *"What did I decide about databases?"* · *"Summarize everything I know
  about AI agents"* · *"What tasks are still unresolved?"*
- **Four modes:** Ask, Summarize, Compare, Find conflicts (the last one
  specifically hunts for contradictions across your decisions).
- Every answer comes with:
  - the answer itself
  - **cited sources**, each linking back to the real saved item/decision/task
    it came from
  - **related items** that were retrieved but not directly cited
  - a **confidence score**
- **Grounded, not hallucinated, by construction, not just by prompt:**
  - If nothing relevant is found in your saved knowledge, the assistant is
    never even called — you get a plain "I don't have that saved yet," with
    zero risk of the model reaching for its own general knowledge.
  - Every citation the model produces is checked against what was actually
    retrieved; a fabricated or out-of-range citation is dropped before it
    ever reaches the screen.
- **Multi-turn conversations**, saved and resumable from a history sidebar.
- **Suggested knowledge actions** — "create this as a task," "save this as a
  decision," "create a project," "add a reminder" — are only ever
  *suggestions*. Nothing is written to your knowledge base until you
  explicitly click confirm on that specific suggestion.

## Cross-cutting properties

- **Swappable AI vendors everywhere:** extraction (`AIProvider`),
  transcription (`TranscriptionProvider`), embeddings (`EmbeddingProvider`),
  and chat (`AssistantProvider`) are each behind their own small interface.
  Today all four are Claude/OpenAI; changing any one vendor means writing
  one new adapter class, not touching a single call site elsewhere in the
  app.
- **Per-user data isolation** is enforced at the service layer on every
  query in the app — search, chat, related items, everything.
- **85 automated tests**, split deliberately: unit tests for every
  safety-critical guard (empty content, malformed AI JSON, hallucination
  prevention, duplicate-tag handling, missing audio, etc.) that run with no
  network or database access, plus a handful of database-backed integration
  tests that prove the real retrieval/ranking mechanics work, using
  deterministic fake embeddings instead of live API calls so the whole suite
  stays runnable offline.

## What's explicitly not built yet

Named here on purpose rather than left implicit:

- **No automated content ingestion** for link/article/YouTube/GitHub/
  screenshot/PDF/image saved items — no scraper, no transcript fetcher, no
  repo analyzer, no OCR, no PDF text extraction.
- **No background job queue.** Processing, transcription, search, and chat
  are all synchronous HTTP calls today — fine for one person using the app
  at a time, not for high concurrency.
- **No chunk-level embeddings**, so search/chat "highlights" are whole-item
  summaries, not precisely-located passage excerpts.
- **No embedding backfill** for items saved before semantic search existed —
  they become searchable the next time they're (re)processed.
- **No dedicated UI** for browsing or editing extracted tasks/decisions/
  questions directly — they power search and chat, and knowledge actions can
  create new ones, but there's no task/decision management screen.
- **No response streaming** — assistant replies arrive complete, not
  token-by-token.
- **No query rewriting** for chat follow-ups — each turn retrieves using
  that turn's literal text; multi-turn coherence relies on the model seeing
  prior turns, not on smarter retrieval.
