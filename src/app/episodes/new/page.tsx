import { PageHeader } from "@/components/PageHeader";
import { NewEpisodeForm } from "./NewEpisodeForm";
import { configured } from "@/lib/env";

export const dynamic = "force-dynamic";

export default function NewEpisodePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        eyebrow="Ingest"
        title="New episode"
        subtitle="Drop a recording in. The system stores it, transcribes it, analyzes it, and queues approvals — you don't lift a finger after upload."
      />
      {!configured.supabaseAdmin || !configured.r2 ? (
        <div className="card text-sm text-paper/80">
          Upload requires Supabase and Cloudflare R2 to be configured. See SETUP.md.
        </div>
      ) : (
        <NewEpisodeForm openaiReady={configured.openai} />
      )}
    </div>
  );
}
