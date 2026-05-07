"use server";

import { revalidatePath } from "next/cache";
import { adminSupabase } from "@/lib/supabase";

const csv = (s: FormDataEntryValue | null) =>
  ((s as string) || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const kvLines = (s: FormDataEntryValue | null) => {
  const out: Record<string, string> = {};
  ((s as string) || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .forEach((line) => {
      const i = line.indexOf("=");
      if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    });
  return out;
};

export async function saveBrand(form: FormData) {
  const sb = adminSupabase();
  const { data: existing } = await sb.from("brand_config").select("id").limit(1).single();
  if (!existing) throw new Error("brand_config row missing — re-run the migration.");

  const patch = {
    show_name: ((form.get("show_name") as string) || "Barberic Culture").trim(),
    tagline: ((form.get("tagline") as string) || "").trim() || null,
    short_desc: ((form.get("short_desc") as string) || "").trim() || null,
    long_desc: ((form.get("long_desc") as string) || "").trim() || null,
    target_audience: ((form.get("target_audience") as string) || "").trim() || null,
    tone: ((form.get("tone") as string) || "").trim() || null,
    topics_in: csv(form.get("topics_in")),
    topics_out: csv(form.get("topics_out")),
    host_name: ((form.get("host_name") as string) || "").trim() || null,
    host_strengths: ((form.get("host_strengths") as string) || "").trim() || null,
    host_catchphrases: csv(form.get("host_catchphrases")),
    host_handles: kvLines(form.get("host_handles")),
    brand_colors: csv(form.get("brand_colors")),
    fonts: csv(form.get("fonts")),
    channel_links: kvLines(form.get("channel_links")),
    posting_cadence: ((form.get("posting_cadence") as string) || "").trim() || null,
    clips_per_episode: Math.max(0, parseInt((form.get("clips_per_episode") as string) || "5", 10) || 5),
    primary_goal: ((form.get("primary_goal") as string) || "").trim() || null,
    notes: ((form.get("notes") as string) || "").trim() || null,
  };

  const { error } = await sb.from("brand_config").update(patch).eq("id", existing.id);
  if (error) throw error;
  revalidatePath("/settings");
  revalidatePath("/");
}
