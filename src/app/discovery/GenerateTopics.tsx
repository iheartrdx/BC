"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function GenerateTopics() {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/discovery/topics", { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || "Failed");
      r.refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-col items-end">
      <button onClick={go} disabled={busy} className="btn btn-primary">
        {busy ? "Thinking…" : "Generate ideas"}
      </button>
      {err && <span className="mt-1 text-xs text-red-300">{err}</span>}
    </div>
  );
}
