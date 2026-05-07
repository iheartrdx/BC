import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { configured } from "@/lib/env";

export async function POST(req: Request) {
  if (!configured.supabaseAdmin) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({}));
  const title = (body?.title as string)?.trim() || "Untitled episode";
  const { data, error } = await adminSupabase()
    .from("episodes")
    .insert({ title, status: "draft" })
    .select("id, title, status")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function GET() {
  if (!configured.supabaseAdmin) return NextResponse.json({ episodes: [] });
  const { data, error } = await adminSupabase()
    .from("episodes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ episodes: data });
}
