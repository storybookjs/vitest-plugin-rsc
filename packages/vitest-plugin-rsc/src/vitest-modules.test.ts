import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { InvokePayload } from "./built-layers.ts";
import { vitestModules } from "./vitest-modules.ts";
import { builtinsKey, workerRunKey, type WorkerRun } from "./worker-run.ts";

const scope = globalThis as unknown as Record<PropertyKey, WorkerRun | undefined>;

// A run as the worker's entry hands it over, with Vitest's `fetch()` answering
// from `answers` by URL, and the questions it got.
function runWith(answers: Record<string, object>, providedContext: Record<string, unknown> = {}) {
  const asked: unknown[][] = [];
  const run: WorkerRun = {
    rpc: {
      fetch: async (...args) => {
        asked.push(args);
        return answers[args[0]] as never;
      },
    },
    providedContext,
    changed: [],
  };
  scope[workerRunKey] = run;
  return { run, asked };
}

afterEach(() => {
  delete scope[workerRunKey];
});

const fetchModule = (...data: unknown[]) =>
  ({ type: "custom", event: "vite:invoke", data: { name: "fetchModule", data } }) as InvokePayload;

describe("a module of a layer of the page", () => {
  test("is Vitest's answer for the environment, with the code that Vitest has on disk", async () => {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vitest-modules-")), "module");
    fs.writeFileSync(tmp, "export const a = 1;");
    const { asked } = runWith({
      "/app/a.tsx": {
        cached: true,
        tmp,
        file: "/root/app/a.tsx",
        id: "/root/app/a.tsx",
        url: "/app/a.tsx",
        invalidate: false,
      },
    });

    const answer = await vitestModules().invoke(
      "react_client",
      fetchModule("/app/a.tsx", "/root/app/page.tsx", { cached: false }),
    );

    expect(asked).toEqual([
      ["/app/a.tsx", "/root/app/page.tsx", "react_client", { cached: false }],
    ]);
    expect(answer).toEqual({
      result: {
        code: "export const a = 1;",
        file: "/root/app/a.tsx",
        id: "/root/app/a.tsx",
        url: "/app/a.tsx",
        invalidate: false,
      },
    });
  });

  test("is an error that names the package, where Vitest leaves a dependency to Node.js", async () => {
    runWith({
      "/@fs/root/node_modules/.pnpm/x@1/node_modules/@scope/lib/index.js": {
        externalize: "/root/node_modules/.pnpm/x@1/node_modules/@scope/lib/index.js",
        type: "module",
      },
    });

    const answer = await vitestModules().invoke(
      "next_ssr",
      fetchModule("/@fs/root/node_modules/.pnpm/x@1/node_modules/@scope/lib/index.js"),
    );

    expect(String((answer as { error: unknown }).error)).toContain(
      "the next_ssr layer of the page imports a file of @scope/lib, which Vitest leaves to Node.js",
    );
    expect(String((answer as { error: unknown }).error)).toContain(
      '`environments.next_ssr.optimizeDeps.include: ["@scope/lib"]`',
    );
  });

  test("is left to the runner where it is no dependency, like Vite's client", async () => {
    runWith({ "/@vite/client": { externalize: "/@vite/client", type: "module" } });

    expect(await vitestModules().invoke("react_client", fetchModule("/@vite/client"))).toEqual({
      result: { externalize: "/@vite/client", type: "module" },
    });
  });
});

test("the builtins of an environment are what the plugin provides for it", async () => {
  const builtins = [{ type: "string", value: "node:fs" }];
  runWith({}, { [builtinsKey]: { next_ssr: builtins } });
  const getBuiltins = {
    type: "custom",
    event: "vite:invoke",
    data: { name: "getBuiltins", data: [] },
  };

  expect(await vitestModules().invoke("next_ssr", getBuiltins as InvokePayload)).toEqual({
    result: builtins,
  });
  expect(await vitestModules().invoke("react_client", getBuiltins as InvokePayload)).toEqual({
    result: [],
  });
});

test("the version of the modules moves with every run that names a changed file", () => {
  const { run } = runWith({});
  const modules = vitestModules();
  expect(modules.version()).toBe(0);

  run.changed.push(["/root/app/a.tsx"], ["/root/app/b.tsx", "/root/app/c.tsx"]);

  expect(modules.version()).toBe(2);
  expect(modules.changedAfter(0)).toEqual([
    "/root/app/a.tsx",
    "/root/app/b.tsx",
    "/root/app/c.tsx",
  ]);
  expect(modules.changedAfter(1)).toEqual(["/root/app/b.tsx", "/root/app/c.tsx"]);
  expect(modules.changedAfter(2)).toEqual([]);
});

test("says so in a worker without the plugin's entry", () => {
  expect(() => vitestModules().version()).toThrow("runs in the plugin's pool");
});
