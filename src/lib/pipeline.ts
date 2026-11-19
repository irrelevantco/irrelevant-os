import { STATUSES, type PipelineStatus } from "./domain";
import type { Lead } from "./data";
import { z } from "zod";

export const pipelinePageSchema = z.object({
  query: z.string(),
  total: z.number().int().nonnegative(),
  groups: z
    .array(
      z.object({
        status: z.enum(STATUSES),
        count: z.number().int().nonnegative(),
        page: z.number().int().positive(),
        pages: z.number().int().positive(),
        leads: z
          .array(
            z.object({
              id: z.uuid(),
              status: z.enum(STATUSES),
              updated_at: z.string(),
              estimated_value_cents: z.number().nullable(),
              next_follow_up: z.string().nullable(),
              research_priority: z.enum(["A", "B", "C"]).nullable(),
              business: z.object({
                name: z.string(),
                industry: z.string(),
                location: z.string(),
              }),
            }),
          )
          .max(12),
      }),
    )
    .length(STATUSES.length),
});
export type PipelinePage = z.infer<typeof pipelinePageSchema>;

export type PipelineLead = Pick<
  Lead,
  "id" | "status" | "updated_at" | "estimated_value_cents" | "next_follow_up"
> & {
  business: Pick<Lead["business"], "name" | "industry" | "location">;
};

export const STAGE_PAGE_SIZE = 12;
export function pipelineGroups<
  T extends {
    status: PipelineStatus;
    business: { name: string; industry: string; location: string };
  },
>(leads: T[], query: string) {
  const q = query.trim().toLocaleLowerCase();
  return STATUSES.map((status) => ({
    status,
    leads: leads.filter(
      (l) =>
        l.status === status &&
        (!q ||
          [l.business.name, l.business.industry, l.business.location].some(
            (v) => v.toLocaleLowerCase().includes(q),
          )),
    ),
  }));
}
export function stagePage<T>(items: T[], requested: number) {
  const pages = Math.max(1, Math.ceil(items.length / STAGE_PAGE_SIZE));
  const page = Math.max(1, Math.min(requested, pages));
  return {
    page,
    pages,
    start: (page - 1) * STAGE_PAGE_SIZE,
    items: items.slice((page - 1) * STAGE_PAGE_SIZE, page * STAGE_PAGE_SIZE),
  };
}
