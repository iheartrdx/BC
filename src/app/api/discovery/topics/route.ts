import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { configured } from "@/lib/env";
import { suggestTopics } from "@/lib/openai";

export async function POST() {
  if (!configured.supabaseAdmin) return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  if (!configured.openai) return NextResponse.json({ error: "OPENAI_API_KEY not set" }, { status: 400 });
  const sb = adminSupabase();
  const brand = (await sb.from("brand_config").select("*").limit(1).single()).data;
  const recent = await sb.from("episodes").select("title").order("created_at", { ascending: false }).limit(10);
  const recentTitles = (recent.data ?? []).map((r) => r.title);

  const { topics } = await suggestTopics(
    {
      show_name: brand?.show_name ?? "Barberic Culture",
      tagline: brand?.tagline,
      tone: brand?.tone,
      target_audience: brand?.target_audience,
      topics_in: brand?.topics_in ?? [],
      topics_out: brand?.topics_out ?? [],
    },
    recentTitles,
  );

  if (topics?.length) {
    await sb.from("topic_ideas").insert(
      topics.map((t) => ({
        title: t.title,
        angle: t.angle,
        rationale: t.rationale,
        score: t.score,
        source: "ai",
      })),
    );
  }
  return NextResponse.json({ count: topics?.length ?? 0 });
}
