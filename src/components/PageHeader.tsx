export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="text-xs uppercase tracking-widest text-muted">{eyebrow}</div>}
        <h1 className="font-display text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-paper/70">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}
