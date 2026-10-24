import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, defineProject } from "vitest/config";

const tConfig = Date.now();
const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const shared = {
  resolve: {
    alias: {
      "#lib/actions.ts": here("./stub-actions.ts"),
      "next/link": here("./stub-link.tsx"),
    },
  },
};
const provide = (envName: string) => ({
  envName,
  t0: Number(process.env.DOMENV_T0 ?? tConfig),
  tConfig,
  iterations: Number(process.env.DOMENV_ITER ?? 250),
});

export default defineConfig({
  root: here("../"),
  test: {
    reporters: ["default"],
    projects: [
      defineProject({
        ...shared,
        test: { name: "node", environment: "node", include: ["domenv/pglite.test.ts"], provide: provide("node") },
      }),
      defineProject({
        ...shared,
        test: { name: "jsdom", environment: "jsdom", include: ["domenv/*.test.{ts,tsx}"], provide: provide("jsdom") },
      }),
      defineProject({
        ...shared,
        test: { name: "happy-dom", environment: "happy-dom", include: ["domenv/*.test.{ts,tsx}"], provide: provide("happy-dom") },
      }),
      defineProject({
        ...shared,
        // Cross-origin isolated, for performance.now() at 5 us instead of 100 us.
        server: {
          headers: {
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
          },
        },
        test: {
          name: "browser",
          include: ["domenv/*.test.{ts,tsx}"],
          provide: provide("browser"),
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      }),
    ],
  },
});
