"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { MoreHorizontal, Trash2, Undo2, X } from "lucide-react";
import { removeLead, restoreLead } from "@/app/lead-trash-actions";
import { type ActionState } from "@/lib/domain";
import { Button } from "./ui/button";

type Identity = { id: string; name: string; updatedAt: string };
const MenuContext = createContext<null | {
  open: (x: number, y: number) => void;
  name: string;
  expanded: boolean;
}>(null);

export function LeadMenuButton() {
  const menu = useContext(MenuContext);
  if (!menu) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      type="button"
      aria-label={`Actions for ${menu.name}`}
      aria-haspopup="menu"
      aria-expanded={menu.expanded}
      className="size-8 shrink-0 p-0"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        menu.open(rect.right - 208, rect.bottom + 4);
      }}
    >
      <MoreHorizontal />
    </Button>
  );
}

export function LeadItem({
  lead,
  canDelete = false,
  returnTo,
  as: Tag = "article",
  children,
  className,
}: {
  lead: Identity;
  canDelete?: boolean;
  returnTo: "/dashboard/leads" | "/dashboard/pipeline";
  as?: "article" | "tr";
  children: React.ReactNode;
  className?: string;
}) {
  const [position, setPosition] = useState<null | {
    left: number;
    top: number;
  }>(null);
  const [confirming, setConfirming] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  function open(x: number, y: number) {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - 216)),
      top: Math.max(8, Math.min(y, window.innerHeight - 112)),
    });
  }
  function close() {
    setPosition(null);
    opener.current?.focus();
  }
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setPosition(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPosition(null);
        opener.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [position]);
  return (
    <MenuContext.Provider
      value={canDelete ? { open, name: lead.name, expanded: !!position } : null}
    >
      <Tag
        className={className}
        onContextMenu={
          canDelete
            ? (event) => {
                event.preventDefault();
                open(event.clientX, event.clientY);
              }
            : undefined
        }
        onKeyDown={
          canDelete
            ? (event) => {
                if (
                  event.key === "ContextMenu" ||
                  (event.shiftKey && event.key === "F10")
                ) {
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  open(rect.left + 16, rect.top + 16);
                }
              }
            : undefined
        }
      >
        {children}
      </Tag>
      {position &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={`Lead actions for ${lead.name}`}
            style={position}
            className="fixed z-50 w-52 rounded-md border border-border bg-card p-1.5 shadow-xl"
            onKeyDown={(event) => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
                return;
              event.preventDefault();
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLElement>(
                  '[role="menuitem"]',
                ),
              );
              const i = items.indexOf(document.activeElement as HTMLElement);
              items[
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? items.length - 1
                    : (i +
                        (event.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                      items.length
              ]?.focus();
            }}
          >
            <Link
              role="menuitem"
              href={`/dashboard/leads/${lead.id}`}
              className="block rounded px-3 py-2 text-sm hover:bg-secondary"
              onClick={close}
            >
              Open lead
            </Link>
            <button
              role="menuitem"
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm text-red-300 hover:bg-secondary"
              onClick={() => {
                setPosition(null);
                setConfirming(true);
              }}
            >
              <Trash2 className="size-4" />
              Delete lead…
            </button>
          </div>,
          document.body,
        )}
      {confirming &&
        createPortal(
          <RemoveDialog
            lead={lead}
            returnTo={returnTo}
            onClose={() => {
              setConfirming(false);
              opener.current?.focus();
            }}
          />,
          document.body,
        )}
    </MenuContext.Provider>
  );
}

function RemoveDialog({
  lead,
  returnTo,
  onClose,
}: {
  lead: Identity;
  returnTo: "/dashboard/leads" | "/dashboard/pipeline";
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, action, pending] = useActionState<ActionState, FormData>(
    removeLead,
    {},
  );
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="remove-lead-title"
      aria-describedby="remove-lead-description"
      onCancel={(event) => {
        if (pending) event.preventDefault();
      }}
      onClose={onClose}
      className="m-auto w-[calc(100%_-_2rem)] max-w-lg rounded-lg border border-border bg-card p-6 text-foreground shadow-2xl backdrop:bg-black/75"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 id="remove-lead-title" className="text-lg font-medium">
          Delete lead?
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          aria-label="Close deletion dialog"
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      <p className="mt-4 break-words font-medium">{lead.name}</p>
      <p
        id="remove-lead-description"
        className="mt-3 text-sm leading-6 text-muted-foreground"
      >
        Move this lead to Trash and remove it from the active CRM and its
        metrics. Notes, research, business details and contact history are kept.
        Queued preparation and unsent delivery approvals are cancelled. You can
        restore the lead from Trash.
      </p>
      <form action={action} className="mt-6">
        <input type="hidden" name="id" value={lead.id} />
        <input
          type="hidden"
          name="expected_updated_at"
          value={lead.updatedAt}
        />
        <input type="hidden" name="return_to" value={returnTo} />
        <input type="hidden" name="confirmed" value="yes" />
        {state.error && (
          <p role="alert" className="mb-4 text-sm text-red-300">
            {state.error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={pending}
            className="bg-red-300 text-black hover:bg-red-200"
          >
            <Trash2 />
            {pending ? "Removing…" : "Move to Trash"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

export function RestoreLeadButton({
  id,
  updatedAt,
}: {
  id: string;
  updatedAt: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(
    restoreLead,
    {},
  );
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="expected_updated_at" value={updatedAt} />
      <Button variant="outline" size="sm" disabled={pending}>
        <Undo2 />
        {pending ? "Restoring…" : "Restore lead"}
      </Button>
      {state.error && (
        <p role="alert" className="mt-2 text-xs text-red-300">
          {state.error}
        </p>
      )}
    </form>
  );
}
