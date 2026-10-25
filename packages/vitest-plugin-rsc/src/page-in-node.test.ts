import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, onTestFinished, test } from "vitest";
import { createVitest } from "vitest/node";
import { isTestServer, projectsHostPageInNode, servesPageInNode } from "./page-in-node.ts";

// What Vitest puts in the config of a server it runs tests on.
const vitestPlugins = [[{ name: "vitest:config:cli" }, { name: "vitest:config" }]];

test("has the page in a worker of Node.js on a dev server of Vitest only", () => {
  const test = { environment: "jsdom" };
  expect(servesPageInNode({ plugins: vitestPlugins, test }, "serve")).toBe(true);
  // A static build, with or without Vitest's plugins.
  expect(servesPageInNode({ test }, "build")).toBe(false);
  expect(servesPageInNode({ plugins: vitestPlugins, test }, "build")).toBe(false);
  // The dev server of another host whose config has the project's `test`,
  // like `storybook dev`, also where Vitest's addon started it.
  expect(servesPageInNode({ plugins: [{ name: "storybook:builder" }], test }, "serve")).toBe(false);
  expect(isTestServer({ plugins: [null, false, vitestPlugins] }, "serve")).toBe(true);
});

test("finds an inline project with its page in a worker of Node.js", () => {
  const browser = { test: { name: "browser", browser: { enabled: true } } };
  const node = { extends: true, test: { name: "node", environment: "happy-dom" } };
  expect(projectsHostPageInNode({ projects: [browser, node] })).toBe(true);
  expect(projectsHostPageInNode({ projects: [browser, "packages/*"] })).toBe(false);
  // By what it inherits, and not where it inherits nothing.
  const unit = { test: { name: "unit" } };
  expect(projectsHostPageInNode({ environment: "jsdom", projects: [unit] })).toBe(true);
  expect(
    projectsHostPageInNode({ environment: "jsdom", projects: [{ ...unit, extends: false }] }),
  ).toBe(false);
  expect(projectsHostPageInNode({ environment: "happy-dom", projects: [browser] })).toBe(false);
});

// The usual workspace: the plugins in the root, a project in Browser Mode and
// one in happy-dom, which differ in `environment` and `browser` only. Vitest
// would resolve the second with the root's server.
test("gives a project in a worker of Node.js a server of its own, next to one in a browser", async () => {
  const dir = fs.mkdtempSync(
    path.join(fileURLToPath(new URL("../node_modules/", import.meta.url)), ".page-in-node-"),
  );
  onTestFinished(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(dir, "vitest.config.mjs"),
    `import { playwright } from "@vitest/browser-playwright";
import { vitestPluginRSC } from "vitest-plugin-rsc";

export default {
  plugins: [vitestPluginRSC()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "browser",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
      { extends: true, test: { name: "node", environment: "happy-dom" } },
    ],
  },
};
`,
  );
  const vitest = await createVitest(
    "test",
    {
      root: dir,
      config: path.join(dir, "vitest.config.mjs"),
      configLoader: "native",
      watch: false,
    },
    { logLevel: "silent" },
  );
  onTestFinished(() => vitest.close());
  const node = vitest.projects.find((project) => project.name === "node")!;
  expect(node.sharedViteServer).toBe(false);
  expect(node.vite).not.toBe(vitest.vite);
  expect(node.config.pool).toBe("vitest-plugin-rsc");
});
