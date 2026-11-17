import { createRequire } from "node:module";
import { describe, it, expect } from "vitest";
const require = createRequire(import.meta.url);
const {
  validateConfig,
  importEnvironment,
} = require("../../desktop/config.cjs");
const anon = `${Buffer.from("{}").toString("base64url")}.${Buffer.from('{"role":"anon"}').toString("base64url")}.test-signature`;
const config = {
  mode: "bundled",
  supabaseUrl: "http://127.0.0.1:54321",
  publishableKey: anon,
  operatorEmail: "owner@example.test",
};
describe("desktop connection boundary", () => {
  it("allows local Supabase without requiring port 3030", () =>
    expect(validateConfig(config).supabaseUrl).toBe("http://127.0.0.1:54321"));
  it("allows a hosted HTTPS application", () =>
    expect(
      validateConfig({
        mode: "hosted",
        appUrl: "https://os.example.test/dashboard",
      }),
    ).toEqual({ mode: "hosted", appUrl: "https://os.example.test" }));
  it("rejects insecure remote application addresses", () =>
    expect(() =>
      validateConfig({ mode: "hosted", appUrl: "http://os.example.test" }),
    ).toThrow("HTTPS"));
  it("rejects privileged API keys", () => {
    const privileged = `e30.${Buffer.from('{"role":"service_role"}').toString("base64url")}.test-signature`;
    expect(() =>
      validateConfig({ ...config, publishableKey: privileged }),
    ).toThrow("Only publishable");
  });
  it("rejects URL credentials and insecure remote databases", () => {
    expect(() =>
      validateConfig({
        ...config,
        supabaseUrl: "https://user:password@example.test",
      }),
    ).toThrow();
    expect(() =>
      validateConfig({ ...config, supabaseUrl: "http://192.168.1.10:54321" }),
    ).toThrow();
  });
  it("imports only the two permitted environment values", () => {
    expect(
      importEnvironment(
        "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=test\nSTRIPE_SECRET_KEY=never-copy\nNODE_OPTIONS=never-run",
      ),
    ).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      publishableKey: "test",
    });
  });
  it("requires an exact operator email", () =>
    expect(() =>
      validateConfig({ ...config, operatorEmail: "invalid" }),
    ).toThrow("operator account"));
});
