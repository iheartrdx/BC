import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/lib/youtube";
import { configured } from "@/lib/env";

export async function GET(req: Request) {
  if (!configured.youtube) {
    return NextResponse.json({ error: "YouTube OAuth not configured" }, { status: 400 });
  }
  const u = new URL(req.url);
  const code = u.searchParams.get("code");
  const state = u.searchParams.get("state");
  const cookieState = cookies().get("yt_oauth_state")?.value;
  if (!code || !state || state !== cookieState) {
    return NextResponse.json({ error: "Invalid OAuth state" }, { status: 400 });
  }
  try {
    const r = await exchangeCode(code);
    const dest = new URL("/settings", u.origin);
    dest.searchParams.set("yt", "connected");
    if (r.channel_title) dest.searchParams.set("channel", r.channel_title);
    return NextResponse.redirect(dest);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "OAuth exchange failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
