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
- **Every saved-item type now has a real automated capture path** — see
  section 6. This used to be a gap (only voice had one); it isn't anymore.

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

## 6. Universal capture (Albo-inspired layer)

One entry point — `POST /api/capture`, or the **+ Capture** button on every
page — for anything you want to save. You give it a link, some text, or a
file; it figures out what kind of thing it is and extracts what it can,
automatically:

- **Paste a link** and it's classified and extracted automatically:
  - A **YouTube URL** → title/author via YouTube's oEmbed API, plus a
    best-effort transcript and chapter list scraped from the watch page
    (there's no supported public transcript API, so this can degrade to
    "title/author only" if YouTube's markup changes — it never fails the
    capture outright).
  - A **GitHub repo URL** → README, primary language + full language
    breakdown, star count, and topics, via GitHub's REST API. An optional
    `GITHUB_TOKEN` raises the low anonymous rate limit or reaches private
    repos you have access to.
  - **Any other URL** → the page is fetched and its main content extracted
    (title, author, description, images), classified as an `ARTICLE` if
    there's substantial extracted text or a plain `LINK` if not.
- **Paste or dictate text** with nothing else → a `NOTE`, same as before.
- **Upload a file:**
  - An **image** → Claude vision describes what's shown and transcribes any
    visible text (OCR), stored together as the item's content.
  - A **screenshot** (check the box when uploading, or pass `hint:
    "screenshot"`) → the same vision mechanism, but prompted to identify
    the app/interface shown and transcribe its text accurately — screenshots
    and photos get different treatment because they're saved for different
    reasons, not because the pixels look different.
  - A **PDF** → text and metadata (page count, author) extracted directly,
    no AI call needed.
- **Collections** — a lighter, casual way to group saved items than
  projects: create one, add/remove items, done. Items can belong to more
  than one.
- **Why this matters, and how much** — every processed item now also gets
  an AI-estimated **importance score** (0-100%) and a plain-language
  **save reason** ("relates to your current project," etc.), both shown on
  the item's card and detail page. Reprocessing an item never silently
  overwrites a save reason you've edited.
- **Rediscovery** (`/rediscover`) — four views over what you've saved:
  - **Recently saved** — the newest items, plainly.
  - **Forgotten items** — saved two weeks ago or more, and never opened (or
    not opened in two weeks) — the things you saved and then lost track of.
  - **Related discoveries** — "you saved this a while ago, and it connects
    to something you just saved" — computed from the same embedding
    similarity as search and related items, just run proactively over your
    most recent saves instead of waiting for you to open one.
  - **Suggested collections** — clusters of similar recent saves you
    haven't organized yet, each with an "Accept as collection" button.
    Nothing is grouped until you click it.
- There's no scheduled job anywhere in this app (a known, named gap), so
  rediscovery is computed live when you load the page, not delivered as an
  actual daily/weekly digest.

## 7. Local and self-hosted model support

Every AI capability in this app — extraction, chat, and embeddings — can
independently run against a local or self-hosted model instead of Claude/
OpenAI, via environment variables (`AI_PROVIDER`, `ASSISTANT_PROVIDER`,
`EMBEDDING_PROVIDER=openai-compatible`). Ollama and NVIDIA NIM both speak
the same OpenAI-compatible request format, so this one switch covers either.
Nothing changes if you leave these unset — Claude/OpenAI stay the default.
Switching the embedding backend to a model with a different output width
than OpenAI's default needs a one-time database column resize first (see
ARCHITECTURE.md) — this isn't automatic.

## Cross-cutting properties

- **Swappable AI vendors everywhere:** extraction (`AIProvider`),
  transcription (`TranscriptionProvider`), embeddings (`EmbeddingProvider`),
  chat (`AssistantProvider`), and image understanding (`VisionProvider`) are
  each behind their own small interface. Claude/OpenAI are the defaults;
  changing any one vendor means writing one new adapter class, not touching
  a single call site elsewhere in the app — including to a local/self-hosted
  backend (section 7), which extraction, chat, and embeddings already
  support without any code changes, just configuration.
- **Universal capture is the same story, one level up:** every source type
  (web, YouTube, GitHub, image, screenshot, PDF, plain text) is one
  `CaptureProvider` behind one registry; adding a new source type is one new
  file and one registration line, never a change to `POST /api/capture`
  itself.
- **Per-user data isolation** is enforced at the service layer on every
  query in the app — search, chat, related items, rediscovery, everything.
- **"AI suggests, you confirm" is enforced consistently, not just in chat.**
  Phase 5's knowledge actions, and now Sub-Phase D's AI-suggested
  collections, both require an explicit user action before anything is
  written — no code path auto-creates a collection or a task from an AI
  suggestion.
- **188 automated tests**, split deliberately: unit tests for every
  safety-critical guard (empty content, malformed AI JSON, hallucination
  prevention, duplicate-tag handling, missing audio, capture-provider
  dispatch order, embedding-similarity clustering, etc.) that run with no
  network or database access, plus DB-guarded integration tests that prove
  the real retrieval/ranking/rediscovery mechanics work using deterministic
  fake embeddings instead of live API calls, so the whole suite stays
  runnable offline. A handful of capture providers (web page fetching,
  YouTube, real PDF parsing) were additionally verified against real live
  requests during development, beyond what the automated suite covers — see
  ARCHITECTURE.md for exactly which ones and why some couldn't be (GitHub
  and Claude-vision access were both blocked by this development sandbox's
  own network/credentials, not by anything in the app).

## What's explicitly not built yet

Named here on purpose rather than left implicit. Note that most of the
first release's gaps in this list have since closed — see the strikethrough
notes — replaced by gaps the Albo-inspired layer (Sub-Phases A-E) opened up
instead:

- ~~No automated content ingestion for link/article/YouTube/GitHub/
  screenshot/PDF/image saved items~~ — **closed.** Section 6 covers all of
  it now.
- **No background job queue.** Processing, transcription, search, chat, and
  now capture/rediscovery are all synchronous HTTP calls today — fine for
  one person using the app at a time, not for high concurrency.
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
- **No scheduled digest.** Rediscovery is computed live on page load, not
  delivered proactively (there's no job scheduler anywhere in this app).
- **No modal/dialog UI anywhere** — capture is a full `/capture` page, not
  an in-context quick-capture popup; confirmations use the browser's native
  `confirm()`. Fine for a personal-use app, worth revisiting if this UI grows.
- **Screenshot vs. photo is a caller-supplied hint**, not something the app
  detects — nothing stops a caller from mislabeling one as the other (the
  consequence is just a slightly mismatched vision prompt, not a broken
  capture).
- **No automated browser/e2e test suite.** The `/capture` and `/rediscover`
  pages were verified with a one-off manual Playwright script during
  development (see ARCHITECTURE.md), not a checked-in suite `npm test` runs.
- **`pdf-parse` is deliberately pinned to its 1.x line**, not latest — the
  2.x line crashes when bundled into this app's Next.js server routes (a
  real, confirmed bug, documented in ARCHITECTURE.md), not a preference.
- **GitHub capture, real Claude-vision image analysis, and local-model
  (Ollama/NVIDIA NIM) inference are all implemented and unit-tested against
  mocked responses, but none were verified against the real, live service**
  in this development environment — two for credential/sandbox-policy
  reasons, one for lack of a running local model to point at. All three
  match their documented request/response contracts; a live check once this
  runs somewhere without those specific constraints is the only thing
  standing between "should work" and "confirmed working."
