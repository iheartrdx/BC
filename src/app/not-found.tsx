import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md pt-24 text-center">
      <div className="font-display text-5xl">404</div>
      <p className="mt-2 text-sm text-paper/70">That page wandered off.</p>
      <Link href="/" className="btn btn-ghost mt-6">
        Back to mission control
      </Link>
    </div>
  );
}
