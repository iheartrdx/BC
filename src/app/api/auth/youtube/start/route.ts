import { NextResponse } from "next/server";
import { configured } from "@/lib/env";
import { authUrl } from "@/lib/youtube";
import crypto from "node:crypto";

export async function GET() {
  if (!configured.youtube) {
    return NextResponse.json({ error: "YOUTUBE_CLIENT_ID/SECRET not set" }, { status: 400 });
  }
  const state = crypto.randomBytes(16).toString("hex");
  const url = authUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set("yt_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
