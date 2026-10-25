import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import type { InvokePayload } from "./built-layers.ts";
import { invokeEvent } from "./page-protocol.ts";
import { vitestModules } from "./vitest-modules.ts";
import { askOverWorkerChannel } from "./worker-channel.ts";
import { builtinsKey, workerRunKey, type WorkerRun } from "./worker-run.ts";

// The dev server's answer on the worker's channel, as index.ts gives it.
vi.mock("./worker-channel.ts", () => ({
  askOverWorkerChannel: vi.fn(async () => ({ result: { code: "", id: "/dev-server" } })),
}));

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
  };
  scope[workerRunKey] = run;
  return { run, asked };
}

afterEach(() => {
  vi.clearAllMocks();
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

  test("is the dev server's, where Vitest leaves a file of a dependency to Node.js", async () => {
    const url = "/@fs/root/node_modules/.pnpm/x@1/node_modules/@scope/lib/index.js";
    runWith({
      [url]: {
        externalize: "/root/node_modules/.pnpm/x@1/node_modules/@scope/lib/index.js",
        type: "module",
      },
    });
    const payload = fetchModule(url);

    const answer = await vitestModules().invoke("next_ssr", payload);

    expect(askOverWorkerChannel).toHaveBeenCalledWith(invokeEvent, {
      environment: "next_ssr",
      payload,
    });
    expect(answer).toEqual({ result: { code: "", id: "/dev-server" } });
  });

  test("is the dev server's too, where Vitest leaves a module out of node_modules to Node.js", async () => {
    // A library of the monorepo, by `deps.moduleDirectories` of the project.
    runWith({
      "/packages/ui/index.js": { externalize: "/root/packages/ui/index.js", type: "module" },
    });
    const payload = fetchModule("/packages/ui/index.js");

    await vitestModules().invoke("react_client", payload);

    expect(askOverWorkerChannel).toHaveBeenCalledWith(invokeEvent, {
      environment: "react_client",
      payload,
    });
  });

  test("is Node's own for a module of Node.js that a browser layer names by Vite's id", async () => {
    const { asked } = runWith({});

    expect(await vitestModules().invoke("react_client", fetchModule("/@id/node:fs"))).toEqual({
      result: { externalize: "node:fs", type: "builtin" },
    });
    expect(asked).toEqual([]);
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

test("says so in a worker without the plugin's entry", async () => {
  await expect(vitestModules().invoke("react_client", fetchModule("/app/a.tsx"))).rejects.toThrow(
    "runs in the plugin's pool",
  );
});
