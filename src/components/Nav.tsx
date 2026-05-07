import Link from "next/link";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/episodes", label: "Episodes" },
  { href: "/approvals", label: "Approvals" },
  { href: "/discovery", label: "Discovery" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" },
];

export function Nav() {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-line bg-black/40 p-6 md:block">
      <Link href="/" className="block">
        <div className="font-display text-lg leading-tight">Barberic Culture</div>
        <div className="text-xs uppercase tracking-widest text-muted">Media OS</div>
      </Link>
      <nav className="mt-8 flex flex-col gap-1">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-md px-3 py-2 text-sm text-paper/80 transition hover:bg-line/40 hover:text-paper"
          >
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="mt-12 text-[11px] leading-relaxed text-muted">
        AI handles operations.
        <br />
        Humans handle authenticity.
      </div>
    </aside>
  );
}
