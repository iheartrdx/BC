import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { SetupChecklist } from "@/components/SetupChecklist";
import { configured } from "@/lib/env";
import { adminSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

async function loadStats() {
  if (!configured.supabaseAdmin) return null;
  const sb = adminSupabase();
  const [eps, pending, clips] = await Promise.all([
    sb.from("episodes").select("id, status", { count: "exact", head: false }),
    sb.from("approvals").select("id", { count: "exact", head: true }).eq("state", "pending"),
    sb.from("clips").select("id", { count: "exact", head: true }),
  ]);
  return {
    episodes: eps.data?.length ?? 0,
    awaiting: eps.data?.filter((e) => e.status === "awaiting_approval").length ?? 0,
    published: eps.data?.filter((e) => e.status === "published").length ?? 0,
    pendingApprovals: pending.count ?? 0,
    clips: clips.count ?? 0,
  };
}

export default async function Home() {
  const stats = await loadStats();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        eyebrow="Barberic Culture Media OS"
        title="Mission control"
        subtitle="The dashboard runs the show. You record, approve, and publish. Everything in between is handled here."
      />
      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Episodes" value={stats?.episodes ?? "—"} href="/episodes" />
        <Stat label="Awaiting approval" value={stats?.awaiting ?? "—"} href="/approvals" emphasize />
        <Stat label="Published" value={stats?.published ?? "—"} href="/episodes?status=published" />
        <Stat label="Clips generated" value={stats?.clips ?? "—"} href="/episodes" />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <div className="card">
          <h2 className="font-display text-xl">What this is</h2>
          <p className="mt-3 text-sm text-paper/80">
            An AI-assisted media operating system, not a content tool. The host records freeform episodes;
            the system handles transcription, asset generation, clip selection, and publishing.
            Every public action is approval-gated until you say otherwise.
          </p>
          <div className="mt-4 flex gap-2">
            <Link className="btn btn-primary" href="/episodes/new">
              Start a new episode
            </Link>
            <Link className="btn btn-ghost" href="/discovery">
              Discover topics
            </Link>
          </div>
        </div>
        <SetupChecklist />
      </div>

      <div className="card mt-6">
        <h2 className="font-display text-xl">The 10-step workflow</h2>
        <ol className="mt-4 grid gap-3 text-sm text-paper/80 md:grid-cols-2">
          {[
            ["Discovery", "AI suggests episode topics from trends + your past performance."],
            ["Prep", "AI generates talking points and conversational scaffolding."],
            ["Record", "You record. That's the human part."],
            ["Ingest", "Source file uploaded to R2; metadata stored in Supabase."],
            ["Transcribe", "Whisper converts audio to a timestamped transcript."],
            ["Analyze", "GPT scores moments, drafts titles, descriptions, and clip candidates."],
            ["Process", "Vertical clips and captions are generated."],
            ["Approve", "You pick titles, thumbnails, clips, and a schedule. ~10 min."],
            ["Publish", "YouTube long-form + Shorts are pushed via API."],
            ["Learn", "Analytics flow back into Discovery for the next cycle."],
          ].map(([k, v], i) => (
            <li key={k} className="flex gap-3">
              <span className="font-display text-accent">{String(i + 1).padStart(2, "0")}</span>
              <span>
                <span className="text-paper">{k}.</span> {v}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  emphasize,
}: {
  label: string;
  value: number | string;
  href: string;
  emphasize?: boolean;
}) {
  return (
    <Link href={href} className={`card transition hover:bg-black/50 ${emphasize ? "border-accent/60" : ""}`}>
      <div className="text-xs uppercase tracking-widest text-muted">{label}</div>
      <div className="mt-2 font-display text-3xl">{value}</div>
    </Link>
  );
}
