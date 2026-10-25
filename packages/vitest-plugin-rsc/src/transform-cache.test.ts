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

const fetchModule = (url: string, options?: object, importer: string | null = "/importer.ts") =>
  ({
    type: "custom",
    event: "vite:invoke",
    data: { name: "fetchModule", id: "send:1", data: [url, importer ?? undefined, options] },
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

test("finds the module of a URL or of the page's entry as Vite does, and leaves to Vite what it resolves itself", async () => {
  const { environment, handleInvoke, project, moduleGraph } = setUp();
  await answerFromTransformCache(project);
  fetch.mockResolvedValue({ cache: true });

  await invokeEnvironment(environment, fetchModule("/@id/__x00__virtual:a", { cached: true }));
  expect(moduleGraph.ensureEntryFromUrl).toHaveBeenCalledWith("\0virtual:a");
  // The page's entry, by its package, without an importer.
  const entry = fetchModule("vitest-plugin-rsc/a", undefined, null);
  expect(await invokeEnvironment(environment, entry)).toEqual({ result: { cache: true } });
  expect(moduleGraph.ensureEntryFromUrl).toHaveBeenCalledWith(
    "/node_modules/vitest-plugin-rsc/a.js",
  );
  expect(fetch).toHaveBeenLastCalledWith(
    "vitest-plugin-rsc/a",
    undefined,
    "react_client",
    undefined,
  );
  // What does not resolve, and a specifier of a module, which Vite resolves
  // as Node.js does.
  expect(await invokeEnvironment(environment, fetchModule("missing/a", undefined, null))).toEqual(
    viteAnswer,
  );
  expect(await invokeEnvironment(environment, fetchModule("vitest-plugin-rsc/a"))).toEqual(
    viteAnswer,
  );
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(handleInvoke).toHaveBeenCalledTimes(2);
});

// A project with Vitest's internals that its key needs: its transform
// service's config, and the registry of keys by config.
function withService(project: TestProject, config: object, keys?: object) {
  return Object.assign(project, {
    _transformService: { config },
    vitest: { distPath: dir, cache: { _modules: keys } },
  }) as TestProject;
}

test("keys a module by the config that the transform service keys by, or leaves it to Vite", async () => {
  const generate = () => "key";
  // A project of its own service: Vitest's own `define`.
  const own = setUp();
  const define = vi.fn();
  defineTransformCacheKey(withService(own.project, own.project.config), define, generate);
  expect(define).toHaveBeenCalledWith(generate);

  // An instance of Browser Mode, on the service of its parent.
  const instance = setUp();
  const parent = {};
  const defineCacheKeyGenerator = vi.fn();
  const keys = { defineCacheKeyGenerator };
  defineTransformCacheKey(withService(instance.project, parent, keys), define, generate);
  expect(defineCacheKeyGenerator).toHaveBeenCalledWith(parent, generate);
  await answerFromTransformCache(instance.project);
  fetch.mockResolvedValue({ cache: true });
  expect(await invokeEnvironment(instance.environment, fetchModule("/a.ts"))).toEqual({
    result: { cache: true },
  });

  // Without the registry, without a service, or without Vitest's `define`:
  // the key would miss what the plugins add, so Vite answers, also when the
  // cache had started to answer.
  for (const [project, environment, defineOf] of [
    [instance.project, instance.environment, define],
    [withService(setUp().project, parent), undefined, define],
    [withService(own.project, own.project.config), own.environment, undefined],
  ] as const) {
    fetch.mockClear();
    const env = environment ?? Object.values(project.vite.environments)[0]!;
    if (project === instance.project)
      Object.assign(project, { vitest: { distPath: dir, cache: {} } });
    defineTransformCacheKey(project, defineOf, generate);
    await answerFromTransformCache(project);
    expect(await invokeEnvironment(env, fetchModule("/a.ts"))).toEqual(viteAnswer);
    expect(fetch).not.toHaveBeenCalled();
  }
});

test("leaves to Vite the environments of a server that two projects with their own cache share", async () => {
  const { environment, project } = setUp();
  await answerFromTransformCache(withService(project, {}));
  const other = Object.assign(Object.create(project) as object, {
    _transformService: { config: {} },
  }) as unknown as TestProject;
  await answerFromTransformCache(other);
  expect(await invokeEnvironment(environment, fetchModule("/a.ts"))).toEqual(viteAnswer);
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
