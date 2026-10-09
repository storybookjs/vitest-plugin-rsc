import type { DevEnvironment, TransformResult, ViteDevServer } from "vite";
import { expect, test, vi } from "vitest";
import {
  dependencyTransformPlugin,
  type ModuleRunnerTransform,
  rolldownTransform,
  transformDependencies,
} from "./dependency-transforms.ts";

type Entry = {
  id: string;
  file: string;
  transformResult?: TransformResult | null;
  invalidationState?: unknown;
  lastInvalidationTimestamp: number;
};

const dependency = "/deps_react_client/icons.js?v=abc123";
const source = `import { a } from "/deps_react_client/chunk.js?v=abc123";\nexport const icon = a;\n`;
const rolldown = (await rolldownTransform())!;

// A dev server with pre-bundled files and the files of the app. Vite's part is
// to compile a module that has no result yet, and to keep the result with it.
// A bare import of a package is a URL of its pre-bundled file too.
function setup(transform: ModuleRunnerTransform, { load = async () => source } = {}) {
  const entries = new Map<string, Entry>();
  const entryOf = (url: string) => {
    const name = /^\/deps_react_client\/([^?]+)/.exec(url)?.[1] ?? /^icons\b/.exec(url)?.[0];
    const file = name
      ? `/root/node_modules/.vite/deps_react_client/${name.replace(/(\.js)?$/, ".js")}`
      : `/root${url}`;
    if (!entries.has(file)) entries.set(file, { id: file, file, lastInvalidationTimestamp: 0 });
    return entries.get(file)!;
  };
  const loaded = vi.fn(load);
  const viteCompiled = vi.fn((url: string) => ({
    code: `compiled by Vite ${url}`,
    map: { mappings: "" as const },
    ssr: true,
    deps: [],
    dynamicDeps: [],
  }));
  const compile = async (url: string) => {
    const entry = entryOf(url);
    entry.transformResult ??= viteCompiled(url);
    return entry.transformResult;
  };
  const environment = {
    moduleGraph: {
      ensureEntryFromUrl: async (url: string) => entryOf(url),
      updateModuleTransformResult(entry: Entry, result: TransformResult) {
        entry.transformResult = result;
      },
    },
    pluginContainer: {
      load: loaded,
      // What Vite's plugins make of a file, the import analysis among them.
      transform: async (code: string) => ({ code: `${code}// plugins\n`, map: null }),
    },
    depsOptimizer: { isOptimizedDepFile: (id: string) => id.includes("/.vite/deps_") },
    transformRequest: compile,
    warmupRequest: async (url: string) => void (await compile(url)),
  };
  transformDependencies(environment as unknown as DevEnvironment, transform);
  return { environment, entryOf, loaded, viteCompiled };
}

test("Vite comes with Rolldown's transform", () => {
  expect(rolldown).toBeTypeOf("function");
});

test("a pre-bundled file is compiled by Rolldown after Vite's plugins", async () => {
  const { environment, viteCompiled } = setup(rolldown);

  const result = await environment.transformRequest(dependency);

  expect(viteCompiled).not.toHaveBeenCalled();
  expect(result).toMatchObject({
    map: null,
    deps: ["/deps_react_client/chunk.js?v=abc123"],
    dynamicDeps: [],
  });
  expect(result?.code).toContain(
    'await __vite_ssr_import__("/deps_react_client/chunk.js?v=abc123"',
  );
  expect(result?.code).toContain('Object.defineProperty(__vite_ssr_exports__, "icon"');
  expect(result?.code).toContain("// plugins");
});

test("the imports of a module are in the order of the module", async () => {
  const imports = ["runtime", "react", "scheduler", "dom", "client", "shared", "icons"];
  const code = imports.map((name, index) => `import * as m${index} from "/deps/${name}.js";`);
  const { environment } = setup(rolldown, {
    load: async () =>
      `${code.join("\n")}\nexport const all = [${imports.map((_, i) => `m${i}`).join(", ")}];`,
  });

  const result = await environment.transformRequest(dependency);

  expect(result?.deps).toEqual(imports.map((name) => `/deps/${name}.js`));
});

test("a file of the app is Vite's to compile", async () => {
  const transform = vi.fn<ModuleRunnerTransform>();
  const { environment, loaded } = setup(transform);

  const result = await environment.transformRequest("/app/page.tsx");

  expect(result?.code).toBe("compiled by Vite /app/page.tsx");
  expect(loaded).not.toHaveBeenCalled();
  expect(transform).not.toHaveBeenCalled();
});

test("a module that pages ask for at once, under any of its URLs, is compiled once", async () => {
  const transform = vi.fn(rolldown);
  const { environment, loaded } = setup(transform);

  await Promise.all([
    environment.warmupRequest(dependency),
    environment.transformRequest(dependency),
    environment.transformRequest("icons?import"),
  ]);

  expect(loaded).toHaveBeenCalledTimes(1);
  expect(transform).toHaveBeenCalledTimes(1);
});

test("a module that Vite keeps a result for while it takes another look keeps that", async () => {
  const transform = vi.fn<ModuleRunnerTransform>();
  const { environment, entryOf } = setup(transform);
  entryOf(dependency).invalidationState = { code: "", ssr: true };

  const result = await environment.transformRequest(dependency);

  expect(result?.code).toBe(`compiled by Vite ${dependency}`);
  expect(transform).not.toHaveBeenCalled();
});

test("a module that Vite invalidated before it compiled it is compiled by Rolldown", async () => {
  const { environment, entryOf, viteCompiled } = setup(rolldown);
  entryOf(dependency).invalidationState = "HARD_INVALIDATED";

  await environment.transformRequest(dependency);

  expect(viteCompiled).not.toHaveBeenCalled();
});

test.for([
  [
    "is invalidated",
    (entry: Entry): void => {
      entry.lastInvalidationTimestamp = 1;
    },
  ],
  [
    "gets a result to keep",
    (entry: Entry): void => {
      entry.invalidationState = { code: "" };
    },
  ],
  [
    "is compiled by Vite",
    (entry: Entry): void => {
      entry.transformResult = { code: `compiled by Vite ${dependency}`, map: null };
    },
  ],
] as const)(
  "a module that %s while Rolldown compiles it is Vite's to compile",
  async ([, change]) => {
    let changed!: () => void;
    const { environment, entryOf } = setup(async (filename, code) => {
      changed();
      return rolldown(filename, code);
    });
    changed = () => change(entryOf(dependency));

    const result = await environment.transformRequest(dependency);

    expect(result?.code).toBe(`compiled by Vite ${dependency}`);
  },
);

test.for([
  ["reports an error", async () => ({ code: "", deps: [], dynamicDeps: [], errors: [{}] })],
  [
    "fails",
    async () => {
      throw new Error("Rolldown is gone");
    },
  ],
] as const)("a file for which Rolldown %s is Vite's to compile", async ([, transform]) => {
  const { environment } = setup(transform);

  const result = await environment.transformRequest(dependency);

  expect(result?.code).toBe(`compiled by Vite ${dependency}`);
});

test("Vite says what is wrong with a URL of a bundle that it has replaced", async () => {
  const transform = vi.fn<ModuleRunnerTransform>();
  const { environment, viteCompiled } = setup(transform, {
    load: async () => {
      throw new Error("The plugin's load of an outdated pre-bundle");
    },
  });
  const outdated = new Error("Vite's error for an outdated pre-bundle");
  viteCompiled.mockImplementation(() => {
    throw outdated;
  });

  await expect(environment.transformRequest(dependency)).rejects.toBe(outdated);
  expect(transform).not.toHaveBeenCalled();
});

test("only an environment that a page runs through a module runner", async () => {
  const environment = (consumer: string, moduleRunnerTransform: boolean) => {
    const transformRequest = vi.fn();
    return { config: { consumer, dev: { moduleRunnerTransform } }, transformRequest };
  };
  const environments = {
    client: environment("client", false),
    ssr: environment("server", true),
    react_client: environment("client", true),
  };
  const originals = Object.values(environments).map((e) => e.transformRequest);

  const { configureServer } = dependencyTransformPlugin() as {
    configureServer: (server: ViteDevServer) => Promise<void>;
  };
  await configureServer({ environments } as unknown as ViteDevServer);

  expect(Object.values(environments).map((e, i) => e.transformRequest !== originals[i])).toEqual([
    false,
    false,
    true,
  ]);
});
