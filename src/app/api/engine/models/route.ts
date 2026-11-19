import { requireContext } from "@/lib/context";
import { z } from "zod";
export async function GET() {
  const { role } = await requireContext();
  if (role !== "owner") return new Response("Owner required", { status: 403 });
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags", {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(2000),
    });
    if (!response.ok) throw Error();
    const text = await response.text();
    if (text.length > 131072) throw Error();
    const data = z
      .object({
        models: z.array(z.object({ name: z.string().max(100) })).max(100),
      })
      .parse(JSON.parse(text));
    return Response.json(
      { models: data.models.map((m) => m.name) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Local Ollama is unavailable." },
      { status: 503 },
    );
  }
}
