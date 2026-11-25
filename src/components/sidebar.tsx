"use client";
import Link from "next/link";
import Form from "next/form";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Menu, Search, X } from "lucide-react";
import { APP_VERSION } from "@/lib/version";
import { workspaceNavigation } from "@/lib/workspace-navigation";
import { Brand } from "./brand";
import { cn } from "@/lib/utils";
import { NavigationPending } from "./navigation-pending";

function SidebarContents({
  organization,
  close,
}: {
  organization: string;
  close?: () => void;
}) {
  const path = usePathname();
  const searchId = useId();
  return (
    <>
      <div className="flex items-start justify-between gap-2 px-5 pb-5 pt-6">
        <div>
          <Brand />
          <p className="ml-[46px] mt-1 text-[9px] tracking-[.15em] text-muted-foreground">
            iRRELEVANT CO.
          </p>
        </div>
        {close && (
          <button
            type="button"
            onClick={close}
            aria-label="Close workspace navigation"
            className="-mr-2 rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <Form
        action="/dashboard/leads"
        onSubmit={() => close?.()}
        className="mx-4 mb-5 flex min-w-0 items-center rounded-lg border border-border bg-background px-2.5 focus-within:border-primary/60"
      >
        <label htmlFor={searchId} className="sr-only">
          Search businesses
        </label>
        <input
          id={searchId}
          name="q"
          type="search"
          placeholder="Find a business…"
          maxLength={160}
          className="h-10 w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-xs"
        />
        <button
          type="submit"
          aria-label="Run business search"
          className="rounded p-1 text-muted-foreground hover:text-primary"
        >
          <Search className="size-4" />
        </button>
      </Form>
      <nav
        aria-label="Workspace navigation"
        className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 pb-5"
      >
        {workspaceNavigation.map((group) => (
          <div key={group.title}>
            <p className="eyebrow mb-2 px-3 text-muted-foreground">
              {group.title}
            </p>
            <div className="space-y-1">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active =
                  href === "/dashboard"
                    ? path === href
                    : path === href || path.startsWith(`${href}/`);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-label={label}
                    aria-current={active ? "page" : undefined}
                    onNavigate={() => {
                      if (path === href) close?.();
                    }}
                    className={cn(
                      "workspace-nav-link flex min-h-10 items-center gap-3 rounded-lg border px-3 py-2.5 text-[13px] transition-colors duration-150 md:min-h-9 md:py-2",
                      active
                        ? "border-primary/25 bg-primary/10 text-primary"
                        : "border-transparent text-foreground/85 hover:border-border hover:bg-secondary",
                    )}
                  >
                    <Icon className="size-4 shrink-0" strokeWidth={1.6} />
                    <span>{label}</span>
                    <NavigationPending label={label} />
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-border p-4">
        <div className="rounded-lg border border-border bg-card/50 px-3 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-primary"
            />
            Private workspace
          </p>
          <div className="mt-1 flex min-w-0 items-center justify-between gap-2 pl-3.5">
            <p
              title={organization}
              className="min-w-0 truncate text-[11px] text-muted-foreground"
            >
              {organization}
            </p>
            <span className="shrink-0 text-[9px] text-muted-foreground">
              v{APP_VERSION}
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

export function Sidebar({ organization }: { organization: string }) {
  const path = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const openedPath = useRef<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  const close = () => dialog.current?.close();
  useEffect(() => {
    // A freshly hydrated page may receive a replayed menu click before effects.
    // Only close a drawer opened for a different route, never that first click.
    if (dialog.current?.open && openedPath.current !== window.location.pathname)
      dialog.current.close();
  }, [path]);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const resize = () => {
      if (desktop.matches) dialog.current?.close();
    };
    desktop.addEventListener("change", resize);
    return () => desktop.removeEventListener("change", resize);
  }, []);
  useEffect(() => {
    if (!open) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
    };
  }, [open]);
  return (
    <>
      <aside
        aria-label="Workspace sidebar"
        className="fixed inset-y-0 left-0 z-30 hidden w-[216px] flex-col border-r border-border bg-[#131411] md:flex"
      >
        <SidebarContents organization={organization} />
      </aside>
      <button
        ref={trigger}
        type="button"
        aria-label="Open workspace navigation"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={id}
        className="shrink-0 rounded-lg border border-border p-2.5 hover:bg-secondary md:hidden"
        onClick={() => {
          openedPath.current = window.location.pathname;
          dialog.current?.showModal();
          setOpen(true);
          dialog.current
            ?.querySelector<HTMLButtonElement>(
              '[aria-label="Close workspace navigation"]',
            )
            ?.focus();
        }}
      >
        <Menu className="size-4" />
      </button>
      <dialog
        id={id}
        ref={dialog}
        aria-label="Workspace menu"
        className="workspace-drawer"
        onClose={() => {
          setOpen(false);
          trigger.current?.focus({ preventScroll: true });
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <SidebarContents organization={organization} close={close} />
        </div>
      </dialog>
    </>
  );
}
