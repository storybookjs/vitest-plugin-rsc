import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineProject } from "vitest/config";
import { vitestPluginRSC } from "vitest-plugin-rsc";
import { vitestPluginNext, type Mode } from "vitest-plugin-rsc/nextjs/plugin";
import { vitestPluginRscSourceConditions } from "../../vitest.conditions.ts";

const root = fileURLToPath(new URL("./", import.meta.url));

const browserProject = defineProject({
  root,
  plugins: [vitestPluginRSC(), vitestPluginNext()],
  resolve: {
    conditions: vitestPluginRscSourceConditions,
  },
  test: {
    name: "nextjs-cache-components-demo",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "build-test/**", "dist/**"],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: "chromium" }],
    },
    isolate: false,
  },
});

// The same tests in a worker of Node.js, with happy-dom for the document, in
// fidelity mode and in fast mode. The plugin is the page's host there, and
// the server's `AsyncLocalStorage` is Node's own: the scope of a cached
// function reaches a callback of a timer, as in a deployment, which the
// tests ask by `inject("host")`. `page` is dom-locators'.
const nodeProject = (name: string, mode: Mode) =>
  defineProject({
    root,
    plugins: [
      vitestPluginRSC(),
      vitestPluginNext({ mode, host: { packages: ["dom-locators", "@testing-library/jest-dom"] } }),
    ],
    resolve: {
      conditions: vitestPluginRscSourceConditions,
      alias: [{ find: /^vitest\/browser$/, replacement: "dom-locators" }],
    },
    test: {
      name,
      include: ["**/*.test.{ts,tsx}"],
      exclude: ["node_modules", "build-test/**", "dist/**"],
      environment: "happy-dom",
      isolate: false,
      // What Vitest gives a test in Browser Mode: the first test opens its
      // route, which compiles it and the first modules of the browser layer.
      testTimeout: 15_000,
      provide: { host: "node" },
      setupFiles: ["./vitest.setup.node.ts"],
    },
  });

export const nextjsCacheComponentsDemoProjects = [
  browserProject,
  nodeProject("nextjs-cache-components-demo-node", "fidelity"),
  nodeProject("nextjs-cache-components-demo-node-fast", "fast"),
];
