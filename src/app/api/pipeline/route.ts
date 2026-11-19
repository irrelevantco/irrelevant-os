import { z } from "zod";
import { STATUSES } from "@/lib/domain";
import { pipelinePage } from "@/lib/pipeline-data";
export async function GET(request: Request) {
  const parsed = z
    .object({
      query: z.string().max(160).default(""),
      stage: z.enum(STATUSES).optional(),
      page: z.coerce.number().int().min(1).max(100000).default(1),
    })
    .safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success)
    return Response.json(
      { error: "Invalid pipeline request." },
      { status: 400 },
    );
  try {
    return Response.json(await pipelinePage(parsed.data), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Pipeline could not refresh. Check sign-in and the database update.",
      },
      { status: 503 },
    );
  }
}
