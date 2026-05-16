import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MinimalPluginContextWithoutEnvironment, Plugin, ViteDevServer } from "vite";
import { afterEach, expect, test, vi } from "vitest";
import { createReactClientCoveragePlugin } from "./coverage.ts";

const reactClientCoverageModulePath = "/@vite/react-client-coverage-module";
const reactClientCoverageQuery = "vitest-plugin-rsc-react-client-coverage";
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

test("loads recorded modules only through the coverage URL", async () => {
  const file = await writeTempModule(`
    "use server";

    export async function action(formData: FormData) {
      return Number(formData.get("count"));
    }
  `);
  const { loadCoverageModule, postCoverageModule, moduleGraph } = setupCoveragePlugin();

  await postCoverageModule({ file, code: "const answer = 42;\n" });

  expect(loadCoverageModule(file)).toBeUndefined();
  expect(loadCoverageModule(toCoverageId(file), "react_client")).toBeUndefined();
  const coverageModule = loadCoverageModule(toCoverageId(file)) as
    | { code: string; map: { sources: string[]; sourcesContent: string[] } }
    | undefined;
  expect(loadCoverageModule(toBrowserCoverageId(file))).toBe(coverageModule);
  expect(coverageModule?.code).toContain("const answer = 42");
  expect(coverageModule?.map.sources).toEqual([`file://${file}`]);
  expect(coverageModule?.map.sourcesContent[0]).toContain("const answer = 42");
  expect(moduleGraph.getModulesByFile).toHaveBeenCalledWith(file);
});

test('records modules with inline "use server" actions', async () => {
  const file = await writeTempModule(`
    export function createAction(count: number) {
      return async function action(formData: FormData) {
        "use server";
        return count + Number(formData.get("count"));
      };
    }
  `);
  const { loadCoverageModule, postCoverageModule, moduleGraph } = setupCoveragePlugin();

  await postCoverageModule({ file, code: "const answer = 42;\n" });

  expect(loadCoverageModule(file)).toBeUndefined();
  expect(loadCoverageModule(toCoverageId(file), "react_client")).toBeUndefined();
  const coverageModule = loadCoverageModule(toCoverageId(file)) as
    | { code: string; map: { sources: string[]; sourcesContent: string[] } }
    | undefined;
  expect(coverageModule?.code).toContain("const answer = 42");
  expect(coverageModule?.map.sources).toEqual([`file://${file}`]);
  expect(coverageModule?.map.sourcesContent[0]).toContain("const answer = 42");
  expect(moduleGraph.getModulesByFile).toHaveBeenCalledWith(file);
});

async function writeTempModule(source: string) {
  const dir = await mkdtemp(join(tmpdir(), "vitest-plugin-rsc-coverage-"));
  tempDirs.push(dir);
  const file = join(dir, "module.ts");
  await writeFile(file, source);
  return file;
}

function toCoverageId(file: string) {
  return `${file}?${reactClientCoverageQuery}=1`;
}

function toBrowserCoverageId(file: string) {
  const path = file.replace(/\\/g, "/");
  return `http://localhost:5173/@fs${path}?${reactClientCoverageQuery}=1`;
}

function setupCoveragePlugin() {
  const plugin = createReactClientCoveragePlugin();
  let middleware: Middleware | undefined;
  const moduleGraph = {
    getModulesByFile: vi.fn(() => []),
    invalidateModule: vi.fn(),
  };
  const server = {
    middlewares: {
      use: vi.fn((handler: Middleware) => {
        middleware = handler;
      }),
    },
    environments: {
      client: {
        moduleGraph,
      },
    },
  } as unknown as ViteDevServer;

  installPluginServer(plugin, server);

  return {
    moduleGraph,
    async postCoverageModule(payload: { file: string; code: string }) {
      if (!middleware) throw new Error("Coverage middleware was not installed.");

      const req = jsonRequest(reactClientCoverageModulePath, payload);
      const res = response();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(204);
      expect(res.ended).toBe(true);
    },
    loadCoverageModule(file: string, environment = "client") {
      const load = plugin.load as LoadHook | undefined;
      if (!load) throw new Error("Coverage load hook was not installed.");
      return load.call({ environment: { name: environment } }, file);
    },
  };
}

function installPluginServer(plugin: Plugin, server: ViteDevServer) {
  const configureServer = plugin.configureServer;
  if (typeof configureServer !== "function") {
    throw new Error("Coverage configureServer hook was not installed.");
  }
  void configureServer.call({} as MinimalPluginContextWithoutEnvironment, server);
}

function jsonRequest(url: string, body: unknown): TestRequest {
  return {
    url,
    async *[Symbol.asyncIterator]() {
      yield new TextEncoder().encode(JSON.stringify(body));
    },
  };
}

function response(): TestResponse {
  return {
    statusCode: 200,
    ended: false,
    end() {
      this.ended = true;
    },
  };
}

type Middleware = (req: TestRequest, res: TestResponse, next: () => void) => void | Promise<void>;

type TestRequest = AsyncIterable<Uint8Array> & {
  url: string;
};

type TestResponse = {
  statusCode: number;
  ended: boolean;
  end(): void;
};

type LoadHook = (this: { environment: { name: string } }, id: string) => unknown;
