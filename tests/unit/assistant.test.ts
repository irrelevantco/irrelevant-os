import { describe, it, expect } from "vitest";
import { ASSISTANT_TASKS, assistantQuerySchema } from "../../src/lib/assistant";
import {
  DEFAULT_SETTINGS,
  engineSettingsSchema,
} from "../../src/lib/engine/contracts";
describe("guided task and schedule boundaries", () => {
  it("accepts only implemented task choices", () => {
    expect(new Set(ASSISTANT_TASKS.map((t) => t.id)).size).toBe(
      ASSISTANT_TASKS.length,
    );
    expect(
      assistantQuerySchema.parse({
        task: "send-everything",
        page: "invalid",
        lead: "other-tenant",
      }),
    ).toEqual({ task: "home", page: 1 });
  });
  it("keeps paginated selections bounded", () => {
    expect(
      assistantQuerySchema.parse({ task: "research", page: "24" }).page,
    ).toBe(24);
    expect(
      assistantQuerySchema.parse({ task: "research", page: "100001" }).page,
    ).toBe(1);
  });
  it("accepts a smaller weekday window and actual cycle choices", () => {
    expect(
      engineSettingsSchema.parse({
        ...DEFAULT_SETTINGS,
        schedule_start_hour: 9,
        schedule_end_hour: 13,
        cycle_minutes: 15,
      }).cycle_minutes,
    ).toBe(15);
    expect(
      engineSettingsSchema.safeParse({
        ...DEFAULT_SETTINGS,
        schedule_start_hour: 6,
      }).success,
    ).toBe(false);
    expect(
      engineSettingsSchema.safeParse({
        ...DEFAULT_SETTINGS,
        schedule_start_hour: 14,
        schedule_end_hour: 13,
      }).success,
    ).toBe(false);
    expect(
      engineSettingsSchema.safeParse({ ...DEFAULT_SETTINGS, cycle_minutes: 2 })
        .success,
    ).toBe(false);
  });
});
