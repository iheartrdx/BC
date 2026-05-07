import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/PageHeader";
import { configured } from "@/lib/env";
import { adminSupabase } from "@/lib/supabase";
import type { Clip, Episode } from "@/lib/types";
import { fmtSeconds, fmtBytes, fmtRelative } from "@/lib/format";
import { IngestButton, ApproveTitleForm } from "./EpisodeActions";

export const dynamic = "force-dynamic";

async function load(id: string) {
  if (!configured.supabaseAdmin) return null;
  const sb = adminSupabase();
  const ep = await sb.from("episodes").select("*").eq("id", id).maybeSingle();
  if (!ep.data) return null;
  const cl = await sb.from("clips").select("*").eq("episode_id", id).order("score", { ascending: false });
  return { episode: ep.data as Episode, clips: (cl.data as Clip[]) ?? [] };
}

export default async function EpisodeDetail({ params }: { params: { id: string } }) {
  const data = await load(params.id);
  if (!data) return notFound();
  const { episode, clips } = data;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow={`Episode · ${episode.status.replace(/_/g, " ")}`}
        title={episode.title}
        subtitle={`Created ${fmtRelative(episode.created_at)} · ${fmtSeconds(episode.duration_seconds)} · ${fmtBytes(episode.source_bytes)}`}
        right={
          <div className="flex gap-2">
            <Link href="/episodes" className="btn btn-ghost">
              Back
            </Link>
            <IngestButton episodeId={episode.id} status={episode.status} />
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-3">
        <div className="card md:col-span-2">
          <h2 className="font-display text-lg">AI-suggested titles</h2>
          {episode.ai_titles?.length ? (
            <ApproveTitleForm episodeId={episode.id} titles={episode.ai_titles} approved={episode.approved_title} />
          ) : (
            <p className="mt-3 text-sm text-muted">Run the pipeline to generate title options.</p>
          )}
        </div>
        <div className="card">
          <h2 className="font-display text-lg">Status</h2>
          <ul className="mt-3 space-y-1 text-sm text-paper/80">
            <li>Storage: {episode.source_storage_key ? "uploaded" : "—"}</li>
            <li>Transcript: {episode.transcript ? `${episode.transcript.length.toLocaleString()} chars` : "—"}</li>
            <li>Clips: {clips.length}</li>
            <li>YouTube: {episode.youtube_video_id ?? "—"}</li>
          </ul>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <div className="card">
          <h2 className="font-display text-lg">Description options</h2>
          {episode.ai_descriptions?.length ? (
            <ul className="mt-3 space-y-3 text-sm">
              {episode.ai_descriptions.map((d, i) => (
                <li key={i} className="rounded-md border border-line/60 p-3">
                  <div className="whitespace-pre-wrap text-paper/90">{d.text}</div>
                  <div className="mt-2 text-xs text-muted">{d.rationale}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">Pending analysis.</p>
          )}
        </div>
        <div className="card">
          <h2 className="font-display text-lg">Chapters</h2>
          {episode.ai_chapters?.length ? (
            <ul className="mt-3 space-y-1 text-sm">
              {episode.ai_chapters.map((c, i) => (
                <li key={i} className="flex justify-between text-paper/80">
                  <span>{c.title}</span>
                  <span className="text-muted">{fmtSeconds(c.start_seconds)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">No chapters yet.</p>
          )}
        </div>
      </div>

      <div className="card mt-6">
        <h2 className="font-display text-lg">Clip candidates</h2>
        {clips.length === 0 ? (
          <p className="mt-3 text-sm text-muted">The pipeline will populate clip candidates after analysis.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line/60">
            {clips.map((c) => (
              <li key={c.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-paper">{c.suggested_title || c.hook}</div>
                    <div className="mt-1 text-xs text-muted">
                      {fmtSeconds(c.start_seconds)} → {fmtSeconds(c.end_seconds)} ·{" "}
                      score {c.score?.toFixed(2) ?? "—"} · {c.status.replace(/_/g, " ")}
                    </div>
                  </div>
                  <span className="pill">{c.hashtags?.[0] ?? ""}</span>
                </div>
                {c.suggested_caption && <p className="mt-2 text-sm text-paper/80">{c.suggested_caption}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {episode.transcript && (
        <details className="card mt-6">
          <summary className="cursor-pointer font-display text-lg">Transcript</summary>
          <pre className="mt-3 max-h-[40rem] overflow-auto whitespace-pre-wrap text-sm text-paper/80">
            {episode.transcript}
          </pre>
        </details>
      )}
    </div>
  );
}
