"use client";
import { useActionState, useState } from "react";
import { enqueueJob } from "@/app/agent-actions";
import { TERRITORIES } from "@/lib/engine/contracts";
import { FREE_CATEGORIES } from "@/lib/agents/discovery-options";
import { Field, Submit } from "@/components/forms";
import { Select } from "@/components/ui/input";
import { Feedback } from "@/components/research/import-form";
export function DiscoveryChoices({ requestKey }: { requestKey: string }) {
  const [state, action] = useActionState(enqueueJob, {}),
    [place, setPlace] = useState("0");
  const territory = TERRITORIES[Number(place)];
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kind" value="discovery" />
      <input type="hidden" name="provider" value="osm" />
      <input type="hidden" name="request_key" value={requestKey} />
      <input type="hidden" name="city" value={territory.city} />
      <input type="hidden" name="state" value={territory.state} />
      <Field label="Choose an area">
        <Select value={place} onChange={(e) => setPlace(e.target.value)}>
          {TERRITORIES.map((t, i) => (
            <option value={i} key={`${t.city}:${t.state}`}>
              {t.city}, {t.state}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Choose a business category">
        <Select name="category" defaultValue="plumber">
          {Object.entries(FREE_CATEGORIES).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Candidate target">
        <Select name="count" defaultValue="5">
          <option value="5">Up to 5 candidates</option>
          <option value="10">Up to 10 candidates</option>
        </Select>
      </Field>
      <p className="text-xs leading-6 text-muted-foreground">
        Free OpenStreetMap search. Three manual requests/day, at least one
        minute apart. Coverage varies; listings and contact information require
        research. Attribution: OpenStreetMap contributors, ODbL. Scheduled
        searches use the separate approved engine allowance.
      </p>
      <Feedback state={state} />
      <Submit>Queue free business search</Submit>
    </form>
  );
}
