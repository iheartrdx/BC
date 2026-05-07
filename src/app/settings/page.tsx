import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { SetupChecklist } from "@/components/SetupChecklist";
import { configured } from "@/lib/env";
import { adminSupabase } from "@/lib/supabase";
import type { BrandConfig } from "@/lib/types";
import { saveBrand } from "./actions";

export const dynamic = "force-dynamic";

async function loadBrand(): Promise<BrandConfig | null> {
  if (!configured.supabaseAdmin) return null;
  const { data } = await adminSupabase().from("brand_config").select("*").limit(1).single();
  return (data as BrandConfig | null) ?? null;
}

export default async function SettingsPage() {
  const brand = await loadBrand();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Settings"
        title="Brand & show identity"
        subtitle="This is the only place you fill out 'who we are' info. Everything else in the dashboard reads from here. Replaces the old Word intake packet."
      />

      {!brand ? (
        <div className="card">
          <p className="text-sm text-paper/80">
            Settings can&apos;t load until Supabase is configured. Add{" "}
            <code className="text-accent">NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code className="text-accent">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>, and{" "}
            <code className="text-accent">SUPABASE_SERVICE_ROLE_KEY</code> to your environment, then run the SQL in{" "}
            <code className="text-accent">supabase/migrations/0001_init.sql</code>.
          </p>
          <div className="mt-4">
            <SetupChecklist />
          </div>
        </div>
      ) : (
        <form action={saveBrand} className="space-y-6">
          <section className="card">
            <h2 className="font-display text-lg">Show</h2>
            <Field label="Show name" name="show_name" defaultValue={brand.show_name} required />
            <Field label="Tagline" name="tagline" defaultValue={brand.tagline ?? ""} />
            <Field
              label="Short description"
              name="short_desc"
              defaultValue={brand.short_desc ?? ""}
              hint="One or two sentences — used as default video description prefix."
              textarea
            />
            <Field
              label="Long description / mission"
              name="long_desc"
              defaultValue={brand.long_desc ?? ""}
              textarea
              rows={4}
            />
            <Field label="Target audience" name="target_audience" defaultValue={brand.target_audience ?? ""} />
            <Field
              label="Tone"
              name="tone"
              defaultValue={brand.tone ?? ""}
              hint="e.g. casual, educational, controversial, funny"
            />
          </section>

          <section className="card">
            <h2 className="font-display text-lg">Topics</h2>
            <Field
              label="Topics that should appear regularly"
              name="topics_in"
              defaultValue={brand.topics_in.join(", ")}
              hint="Comma-separated."
              textarea
            />
            <Field
              label="Topics to avoid"
              name="topics_out"
              defaultValue={brand.topics_out.join(", ")}
              hint="Comma-separated."
              textarea
            />
          </section>

          <section className="card">
            <h2 className="font-display text-lg">Host</h2>
            <Field label="Host name" name="host_name" defaultValue={brand.host_name ?? ""} />
            <Field
              label="Host strengths on camera"
              name="host_strengths"
              defaultValue={brand.host_strengths ?? ""}
              textarea
            />
            <Field
              label="Recurring catchphrases"
              name="host_catchphrases"
              defaultValue={(brand.host_catchphrases ?? []).join(", ")}
              hint="Comma-separated."
            />
            <Field
              label="Host social handles (one per line, format: platform=handle)"
              name="host_handles"
              defaultValue={Object.entries(brand.host_handles ?? {})
                .map(([k, v]) => `${k}=${v}`)
                .join("\n")}
              textarea
              rows={4}
            />
          </section>

          <section className="card">
            <h2 className="font-display text-lg">Brand assets</h2>
            <Field
              label="Brand colors (hex, comma-separated)"
              name="brand_colors"
              defaultValue={brand.brand_colors.join(", ")}
            />
            <Field label="Fonts (comma-separated)" name="fonts" defaultValue={brand.fonts.join(", ")} />
            <Field
              label="Channel links (one per line: platform=url)"
              name="channel_links"
              defaultValue={Object.entries(brand.channel_links ?? {})
                .map(([k, v]) => `${k}=${v}`)
                .join("\n")}
              textarea
              rows={4}
            />
          </section>

          <section className="card">
            <h2 className="font-display text-lg">Production goals</h2>
            <Field
              label="Posting cadence"
              name="posting_cadence"
              defaultValue={brand.posting_cadence ?? ""}
              hint="e.g. 1 long-form / week + 3 Shorts"
            />
            <Field
              label="Clips per episode"
              name="clips_per_episode"
              type="number"
              defaultValue={String(brand.clips_per_episode)}
            />
            <Field
              label="Primary growth goal"
              name="primary_goal"
              defaultValue={brand.primary_goal ?? ""}
              hint="subscribers / clips / revenue / sponsorships"
            />
            <Field label="Notes for the AI producer" name="notes" defaultValue={brand.notes ?? ""} textarea />
          </section>

          <div className="flex items-center justify-between">
            <Link href="/" className="text-sm text-muted hover:text-paper">
              ← Back to mission control
            </Link>
            <button type="submit" className="btn btn-primary">
              Save brand settings
            </button>
          </div>
        </form>
      )}

      <div className="mt-12">
        <SetupChecklist />
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  hint,
  textarea,
  rows,
  type,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  hint?: string;
  textarea?: boolean;
  rows?: number;
  type?: string;
  required?: boolean;
}) {
  return (
    <div className="mb-4">
      <label className="field-label">{label}</label>
      {textarea ? (
        <textarea name={name} defaultValue={defaultValue} rows={rows ?? 2} className="field-input" />
      ) : (
        <input
          name={name}
          defaultValue={defaultValue}
          type={type ?? "text"}
          required={required}
          className="field-input"
        />
      )}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
