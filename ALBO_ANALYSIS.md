# Albo Analysis

Research into [Albo](https://albo.inc/) (formerly "Sortd"), a consumer
save-for-later app, to inform an Albo-*inspired* capture/organization layer
for this app. This document replicates functionality and concepts only —
no branding, copy, assets, or UI is copied from Albo.

## Sourcing and confidence

Albo's own site (`albo.inc`) blocks automated fetches, so this is built from
its App Store / Google Play listings, its publisher's app-catalog page
(mwm.ai), and one third-party competitor comparison page (`letitsorti.com`,
a competing app's marketing page comparing itself to Albo — read with
appropriate skepticism, since a competitor has an incentive to describe
Albo's weaknesses generously). Sources are cited inline. Two things worth
flagging before the analysis, not after:

1. **The official listing and the competitor page directly contradict each
   other** on AI categorization: Albo's own description advertises
   "AI-powered system automatically categorizes your saves" and "smart
   collections," while the competitor page claims "No AI Categorization...
   requires manual setup" and "No Semantic Search... limited to
   keyword/tag-based discovery." Both can't be fully right. Likely
   explanation: Albo's automatic categorization is real but shallower than
   its marketing implies (e.g., rule-based content-type detection —
   "recipe," "place," "product" — rather than open-ended semantic
   clustering), and the competitor is technically correct that there's no
   semantic *search* while being unfair about "no AI" entirely. Treated
   below as: real but limited automatic categorization, no confirmed
   semantic search.
2. **I found no evidence for an explicit "why was this saved / why does it
   matter" feature** as its own named capability — Albo has generic
   per-save notes/tags/ratings, not an AI-generated save rationale. That
   specific feature (requested later in this task) appears to be a
   logical extension in the spirit of Albo's rediscovery framing, not a
   documented Albo feature. Flagged here so it isn't presented as
   "Albo does this" when it doesn't, confirmably.

## What Albo does

Albo is a universal "save for later" app: a single inbox for links, videos,
recipes, workouts, books, movies, places, tools, screenshots, music, games,
articles, and tutorials, saved from any app (Instagram, TikTok, a browser,
etc.) via the OS share sheet. Everything lands in one place, gets lightly
auto-categorized, and can be manually organized into collections.

**Tagline / positioning:** *"Your digital hoarding ends now"* — *"Your
universal save-for-later app - helping you finally do the things you
save."* ([mwm.ai](https://mwm.ai/apps/albo-save-organize/6578421992))

## What problem it solves

The specific pain point Albo names is **"digital hoarding"**: people save
things constantly (a recipe from TikTok, a product from Instagram, an
article link) and then never see them again — scattered across screenshot
albums, browser bookmarks, and a dozen apps' internal "saved" tabs, with no
single place to look and no reason to go back. Albo's answer is
consolidation (one inbox regardless of source) plus **prompting the user
back to what they saved** so intent turns into action, rather than just
archiving.

This is a materially different problem than the one this app is solving.
Albo is about *"I saved a recipe, did I ever cook it?"* — action follow-through
on everyday personal content. This app is about *"I read/heard/wrote something
weeks ago — what did I actually conclude, and can I find and reason over it
later?"* — knowledge retention and retrieval, closer to a personal
research/decision archive than a to-do-adjacent bookmarking tool. The
overlap is real (universal capture, one inbox, organization, resurfacing)
but the *purpose* of resurfacing differs: Albo resurfaces to prompt
*doing*; this app should resurface to prompt *remembering and connecting*.

## Core features (as documented)

| Feature | Description | Source |
|---|---|---|
| Universal capture | Save from any app via share sheet — links, videos, recipes, places, screenshots, etc. | App Store, mwm.ai |
| Auto-extraction | Pulls structured detail out of what you save — e.g. ingredients from a recipe, "Made it?" tracking | mwm.ai |
| Readable articles | Full article text rendered inside the app, not just a link | Search summary |
| Smart collections | Some automatic categorization (recipes/places/products/software) plus user-created custom collections | App Store |
| Collection covers | Emoji or photo covers per collection | App Store |
| Map view | Saved places pinned to an interactive map, filterable | App Store |
| "Decide for me" | A pick-one-from-this-collection helper (e.g. "which of my 40 saved recipes should I cook tonight") | App Store |
| AI chat | Conversational recommendations over saved content | App Store |
| Content-type detection | Identifies shows, movies, books, actors, authors from a save | App Store |
| Blend / shared collections | Compare or combine collections with friends/family; social save-browsing | App Store |
| Tags, notes, ratings | Manual annotation per save | Search summary |
| Reminders | Nudges to actually use what you saved | mwm.ai |
| Siri Shortcuts | OS-level quick-save integration | App Store |

## Core user workflow

1. **Capture** — from inside another app (Instagram, TikTok, a browser,
   camera roll), the user shares content to Albo via the OS share sheet, or
   pastes a link.
2. **Auto-extraction** — Albo identifies the content type and source
   ("Imported from Instagram"), pulls out a title/image/relevant details,
   and (per its own marketing, with the caveat above) files it into a
   likely category.
3. **Organize** — the user either accepts the automatic bucket or moves the
   save into a custom collection; tags/notes/ratings can be added.
4. **Rediscover** — the app resurfaces saves (reminders, "recently saved,"
   presumably some "haven't looked at this" prompting, though no source
   documents the exact resurfacing mechanism or cadence) to close the loop
   between saving and doing.
5. **Act** — "Made it?" (recipes), map navigation (places), "Decide for me"
   (pick from a collection) — the app tries to convert the save into a
   completed real-world action.
6. **Share** — collections can be shared or blended with other people.

## Data model implications

Reverse-engineering a plausible data model from the documented feature set
(not Albo's actual schema, which isn't public):

```
SavedItem      — polymorphic: link/video/recipe/place/product/screenshot/etc,
                 source app, extracted title/image/text, structured extras
                 per type (ingredients for a recipe, a lat/lng for a place)
Collection     — user-created or auto-suggested, name, cover (emoji/photo)
ItemCollection — many-to-many, an item can live in more than one collection
Tag            — user-defined, free-form
Note           — free-text, user-authored, attached to one save
Rating         — a simple score per save (e.g. for "worth it" recipes)
SharedCollection — a collection with more than one member/viewer
```

## Features we should replicate

Chosen because they extend this app's existing purpose (knowledge retention
and retrieval) rather than because Albo has them:

1. **Universal capture as a first-class concept**, not per-type special
   cases — a `CaptureProvider` abstraction that normalizes any input
   (URL, video link, image, PDF, audio) into a `SavedItem`, mirroring how
   this app already treats `AIProvider`/`TranscriptionProvider`/
   `EmbeddingProvider`/`AssistantProvider` as swappable capabilities.
2. **Collections** as a manual, user-controlled organizing layer *above*
   tags/projects — Albo's "smart collections" concept, minus the parts that
   don't fit this app (map view, recipe-specific tracking, social
   blending — genuinely out of scope, see below).
3. **Content-type-specific extraction** (README/languages for a GitHub
   repo, transcript/chapters for a YouTube video) — this app already has
   the `AIProvider.analyze()` pipeline; extending *what* gets fed into it
   per source type is the direct analog of Albo's per-type extraction.
4. **Resurfacing saved knowledge** — reframed for *this* app's purpose:
   not "did you cook this yet" but "you saved this weeks ago, and it
   connects to what you're working on now." This is a genuine, valuable
   extension of Phase 4's embedding-similarity machinery, not a new
   capability from scratch.
5. **Lightweight per-item annotation** (tags exist already; the "why does
   this matter" framing is new, see the flag above) — as an *AI-suggested,
   user-editable* field, not a hard requirement, and clearly labeled as
   this app's own idea rather than an Albo feature we're copying.

## Features we should intentionally not copy

1. **Map view / place-pinning** — this app has no concept of physical
   places and no reason to invent one; pure scope creep for a personal
   knowledge app.
2. **Recipe-specific tracking ("Made it?"), workout plans, product/price
   info** — Albo's content types skew lifestyle/shopping; this app's
   content types (notes, articles, code, decisions, voice memos) don't
   need recipe-shaped metadata.
3. **Social features (blend collections, friend activity, shared
   collections)** — this is explicitly a *personal* knowledge app (every
   query in the codebase is scoped to one user). Multi-user sharing is a
   different product decision with real access-control implications,
   not something to bolt on as a side effect of an "Albo clone" pass.
4. **"Decide for me" random-pick helper** — a fun feature for "which
   recipe should I make," meaningless for "which of my saved research
   notes should I read" — nothing to replicate here.
5. **Any of Albo's actual UI, icon set, copy, or visual design** — per the
   task's explicit instruction: functionality and concepts only.
6. **Persisted relationship graph for "smart relationships"** — see the
   architecture note below: this app already solved "what's related to
   this item" via on-demand embedding similarity in Phase 4
   (`findRelatedItems`), and Phase 4's own architecture doc explicitly
   retired an earlier `RelatedItem`-table plan in favor of that. Building
   a persisted relationship table now would contradict that already-made
   decision for no real benefit — on-demand similarity is cheaper, always
   current (no stale edges), and already exists.

## Where this maps onto the existing architecture

This app already has the harder half of "Albo but for knowledge" built:
AI extraction (Phase 2), voice capture (Phase 3), semantic search and
on-demand relatedness (Phase 4), and conversational retrieval (Phase 5).
What Albo actually adds on top, translated to this app's concepts, is:
(a) a proper multi-source **capture** abstraction instead of manual
title/content entry for 8 of 9 `SavedItemType`s, and (b) **collections** as
a lighter-weight, more casual organizing layer than `Project`. Both are
additive to the existing pipeline (`Capture → SavedItem → ProcessingJob →
AI extraction → Knowledge base → Search/chat`), not replacements for any
part of it.

---

Sources: [Albo — Save, organize & rediscover everything you find online](https://albo.inc/) ·
[Albo: Save & Organize - Lifestyle App | MWM](https://mwm.ai/apps/albo-save-organize/6578421992) ·
[Albo: Save & Organise - App Store](https://apps.apple.com/us/app/albo-save-organise/id6578421992) ·
[Sorti vs Albo (2026) comparison](https://letitsorti.com/compare/albo)
