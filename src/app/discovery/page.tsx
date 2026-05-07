import { PageHeader } from "@/components/PageHeader";
import { configured } from "@/lib/env";
import { adminSupabase } from "@/lib/supabase";
import type { TopicIdea } from "@/lib/types";
import { GenerateTopics } from "./GenerateTopics";

export const dynamic = "force-dynamic";

export default async function DiscoveryPage() {
  let topics: TopicIdea[] = [];
  if (configured.supabaseAdmin) {
    const { data } = await adminSupabase()
      .from("topic_ideas")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    topics = (data as TopicIdea[]) ?? [];
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Step 1 of the workflow"
        title="Discovery"
        subtitle="The AI proposes future episode topics using your brand profile and the current creative direction. Shortlist the ones you'd actually record."
        right={configured.openai && configured.supabaseAdmin ? <GenerateTopics /> : null}
      />

      {!configured.openai || !configured.supabaseAdmin ? (
        <div className="card text-sm text-paper/80">
          Discovery needs Supabase + OpenAI to be configured.
        </div>
      ) : topics.length === 0 ? (
        <div className="card text-sm text-paper/80">
          No topic ideas yet. Click <em>Generate ideas</em> to seed the queue.
        </div>
      ) : (
        <div className="space-y-3">
          {topics.map((t) => (
            <div key={t.id} className="card">
              <div className="flex items-center justify-between">
                <div className="font-display text-lg">{t.title}</div>
                <span className="pill">{t.status}</span>
              </div>
              {t.angle && <div className="mt-2 text-sm text-paper/80">{t.angle}</div>}
              {t.rationale && <div className="mt-2 text-xs text-muted">{t.rationale}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
