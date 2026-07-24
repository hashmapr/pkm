# PKM — Personal AI Knowledge Capture

Save anything — voice, links, articles, YouTube, GitHub repos, screenshots,
PDFs, images, notes — into one inbox. AI understands, organizes, connects, and
makes it searchable. See [ARCHITECTURE.md](./ARCHITECTURE.md) for design and
the phased build plan.

**Phase 1 (current):** authentication, saved item CRUD, tags, projects.

## Setup

```bash
cp .env.example .env   # set JWT_SECRET, DATABASE_URL
docker compose up -d   # starts Postgres
npm install
npm run prisma:migrate
npm run dev
```

Open http://localhost:3000, create an account, and start saving items.
