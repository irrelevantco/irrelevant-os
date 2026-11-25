import { headers } from "next/headers";
import { AcquisitionRunner } from "@/components/acquisition/runner";
import { LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { WorkspaceBreadcrumb } from "@/components/workspace-breadcrumb";
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
  const { db, organization, memberships, role } = await requireContext();
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
    <div className="workspace-shell min-h-screen">
      {role === "owner" && automaticEnabled && (
        <AcquisitionRunner
          desktop={
            process.env.IRRELEVANT_DESKTOP === "true" ||
            ((await headers()).get("user-agent")?.includes("Electron/") ??
              false)
          }
        />
      )}
      <div className="min-w-0 md:ml-[216px]">
        <header className="flex min-h-[72px] flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3 md:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <Sidebar organization={organization.name} />
            <WorkspaceBreadcrumb />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {memberships.length > 1 && (
              <form action={switchOrganization} className="flex min-w-0 gap-2">
                <label htmlFor="org-switch" className="sr-only">
                  Active organization
                </label>
                <select
                  id="org-switch"
                  name="organization_id"
                  defaultValue={organization.id}
                  className="max-w-32 rounded border border-border bg-card p-1.5 text-base sm:text-xs"
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
            <span className="hidden items-center gap-2 text-xs text-muted-foreground xl:inline-flex">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-primary"
              />
              Private workspace
            </span>
            <Button asChild size="sm">
              <Link href="/dashboard/leads/new">
                <Plus />
                New business
              </Link>
            </Button>
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
          className="mx-auto max-w-[1600px] px-5 py-7 md:px-7 md:py-8"
        >
          <WorkspaceTransition>{children}</WorkspaceTransition>
        </main>
        <footer className="mx-5 flex flex-wrap justify-between gap-2 border-t border-border py-5 text-[10px] text-muted-foreground md:mx-7">
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
