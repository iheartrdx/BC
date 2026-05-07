import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { configured } from "@/lib/env";
import { adminSupabase } from "@/lib/supabase";
import type { Episode } from "@/lib/types";
import { fmtRelative, fmtSeconds } from "@/lib/format";

export const dynamic = "force-dynamic";

const statusColor: Record<string, string> = {
  draft: "border-line text-muted",
  recorded: "border-line text-paper/80",
  uploaded: "border-blue-400/40 text-blue-200",
  transcribing: "border-blue-400/40 text-blue-200",
  analyzing: "border-blue-400/40 text-blue-200",
  assets_ready: "border-emerald-400/40 text-emerald-200",
  awaiting_approval: "border-accent/60 text-accent",
  approved: "border-emerald-400/40 text-emerald-200",
  scheduled: "border-emerald-400/40 text-emerald-200",
  published: "border-emerald-400/60 text-emerald-200",
  error: "border-red-400/60 text-red-200",
};

export default async function EpisodesPage() {
  let episodes: Episode[] = [];
  if (configured.supabaseAdmin) {
    const { data } = await adminSupabase()
      .from("episodes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    episodes = (data as Episode[]) ?? [];
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Library"
        title="Episodes"
        subtitle="Every recording the system has touched. Click into one to see transcript, AI assets, and clips."
        right={
          <Link href="/episodes/new" className="btn btn-primary">
            New episode
          </Link>
        }
      />

      {!configured.supabaseAdmin ? (
        <div className="card text-sm text-paper/80">
          Configure Supabase to start tracking episodes. See <Link className="text-accent" href="/settings">Settings</Link>.
        </div>
      ) : episodes.length === 0 ? (
        <div className="card text-sm text-paper/80">
          No episodes yet. <Link className="text-accent" href="/episodes/new">Create the first one</Link> to kick off the pipeline.
        </div>
      ) : (
        <div className="card divide-y divide-line/60 p-0">
          {episodes.map((e) => (
            <Link
              key={e.id}
              href={`/episodes/${e.id}`}
              className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-line/30"
            >
              <div className="min-w-0">
                <div className="truncate text-paper">{e.title}</div>
                <div className="mt-1 flex items-center gap-3 text-xs text-muted">
                  <span>{fmtRelative(e.created_at)}</span>
                  <span>·</span>
                  <span>{fmtSeconds(e.duration_seconds)}</span>
                  {e.number != null && <span>· #{e.number}</span>}
                </div>
              </div>
              <span className={`pill ${statusColor[e.status] || ""}`}>{e.status.replace(/_/g, " ")}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
