import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DevEnvironment, ViteDevServer } from "vite";
import { expect, test, vi } from "vitest";
import type { TestProject } from "vitest/node";
import { answerFromTransformCache, invokeEnvironment, withLinesBefore } from "./transform-cache.ts";

// The page's runners get a module from Vitest's transform cache, and from
// Vite what Vitest has not: Vitest's `fetch()` is a fake here, in a build of
// Vitest of its own.

const fetch = vi.fn();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-transform-cache-"));
const fakeFetch = "vitest-plugin-rsc:transform-cache.test";
Object.assign(globalThis, { [fakeFetch]: fetch });
fs.writeFileSync(path.join(dir, "package.json"), '{ "type": "module" }');
fs.writeFileSync(
  path.join(dir, "node.js"),
  `export const createMethodsRPC = () => ({ fetch: globalThis[${JSON.stringify(fakeFetch)}] });`,
);
const tmp = path.join(dir, "module");
fs.writeFileSync(tmp, "export default 1;\n// cached");

const viteAnswer = { result: { code: "export default 'vite';", file: "/a.ts", id: "/a.ts" } };

function setUp({ fsModuleCache = true, invalidated = 0 } = {}) {
  fetch.mockReset();
  const server = {} as ViteDevServer;
  const handleInvoke = vi.fn(async () => viteAnswer);
  const node = { lastInvalidationTimestamp: invalidated, lastHMRTimestamp: 0 };
  const moduleGraph = { ensureEntryFromUrl: vi.fn(async () => node), invalidateModule: vi.fn() };
  const environment = {
    name: "react_client",
    moduleGraph,
    hot: { handleInvoke },
  } as unknown as DevEnvironment;
  const project = {
    config: { fsModuleCache },
    vite: server,
    vitest: { distPath: dir },
  } as unknown as TestProject;
  return { server, environment, handleInvoke, project, node, moduleGraph };
}

const fetchModule = (url: string, options?: object) =>
  ({
    type: "custom",
    event: "vite:invoke",
    data: { name: "fetchModule", id: "send:1", data: [url, "/importer.ts", options] },
  }) as Parameters<DevEnvironment["hot"]["handleInvoke"]>[0];

test("answers a module that Vitest has on disk with its code, without Vite", async () => {
  const { server, environment, handleInvoke, project } = setUp();
  await answerFromTransformCache(project);
  fetch.mockResolvedValue({
    cached: true,
    tmp,
    file: "/a.ts",
    id: "/a.ts",
    url: "/a.ts",
    invalidate: false,
  });

  expect(
    await invokeEnvironment(server, environment, fetchModule("/a.ts", { cached: false })),
  ).toEqual({
    result: {
      code: "export default 1;\n// cached",
      file: "/a.ts",
      id: "/a.ts",
      url: "/a.ts",
      invalidate: false,
    },
  });
  expect(fetch).toHaveBeenCalledWith("/a.ts", "/importer.ts", "react_client", { cached: false });
  expect(handleInvoke).not.toHaveBeenCalled();
});

test("passes on that the runner has the module already", async () => {
  const { server, environment, handleInvoke, project } = setUp();
  await answerFromTransformCache(project);
  fetch.mockResolvedValue({ cache: true });

  expect(
    await invokeEnvironment(server, environment, fetchModule("/a.ts", { cached: true })),
  ).toEqual({
    result: { cache: true },
  });
  expect(handleInvoke).not.toHaveBeenCalled();
});

test("leaves to Vite a module that Vitest would leave to Node.js, and an error", async () => {
  const { server, environment, handleInvoke, project } = setUp();
  await answerFromTransformCache(project);

  fetch.mockResolvedValue({ externalize: "file:///node_modules/a/index.js", type: "module" });
  expect(
    await invokeEnvironment(server, environment, fetchModule("/node_modules/a/index.js")),
  ).toBe(viteAnswer);
  fetch.mockRejectedValue(new Error("Transform failed"));
  expect(await invokeEnvironment(server, environment, fetchModule("/a.ts"))).toBe(viteAnswer);
  expect(handleInvoke).toHaveBeenCalledTimes(2);
});

test("leaves to Vite a module that Vite invalidated in the run, which Vitest keys by its old file", async () => {
  const { server, environment, handleInvoke, project } = setUp({ invalidated: 1 });
  await answerFromTransformCache(project);

  expect(await invokeEnvironment(server, environment, fetchModule("/a.ts"))).toBe(viteAnswer);
  expect(fetch).not.toHaveBeenCalled();
  expect(handleInvoke).toHaveBeenCalledOnce();
});

test("leaves to Vite a module invalidated while Vitest read it, and forgets Vitest's code of it", async () => {
  const { server, environment, handleInvoke, project, node, moduleGraph } = setUp();
  await answerFromTransformCache(project);
  fetch.mockImplementation(async () => {
    node.lastInvalidationTimestamp = 5;
    return { cached: true, tmp, file: "/a.ts", id: "/a.ts", url: "/a.ts", invalidate: false };
  });

  expect(await invokeEnvironment(server, environment, fetchModule("/a.ts"))).toBe(viteAnswer);
  expect(moduleGraph.invalidateModule).toHaveBeenCalledWith(node);
  expect(handleInvoke).toHaveBeenCalledOnce();
});

test("finds the module of a URL as Vite does, and leaves a bare specifier to Vite", async () => {
  const { server, environment, handleInvoke, project, moduleGraph } = setUp();
  await answerFromTransformCache(project);
  fetch.mockResolvedValue({ cache: true });

  await invokeEnvironment(
    server,
    environment,
    fetchModule("/@id/__x00__virtual:a", { cached: true }),
  );
  expect(moduleGraph.ensureEntryFromUrl).toHaveBeenCalledWith("\0virtual:a");
  expect(await invokeEnvironment(server, environment, fetchModule("vitest-plugin-rsc/a"))).toBe(
    viteAnswer,
  );
  expect(fetch).toHaveBeenCalledOnce();
  expect(handleInvoke).toHaveBeenCalledOnce();
});

test("leaves to Vite what is not a module, and every module without the cache", async () => {
  const { server, environment, handleInvoke, project } = setUp({ fsModuleCache: false });
  await answerFromTransformCache(project);
  expect(await invokeEnvironment(server, environment, fetchModule("/a.ts"))).toBe(viteAnswer);

  const other = setUp();
  await answerFromTransformCache(other.project);
  const builtins = {
    ...fetchModule("/a.ts"),
    data: { name: "getBuiltins", id: "send:2", data: [] },
  };
  expect(await invokeEnvironment(other.server, other.environment, builtins as never)).toBe(
    viteAnswer,
  );
  expect(fetch).not.toHaveBeenCalled();
  expect(handleInvoke).toHaveBeenCalledOnce();
  expect(other.handleInvoke).toHaveBeenCalledOnce();
});

test("moves the source map down by the lines that the runner puts before the code", () => {
  const map = { version: 3, sources: ["a.ts"], mappings: "AAAA;AACA" };
  // As Vite puts it in the code, built here: Vitest reads the last comment
  // of a source map in a module it caches, also one in a string.
  const withMap = (of: object) =>
    "export default 1;\n//# sourceMappingSource=vite-generated\n" +
    `//# ${"sourceMappingURL"}=data:application/json;base64,` +
    `${Buffer.from(JSON.stringify(of)).toString("base64")}\n// cached`;
  const code = withMap(map);

  expect(withLinesBefore(code, 2)).toBe(withMap({ ...map, mappings: ";;AAAA;AACA" }));
  expect(withLinesBefore(code, 0)).toBe(code);
  // Vite's own, which has the lines already.
  const fromVite = code.replace(
    "\n//# sourceMappingSource",
    "\n//# sourceURL=/a.ts\n//# sourceMappingSource",
  );
  expect(withLinesBefore(fromVite, 2)).toBe(fromVite);
  // A dependency, which comes without a map.
  expect(withLinesBefore("export default 1;\n", 2)).toBe("export default 1;\n");
});
