import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { configured } from "@/lib/env";

const PATCHABLE = new Set([
  "title",
  "number",
  "status",
  "recorded_at",
  "duration_seconds",
  "source_storage_key",
  "source_mime",
  "source_bytes",
  "approved_title",
  "approved_description",
  "scheduled_at",
  "notes",
]);

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!configured.supabaseAdmin) return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  const { data, error } = await adminSupabase().from("episodes").select("*").eq("id", params.id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!configured.supabaseAdmin) return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (PATCHABLE.has(k)) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  const { error } = await adminSupabase().from("episodes").update(patch).eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!configured.supabaseAdmin) return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  const { error } = await adminSupabase().from("episodes").delete().eq("id", params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
