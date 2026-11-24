import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
import path from "node:path";
import { missingDatabaseMigration } from "../../src/lib/database-failure";
const require = createRequire(import.meta.url);
const {
  upgradeLocal,
  validateLocalTarget,
} = require("../../desktop/local-upgrade.cjs");
function fake(
  options: {
    versions?: string;
    wrongLabel?: boolean;
    wrongPort?: boolean;
    failApply?: boolean;
  } = {},
) {
  const writes: string[] = [];
  const execute = (args: string[], input?: string) => {
    if (args[0] === "inspect")
      return options.wrongLabel ? "different-stack" : "irrelevant-phase1";
    if (args[0] === "port")
      return options.wrongPort ? "0.0.0.0:54321" : "127.0.0.1:54321";
    if (input?.startsWith("select version"))
      return options.versions ?? "202611170001\n202611170002";
    if (input?.includes("'organizations'"))
      return JSON.stringify({
        organizations: 1,
        memberships: 1,
        businesses: 30,
        leads: 30,
        notes: 5,
      });
    if (input?.includes("'contacts'"))
      return JSON.stringify({
        contacts: true,
        jobs: true,
        settings: true,
        suppression: true,
        claim: true,
      });
    if (input?.trim().startsWith("begin;")) {
      if (options.failApply) throw new Error("synthetic failure");
      writes.push(input);
    }
    return "";
  };
  return { writes, execute };
}
const options = {
  url: "http://127.0.0.1:54321",
  migrationsDirectory: path.resolve("supabase/migrations"),
};
describe("local database updater", () => {
  it("rejects hosted, credential-bearing and nonstandard target URLs", () => {
    for (const url of [
      "https://example.supabase.co",
      "http://127.0.0.1:54322",
      "http://user:password@localhost:54321",
    ])
      expect(() => validateLocalTarget(url)).toThrow();
  });
  it("refuses a different Docker stack before issuing SQL", () => {
    const f = fake({ wrongLabel: true });
    expect(() => upgradeLocal({ ...options, execute: f.execute })).toThrow(
      "supported",
    );
    expect(f.writes).toHaveLength(0);
  });
  it("refuses mismatched or publicly exposed API bindings", () => {
    const f = fake({ wrongPort: true });
    expect(() => upgradeLocal({ ...options, execute: f.execute })).toThrow(
      "port ownership",
    );
    expect(f.writes).toHaveLength(0);
  });
  it("refuses to initialize an unversioned database", () => {
    const f = fake({ versions: "" });
    expect(() => upgradeLocal({ ...options, execute: f.execute })).toThrow(
      "does not initialize",
    );
    expect(f.writes).toHaveLength(0);
  });
  it("applies only missing transactional migrations and records their versions", () => {
    const f = fake();
    const result = upgradeLocal({ ...options, execute: f.execute });
    expect(result.applied).toEqual([
      "20261117175427",
      "20261117203425",
      "20261117221021",
      "20261117231231",
      "20261118153305",
      "20261118191851",
      "20261119021025",
      "20261119024350",
      "20261119201405",
    ]);
    expect(f.writes).toHaveLength(9);
    expect(f.writes.every((s) => s.trim().endsWith("commit;"))).toBe(true);
    expect(f.writes[0]).toContain("values ('20261117175427')");
    expect(result.preserved.leads).toBe(30);
  });
  it("repeated upgrade writes nothing when the database is current", () => {
    const f = fake({
      versions:
        "202611170001\n202611170002\n20261117175427\n20261117203425\n20261117221021\n20261117231231\n20261118153305\n20261118191851\n20261119021025\n20261119024350\n20261119201405",
    });
    expect(upgradeLocal({ ...options, execute: f.execute }).applied).toEqual(
      [],
    );
    expect(f.writes).toHaveLength(0);
  });
  it("does not continue after a failed migration", () => {
    const f = fake({ failApply: true });
    expect(() => upgradeLocal({ ...options, execute: f.execute })).toThrow(
      "synthetic failure",
    );
    expect(f.writes).toHaveLength(0);
  });
});
describe("database error diagnosis", () => {
  it("identifies missing tables, columns and functions as database-version failures", () => {
    for (const code of ["PGRST205", "PGRST202", "42P01", "42703"])
      expect(missingDatabaseMigration({ code })).toBe(true);
  });
  it("does not mislabel permissions or connection failures as a missing migration", () => {
    for (const error of [null, { code: "42501" }, { code: "ECONNREFUSED" }])
      expect(missingDatabaseMigration(error)).toBe(false);
  });
});
