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
**Sub-Phase A (done):** first slice of an Albo-inspired universal capture
layer — `Collection`/`SavedItemCollection` for lightweight manual grouping
alongside tags/projects, a `CaptureProvider` abstraction behind
`POST /api/capture`, and two new AI-derived fields on each item —
`importanceScore` and a plain-language `saveReason` ("why this was saved").
**Sub-Phase B (done):** real capture providers — `WebCaptureProvider`
(generic webpage extraction: title/author/description/images, classified
as `LINK` or `ARTICLE`), `YouTubeCaptureProvider` (title/author via oEmbed,
best-effort transcript + chapters), and `GitHubCaptureProvider` (README,
languages, stars via the GitHub REST API) — `POST /api/capture` now handles
URLs from any of these sources, not just plain text.
**Sub-Phase C (current):** file-upload capture — `ImageCaptureProvider` and
`ScreenshotCaptureProvider` (Claude vision: description + OCR, via a new
`VisionProvider` abstraction), and `PDFCaptureProvider` (text/metadata
extraction) — `POST /api/capture` now also accepts `multipart/form-data`
file uploads, with the raw file persisted as an `Attachment` and served back
via `GET /api/attachments/file/[key]`.
See ALBO_ANALYSIS.md and ALBO_INTEGRATION_PLAN.md for the research behind
this and the full Sub-Phase A-F roadmap, and ARCHITECTURE.md for the full
design.

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

## Testing

```bash
npm test
```

Unit tests cover AI response parsing/validation, failed-response handling,
empty-content guarding, duplicate-tag normalization, entity extraction
validation, local storage read/write/delete, transcription
success/failure/missing-audio, embedding text-building and success/failure
handling, the search service's empty-query guard and highlight logic, and
the assistant's response parsing, per-mode provider dispatch/failure, and
source-index validation (the hallucination-prevention mechanism), the
`CaptureProviderRegistry`'s dispatch order/no-match behavior and
`NoteCaptureProvider`'s title derivation, the new `importanceScore`/
`saveReason` fields on the AI extraction schema, the
`OpenAICompatibleAIProvider`/`OpenAICompatibleAssistantProvider` request
shape and error handling against a mocked SDK client, the
`AI_PROVIDER`/`ASSISTANT_PROVIDER`/`EMBEDDING_PROVIDER` factory selection
logic (env-var-driven, defaults preserved, required-config errors), and
`WebCaptureProvider`/`YouTubeCaptureProvider`/`GitHubCaptureProvider`'s
extraction, classification, and error handling against a mocked `fetch`,
`ClaudeVisionProvider`'s image-content-block request shape and error
handling against a mocked SDK client, `ImageCaptureProvider`/
`ScreenshotCaptureProvider`'s hint-based dispatch and content-building
against a fake `VisionProvider`, `PDFCaptureProvider`'s text/metadata
mapping against a mocked `pdf-parse`, and `captureItem`'s file-size
validation and storage/`Attachment`-creation logic against a mocked
database — all against pure functions and fake/mocked providers, no live
database, network call, or real Ollama/NIM/GitHub-API/Claude-vision access
required (though `WebCaptureProvider`, `YouTubeCaptureProvider`, and
`PDFCaptureProvider`'s full capture-to-served-attachment path were
additionally smoke-tested against real live requests; see ARCHITECTURE.md
for what wasn't, including why `PDFCaptureProvider` is pinned to
`pdf-parse@1.x`).

Four tests need a real database (pgvector) and skip cleanly if none is
reachable: `audio-pipeline.integration.test.ts` (transcribe → content update
→ processing pipeline), `search.integration.test.ts` (real cosine-similarity
ranking via pgvector using a deterministic hashed-text fake embedding, plus
filter narrowing and the related-items query),
`assistant-chat.integration.test.ts` (retrieval accuracy, missing-information
short-circuiting, dropping a fabricated source citation, and multi-turn
conversation history — same deterministic fake embedding, no live embedding
or Claude call needed), and `collections.integration.test.ts` (create/list
with item counts, idempotent add/remove, and cross-user access checks via
`CollectionNotFoundError`).
