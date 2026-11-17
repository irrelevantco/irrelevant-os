import Link from "next/link";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
export default function Home() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-7xl items-center justify-between border-b border-border px-6 py-6 sm:px-12">
        <Brand />
        <Button asChild variant="outline">
          <Link href="/login">
            Workspace
            <ArrowUpRight />
          </Link>
        </Button>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-6 sm:px-12">
        <div className="grid gap-12 py-24 lg:grid-cols-[1.5fr_1fr] lg:py-36">
          <div>
            <p className="eyebrow mb-8 flex items-center gap-3 text-primary">
              <span className="h-px w-8 bg-primary" />
              iRRELEVANT CO / Operating system
            </p>
            <h1 className="editorial text-7xl leading-[.95] sm:text-8xl lg:text-[112px]">
              Build your
              <br />
              <span className="italic text-primary">position.</span>
            </h1>
            <p className="mt-9 max-w-md text-base leading-7 text-muted-foreground">
              Good work deserves the right opportunities. A focused workspace to
              find your next client, move the conversation forward, and build a
              stronger business.
            </p>
            <Button asChild className="mt-9">
              <Link href="/login">
                Open your workspace
                <ArrowUpRight />
              </Link>
            </Button>
          </div>
          <div className="grid-paper relative flex min-h-80 items-center justify-center overflow-hidden rounded-lg border border-border">
            <div className="absolute left-6 top-6 eyebrow text-muted-foreground">
              Direction / 001
            </div>
            <div className="relative flex size-56 items-center justify-center rounded-full border border-primary/20">
              <div className="flex size-40 items-center justify-center rounded-full border border-primary/35">
                <ArrowUpRight
                  className="size-28 text-primary"
                  strokeWidth={0.8}
                />
              </div>
              <span className="absolute bottom-5 right-5 size-3 rounded-full bg-primary" />
            </div>
            <p className="absolute bottom-6 left-6 eyebrow text-muted-foreground">
              Intent → Action → Growth
            </p>
          </div>
        </div>
        <div className="grid gap-8 border-t border-border py-12 md:grid-cols-3">
          {[
            [
              "01",
              "Find your fit.",
              "A deliberate pipeline of businesses you can meaningfully help.",
            ],
            [
              "02",
              "Move with purpose.",
              "One place for context, conversations, and the next useful action.",
            ],
            [
              "03",
              "Build for the long term.",
              "A foundation for durable client relationships and sustainable growth.",
            ],
          ].map(([n, title, body]) => (
            <div key={n}>
              <span className="eyebrow text-primary">{n} /</span>
              <h2 className="mt-4 text-xl tracking-tight">{title}</h2>
              <p className="mt-3 max-w-xs text-sm leading-6 text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>
        <footer className="flex items-center justify-between border-t border-border py-6 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} iRRELEVANT CO</span>
          <span className="flex items-center gap-2">
            Built with intention
            <ArrowDown className="size-3" />
          </span>
        </footer>
      </main>
    </div>
  );
}
