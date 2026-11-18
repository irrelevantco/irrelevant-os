import { z } from "zod";

export const leadTrashSchema = z.object({
  id: z.uuid(),
  expected_updated_at: z.iso.datetime({ offset: true }),
  confirmed: z.literal("yes", "Confirm the lead removal first."),
  return_to: z.enum(["/dashboard/leads", "/dashboard/pipeline"]),
});
export const restoreLeadSchema = leadTrashSchema.pick({
  id: true,
  expected_updated_at: true,
});
export const trashListSchema = z.object({
  count: z.number().int().nonnegative(),
  leads: z.array(
    z.object({
      id: z.uuid(),
      business_name: z.string(),
      status: z.string(),
      deleted_at: z.string(),
      updated_at: z.string(),
    }),
  ),
});
