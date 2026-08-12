/// <reference types="vitest/config" />
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * The one seam between the console and its backend.
 *
 * Every network call in this app goes through src/api.ts, so the demo build
 * swaps that whole module for src/demo/fixtures.ts here rather than threading a
 * flag through the pages. Two things follow. The pages are untouched, which is
 * what stops the preview drifting from the console it previews. And the fetch
 * code is not resolved at all in that build, so the bundle cannot reach a
 * backend even if something later asked it to.
 *
 * Anchored at both ends, so "../api-error" and "../lib/api" are not caught.
 */
// Matches every way src/api.ts can be named: "./api", "../../api", and the
// "@/api" alias. The whole no-network guarantee rests on this catching all of
// them, and a specifier it misses ships the real fetch client into a public
// preview with every check still green.
const API_MODULE = /^(?:(?:\.\.?\/)+|@\/)api$/;

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  // Never in tests: they import the real module and the fixtures side by side
  // to check that the two still agree, which aliasing one onto the other would
  // quietly turn into a tautology.
  const demo = mode !== "test" && env.VITE_DEMO === "true";

  return {
    // From the env so the preview can be moved without a code change. The
    // default matches where shipvoice.dev serves it.
    base: demo ? env.VITE_DEMO_BASE || "/demo/" : "/",
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        ...(demo
          ? [
              {
                find: API_MODULE,
                replacement: path.resolve(__dirname, "./src/demo/fixtures.ts"),
              },
            ]
          : []),
        { find: "@", replacement: path.resolve(__dirname, "./src") },
      ],
    },
    // Its own directory, so `pnpm build:demo` never overwrites the console
    // build that gets shipped in the Docker image.
    build: demo ? { outDir: "dist-demo", emptyOutDir: true } : {},
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test-setup.ts",
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov"],
        // Measure only our code; the vendored shadcn/agents-ui components are excluded.
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/components/ui/**",
          "src/components/agents-ui/**",
          "src/components/ai-elements/**",
          "src/hooks/agents-ui/**",
          "src/**/*.test.{ts,tsx}",
          "src/test-setup.ts",
          "src/vite-env.d.ts",
          "src/main.tsx",
        ],
      },
    },
  };
});
