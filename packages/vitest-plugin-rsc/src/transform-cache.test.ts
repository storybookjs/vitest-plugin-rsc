import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { DevEnvironment } from "vite";
import { expect, test, vi } from "vitest";
import type { TestProject } from "vitest/node";
import {
  answerFromTransformCache,
  defineTransformCacheKey,
  invokeEnvironment,
  withLinesBefore,
} from "./transform-cache.ts";

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
  const handleInvoke = vi.fn(async () => structuredClone(viteAnswer));
  const node = { lastInvalidationTimestamp: invalidated, lastHMRTimestamp: 0 };
  const moduleGraph = { ensureEntryFromUrl: vi.fn(async () => node), invalidateModule: vi.fn() };
  // A package of the app resolves, from the page's importer.
  const resolveId = vi.fn(async (url: string) =>
    url.startsWith("vitest-plugin-rsc/") ? { id: `/node_modules/${url}.js` } : null,
  );
  const environment = {
    name: "react_client",
    moduleGraph,
    pluginContainer: { resolveId },
    hot: { handleInvoke },
  } as unknown as DevEnvironment;
  const project = {
    config: { fsModuleCache },
    vite: { environments: { react_client: environment } },
    vitest: { distPath: dir },
  } as unknown as TestProject;
  return { environment, handleInvoke, project, node, moduleGraph };
}

const fetchModule = (url: string, options?: object) =>
  ({
    type: "custom",
    event: "vite:invoke",
    data: { name: "fetchModule", id: "send:1", data: [url, "/importer.ts", options] },
  }) as Parameters<DevEnvironment["hot"]["handleInvoke"]>[0];

test("answers a module that Vitest has on disk with its code, without Vite", async () => {
  const { environment, handleInvoke, project } = setUp();
  await answerFromTransformCache(project);
  fetch.mockResolvedValue({
    cached: true,
    tmp,
    file: "/a.ts",
    id: "/a.ts",
    url: "/a.ts",
    invalidate: false,
  });

  expect(await invokeEnvironment(environment, fetchModule("/a.ts", { cached: false }))).toEqual({
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
  const { environment, handleInvoke, project } = setUp();
  await answerFromTransformCache(project);
  fetch.mockResolvedValue({ cache: true });

  expect(await invokeEnvironment(environment, fetchModule("/a.ts", { cached: true }))).toEqual({
    result: { cache: true },
  });
  expect(handleInvoke).not.toHaveBeenCalled();
});

test("leaves to Vite a module that Vitest would leave to Node.js, and an error", async () => {
  const { environment, handleInvoke, project } = setUp();
  await answerFromTransformCache(project);

  fetch.mockResolvedValue({ externalize: "file:///node_modules/a/index.js", type: "module" });
  expect(await invokeEnvironment(environment, fetchModule("/node_modules/a/index.js"))).toEqual(
    viteAnswer,
  );
  fetch.mockRejectedValue(new Error("Transform failed"));
  expect(await invokeEnvironment(environment, fetchModule("/a.ts"))).toEqual(viteAnswer);
  expect(handleInvoke).toHaveBeenCalledTimes(2);
});

test("leaves to Vite a module that Vite invalidated in the run, which Vitest keys by its old file", async () => {
  const { environment, handleInvoke, project } = setUp({ invalidated: 1 });
  await answerFromTransformCache(project);

  expect(await invokeEnvironment(environment, fetchModule("/a.ts"))).toEqual(viteAnswer);
  expect(fetch).not.toHaveBeenCalled();
  expect(handleInvoke).toHaveBeenCalledOnce();
});

test("leaves to Vite a module invalidated while Vitest read it, and forgets Vitest's code of it", async () => {
  const { environment, handleInvoke, project, node, moduleGraph } = setUp();
  await answerFromTransformCache(project);
  fetch.mockImplementation(async () => {
    node.lastInvalidationTimestamp = 5;
    return { cached: true, tmp, file: "/a.ts", id: "/a.ts", url: "/a.ts", invalidate: false };
  });

  expect(await invokeEnvironment(environment, fetchModule("/a.ts"))).toEqual(viteAnswer);
  expect(moduleGraph.invalidateModule).toHaveBeenCalledWith(node);
  expect(handleInvoke).toHaveBeenCalledOnce();
});

test("finds the module of a URL or of a specifier as Vite does, and leaves to Vite what does not resolve", async () => {
  const { environment, handleInvoke, project, moduleGraph } = setUp();
  await answerFromTransformCache(project);
  fetch.mockResolvedValue({ cache: true });

  await invokeEnvironment(environment, fetchModule("/@id/__x00__virtual:a", { cached: true }));
  expect(moduleGraph.ensureEntryFromUrl).toHaveBeenCalledWith("\0virtual:a");
  expect(await invokeEnvironment(environment, fetchModule("vitest-plugin-rsc/a"))).toEqual({
    result: { cache: true },
  });
  expect(moduleGraph.ensureEntryFromUrl).toHaveBeenCalledWith(
    "/node_modules/vitest-plugin-rsc/a.js",
  );
  expect(fetch).toHaveBeenLastCalledWith(
    "vitest-plugin-rsc/a",
    "/importer.ts",
    "react_client",
    undefined,
  );
  expect(await invokeEnvironment(environment, fetchModule("missing/a"))).toEqual(viteAnswer);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(handleInvoke).toHaveBeenCalledOnce();
});

test("keys a module of an instance of Browser Mode by the config of the project it is an instance of, or leaves it to Vite", async () => {
  const parent = { config: {} };
  const generate = () => "key";
  const { project } = setUp();
  const define = vi.fn();
  const defineCacheKeyGenerator = vi.fn();
  const instance = Object.assign(project, {
    _parent: parent,
    vitest: { distPath: dir, cache: { _modules: { defineCacheKeyGenerator } } },
  });
  defineTransformCacheKey(instance, define, generate);
  expect(define).toHaveBeenCalledWith(generate);
  expect(defineCacheKeyGenerator).toHaveBeenCalledWith(parent.config, generate);

  // A Vitest without the place of its keys: the key would miss what the
  // plugins add, so Vite answers.
  const other = setUp();
  const unreachable = Object.assign(other.project, {
    _parent: parent,
    vitest: { distPath: dir, cache: {} },
  });
  defineTransformCacheKey(unreachable, undefined, generate);
  await answerFromTransformCache(unreachable);
  expect(await invokeEnvironment(other.environment, fetchModule("/a.ts"))).toEqual(viteAnswer);
  expect(fetch).not.toHaveBeenCalled();
});

test("leaves to Vite what is not a module, and every module without the cache", async () => {
  const { environment, handleInvoke, project } = setUp({ fsModuleCache: false });
  await answerFromTransformCache(project);
  expect(await invokeEnvironment(environment, fetchModule("/a.ts"))).toEqual(viteAnswer);

  const other = setUp();
  await answerFromTransformCache(other.project);
  const builtins = {
    ...fetchModule("/a.ts"),
    data: { name: "getBuiltins", id: "send:2", data: [] },
  };
  expect(await invokeEnvironment(other.environment, builtins as never)).toEqual(viteAnswer);
  expect(fetch).not.toHaveBeenCalled();
  expect(handleInvoke).toHaveBeenCalledOnce();
  expect(other.handleInvoke).toHaveBeenCalledOnce();
});

// A module's code with a map, as Vitest keeps it, or as Vite gives it to a
// runner, which names the module before the map. Built here: Vitest reads the
// last comment of a source map in a module it caches, also one in a string.
const map = { version: 3, sources: ["a.ts"], mappings: "AAAA;AACA" };
const withMap = (of: object, name = "") =>
  "export default 1;\n" +
  (name && `//# sourceURL=${name}\n`) +
  "//# sourceMappingSource=vite-generated\n" +
  `//# ${"sourceMappingURL"}=data:application/json;base64,` +
  `${Buffer.from(JSON.stringify(of)).toString("base64")}\n// cached`;
const shifted = withMap({ ...map, mappings: ";;AAAA;AACA" }, "/a.ts");

test("moves the source map down by the lines that the runner puts before the code, once", () => {
  expect(withLinesBefore(withMap(map), 2, "/a.ts")).toBe(shifted);
  expect(withLinesBefore(shifted, 2, "/a.ts")).toBe(shifted);
  expect(withLinesBefore(withMap(map), 0, "/a.ts")).toBe(withMap(map));
  // A dependency, which comes without a map.
  expect(withLinesBefore("export default 1;\n", 2, "/a.ts")).toBe("export default 1;\n");
});

test("moves the map of Vite's answer down when Vitest compiled the module in the run", async () => {
  const { environment, handleInvoke, project } = setUp({ invalidated: 1 });
  await answerFromTransformCache(project);
  const answer = (code: string) => ({ result: { code, file: "/a.ts", id: "/a.ts" } });
  const options = { cached: false, startOffset: 2 };

  handleInvoke.mockResolvedValueOnce(answer(withMap(map)));
  expect(await invokeEnvironment(environment, fetchModule("/a.ts", options))).toEqual(
    answer(shifted),
  );
  // Vite's own, which has the lines already.
  handleInvoke.mockResolvedValueOnce(answer(shifted));
  expect(await invokeEnvironment(environment, fetchModule("/a.ts", options))).toEqual(
    answer(shifted),
  );
});
