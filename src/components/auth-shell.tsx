import { Brand } from "./brand";
export function AuthShell({
  children,
  eyebrow,
  title,
  description,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="grid-paper hidden flex-col justify-between border-r border-border p-14 lg:flex">
        <Brand />
        <div>
          <p className="eyebrow mb-6 text-primary">A little more intention.</p>
          <p className="editorial max-w-lg text-[88px] leading-[.98]">
            The next
            <br />
            chapter is
            <br />
            <span className="italic text-primary">yours to build.</span>
          </p>
          <p className="mt-8 max-w-xs text-sm leading-6 text-muted-foreground">
            A focused operating system for the work that moves your business
            forward.
          </p>
        </div>
        <p className="eyebrow text-muted-foreground">
          iRRELEVANT CO · Build your position.
        </p>
      </aside>
      <main id="main" className="flex flex-col px-6 py-8 sm:px-12">
        <div className="lg:hidden">
          <Brand />
        </div>
        <div className="m-auto w-full max-w-sm py-16">
          <p className="eyebrow mb-4 text-primary">{eyebrow}</p>
          <h1 className="editorial text-5xl leading-tight">{title}</h1>
          <p className="mb-8 mt-4 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          {children}
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          Private workspace · Human-led growth
        </p>
      </main>
    </div>
  );
}
