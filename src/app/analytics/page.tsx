import { PageHeader } from "@/components/PageHeader";

export default function AnalyticsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Step 10 — feedback loop"
        title="Analytics"
        subtitle="Watch time, CTR, retention, and clip performance feed back into Discovery so future episodes get smarter."
      />
      <div className="card text-sm text-paper/80">
        <p>
          Analytics ingestion runs on a schedule once YouTube is connected. Until then this page is a
          placeholder. The data model already supports per-episode and per-clip snapshots — see{" "}
          <code className="text-accent">analytics_snapshots</code> in the schema.
        </p>
        <p className="mt-3 text-muted">
          Next milestones: nightly cron pulling YouTube Analytics → snapshot rows → roll-ups on this page.
        </p>
      </div>
    </div>
  );
}
