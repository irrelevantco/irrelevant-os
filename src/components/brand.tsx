import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5"
      aria-label="iRRELEVANT OS home"
    >
      <span className="flex size-8 items-center justify-center rounded-sm bg-primary font-black tracking-tighter text-primary-foreground">
        iR
        <ArrowUpRight className="size-2.5" strokeWidth={2.5} />
      </span>
      <span className="text-[17px] font-bold tracking-[-.06em]">
        iRRELEVANT
        {!compact && (
          <span className="ml-1 text-[10px] font-normal tracking-widest text-muted-foreground">
            OS
          </span>
        )}
      </span>
    </Link>
  );
}
