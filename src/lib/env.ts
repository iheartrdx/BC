// Central env access. Every call answers two questions:
//   1) what's the value (or undefined)?
//   2) is this integration "configured" enough to use?
// Pages and API routes use the `configured` map to decide whether to render
// real UI or a "set this up first" placeholder.

const e = (k: string) => process.env[k]?.trim() || undefined;

export const env = {
  appUrl: e("APP_URL") || "http://localhost:3000",
  adminEmail: e("ADMIN_EMAIL"),

  supabaseUrl: e("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: e("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceRoleKey: e("SUPABASE_SERVICE_ROLE_KEY"),

  openaiKey: e("OPENAI_API_KEY"),
  openaiModel: e("OPENAI_MODEL") || "gpt-4o",
  openaiTranscribeModel: e("OPENAI_TRANSCRIBE_MODEL") || "whisper-1",

  r2AccountId: e("R2_ACCOUNT_ID"),
  r2AccessKeyId: e("R2_ACCESS_KEY_ID"),
  r2SecretAccessKey: e("R2_SECRET_ACCESS_KEY"),
  r2Bucket: e("R2_BUCKET_NAME") || "barberic-media-os-prod",
  r2PublicBaseUrl: e("R2_PUBLIC_BASE_URL"),

  youtubeClientId: e("YOUTUBE_CLIENT_ID"),
  youtubeClientSecret: e("YOUTUBE_CLIENT_SECRET"),
  youtubeRedirectUri:
    e("YOUTUBE_REDIRECT_URI") ||
    `${e("APP_URL") || "http://localhost:3000"}/api/auth/youtube/callback`,

  opusclipKey: e("OPUSCLIP_API_KEY"),
  descriptKey: e("DESCRIPT_API_KEY"),
  makeWebhook: e("MAKE_WEBHOOK_URL"),
};

export const configured = {
  supabase: !!(env.supabaseUrl && env.supabaseAnonKey),
  supabaseAdmin: !!(env.supabaseUrl && env.supabaseServiceRoleKey),
  openai: !!env.openaiKey,
  r2: !!(env.r2AccountId && env.r2AccessKeyId && env.r2SecretAccessKey),
  youtube: !!(env.youtubeClientId && env.youtubeClientSecret),
  opusclip: !!env.opusclipKey,
  descript: !!env.descriptKey,
  make: !!env.makeWebhook,
};

export type IntegrationKey = keyof typeof configured;

export const integrationLabels: Record<IntegrationKey, string> = {
  supabase: "Supabase (database + auth)",
  supabaseAdmin: "Supabase service-role (server jobs)",
  openai: "OpenAI (AI + transcription)",
  r2: "Cloudflare R2 (file storage)",
  youtube: "YouTube Data API",
  opusclip: "OpusClip (optional)",
  descript: "Descript (optional)",
  make: "Make.com webhook (optional)",
};
