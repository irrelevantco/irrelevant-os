import { headers } from "next/headers";
import { AcquisitionRunner } from "@/components/acquisition/runner";
import { LogOut, Search } from "lucide-react";
import { requireContext } from "@/lib/context";
import { Sidebar } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { signOut, switchOrganization } from "@/app/actions";
import { WorkspaceTransition } from "@/components/workspace-transition";
export const dynamic = "force-dynamic";
export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { db, user, organization, memberships, role } = await requireContext();
  const automatic =
    role === "owner"
      ? await db.rpc("acquisition_state", {
          org: organization.id,
          payload: { metrics_only: true },
        })
      : null;
  const engine =
    role === "owner"
      ? await db.rpc("engine_control", {
          org: organization.id,
          payload: { op: "policy_status" },
        })
      : null;
  const automaticEnabled =
    (engine?.data as { enabled?: boolean } | null)?.enabled === true ||
    (automatic?.data as { settings?: { enabled?: boolean } } | null)?.settings
      ?.enabled === true;
  return (
    <div className="min-h-screen">
      <Sidebar organization={organization.name} />
      {role === "owner" && automaticEnabled && (
        <AcquisitionRunner
          desktop={
            process.env.IRRELEVANT_DESKTOP === "true" ||
            ((await headers()).get("user-agent")?.includes("Electron/") ??
              false)
          }
        />
      )}
      <div className="lg:ml-60">
        <header className="flex min-h-20 flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-9">
          <form
            action="/dashboard/leads"
            className="flex items-center gap-2 text-muted-foreground"
          >
            <Search className="size-4" />
            <label htmlFor="workspace-search" className="sr-only">
              Search businesses
            </label>
            <input
              id="workspace-search"
              name="q"
              type="search"
              placeholder="Find a business…"
              maxLength={160}
              className="h-8 w-40 bg-transparent text-base sm:text-sm outline-none placeholder:text-muted-foreground sm:w-52"
            />
            <button
              type="submit"
              className="eyebrow rounded border border-border px-1.5 py-1 text-[9px] hover:text-primary"
            >
              Search
            </button>
          </form>
          <div className="flex items-center gap-3">
            {memberships.length > 1 && (
              <form action={switchOrganization} className="flex gap-2">
                <label htmlFor="org-switch" className="sr-only">
                  Active organization
                </label>
                <select
                  id="org-switch"
                  name="organization_id"
                  defaultValue={organization.id}
                  className="max-w-36 rounded border border-border bg-card p-1.5 text-base sm:text-xs"
                >
                  {memberships.map((m) => (
                    <option key={m.organization.id} value={m.organization.id}>
                      {m.organization.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" variant="outline" type="submit">
                  Switch
                </Button>
              </form>
            )}
            <span className="hidden max-w-44 truncate text-xs text-muted-foreground xl:block">
              {user.email}
            </span>
            <div
              className="flex size-8 items-center justify-center rounded-full border border-border bg-secondary text-xs font-medium"
              aria-hidden="true"
            >
              {(user.email ?? "U").slice(0, 1).toUpperCase()}
            </div>
            <form action={signOut}>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut />
              </Button>
            </form>
          </div>
        </header>
        <main
          id="main"
          className="mx-auto max-w-[1600px] px-5 py-8 sm:px-9 sm:py-10"
        >
          <WorkspaceTransition>{children}</WorkspaceTransition>
        </main>
        <footer className="mx-5 flex flex-wrap justify-between gap-2 border-t border-border py-5 text-[10px] text-muted-foreground sm:mx-9">
          <span>iRRELEVANT OS / Build your position.</span>
          <span>
            Private workspace · Times shown in Eastern Time · Map data:{" "}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              © OpenStreetMap contributors / ODbL
            </a>
          </span>
        </footer>
      </div>
    </div>
  );
}
