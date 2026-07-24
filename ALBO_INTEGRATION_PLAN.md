# Albo-Inspired Layer — Schema, Feature Mapping, and Implementation Plan

Companion to [ALBO_ANALYSIS.md](./ALBO_ANALYSIS.md). Everything here is
additive to the existing pipeline
(`Capture → SavedItem → ProcessingJob → AI extraction → Knowledge base →
Search/chat`) — no existing model, service, or endpoint is rewritten.

## 1. Database schema proposal

Two new models, three additive columns on `SavedItem`. Nothing else in the
existing schema changes.

```
Collection            id, userId, name, description, emoji, isAiSuggested,
                       createdAt, updatedAt
                       @@unique([userId, name])
                       — a lighter, more casual organizing layer than
                         Project: no description requirement, an emoji
                         "cover" instead of Albo's photo covers (no new
                         image-upload surface for a cosmetic feature),
                         and a flag distinguishing user-created from
                         AI-suggested collections

SavedItemCollection    savedItemId, collectionId, addedAt
                       — many-to-many; an item can live in more than one
                         collection, same shape as SavedItemTag/SavedItemProject

SavedItem (additive):
  importanceScore  Float?    — AI-estimated 0-1, produced by the *existing*
                               AIProvider.analyze() call (one new field in
                               that strict JSON schema, not a new AI call)
  saveReason       String?   — AI-suggested "why this was saved / why it
                               matters," same analyze() call; user-editable
                               after the fact
  lastViewedAt     DateTime? — set when the item detail page is opened;
                               powers "forgotten items" in the rediscovery
                               system (Sub-Phase D)
```

**Why not a persisted relationship table:** "Smart Relationships" (section
5 of the task) is already solved on-demand by Phase 4's
`findRelatedItems` (cosine similarity over stored embeddings), and Phase
4's own architecture doc already retired an earlier `RelatedItem`-table
plan in favor of exactly that. Building a persisted graph now would
contradict a decision already made for no benefit — on-demand similarity
is cheaper and never goes stale. Sub-Phase D wires the *existing*
mechanism to fire automatically right after a new item finishes
processing, rather than only when a user opens an item's detail page.

**Why not new tables for capture-provider output:** GitHub
languages/dependencies, YouTube chapters/transcript, webpage
author/publish-date — all of this lands in `SavedItem.metadata` (a `Json?`
column that has existed since Phase 1 specifically for "type-specific raw
fields"). No new columns needed; each `CaptureProvider` just populates it
differently per source type.

**Why no scheduler/cron table for "weekly resurfacing":** there is no
background job infrastructure anywhere in this app yet (flagged as a known
gap since Phase 2). Sub-Phase D builds the *query* a weekly digest would
run, exposed as an on-demand endpoint, not an actual scheduled job —
flagged here rather than silently only building half of it.

## 2. Feature mapping: Albo → this app

| Albo feature | Our implementation | Phase |
|---|---|---|
| Universal capture via share sheet | `CaptureProvider` interface (`supports`/`capture`) + a registry, `POST /api/capture` | B |
| Auto content-type detection | `SavedItemType` already exists (Phase 1); `CaptureProvider.supports()` picks the right provider per input | B |
| Article extraction, readable text | `WebProvider` — fetch + main-content extraction into `content`, metadata (author, published date) into `metadata` | B |
| YouTube-specific extraction | `YouTubeProvider` — transcript into `content`, chapters/description into `metadata` | B |
| GitHub-specific extraction | `GitHubProvider` — README into `content`, languages/dependencies/stars into `metadata`, via GitHub's public REST API | B |
| Image saves | `ImageProvider` — OCR text + a vision description into `content`, via Claude's multimodal input (no new vendor) | C |
| Screenshot saves | `ScreenshotProvider` — same mechanism as `ImageProvider`; Albo itself reportedly handles these inconsistently, so this is a place we can just do it *properly* instead of replicating a known weak spot | C |
| PDF saves | `PDFProvider` — text extraction into `content`, metadata (page count, title) into `metadata` | C |
| Smart/auto collections | `Collection` model + AI-suggested collection creation from clusters of similar new saves | A (schema, manual) / D (AI-suggested) |
| Manual collections | `Collection` CRUD, assign/unassign items | A |
| Map view | **Not replicated** — no physical-place concept in this app |
| "Decide for me" | **Not replicated** — meaningless for research/decision content |
| Social/shared collections | **Not replicated** — this app is single-user throughout |
| AI chat over saves | Already exists — Phase 5's `AssistantProvider` + `/chat` | done (Phase 5) |
| Reminders / resurfacing | Rediscovery endpoints: recently saved, forgotten items, related discoveries | D |
| Tags, notes, ratings | Tags already exist (Phase 1). Ratings not replicated (no use case for research content). "Notes" already means something else in this app (the NOTE saved-item type) so not duplicated as a separate per-item annotation. |
| "Why did I save this" | New: `saveReason`, AI-suggested via the existing `analyze()` call, user-editable — **explicitly not a confirmed Albo feature**, built because it fits this app's memory/retrieval purpose | A |
| Importance signal | New: `importanceScore`, same `analyze()` call | A |

## 3. Implementation plan (sub-phases)

This is bigger than any single prior phase — bigger, in fact, than several
of them combined. Splitting it the same way Phases 1-5 were split, one
sub-phase per turn:

- **Sub-Phase A (this turn):** Schema migration (`Collection`,
  `SavedItemCollection`, the three additive `SavedItem` columns).
  Collections service + CRUD API. Extend `AIProvider.analyze()`'s strict
  JSON schema with `importanceScore`/`saveReason` and persist them
  alongside the existing extraction fields. `lastViewedAt` tracking on
  item view. `CaptureProvider` interface + registry (no concrete
  providers yet — the abstraction, tested with a fake). Basic Collections
  UI (list, create, assign items) reusing existing component patterns.
- **Sub-Phase B:** Real capture providers with actual external
  integrations — `WebProvider`, `YouTubeProvider`, `GitHubProvider` — plus
  `POST /api/capture` as the one endpoint that dispatches to whichever
  provider `supports()` the input.
- **Sub-Phase C:** `ImageProvider`/`ScreenshotProvider` (OCR + vision via
  Claude) and `PDFProvider` (text extraction).
- **Sub-Phase D:** Rediscovery endpoints (recently saved, forgotten,
  related discoveries, weekly-digest-shaped query) wired to fire
  Phase 4's existing similarity search automatically post-capture;
  AI-suggested collections from clusters of similar recent saves.
- **Sub-Phase E:** UI pass — universal capture entry point, saved-item
  cards updated for collections/importance/save-reason, a rediscovery
  page, related-knowledge section reused from Phase 4/5's existing
  components.
- **Sub-Phase F:** Tests across all of the above + a final docs pass
  (ARCHITECTURE.md, README.md, CAPABILITIES.md updated to reflect the
  finished Albo layer).

Implementing Sub-Phase A now.
