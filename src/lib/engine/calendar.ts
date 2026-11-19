import { z } from "zod";
import { meetingTimes, easternParts } from "../acquisition/contracts";
import { googleJson } from "../acquisition/google-http";
export type Slot = { starts_at: string; ends_at: string };
export function candidateSlots(now = new Date()) {
  const local = easternParts(now),
    result: Slot[] = [];
  for (let day = 0; day < 14; day++) {
    const date = new Date(
      Date.UTC(
        Number(local.year),
        Number(local.month) - 1,
        Number(local.day) + day,
      ),
    )
      .toISOString()
      .slice(0, 10);
    for (let minute = 7 * 60; minute <= 14 * 60 + 30; minute += 30) {
      const time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      try {
        const slot = meetingTimes(`${date}T${time}`, 30, now);
        if (new Date(slot.starts_at).getTime() >= now.getTime() + 1800000)
          result.push(slot);
      } catch {
        /* Weekend, past, or outside the permitted window. */
      }
    }
  }
  return result;
}
export function chooseSlots(candidates: Slot[], busy: Slot[]) {
  return candidates
    .filter(
      (slot) =>
        !busy.some(
          (block) =>
            new Date(block.starts_at) < new Date(slot.ends_at) &&
            new Date(block.ends_at) > new Date(slot.starts_at),
        ),
    )
    .slice(0, 2);
}
export async function availableSlots(
  token: string,
  localBusy: Slot[],
  transport: typeof fetch = fetch,
  now = new Date(),
) {
  const candidates = candidateSlots(now);
  if (!candidates.length) return [];
  const response = z
    .object({
      calendars: z.record(
        z.string(),
        z.object({
          busy: z.array(z.object({ start: z.string(), end: z.string() })),
          errors: z.array(z.unknown()).optional(),
        }),
      ),
    })
    .parse(
      await googleJson(
        "https://www.googleapis.com/calendar/v3/freeBusy",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            timeMin: candidates[0].starts_at,
            timeMax: candidates.at(-1)!.ends_at,
            items: [{ id: "primary" }],
          }),
        },
        transport,
      ),
    );
  if (!response.calendars.primary || response.calendars.primary.errors?.length)
    throw Error("Google Calendar availability could not be confirmed.");
  return chooseSlots(candidates, [
    ...localBusy,
    ...response.calendars.primary.busy.map((block) => ({
      starts_at: block.start,
      ends_at: block.end,
    })),
  ]);
}
