import { describe, it, expect } from "vitest";
import { importFailure } from "../../src/lib/imports/errors";
describe("CSV failure diagnosis", () => {
  it("distinguishes the hosted timeout and atomic rollback from a missing migration", () => {
    expect(importFailure({ code: "57014" }, "preview")).toContain("time limit");
    expect(importFailure({ code: "57014" }, "import")).toContain("rolled back");
    expect(importFailure({ code: "57014" }, "preview")).not.toContain(
      "needs an update",
    );
  });
  it("reports permissions and schema failures without exposing database details", () => {
    expect(importFailure({ code: "42501" }, "preview")).toContain("owner");
    expect(importFailure({ code: "PGRST202" }, "preview")).toContain(
      "needs an update",
    );
    expect(importFailure(null, "preview")).toContain("Check your connection");
  });
});
