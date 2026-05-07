import { NextResponse } from "next/server";
import { configured } from "@/lib/env";
import { presignUpload, buildEpisodeKey } from "@/lib/r2";

export async function POST(req: Request) {
  if (!configured.r2) return NextResponse.json({ error: "R2 not configured" }, { status: 400 });
  const { episodeId, filename, contentType } = (await req.json().catch(() => ({}))) as {
    episodeId?: string;
    filename?: string;
    contentType?: string;
  };
  if (!episodeId || !filename) return NextResponse.json({ error: "episodeId and filename required" }, { status: 400 });
  const key = buildEpisodeKey(episodeId, filename);
  const url = await presignUpload(key, contentType || "application/octet-stream");
  return NextResponse.json({ url, key });
}
