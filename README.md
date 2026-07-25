# PKM — Personal AI Knowledge Capture

Save anything — voice, links, articles, YouTube, GitHub repos, screenshots,
PDFs, images, notes — into one inbox. AI understands, organizes, connects, and
makes it searchable. See [CAPABILITIES.md](./CAPABILITIES.md) for the full,
honest feature list (including what's not built yet) and
[ARCHITECTURE.md](./ARCHITECTURE.md) for design and the phased build plan.

**Phase 1 (done):** authentication, saved item CRUD, tags, projects.
**Phase 2 (done):** AI processing pipeline — `AIProvider`/Claude adapter,
`ProcessingJob` + extracted tasks/entities/decisions/questions, triggered via
`POST /api/items/:id/process`.
**Phase 3 (done):** voice capture — `StorageProvider`/local disk,
`TranscriptionProvider`/Whisper adapter, `AudioAttachment`, upload + transcribe
endpoints that feed the same Phase 2 pipeline.
**Phase 4 (done):** semantic search — `EmbeddingProvider`/OpenAI adapter,
pgvector-backed `Embedding` table indexed automatically when processing
completes, a global search bar, `/search` results page with type/date/
project/tag filters, and a "Related items" section powered by embedding
similarity.
**Phase 5 (done):** AI assistant — `AssistantProvider`/Claude adapter,
retrieval-augmented chat over your saved knowledge with source citations,
confidence scores, and user-confirmed knowledge actions (create a task,
save a decision, create a project, add a reminder — nothing executes without
an explicit confirm click). `/chat` page with conversation history.
**Albo-inspired universal capture layer (done, Sub-Phases A-F):** one
capture entry point — `POST /api/capture` or the **+ Capture** button on
every page — that classifies and extracts whatever you give it: a webpage,
a YouTube video, a GitHub repo, an image/screenshot (Claude vision:
description + OCR), a PDF, or plain text, each via its own `CaptureProvider`.
Lightweight `Collection`s for grouping alongside tags/projects; an
AI-estimated importance score and plain-language "why this was saved" on
every item; a `/rediscover` page surfacing recently-saved items, forgotten
items, related-knowledge connections, and AI-suggested collections (never
auto-created — you confirm). Every AI capability (extraction, chat,
embeddings) can also run against a local/self-hosted model (Ollama, NVIDIA
NIM) instead of Claude/OpenAI, per-capability, via env vars. See
[CAPABILITIES.md](./CAPABILITIES.md) for the full feature list,
[ALBO_ANALYSIS.md](./ALBO_ANALYSIS.md)/[ALBO_INTEGRATION_PLAN.md](./ALBO_INTEGRATION_PLAN.md)
for the research and sub-phase-by-sub-phase plan, and
[ARCHITECTURE.md](./ARCHITECTURE.md) for the full design and what's still
unverified against real live services in this development environment.

## Setup

```bash
cp .env.example .env   # set JWT_SECRET, DATABASE_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY
docker compose up -d   # starts Postgres (pgvector/pgvector image — required from Phase 4 on)
npm install
npm run prisma:migrate
npm run dev
```

### Running on local models (Ollama / NVIDIA NIM) instead of cloud APIs

`AIProvider`, `AssistantProvider`, and `EmbeddingProvider` can each
independently point at any backend that speaks the OpenAI-compatible chat/
embeddings API — Ollama and NVIDIA NIM both qualify — instead of
Claude/OpenAI. Set in `.env` (all optional; unset keeps the cloud defaults):

```bash
AI_PROVIDER="openai-compatible"          # extraction
ASSISTANT_PROVIDER="openai-compatible"   # /chat
EMBEDDING_PROVIDER="openai-compatible"   # search
OPENAI_COMPATIBLE_BASE_URL="http://localhost:11434/v1"  # Ollama's OpenAI-compat endpoint, or your NIM endpoint
OPENAI_COMPATIBLE_MODEL="llama3.1"
OPENAI_COMPATIBLE_EMBEDDING_MODEL="nomic-embed-text"
OPENAI_COMPATIBLE_EMBEDDING_DIMENSIONS="768"   # must match the model's real output width
```

Switching `EMBEDDING_PROVIDER` to a model with a different output width than
1536 (OpenAI's default) requires resizing the `embeddings.vector` column
first — see ARCHITECTURE.md's "Local / self-hosted model backends" section
before flipping that one. Transcription (Whisper) has no local adapter yet
and still needs `OPENAI_API_KEY` regardless of these switches.

Open http://localhost:3000, create an account, and start saving items.
Trigger processing for a saved item with `POST /api/items/:id/process`
(requires `ANTHROPIC_API_KEY` and, from Phase 4, `OPENAI_API_KEY` for
embeddings — a failed embedding call doesn't fail processing, but the item
won't be searchable until it succeeds).

Upload audio and run it through transcription + processing:

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/audio/upload \
  -F "audio=@memo.mp3" -F "title=Voice memo"
# -> { "item": { "id": "...", ... }, "audioAttachment": { ... } }

curl -b cookies.txt -X POST http://localhost:3000/api/items/<id>/transcribe
# requires OPENAI_API_KEY and ANTHROPIC_API_KEY; transcribes, then
# automatically runs the item through the Phase 2 processing pipeline
# (which now also indexes embeddings on success)
```

Search once an item has finished processing:

```bash
curl -b cookies.txt "http://localhost:3000/api/search?q=AI+agents&type=NOTE"
curl -b cookies.txt "http://localhost:3000/api/items/<id>/related"
```

Or just use the search bar in the app header / the `/search` page.

Chat with your saved knowledge (also requires `OPENAI_API_KEY` — the
question itself gets embedded to retrieve relevant sources — and
`ANTHROPIC_API_KEY`):

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/assistant/messages \
  -H "Content-Type: application/json" \
  -d '{"question":"What did I decide about databases?"}'
# -> { "conversation": {...}, "userMessage": {...}, "assistantMessage": {...} }
# pass back "conversationId": "<id>" from the response to continue the same conversation

curl -b cookies.txt -X POST http://localhost:3000/api/assistant/actions/confirm \
  -H "Content-Type: application/json" \
  -d '{"type":"CREATE_PROJECT","payload":{"name":"Database"}}'
# only fires on an explicit call like this — the chat response never writes to the DB itself
```

Or just use the `/chat` page, with the mode buttons (Ask / Summarize /
Compare / Find conflicts) above the input box.

Capture a plain-text note, a webpage, a YouTube video, or a GitHub repo
through the same universal capture endpoint, and manage collections:

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/capture \
  -H "Content-Type: application/json" \
  -d '{"text":"Idea: try a graph-based agent orchestrator"}'
# -> { "item": { "id": "...", "type": "NOTE", ... } }

curl -b cookies.txt -X POST http://localhost:3000/api/capture \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/some-article"}'
# -> { "item": { "id": "...", "type": "LINK" | "ARTICLE", ... } }

curl -b cookies.txt -X POST http://localhost:3000/api/capture \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ"}'
# -> { "item": { "id": "...", "type": "YOUTUBE", ... } } — transcript is best-effort,
# capture still succeeds on title/author alone if no captions are found

curl -b cookies.txt -X POST http://localhost:3000/api/capture \
  -H "Content-Type: application/json" \
  -d '{"url":"https://github.com/anthropics/claude-code"}'
# -> { "item": { "id": "...", "type": "GITHUB", ... } } — set GITHUB_TOKEN to
# raise GitHub's low anonymous rate limit or reach private repos

curl -b cookies.txt -X POST http://localhost:3000/api/capture \
  -F "file=@photo.jpg;type=image/jpeg"
# -> { "item": { "id": "...", "type": "IMAGE", ... } } — requires ANTHROPIC_API_KEY
# (Claude vision describes + OCRs the image); add -F "hint=screenshot" to
# capture as SCREENSHOT instead (a different prompt, geared at UI/app content)

curl -b cookies.txt -X POST http://localhost:3000/api/capture \
  -F "file=@document.pdf;type=application/pdf"
# -> { "item": { "id": "...", "type": "PDF", ... } } — no API key needed,
# text/author/page-count extracted locally

curl -b cookies.txt "http://localhost:3000/api/attachments/file/<key>"
# serves the raw uploaded file back — <key> comes from
# item.attachments[].storagePath in the capture response above

curl -b cookies.txt -X POST http://localhost:3000/api/collections \
  -H "Content-Type: application/json" -d '{"name":"AI","emoji":"🤖"}'
curl -b cookies.txt -X POST http://localhost:3000/api/collections/<id>/items \
  -H "Content-Type: application/json" -d '{"savedItemId":"<item id>"}'
curl -b cookies.txt http://localhost:3000/api/collections/<id>
```

Or just use the `/collections` page, and the "Add to collection" control on
any item's detail page.

Check what's worth revisiting, and accept an AI-suggested collection:

```bash
curl -b cookies.txt http://localhost:3000/api/rediscovery
# -> { "recentlySaved": [...], "forgottenItems": [...], "relatedDiscoveries": [...] }
# forgottenItems: saved 14+ days ago, never viewed (or not viewed in 14+ days)
# relatedDiscoveries: pairs where a recent save connects to older saved knowledge

curl -b cookies.txt http://localhost:3000/api/collections/suggested
# -> { "suggestions": [{ "name": "...", "itemIds": [...], "items": [...] }] }
# candidates only — nothing is created until you accept one:

curl -b cookies.txt -X POST http://localhost:3000/api/collections/suggested/accept \
  -H "Content-Type: application/json" \
  -d '{"name":"AI Agents","itemIds":["<id1>","<id2>"]}'
# -> { "collection": { ..., "isAiSuggested": true } }
```

Or just use the `/rediscover` page, with an "Accept as collection" button
on each suggestion.

Capture anything from the UI, without touching `curl` at all: click
**+ Capture** in the header (visible on every page) to open `/capture` —
paste a link or write a note in the one box (detected automatically), or
upload an image/screenshot/PDF instead.

## Testing

```bash
npm test
```

**188 tests across 31 files.** Unit tests (no network or database access
needed) cover: AI response parsing/validation and failure handling for
every provider (extraction, assistant, embeddings, vision); the
hallucination-prevention source-index check; local storage read/write/
delete; transcription success/failure; every `CaptureProvider`'s
supports()/capture() logic against mocked `fetch`/SDK clients/`pdf-parse`,
plus the real exported registry's dispatch order end-to-end
(`getCaptureRegistry()`, not just each provider in isolation);
`AI_PROVIDER`/`ASSISTANT_PROVIDER`/`EMBEDDING_PROVIDER`'s env-var-driven
factory selection; `captureItem`'s file-size validation and storage/
`Attachment`-creation against a mocked database; and
`clusterBySimilarity`/`deriveClusterName`'s AI-suggested-collection
clustering logic as pure functions.

Six integration tests need a real database (pgvector) and skip cleanly if
none is reachable, using deterministic fake/hashed embeddings instead of
live API calls so the suite stays runnable offline:
`audio-pipeline.integration.test.ts`, `search.integration.test.ts`,
`assistant-chat.integration.test.ts`, `collections.integration.test.ts`,
and `rediscovery.integration.test.ts` (recently-saved ordering,
forgotten-item age filtering, related-discovery pairing, and
suggested-collection clustering/acceptance).

Beyond the automated suite, a subset of capture providers (web page
fetching, YouTube, real PDF parsing end-to-end through a served-back
attachment) and the `/capture`/`/rediscover` UI were additionally verified
against real live requests/a real browser during development — see
ARCHITECTURE.md for exactly what was and wasn't (GitHub capture, real
Claude-vision calls, and local-model inference all remain unverified
against the real live service in this environment, for reasons unrelated
to the app itself).
