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
**Phase 5 (current):** AI assistant — `AssistantProvider`/Claude adapter,
retrieval-augmented chat over your saved knowledge with source citations,
confidence scores, and user-confirmed knowledge actions (create a task,
save a decision, create a project, add a reminder — nothing executes without
an explicit confirm click). `/chat` page with conversation history. See
ARCHITECTURE.md for the full design.

## Setup

```bash
cp .env.example .env   # set JWT_SECRET, DATABASE_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY
docker compose up -d   # starts Postgres (pgvector/pgvector image — required from Phase 4 on)
npm install
npm run prisma:migrate
npm run dev
```

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
source-index validation (the hallucination-prevention mechanism) — all
against pure functions and fake providers, no live database or network call
required.

Three tests need a real database (pgvector) and skip cleanly if none is
reachable: `audio-pipeline.integration.test.ts` (transcribe → content update
→ processing pipeline), `search.integration.test.ts` (real cosine-similarity
ranking via pgvector using a deterministic hashed-text fake embedding, plus
filter narrowing and the related-items query), and
`assistant-chat.integration.test.ts` (retrieval accuracy, missing-information
short-circuiting, dropping a fabricated source citation, and multi-turn
conversation history — same deterministic fake embedding, no live embedding
or Claude call needed).
