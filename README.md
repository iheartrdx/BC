# Barberic Culture Media OS

> AI handles operations. Humans handle authenticity.

An AI-assisted media operating system for the *Barberic Culture* podcast.
The host records freeform conversation; this system handles topic discovery,
transcription, asset generation, clip selection, scheduled publishing, and the
analytics feedback loop. Every public action is approval-gated.

## Status

V1 scaffold. Boots without any API keys. Each integration unlocks more of the
dashboard when its environment variables are set. See [SETUP.md](./SETUP.md).

## Stack

| Layer | Service |
| --- | --- |
| Frontend | Next.js 14 (App Router) + React + Tailwind |
| Backend | Next.js API routes (Node) |
| DB / Auth | Supabase |
| Object storage | Cloudflare R2 (S3-compatible) |
| AI | OpenAI (GPT-4o + Whisper) |
| Recording | Riverside (or any source file) |
| Publishing | YouTube Data API v3 |
| Hosting | Vercel |

Optional add-ons (feature-flagged): OpusClip, Descript, Make.com.

## Quick start

```bash
npm install
cp .env.example .env.local
npm run dev
# open http://localhost:3000
```

The dashboard will tell you which integrations still need to be configured.
For step-by-step account creation and key collection, follow [SETUP.md](./SETUP.md).

## Workflow

1. **Discovery** — AI proposes future episode topics.
2. **Prep** — AI drafts talking points (planned for V1.1).
3. **Record** — host records freeform.
4. **Ingest** — `/episodes/new` uploads to R2 + creates the episode record.
5. **Transcribe** — Whisper converts to a timestamped transcript.
6. **Analyze** — GPT-4o drafts titles, descriptions, chapters, hashtags, thumbnail concepts, pinned comment, and 5–10 clip candidates.
7. **Process** — clip rendering (planned for V1.1; clip metadata is generated in V1).
8. **Approve** — `/approvals` is the human inbox. ~10 minutes per episode.
9. **Publish** — long-form goes to YouTube via the Data API.
10. **Learn** — analytics flow back into Discovery (planned for V1.1).

## Repository layout

```
src/
  app/                   # Next.js App Router pages + API routes
    page.tsx             # Mission control / dashboard home
    settings/            # Brand config (replaces the Word intake packet)
    episodes/            # Episode list, new upload, detail
    approvals/           # Human approval inbox
    discovery/           # AI topic suggestions
    analytics/           # Analytics dashboard (placeholder in V1)
    api/                 # All server routes
  components/            # Shared React components
  lib/
    env.ts               # Central env access + integration flags
    supabase.ts          # Browser/server/admin clients
    r2.ts                # Presigned upload/download helpers
    openai.ts            # Transcription + analysis + topic ideas
    youtube.ts           # OAuth + uploads
    types.ts             # Shared TypeScript types
    format.ts            # Display helpers
supabase/
  migrations/0001_init.sql   # Run this in Supabase SQL editor
SETUP.md                 # Plain-English setup recipe
```

## Operating philosophy

The dashboard never asks the host to *do work* — it asks them to *make decisions*.

Bad: "Write a title."
Good: "Approve one of these AI-generated title options."

Every screen is built to keep the human in the role of editor and brand owner,
not operator.
