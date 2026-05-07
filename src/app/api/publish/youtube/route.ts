import { NextResponse } from "next/server";
import { configured } from "@/lib/env";
import { adminSupabase } from "@/lib/supabase";
import { presignDownload } from "@/lib/r2";
import { uploadVideo } from "@/lib/youtube";
import type { Episode } from "@/lib/types";

export const maxDuration = 300;

// Publish an episode (long-form) to YouTube. The clip equivalent will follow
// the same pattern using the rendered short's storage key.
export async function POST(req: Request) {
  if (!configured.supabaseAdmin || !configured.r2 || !configured.youtube) {
    return NextResponse.json({ error: "Supabase, R2, and YouTube must all be configured." }, { status: 400 });
  }
  const { episodeId, publishAt } = (await req.json().catch(() => ({}))) as {
    episodeId?: string;
    publishAt?: string;
  };
  if (!episodeId) return NextResponse.json({ error: "episodeId required" }, { status: 400 });

  const sb = adminSupabase();
  const ep = (await sb.from("episodes").select("*").eq("id", episodeId).maybeSingle()).data as Episode | null;
  if (!ep) return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  if (!ep.source_storage_key) return NextResponse.json({ error: "Episode has no source file" }, { status: 400 });
  if (!ep.approved_title) return NextResponse.json({ error: "No approved title" }, { status: 400 });

  const fileUrl = await presignDownload(ep.source_storage_key, 60 * 60);
  const result = await uploadVideo({
    title: ep.approved_title,
    description: ep.approved_description ?? "",
    tags: ep.ai_hashtags?.map((h) => h.replace(/^#/, "")) ?? [],
    publishAt,
    fileUrl,
  });

  await sb
    .from("episodes")
    .update({
      youtube_video_id: result.id,
      status: publishAt ? "scheduled" : "published",
      scheduled_at: publishAt ?? null,
    })
    .eq("id", episodeId);

  return NextResponse.json({ id: result.id, status: result.status });
}
