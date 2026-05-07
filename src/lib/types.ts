export type EpisodeStatus =
  | "draft"
  | "recorded"
  | "uploaded"
  | "transcribing"
  | "analyzing"
  | "assets_ready"
  | "awaiting_approval"
  | "approved"
  | "scheduled"
  | "published"
  | "error";

export type ClipStatus =
  | "candidate"
  | "rendering"
  | "ready"
  | "awaiting_approval"
  | "approved"
  | "scheduled"
  | "published"
  | "rejected"
  | "error";

export type ApprovalKind =
  | "episode_title"
  | "episode_description"
  | "episode_thumbnail"
  | "episode_schedule"
  | "clip_title"
  | "clip_caption"
  | "clip_render"
  | "clip_schedule"
  | "social_post";

export type ApprovalState = "pending" | "approved" | "rejected";

export interface BrandConfig {
  id: string;
  show_name: string;
  tagline: string | null;
  short_desc: string | null;
  long_desc: string | null;
  target_audience: string | null;
  topics_in: string[];
  topics_out: string[];
  tone: string | null;
  host_name: string | null;
  host_handles: Record<string, string>;
  host_strengths: string | null;
  host_catchphrases: string[] | null;
  brand_colors: string[];
  fonts: string[];
  channel_links: Record<string, string>;
  posting_cadence: string | null;
  clips_per_episode: number;
  primary_goal: string | null;
  notes: string | null;
  updated_at: string;
}

export interface Episode {
  id: string;
  number: number | null;
  title: string;
  status: EpisodeStatus;
  recorded_at: string | null;
  duration_seconds: number | null;
  source_storage_key: string | null;
  source_mime: string | null;
  source_bytes: number | null;
  transcript: string | null;
  transcript_json: unknown;
  ai_titles: { text: string; rationale: string }[];
  ai_descriptions: { text: string; rationale: string }[];
  ai_chapters: { start_seconds: number; title: string }[];
  ai_hashtags: string[];
  ai_thumbnail_ideas: { concept: string; text_overlay: string }[];
  ai_pinned_comment: string | null;
  approved_title: string | null;
  approved_description: string | null;
  scheduled_at: string | null;
  youtube_video_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Clip {
  id: string;
  episode_id: string;
  start_seconds: number;
  end_seconds: number;
  hook: string | null;
  reason: string | null;
  score: number | null;
  suggested_title: string | null;
  suggested_caption: string | null;
  hashtags: string[];
  render_storage_key: string | null;
  thumbnail_storage_key: string | null;
  status: ClipStatus;
  approved_title: string | null;
  approved_caption: string | null;
  scheduled_at: string | null;
  youtube_short_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Approval {
  id: string;
  kind: ApprovalKind;
  episode_id: string | null;
  clip_id: string | null;
  payload: Record<string, unknown>;
  state: ApprovalState;
  decided_by: string | null;
  decided_at: string | null;
  decision: Record<string, unknown> | null;
  created_at: string;
}

export interface TopicIdea {
  id: string;
  title: string;
  angle: string | null;
  rationale: string | null;
  source: string | null;
  score: number | null;
  used_in_episode_id: string | null;
  status: "new" | "shortlisted" | "used" | "dismissed";
  created_at: string;
}
