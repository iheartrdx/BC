import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { configured } from "@/lib/env";

// When an approval is decided, we both record the decision and apply the
// chosen value to the underlying entity (episode/clip) so the rest of the
// dashboard can rely on a single source of truth.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!configured.supabaseAdmin) return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  const sb = adminSupabase();
  const { state, decision } = (await req.json().catch(() => ({}))) as {
    state?: "approved" | "rejected";
    decision?: Record<string, unknown> | null;
  };
  if (state !== "approved" && state !== "rejected") {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 });
  }

  const ap = await sb.from("approvals").select("*").eq("id", params.id).maybeSingle();
  if (!ap.data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await sb
    .from("approvals")
    .update({
      state,
      decision: decision ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (state === "approved" && decision && ap.data.episode_id) {
    const patch: Record<string, unknown> = {};
    if (ap.data.kind === "episode_title" && typeof decision.text === "string") {
      patch.approved_title = decision.text;
    } else if (ap.data.kind === "episode_description" && typeof decision.text === "string") {
      patch.approved_description = decision.text;
    }
    if (Object.keys(patch).length > 0) {
      await sb.from("episodes").update(patch).eq("id", ap.data.episode_id);
    }
  }
  if (state === "approved" && decision && ap.data.clip_id) {
    const patch: Record<string, unknown> = {};
    if (ap.data.kind === "clip_title" && typeof decision.text === "string") patch.approved_title = decision.text;
    if (ap.data.kind === "clip_caption" && typeof decision.text === "string") patch.approved_caption = decision.text;
    if (Object.keys(patch).length > 0) await sb.from("clips").update(patch).eq("id", ap.data.clip_id);
  }

  return NextResponse.json({ ok: true });
}
