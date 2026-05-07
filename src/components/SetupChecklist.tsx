import { configured, integrationLabels, IntegrationKey } from "@/lib/env";

const order: IntegrationKey[] = [
  "supabase",
  "supabaseAdmin",
  "openai",
  "r2",
  "youtube",
  "opusclip",
  "descript",
  "make",
];

const required: IntegrationKey[] = ["supabase", "supabaseAdmin", "openai", "r2", "youtube"];

export function SetupChecklist() {
  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Setup checklist</h2>
        <span className="text-xs text-muted">From your environment variables</span>
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {order.map((k) => {
          const ok = configured[k];
          const isRequired = required.includes(k);
          return (
            <li key={k} className="flex items-center justify-between gap-3 border-b border-line/60 py-2 last:border-0">
              <span className="flex items-center gap-2">
                <span
                  aria-hidden
                  className={`inline-block h-2.5 w-2.5 rounded-full ${ok ? "bg-emerald-400" : isRequired ? "bg-red-400" : "bg-muted"}`}
                />
                <span className="text-paper">{integrationLabels[k]}</span>
                {!isRequired && <span className="pill">optional</span>}
              </span>
              <span className={`text-xs ${ok ? "text-emerald-300" : "text-muted"}`}>
                {ok ? "configured" : "not set"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-xs text-muted">
        Missing items don&apos;t crash the app — they just leave parts of the dashboard inert. See{" "}
        <code className="text-paper/80">SETUP.md</code> for the order to fill these in.
      </p>
    </div>
  );
}
