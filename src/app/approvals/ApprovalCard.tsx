"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Approval } from "@/lib/types";

export function ApprovalCard({ approval }: { approval: Approval }) {
  const r = useRouter();
  const [picked, setPicked] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const options =
    (approval.payload as { options?: Array<Record<string, unknown>> }).options ??
    (approval.payload as { items?: Array<Record<string, unknown>> }).items ??
    [];

  async function decide(state: "approved" | "rejected") {
    setBusy(true);
    await fetch(`/api/approvals/${approval.id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        state,
        decision: picked != null ? options[picked] : null,
      }),
    });
    setBusy(false);
    r.refresh();
  }

  return (
    <div className="card">
      <div className="mb-3 flex items-center justify-between">
        <span className="pill">{approval.kind.replace(/_/g, " ")}</span>
        <span className="text-xs text-muted">{new Date(approval.created_at).toLocaleString()}</span>
      </div>

      {options.length > 0 ? (
        <ul className="space-y-2">
          {options.map((opt, i) => (
            <li key={i}>
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${
                  picked === i ? "border-accent bg-accent/10" : "border-line/60"
                }`}
              >
                <input
                  type="radio"
                  name={`opt-${approval.id}`}
                  className="mt-1"
                  checked={picked === i}
                  onChange={() => setPicked(i)}
                />
                <span>
                  <OptionLabel option={opt} />
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <pre className="overflow-auto rounded bg-black/40 p-3 text-xs text-paper/80">
          {JSON.stringify(approval.payload, null, 2)}
        </pre>
      )}

      <div className="mt-4 flex gap-2">
        <button
          className="btn btn-primary"
          disabled={busy || (options.length > 0 && picked == null)}
          onClick={() => decide("approved")}
        >
          Approve
        </button>
        <button className="btn btn-danger" disabled={busy} onClick={() => decide("rejected")}>
          Reject all
        </button>
      </div>
    </div>
  );
}

function OptionLabel({ option }: { option: Record<string, unknown> }) {
  if (typeof option.text === "string") {
    return (
      <>
        <span className="block text-paper">{option.text as string}</span>
        {typeof option.rationale === "string" && (
          <span className="mt-1 block text-xs text-muted">{option.rationale}</span>
        )}
      </>
    );
  }
  if (typeof option.concept === "string") {
    return (
      <>
        <span className="block text-paper">{option.concept as string}</span>
        {typeof option.text_overlay === "string" && (
          <span className="mt-1 block text-xs text-muted">Overlay: {option.text_overlay as string}</span>
        )}
      </>
    );
  }
  return <span className="text-paper/80">{JSON.stringify(option)}</span>;
}
