# Barberic Culture Media OS — Setup

Plain English. No jargon. Follow these steps in order. Skipping ahead is fine
— each integration unlocks more of the dashboard, and the app boots even when
nothing is configured. You can stop after any step and the dashboard will
still load; it'll just tell you what's missing.

---

## What you'll have at the end

- A live dashboard at a real URL (e.g. `https://barberic-culture.vercel.app`)
- Login is tied to your email (Supabase magic link)
- The host records → you upload → the system transcribes, analyzes, drafts titles/descriptions/clips → you approve → it publishes to YouTube
- Total per-episode human time: ~10 minutes

Estimated cost when fully running: **$200–500/month** (mostly OpenAI usage).

---

## Step 0 — Local prerequisites (one-time, on your computer)

You need:
1. **Node.js 20 or newer.** Get it at https://nodejs.org (LTS is fine).
2. **Git.** It's probably already installed. Verify with `git --version`.
3. **A code editor.** VS Code is free: https://code.visualstudio.com
4. **A GitHub account** (you'll push the code there). Free is fine.

Once those are installed, in a terminal:

```bash
cd /path/to/this/repo
npm install
cp .env.example .env.local
```

You can already run the app right now:

```bash
npm run dev
```

Open http://localhost:3000. You'll see the dashboard with a setup checklist
showing every integration as "not set." That's expected.

---

## Step 1 — Supabase (database + login) — REQUIRED

Supabase stores every episode, transcript, clip, approval, and brand setting.

1. Go to **https://supabase.com** and create a free account.
2. Create a new project. Pick any region close to you. Save the database password somewhere safe (you won't need it day-to-day).
3. While it provisions (~2 min), open the project → **Project Settings → API**. Copy these three values into `.env.local`:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** (click "reveal") → `SUPABASE_SERVICE_ROLE_KEY`
4. In Supabase, go to **SQL Editor** → **New query**.
5. Open the file `supabase/migrations/0001_init.sql` from this repo, copy its full contents, paste into the SQL editor, and click **Run**.
6. Restart `npm run dev`. The dashboard checklist should now show Supabase as configured.

You can now visit `/settings` and fill out brand info. **This replaces the old Word "intake packet."**

---

## Step 2 — OpenAI (the AI brain) — REQUIRED

OpenAI handles transcription (Whisper) and content generation (GPT-4o).
Pay-as-you-go. Budget ~$50–150/month for one weekly show.

1. Go to **https://platform.openai.com** and create an account separate from your normal ChatGPT account if you want to keep billing clean.
2. **Billing → Add payment method.** Set a usage cap (e.g. $100/month) so you can't be surprised.
3. **API keys → Create new secret key.** Name it "barberic-media-os."
4. Copy the key into `.env.local` as `OPENAI_API_KEY`.
5. Restart `npm run dev`.

The Discovery page and the episode pipeline should now work.

---

## Step 3 — Cloudflare R2 (file storage) — REQUIRED

R2 stores the raw recordings. It's S3-compatible and has no egress fees.
Budget ~$5–25/month early on.

1. Go to **https://cloudflare.com**, sign in or sign up.
2. Left nav → **R2** → **Purchase R2** (it's still essentially free at small volume but you must add billing).
3. **Create bucket** → name it `barberic-media-os-prod`.
4. Top-right → **Manage R2 API Tokens** → **Create API Token**.
   - Permissions: **Object Read & Write**.
   - Specify bucket: `barberic-media-os-prod`.
5. Copy these into `.env.local`:
   - **Account ID** (visible in the right sidebar of the R2 page) → `R2_ACCOUNT_ID`
   - **Access Key ID** → `R2_ACCESS_KEY_ID`
   - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`
   - Leave `R2_BUCKET_NAME=barberic-media-os-prod`
6. Restart `npm run dev`.

You can now upload an episode at `/episodes/new`.

---

## Step 4 — YouTube Data API (publishing) — REQUIRED

This is the only step with a couple of fiddly clicks. Take your time.

1. Go to **https://console.cloud.google.com**.
2. Top bar → project dropdown → **New Project** → name it "Barberic Culture Media OS."
3. Search bar → type **YouTube Data API v3** → **Enable**.
4. Search bar → type **OAuth consent screen** → configure:
   - User type: **External**.
   - App name: "Barberic Culture Media OS." Support email: your email.
   - **Scopes** — click **Add or remove scopes**, search for and add:
     - `.../auth/youtube.upload`
     - `.../auth/youtube.readonly`
     - `.../auth/yt-analytics.readonly`
   - **Test users** — add your own Google email until the app is verified.
5. Search bar → **Credentials** → **Create credentials** → **OAuth client ID**.
   - Type: **Web application**.
   - Authorized redirect URIs:
     - `http://localhost:3000/api/auth/youtube/callback`
     - `https://YOUR-VERCEL-DOMAIN/api/auth/youtube/callback` (add this after Step 6 when you deploy)
6. Copy into `.env.local`:
   - **Client ID** → `YOUTUBE_CLIENT_ID`
   - **Client secret** → `YOUTUBE_CLIENT_SECRET`
7. Restart `npm run dev`. Visit `/api/auth/youtube/start` once and approve the consent screen with the Google account that owns the YouTube channel. The system stores the refresh token in Supabase — you only do this once.

---

## Step 5 — Deploy to Vercel (production URL)

1. Push this repo to GitHub (private repo is fine).
2. Go to **https://vercel.com** → **Add New → Project** → import your GitHub repo.
3. Framework: Next.js (auto-detected). Click **Deploy**. The first build will fail because env vars aren't set — that's fine.
4. Project → **Settings → Environment Variables**. Add every value from your `.env.local` (skip the comments). Use the same names.
5. Update `APP_URL` to your real Vercel URL (e.g. `https://barberic-culture.vercel.app`).
6. Update `YOUTUBE_REDIRECT_URI` to `https://YOUR-VERCEL-DOMAIN/api/auth/youtube/callback` and add that URL as an authorized redirect URI in the Google Cloud OAuth client (Step 4).
7. **Deployments → Redeploy** the latest build.

You're live.

---

## Step 6 — Riverside (recording) — RECOMMENDED, NOT BLOCKING

You can ship V1 with any recording method that produces a `.mp4` or `.mp3`.
Riverside is recommended because it gives clean separate tracks per speaker.

1. Sign up at **https://riverside.fm** (Pro plan, ~$24/mo).
2. Create a studio for the show. The host records there.
3. After each session, download the master mix as MP4 and upload it via `/episodes/new`.

No API integration needed in V1 — just download → upload.

---

## Optional integrations (turn on later)

- **OpusClip** — automatic Shorts/Reels generation. Set `OPUSCLIP_API_KEY`.
- **Descript** — manual transcript editing UI as a fallback. Set `DESCRIPT_API_KEY`.
- **Make.com** — webhooks for ad-hoc automations. Set `MAKE_WEBHOOK_URL`.

The dashboard works without any of these. They're behind feature flags so you can add them when (and if) they're worth the spend.

---

## "How do I actually use it day-to-day?"

Once everything above is set up:

1. **Once a week (you):** Open `/discovery`. Click *Generate ideas*. Star a few you like.
2. **Recording day (host):** The host records freeform on Riverside (or whatever).
3. **Right after recording (you):** Open `/episodes/new`. Title it. Drag in the file. Click upload. Walk away.
4. **~30 minutes later:** Check `/approvals`. Pick a title, description, and thumbnail concept. Approve clip candidates one by one. Done in ~10 minutes.
5. **Schedule the publish:** From the episode page, set a publish date. The system uploads it to YouTube as private + scheduled.
6. **The next morning:** Watch analytics flow in. Generate next week's topics from `/discovery`.

That's the whole loop.

---

## Troubleshooting

**"Settings can't load until Supabase is configured."** — You missed Step 1 or
the SQL migration didn't run. Check `Project Settings → API` keys match
exactly (no trailing spaces).

**Upload fails with 403 / SignatureDoesNotMatch.** — R2 access keys are wrong
or scoped to the wrong bucket. Re-create the R2 token with the correct
bucket scope.

**"YOUTUBE_CLIENT_ID/SECRET not set."** — Step 4 isn't complete, or the env
vars weren't redeployed on Vercel.

**"No approved title"** when publishing. — Approve a title from the episode
page first.

**OpenAI quota errors.** — Raise your monthly cap in the OpenAI billing page,
or wait until next month.

---

## Where to ask for help

If something's broken, the fastest path is: paste the error message from the
browser console **and** the Vercel function logs into a chat with me. I can
fix forward from those.
