import "server-only";
import type { Db } from "../acquisition/google";
import type { Json } from "../supabase/database.types";
export async function engineRpc(
  db: Db,
  org: string,
  op: string,
  payload: Record<string, Json | undefined> = {},
) {
  const result = await db.rpc("engine_control", {
    org,
    payload: { ...payload, op },
  });
  if (result.error) throw Error(result.error.message.slice(0, 400));
  return result.data;
}
