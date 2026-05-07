import OpenAI from "openai";
import { env, configured } from "./env";

export function openai() {
  if (!configured.openai) throw new Error("OPENAI_API_KEY not set.");
  return new OpenAI({ apiKey: env.openaiKey });
}

// Generate structured episode assets from a transcript. Returns JSON the
// dashboard stores directly on the episode row.
export async function analyzeTranscript(transcript: string, brand: BrandSummary) {
  const ai = openai();
  const sys = `You are the executive producer for "${brand.show_name}", a YouTube-first podcast.
Tone: ${brand.tone || "casual, conversational, authentic"}.
Audience: ${brand.target_audience || "barbers and barbershop culture fans"}.
Topics that should appear: ${(brand.topics_in || []).join(", ") || "n/a"}.
Topics to avoid: ${(brand.topics_out || []).join(", ") || "n/a"}.
You produce SEO-optimized YouTube assets and short-form clip recommendations.
Always respond with valid JSON matching the requested schema.`;

  const user = `Episode transcript:
"""
${transcript.slice(0, 60_000)}
"""

Return JSON with this exact shape:
{
  "titles": [ { "text": "...", "rationale": "why this hooks viewers" } ],   // 5 options
  "descriptions": [ { "text": "...", "rationale": "..." } ],                // 3 options, each <= 1500 chars
  "chapters": [ { "start_seconds": number, "title": "..." } ],              // 5-10 chapters
  "hashtags": ["#barber", ...],                                             // 8-15 items
  "thumbnail_ideas": [ { "concept": "...", "text_overlay": "..." } ],       // 3 options
  "pinned_comment": "single string the host should pin",
  "clip_candidates": [
    {
      "start_seconds": number,
      "end_seconds": number,
      "hook": "the first line that grabs attention",
      "reason": "why this moment will perform",
      "score": number,
      "suggested_title": "...",
      "suggested_caption": "...",
      "hashtags": ["#..."]
    }
  ]                                                                         // 5-10 items, 20-60s each
}`;

  const resp = await ai.chat.completions.create({
    model: env.openaiModel,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: sys },
      { role: "user", content: user },
    ],
  });
  const content = resp.choices[0]?.message?.content || "{}";
  return JSON.parse(content) as AnalyzeResult;
}

export async function suggestTopics(brand: BrandSummary, recentTitles: string[]) {
  const ai = openai();
  const resp = await ai.chat.completions.create({
    model: env.openaiModel,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are a YouTube growth strategist for "${brand.show_name}". Suggest concrete episode topics that would perform well with the show's audience: ${brand.target_audience || "barbers and barbershop culture fans"}. Avoid: ${(brand.topics_out || []).join(", ") || "n/a"}.`,
      },
      {
        role: "user",
        content: `Recent or upcoming titles: ${recentTitles.join(" | ") || "none yet"}.

Return JSON: { "topics": [ { "title": "...", "angle": "...", "rationale": "...", "score": 0.0 } ] } with 8 items.`,
      },
    ],
  });
  return JSON.parse(resp.choices[0]?.message?.content || '{"topics":[]}') as {
    topics: TopicIdea[];
  };
}

// Whisper transcription. Caller streams the file URL or buffer.
export async function transcribeFromUrl(url: string): Promise<TranscriptResult> {
  const ai = openai();
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Failed to fetch source for transcription: ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  const file = new File([buf], "source.audio", { type: r.headers.get("content-type") || "audio/mpeg" });

  const resp = await ai.audio.transcriptions.create({
    file,
    model: env.openaiTranscribeModel,
    response_format: "verbose_json",
  });
  // The verbose response includes segments; pluck what we need.
  const v = resp as unknown as {
    text: string;
    segments?: Array<{ start: number; end: number; text: string }>;
  };
  return { text: v.text, segments: v.segments || [] };
}

export type BrandSummary = {
  show_name: string;
  tagline?: string | null;
  tone?: string | null;
  target_audience?: string | null;
  topics_in?: string[] | null;
  topics_out?: string[] | null;
};

export type AnalyzeResult = {
  titles: { text: string; rationale: string }[];
  descriptions: { text: string; rationale: string }[];
  chapters: { start_seconds: number; title: string }[];
  hashtags: string[];
  thumbnail_ideas: { concept: string; text_overlay: string }[];
  pinned_comment: string;
  clip_candidates: {
    start_seconds: number;
    end_seconds: number;
    hook: string;
    reason: string;
    score: number;
    suggested_title: string;
    suggested_caption: string;
    hashtags: string[];
  }[];
};

export type TopicIdea = {
  title: string;
  angle: string;
  rationale: string;
  score: number;
};

export type TranscriptResult = {
  text: string;
  segments: { start: number; end: number; text: string }[];
};
