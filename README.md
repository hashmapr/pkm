# PKM — Personal AI Knowledge Capture

Save anything — voice, links, articles, YouTube, GitHub repos, screenshots,
PDFs, images, notes — into one inbox. AI understands, organizes, connects, and
makes it searchable. See [ARCHITECTURE.md](./ARCHITECTURE.md) for design and
the phased build plan.

**Phase 1 (done):** authentication, saved item CRUD, tags, projects.
**Phase 2 (current):** AI processing pipeline — `AIProvider`/Claude adapter,
`ProcessingJob` + extracted tasks/entities/decisions/questions, triggered via
`POST /api/items/:id/process`. Backend only, no UI yet — see ARCHITECTURE.md.

## Setup

```bash
cp .env.example .env   # set JWT_SECRET, DATABASE_URL, ANTHROPIC_API_KEY
docker compose up -d   # starts Postgres
npm install
npm run prisma:migrate
npm run dev
```

Open http://localhost:3000, create an account, and start saving items.
Trigger processing for a saved item with `POST /api/items/:id/process`
(requires `ANTHROPIC_API_KEY`).

## Testing

```bash
npm test
```

Unit tests cover AI response parsing/validation, failed-response handling,
empty-content guarding, duplicate-tag normalization, and entity extraction
validation — all against pure functions and a fake `AIProvider`, no live
database or network call required.
