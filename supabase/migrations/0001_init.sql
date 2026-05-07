-- =============================================================================
-- Barberic Culture Media OS — initial schema
-- Run this in your Supabase project's SQL editor (or via supabase CLI).
-- =============================================================================

create extension if not exists "pgcrypto";

-- Single-row brand config replaces the Word "intake packet". The dashboard
-- Settings page reads/writes this row.
create table if not exists brand_config (
  id              uuid primary key default gen_random_uuid(),
  show_name       text not null default 'Barberic Culture',
  tagline         text,
  short_desc      text,
  long_desc       text,
  target_audience text,
  topics_in       text[] not null default '{}',
  topics_out      text[] not null default '{}',
  tone            text,
  host_name       text,
  host_handles    jsonb not null default '{}'::jsonb,
  host_strengths  text,
  host_catchphrases text[],
  brand_colors    text[] not null default '{}',
  fonts           text[] not null default '{}',
  channel_links   jsonb not null default '{}'::jsonb,
  posting_cadence text,
  clips_per_episode int not null default 5,
  primary_goal    text,
  notes           text,
  updated_at      timestamptz not null default now()
);

-- Seed exactly one row.
insert into brand_config (show_name)
select 'Barberic Culture'
where not exists (select 1 from brand_config);

create type episode_status as enum (
  'draft',
  'recorded',
  'uploaded',
  'transcribing',
  'analyzing',
  'assets_ready',
  'awaiting_approval',
  'approved',
  'scheduled',
  'published',
  'error'
);

create table if not exists episodes (
  id               uuid primary key default gen_random_uuid(),
  number           int,
  title            text not null default 'Untitled episode',
  status           episode_status not null default 'draft',
  recorded_at      timestamptz,
  duration_seconds int,
  source_storage_key text,                 -- R2 object key for the raw video/audio
  source_mime      text,
  source_bytes     bigint,
  transcript       text,
  transcript_json  jsonb,                  -- word-level / segment timing
  ai_titles        jsonb not null default '[]'::jsonb,
  ai_descriptions  jsonb not null default '[]'::jsonb,
  ai_chapters      jsonb not null default '[]'::jsonb,
  ai_hashtags      text[] not null default '{}',
  ai_thumbnail_ideas jsonb not null default '[]'::jsonb,
  ai_pinned_comment text,
  approved_title   text,
  approved_description text,
  scheduled_at     timestamptz,
  youtube_video_id text,
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists episodes_status_idx on episodes(status);
create index if not exists episodes_created_idx on episodes(created_at desc);

create type clip_status as enum (
  'candidate',
  'rendering',
  'ready',
  'awaiting_approval',
  'approved',
  'scheduled',
  'published',
  'rejected',
  'error'
);

create table if not exists clips (
  id            uuid primary key default gen_random_uuid(),
  episode_id    uuid not null references episodes(id) on delete cascade,
  start_seconds numeric not null,
  end_seconds   numeric not null,
  hook          text,
  reason        text,                      -- why AI picked this moment
  score         numeric,                   -- 0..1 virality estimate
  suggested_title text,
  suggested_caption text,
  hashtags      text[] not null default '{}',
  render_storage_key text,                 -- R2 key for rendered vertical clip
  thumbnail_storage_key text,
  status        clip_status not null default 'candidate',
  approved_title text,
  approved_caption text,
  scheduled_at  timestamptz,
  youtube_short_id text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists clips_episode_idx on clips(episode_id);
create index if not exists clips_status_idx on clips(status);

-- Generic approval queue. Anything that needs a human "yes" goes here so the
-- Approvals page is a single inbox.
create type approval_kind as enum (
  'episode_title',
  'episode_description',
  'episode_thumbnail',
  'episode_schedule',
  'clip_title',
  'clip_caption',
  'clip_render',
  'clip_schedule',
  'social_post'
);

create type approval_state as enum ('pending', 'approved', 'rejected');

create table if not exists approvals (
  id           uuid primary key default gen_random_uuid(),
  kind         approval_kind not null,
  episode_id   uuid references episodes(id) on delete cascade,
  clip_id      uuid references clips(id) on delete cascade,
  payload      jsonb not null,             -- options to pick from / preview
  state        approval_state not null default 'pending',
  decided_by   uuid,
  decided_at   timestamptz,
  decision     jsonb,                      -- which option was chosen
  created_at   timestamptz not null default now()
);

create index if not exists approvals_state_idx on approvals(state);
create index if not exists approvals_kind_idx on approvals(kind);

-- Topic discovery suggestions for future episodes.
create table if not exists topic_ideas (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  angle       text,
  rationale   text,
  source      text,                        -- 'ai' | 'analytics' | 'manual'
  score       numeric,
  used_in_episode_id uuid references episodes(id) on delete set null,
  status      text not null default 'new', -- new | shortlisted | used | dismissed
  created_at  timestamptz not null default now()
);

-- Cached YouTube/social analytics snapshots.
create table if not exists analytics_snapshots (
  id              uuid primary key default gen_random_uuid(),
  episode_id      uuid references episodes(id) on delete cascade,
  clip_id         uuid references clips(id) on delete cascade,
  platform        text not null,           -- 'youtube' | 'youtube_shorts' | etc
  views           bigint,
  watch_time_seconds bigint,
  ctr             numeric,
  avg_view_duration numeric,
  comments        bigint,
  likes           bigint,
  captured_at     timestamptz not null default now()
);

-- OAuth tokens for outbound services (currently YouTube). Only the
-- service-role key on the server can read this.
create table if not exists service_tokens (
  service       text primary key,          -- 'youtube'
  access_token  text,
  refresh_token text,
  scope         text,
  token_type    text,
  expires_at    timestamptz,
  channel_id    text,
  channel_title text,
  updated_at    timestamptz not null default now()
);

-- Updated-at triggers
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at := now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_episodes_updated on episodes;
create trigger trg_episodes_updated before update on episodes
  for each row execute function set_updated_at();

drop trigger if exists trg_clips_updated on clips;
create trigger trg_clips_updated before update on clips
  for each row execute function set_updated_at();

drop trigger if exists trg_brand_config_updated on brand_config;
create trigger trg_brand_config_updated before update on brand_config
  for each row execute function set_updated_at();

-- Row-level security: lock everything to authenticated users by default.
-- The server uses the service-role key for backend jobs and bypasses RLS.
alter table brand_config       enable row level security;
alter table episodes           enable row level security;
alter table clips              enable row level security;
alter table approvals          enable row level security;
alter table topic_ideas        enable row level security;
alter table analytics_snapshots enable row level security;
alter table service_tokens     enable row level security;

create policy "auth read brand_config"     on brand_config       for select to authenticated using (true);
create policy "auth write brand_config"    on brand_config       for update to authenticated using (true);
create policy "auth all episodes"          on episodes           for all    to authenticated using (true) with check (true);
create policy "auth all clips"             on clips              for all    to authenticated using (true) with check (true);
create policy "auth all approvals"         on approvals          for all    to authenticated using (true) with check (true);
create policy "auth all topic_ideas"       on topic_ideas        for all    to authenticated using (true) with check (true);
create policy "auth read analytics"        on analytics_snapshots for select to authenticated using (true);
-- service_tokens: server-only. No policy granted to authenticated.
