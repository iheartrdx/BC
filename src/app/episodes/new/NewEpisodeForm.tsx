"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Phase = "idle" | "creating" | "presigning" | "uploading" | "registering" | "ingesting" | "done" | "error";

export function NewEpisodeForm({ openaiReady }: { openaiReady: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [autoIngest, setAutoIngest] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setErr(null);
    try {
      setPhase("creating");
      const ep = await fetch("/api/episodes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title || file.name }),
      }).then((r) => r.json());
      if (!ep?.id) throw new Error(ep?.error || "Couldn't create episode");

      setPhase("presigning");
      const presign = await fetch("/api/upload/presign", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ episodeId: ep.id, filename: file.name, contentType: file.type || "application/octet-stream" }),
      }).then((r) => r.json());
      if (!presign?.url) throw new Error(presign?.error || "Couldn't get upload URL");

      setPhase("uploading");
      await uploadWithProgress(presign.url, file, file.type, setProgress);

      setPhase("registering");
      await fetch(`/api/episodes/${ep.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_storage_key: presign.key,
          source_mime: file.type,
          source_bytes: file.size,
          status: "uploaded",
        }),
      });

      if (autoIngest && openaiReady) {
        setPhase("ingesting");
        await fetch(`/api/episodes/${ep.id}/ingest`, { method: "POST" });
      }

      setPhase("done");
      router.push(`/episodes/${ep.id}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Upload failed");
      setPhase("error");
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-5">
      <div>
        <label className="field-label">Episode title (you can change it later)</label>
        <input
          className="field-input"
          placeholder="Untitled episode"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div>
        <label className="field-label">Recording file (mp4 / mov / mp3 / wav / m4a)</label>
        <input
          type="file"
          accept="video/*,audio/*"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="field-input file:mr-3 file:rounded file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-ink"
          required
        />
        {file && (
          <p className="mt-1 text-xs text-muted">
            {file.name} — {(file.size / 1024 / 1024).toFixed(1)} MB
          </p>
        )}
      </div>

      <label className="flex items-start gap-3 text-sm text-paper/80">
        <input
          type="checkbox"
          checked={autoIngest}
          onChange={(e) => setAutoIngest(e.target.checked)}
          className="mt-1"
          disabled={!openaiReady}
        />
        <span>
          After upload, automatically transcribe and analyze.
          {!openaiReady && (
            <span className="ml-1 text-muted">(Disabled — add OPENAI_API_KEY to enable.)</span>
          )}
        </span>
      </label>

      {phase !== "idle" && (
        <div className="rounded-md border border-line bg-black/40 p-3 text-sm">
          <PhaseLabel phase={phase} />
          {phase === "uploading" && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded bg-line">
              <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          {err && <div className="mt-2 text-red-300">{err}</div>}
        </div>
      )}

      <button
        type="submit"
        className="btn btn-primary"
        disabled={!file || (phase !== "idle" && phase !== "error")}
      >
        Upload + start pipeline
      </button>
    </form>
  );
}

function PhaseLabel({ phase }: { phase: Phase }) {
  const map: Record<Phase, string> = {
    idle: "",
    creating: "Creating episode record…",
    presigning: "Requesting secure upload link…",
    uploading: "Uploading to Cloudflare R2…",
    registering: "Linking file to episode…",
    ingesting: "Kicking off transcription + analysis…",
    done: "Done.",
    error: "Something went wrong.",
  };
  return <span className="text-paper/80">{map[phase]}</span>;
}

function uploadWithProgress(
  url: string,
  file: File,
  contentType: string,
  onProgress: (p: number) => void,
) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}
