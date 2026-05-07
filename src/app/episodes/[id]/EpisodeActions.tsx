"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function IngestButton({
  episodeId,
  status,
}: {
  episodeId: string;
  status: string;
}) {
  const r = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const can = status === "uploaded" || status === "error" || status === "assets_ready" || status === "awaiting_approval";

  async function go() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/episodes/${episodeId}/ingest`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Ingest failed");
      r.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Ingest failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-end">
      <button onClick={go} disabled={!can || loading} className="btn btn-primary">
        {loading ? "Running…" : status === "uploaded" ? "Run pipeline" : "Re-run pipeline"}
      </button>
      {err && <span className="mt-1 text-xs text-red-300">{err}</span>}
    </div>
  );
}

export function ApproveTitleForm({
  episodeId,
  titles,
  approved,
}: {
  episodeId: string;
  titles: { text: string; rationale: string }[];
  approved: string | null;
}) {
  const r = useRouter();
  const [picked, setPicked] = useState<string | null>(approved);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!picked) return;
    setSaving(true);
    await fetch(`/api/episodes/${episodeId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approved_title: picked }),
    });
    setSaving(false);
    r.refresh();
  }

  return (
    <div className="mt-3 space-y-2">
      {titles.map((t, i) => (
        <label
          key={i}
          className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${
            picked === t.text ? "border-accent bg-accent/10" : "border-line/60"
          }`}
        >
          <input
            type="radio"
            name="title"
            className="mt-1"
            checked={picked === t.text}
            onChange={() => setPicked(t.text)}
          />
          <span>
            <span className="block text-paper">{t.text}</span>
            <span className="mt-1 block text-xs text-muted">{t.rationale}</span>
          </span>
        </label>
      ))}
      <button onClick={save} className="btn btn-primary" disabled={!picked || saving || picked === approved}>
        {approved && picked === approved ? "Approved" : saving ? "Saving…" : "Approve title"}
      </button>
    </div>
  );
}
