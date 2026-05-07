import { google } from "googleapis";
import { Readable } from "node:stream";
import { env, configured } from "./env";
import { adminSupabase } from "./supabase";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

export function oauthClient() {
  if (!configured.youtube) throw new Error("YouTube OAuth client not configured.");
  return new google.auth.OAuth2(env.youtubeClientId, env.youtubeClientSecret, env.youtubeRedirectUri);
}

export function authUrl(state: string) {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

export async function exchangeCode(code: string) {
  const c = oauthClient();
  const { tokens } = await c.getToken(code);
  c.setCredentials(tokens);
  // grab channel for display
  const yt = google.youtube({ version: "v3", auth: c });
  const ch = await yt.channels.list({ mine: true, part: ["snippet"] });
  const channel = ch.data.items?.[0];
  await adminSupabase()
    .from("service_tokens")
    .upsert({
      service: "youtube",
      access_token: tokens.access_token ?? null,
      refresh_token: tokens.refresh_token ?? null,
      scope: tokens.scope ?? null,
      token_type: tokens.token_type ?? null,
      expires_at: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
      channel_id: channel?.id ?? null,
      channel_title: channel?.snippet?.title ?? null,
    });
  return { channel_id: channel?.id, channel_title: channel?.snippet?.title };
}

async function authedClient() {
  const { data, error } = await adminSupabase()
    .from("service_tokens")
    .select("*")
    .eq("service", "youtube")
    .maybeSingle();
  if (error) throw error;
  if (!data?.refresh_token) throw new Error("YouTube not connected. Visit Settings → Connect YouTube.");
  const c = oauthClient();
  c.setCredentials({
    access_token: data.access_token ?? undefined,
    refresh_token: data.refresh_token,
    scope: data.scope ?? undefined,
    token_type: data.token_type ?? undefined,
    expiry_date: data.expires_at ? new Date(data.expires_at).getTime() : undefined,
  });
  return c;
}

export async function uploadVideo(opts: {
  title: string;
  description: string;
  tags?: string[];
  publishAt?: string;       // ISO; if set, video is uploaded private + scheduled
  fileUrl: string;          // signed R2 URL to stream from
  isShort?: boolean;        // append #Shorts to description if true
}) {
  const auth = await authedClient();
  const yt = google.youtube({ version: "v3", auth });
  const res = await fetch(opts.fileUrl);
  if (!res.ok) throw new Error(`Could not fetch source video: ${res.status}`);
  const stream = Readable.fromWeb(res.body as never);

  const status = opts.publishAt ? { privacyStatus: "private", publishAt: opts.publishAt } : { privacyStatus: "public" };
  const description = opts.isShort ? `${opts.description}\n\n#Shorts` : opts.description;

  const result = await yt.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: { title: opts.title, description, tags: opts.tags },
      status,
    },
    media: { body: stream },
  });
  return { id: result.data.id, status: result.data.status?.privacyStatus };
}
