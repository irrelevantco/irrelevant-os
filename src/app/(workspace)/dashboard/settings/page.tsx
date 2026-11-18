import { supabaseConfig } from "@/lib/supabase/config";
import { requireContext } from "@/lib/context";
import { PageHeading } from "@/components/page-heading";
import { OrganizationForm } from "@/components/forms";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InstallApp } from "@/components/install-app";
import Link from "next/link";
export const metadata = { title: "Settings" };
export default async function Settings() {
  const { organization, user, role } = await requireContext();
  const backend = supabaseConfig().url;
  const appUrl = process.env.APP_URL;
  const hostedUrl =
    appUrl?.startsWith("https://") && backend?.startsWith("https://")
      ? new URL(appUrl).origin
      : null;
  return (
    <>
      <PageHeading
        eyebrow="Workspace / Settings"
        title="A solid foundation."
        description="Manage your organization and keep your workspace in order."
      />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-base font-medium">Organization</h2>
            <Badge>{role}</Badge>
          </div>
          {role === "owner" ? (
            <OrganizationForm name={organization.name} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {organization.name} · Contact your owner to rename this workspace.
            </p>
          )}
          <p className="mt-6 break-all text-[10px] leading-5 text-muted-foreground">
            Organization ID: {organization.id}
          </p>
        </Card>
        <Card className="p-6">
          <h2 className="mb-5 text-base font-medium">Your account</h2>
          <p className="break-all text-sm">{user.email}</p>
          <p className="mt-3 text-xs leading-6 text-muted-foreground">
            Authentication is managed by Supabase. Every data request is checked
            against organization membership.
          </p>
          <div className="mt-5 border-t border-border pt-5">
            <p className="eyebrow mb-3 text-muted-foreground">Integrations</p>
            <p className="text-xs leading-6 text-muted-foreground">
              Controlled preparation jobs and manual contact logging are
              available in Agent control. Google connection, approved email
              delivery and appointment controls are available under Connections.
              Contracts and payments remain unconnected.
            </p>
          </div>
        </Card>
        <Card className="p-6">
          <h2 className="mb-5 text-base font-medium">Use it on your phone</h2>
          <InstallApp hostedUrl={hostedUrl} />
          <Link
            href="/dashboard/agents"
            className="mt-4 inline-block text-sm text-primary underline"
          >
            Open agent control
          </Link>
        </Card>
        <Card className="p-6">
          <h2 className="mb-2 text-base font-medium">
            Create another organization
          </h2>
          <p className="mb-5 text-xs leading-6 text-muted-foreground">
            A separate workspace with its own businesses, leads, notes, and
            history. You’ll switch into it after creation.
          </p>
          <OrganizationForm />
        </Card>
      </div>
    </>
  );
}
