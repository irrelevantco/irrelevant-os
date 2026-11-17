import Link from "next/link";
export default function WorkspaceNotFound() {
  return (
    <section className="py-16">
      <p className="eyebrow text-primary">404 / No record here</p>
      <h1 className="editorial my-5 text-5xl">A different direction.</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        This record is unavailable in your current organization. Use the
        organization switcher to choose another workspace.
      </p>
      <Link href="/dashboard" className="text-sm text-primary underline">
        Back to overview →
      </Link>
    </section>
  );
}
