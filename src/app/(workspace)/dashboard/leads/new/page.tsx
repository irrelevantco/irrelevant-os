import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeading } from "@/components/page-heading";
import { ProspectForm } from "@/components/forms";
import { Card } from "@/components/ui/card";
export const metadata = { title: "Add business" };
export default function NewLead() {
  return (
    <div className="max-w-3xl">
      <Link
        href="/dashboard/leads"
        className="mb-7 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-3.5" />
        All leads
      </Link>
      <PageHeading
        eyebrow="A new connection / 01"
        title="Start with a good fit."
        description="Record public business information and its source. Every new lead starts as Discovered."
      />
      <Card className="p-5 sm:p-7">
        <ProspectForm />
      </Card>
    </div>
  );
}
