import Link from "next/link";
import Image from "next/image";
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2.5"
      aria-label="iRRELEVANT OS home"
    >
      <Image
        src="/brand-ir.svg"
        alt=""
        width={36}
        height={36}
        unoptimized
        className="size-9 shrink-0 rounded-[4px]"
      />
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
