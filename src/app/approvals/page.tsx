import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { configured } from "@/lib/env";
import { adminSupabase } from "@/lib/supabase";
import type { Approval } from "@/lib/types";
import { fmtRelative } from "@/lib/format";
import { ApprovalCard } from "./ApprovalCard";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  let pending: Approval[] = [];
  let recent: Approval[] = [];
  if (configured.supabaseAdmin) {
    const sb = adminSupabase();
    const a = await sb.from("approvals").select("*").eq("state", "pending").order("created_at");
    const b = await sb
      .from("approvals")
      .select("*")
      .neq("state", "pending")
      .order("decided_at", { ascending: false })
      .limit(20);
    pending = (a.data as Approval[]) ?? [];
    recent = (b.data as Approval[]) ?? [];
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Inbox"
        title="Approvals"
        subtitle="The dashboard never asks you to write — only to choose. This is where you spend ~10 minutes per episode."
      />

      {!configured.supabaseAdmin ? (
        <div className="card text-sm text-paper/80">Configure Supabase to see approvals.</div>
      ) : pending.length === 0 ? (
        <div className="card text-sm text-paper/80">
          Inbox zero. Run an episode through{" "}
          <Link href="/episodes/new" className="text-accent">
            ingest
          </Link>{" "}
          to populate the queue.
        </div>
      ) : (
        <div className="space-y-4">
          {pending.map((a) => (
            <ApprovalCard key={a.id} approval={a} />
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <div className="mt-10">
          <h2 className="font-display text-lg">Recently decided</h2>
          <ul className="mt-3 divide-y divide-line/60 rounded-lg border border-line">
            {recent.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="text-paper/80">{a.kind.replace(/_/g, " ")}</span>
                <span className="flex items-center gap-3 text-xs text-muted">
                  <span>{a.state}</span>
                  <span>{fmtRelative(a.decided_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
