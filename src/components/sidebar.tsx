"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  Plug,
  Activity,
  Workflow,
  FileSpreadsheet,
  FileInput,
  NotebookPen,
  Mail,
  ArrowUpRight,
  Columns3,
  LayoutDashboard,
  Settings2,
  UsersRound,
} from "lucide-react";
import { APP_VERSION } from "@/lib/version";
import { Brand } from "./brand";
import { cn } from "@/lib/utils";
import { NavigationPending } from "./navigation-pending";
const items = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/leads", label: "Leads", icon: UsersRound },
  { href: "/dashboard/pipeline", label: "Pipeline", icon: Columns3 },
  { href: "/dashboard/imports", label: "Imports", icon: FileInput },
  {
    href: "/dashboard/converter",
    label: "Data converter",
    icon: FileSpreadsheet,
  },
  { href: "/dashboard/research", label: "Research", icon: NotebookPen },
  { href: "/dashboard/outreach", label: "Outreach drafts", icon: Mail },
  { href: "/dashboard/agents", label: "iR Agent", icon: Workflow },
  { href: "/dashboard/engine", label: "Acquisition engine", icon: Activity },
  {
    href: "/dashboard/schedule",
    label: "Calls & meetings",
    icon: CalendarDays,
  },
  { href: "/dashboard/connections", label: "Connections", icon: Plug },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
  { href: "/dashboard/settings", label: "Settings", icon: Settings2 },
];
export function Sidebar({ organization }: { organization: string }) {
  const path = usePathname();
  return (
    <aside className="border-b border-border bg-[#131411] lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-60 lg:flex-col lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between px-6 py-6 lg:block lg:px-7 lg:py-8">
        <Brand />
        <span className="max-w-40 truncate text-xs text-muted-foreground lg:hidden">
          {organization}
        </span>
      </div>
      <div className="mx-5 mb-6 hidden rounded-md border border-border bg-card px-3 py-3 lg:block">
        <p className="eyebrow text-muted-foreground">Workspace</p>
        <p className="mt-2 truncate text-sm font-medium">{organization}</p>
      </div>
      <p className="eyebrow mb-3 hidden px-7 text-muted-foreground lg:block">
        Acquisition
      </p>
      <nav
        aria-label="Workspace navigation"
        className="flex gap-1 overflow-x-auto px-3 pb-3 lg:grid lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:px-4 lg:pb-0"
      >
        {items.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/dashboard" ? path === href : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "workspace-nav-link flex shrink-0 items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors duration-150",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="size-4" strokeWidth={1.6} />
              {label}
              <NavigationPending label={label} />
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto hidden px-7 pb-7 lg:block">
        <div className="mb-7 border-t border-border pt-5">
          <ArrowUpRight className="mb-3 size-6 text-primary" strokeWidth={1} />
          <p className="editorial text-2xl">Quality over quantity.</p>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            The right conversation starts with the right opportunity.
          </p>
        </div>
        <div className="flex items-center justify-between">
          <span className="eyebrow text-muted-foreground">
            Acquisition / v{APP_VERSION}
          </span>
          <span className="size-1.5 rounded-full bg-primary" />
        </div>
      </div>
    </aside>
  );
}
