# PKM — Personal AI Knowledge Capture

Save anything — voice, links, articles, YouTube, GitHub repos, screenshots,
PDFs, images, notes — into one inbox. AI understands, organizes, connects, and
makes it searchable. See [ARCHITECTURE.md](./ARCHITECTURE.md) for design and
the phased build plan.

**Phase 1 (done):** authentication, saved item CRUD, tags, projects.
**Phase 2 (done):** AI processing pipeline — `AIProvider`/Claude adapter,
`ProcessingJob` + extracted tasks/entities/decisions/questions, triggered via
`POST /api/items/:id/process`.
**Phase 3 (current):** voice capture — `StorageProvider`/local disk,
`TranscriptionProvider`/Whisper adapter, `AudioAttachment`, upload + transcribe
endpoints that feed the same Phase 2 pipeline. Backend only, no UI yet — see
ARCHITECTURE.md.

## Setup

```bash
cp .env.example .env   # set JWT_SECRET, DATABASE_URL, ANTHROPIC_API_KEY, OPENAI_API_KEY
docker compose up -d   # starts Postgres
npm install
npm run prisma:migrate
npm run dev
```

Open http://localhost:3000, create an account, and start saving items.
Trigger processing for a saved item with `POST /api/items/:id/process`
(requires `ANTHROPIC_API_KEY`).

Upload audio and run it through transcription + processing:

```bash
curl -b cookies.txt -X POST http://localhost:3000/api/audio/upload \
  -F "audio=@memo.mp3" -F "title=Voice memo"
# -> { "item": { "id": "...", ... }, "audioAttachment": { ... } }

curl -b cookies.txt -X POST http://localhost:3000/api/items/<id>/transcribe
# requires OPENAI_API_KEY and ANTHROPIC_API_KEY; transcribes, then
# automatically runs the item through the Phase 2 processing pipeline
```

## Testing

```bash
npm test
```

Unit tests cover AI response parsing/validation, failed-response handling,
empty-content guarding, duplicate-tag normalization, entity extraction
validation, local storage read/write/delete, and transcription
success/failure/missing-audio — all against pure functions and fake
providers, no live database or network call required. One test
(`audio-pipeline.integration.test.ts`) verifies the full transcribe → content
update → processing-pipeline flow against a real Postgres instance; it skips
cleanly if none is reachable.
