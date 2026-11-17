"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main id="main" className="mx-auto max-w-lg p-8 py-24">
      <p className="eyebrow text-primary">Connection interrupted</p>
      <h1 className="editorial mt-5 text-4xl">Let’s try that again.</h1>
      <p className="my-6 text-sm leading-6 text-muted-foreground">
        Your workspace could not load. Check that Supabase is running and the
        database migrations are applied. No pending change should be assumed
        saved.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
