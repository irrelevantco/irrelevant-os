import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Electron sandboxed preloads use CommonJS; keep this exception scoped to desktop.
  {
    files: ["desktop/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  globalIgnores([
    ".next/**",
    "next-env.d.ts",
    "work/**",
    "supabase/.temp/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
