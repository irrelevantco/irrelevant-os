import Link from "next/link";
export default function NotFound() {
  return (
    <main id="main" className="p-10 py-24">
      <p className="eyebrow text-primary">404 / No record here</p>
      <h1 className="editorial my-5 text-5xl">A different direction.</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        This page or record is unavailable in your current workspace.
      </p>
      <Link href="/dashboard" className="text-sm text-primary underline">
        Back to overview →
      </Link>
    </main>
  );
}
