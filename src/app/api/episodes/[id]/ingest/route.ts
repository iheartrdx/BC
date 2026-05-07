import { NextResponse } from "next/server";
import { configured } from "@/lib/env";
import { adminSupabase } from "@/lib/supabase";
import { presignDownload } from "@/lib/r2";
import { analyzeTranscript, transcribeFromUrl } from "@/lib/openai";
import type { Episode } from "@/lib/types";

// This route runs the full pipeline synchronously. It is wrapped in try/catch
// so any failure flips the episode to 'error' with a readable note instead of
// leaving it stuck in a halfway state.
//
// For very long recordings you'd want to enqueue this on a worker; for V1 a
// single Vercel function is fine (configure maxDuration accordingly when you
// upgrade Vercel plans).
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!configured.supabaseAdmin) return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  if (!configured.openai) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 400 });
  if (!configured.r2) return NextResponse.json({ error: "R2 not configured" }, { status: 400 });

  const sb = adminSupabase();
  const id = params.id;

  const ep = await sb.from("episodes").select("*").eq("id", id).maybeSingle();
  if (!ep.data) return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  const episode = ep.data as Episode;
  if (!episode.source_storage_key) {
    return NextResponse.json({ error: "Episode has no uploaded source file" }, { status: 400 });
  }

  try {
    await sb.from("episodes").update({ status: "transcribing" }).eq("id", id);

    const sourceUrl = await presignDownload(episode.source_storage_key, 60 * 60);
    const tx = await transcribeFromUrl(sourceUrl);

    await sb
      .from("episodes")
      .update({ status: "analyzing", transcript: tx.text, transcript_json: { segments: tx.segments } })
      .eq("id", id);

    const brand = (await sb.from("brand_config").select("*").limit(1).single()).data;
    const analysis = await analyzeTranscript(tx.text, {
      show_name: brand?.show_name ?? "Barberic Culture",
      tagline: brand?.tagline,
      tone: brand?.tone,
      target_audience: brand?.target_audience,
      topics_in: brand?.topics_in ?? [],
      topics_out: brand?.topics_out ?? [],
    });

    await sb
      .from("episodes")
      .update({
        status: "awaiting_approval",
        ai_titles: analysis.titles,
        ai_descriptions: analysis.descriptions,
        ai_chapters: analysis.chapters,
        ai_hashtags: analysis.hashtags,
        ai_thumbnail_ideas: analysis.thumbnail_ideas,
        ai_pinned_comment: analysis.pinned_comment,
      })
      .eq("id", id);

    if (analysis.clip_candidates?.length) {
      const rows = analysis.clip_candidates.map((c) => ({
        episode_id: id,
        start_seconds: c.start_seconds,
        end_seconds: c.end_seconds,
        hook: c.hook,
        reason: c.reason,
        score: c.score,
        suggested_title: c.suggested_title,
        suggested_caption: c.suggested_caption,
        hashtags: c.hashtags ?? [],
        status: "candidate" as const,
      }));
      await sb.from("clips").insert(rows);
    }

    // Queue the human approvals.
    const approvals = [
      { kind: "episode_title" as const, episode_id: id, payload: { options: analysis.titles } },
      { kind: "episode_description" as const, episode_id: id, payload: { options: analysis.descriptions } },
      { kind: "episode_thumbnail" as const, episode_id: id, payload: { options: analysis.thumbnail_ideas } },
    ];
    await sb.from("approvals").insert(approvals);

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown ingest error";
    await sb.from("episodes").update({ status: "error", notes: message }).eq("id", id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
