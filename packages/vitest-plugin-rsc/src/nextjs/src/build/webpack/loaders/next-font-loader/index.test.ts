import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "vitest";
import { useNextFontLoader } from "./index.ts";

const packageRequire = createRequire(import.meta.url);
const nextPackagePath = packageRequire.resolve("next/package.json");
const nextPackageDir = path.dirname(nextPackagePath);
const sourceFontPath = packageRequire.resolve(
  "next/dist/next-devtools/server/font/geist-latin.woff2",
);

test("emits next/font local files as build assets", async () => {
  const { appDir, fontPath, root, cleanup } = createTempFontFixture();
  const plugin = useNextFontLoader();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const emittedAssets: Array<{ fileName: string; source: Buffer }> = [];
  const watchedFiles: string[] = [];

  try {
    await configResolved.call({} as never, { root, mode: "test", command: "build" } as never);

    const resolved = await resolveId.call(
      {} as never,
      createLocalFontRequest(),
      undefined,
      {} as never,
    );
    const code = (await load.call(
      {
        addWatchFile: (file: string) => watchedFiles.push(file),
        emitFile: (asset: { type: "asset"; fileName: string; source: Buffer }) => {
          emittedAssets.push({ fileName: asset.fileName, source: asset.source });
          return "font-reference";
        },
      } as never,
      resolved as string,
      {} as never,
    )) as string;

    expect(watchedFiles).toEqual([fontPath]);
    expect(emittedAssets).toHaveLength(1);
    expect(emittedAssets[0]!.fileName).toMatch(/^_next\/static\/media\/.+\.p\.woff2$/);
    expect(emittedAssets[0]!.fileName).not.toContain("-s.");
    expect(emittedAssets[0]!.source.length).toBeGreaterThan(0);
    expect(code).toContain("import.meta.ROLLUP_FILE_URL_font-reference");
    expect(code).toContain("__className_");
    expect(code).not.toContain(".className");
    expect(code).not.toContain(".variable");
    expect(code).not.toContain("data:font");
    expect(code).not.toContain("__vitest_plugin_rsc_next_font_asset__");
  } finally {
    cleanup();
  }

  function createLocalFontRequest() {
    return createNextFontTargetCssRequest({
      relativePath: path.relative(root, path.join(appDir, "page.tsx")),
    });
  }
});

test("resolves postcss from installed Next package when app root lacks postcss", async () => {
  const { appDir, root, cleanup } = createTempFontFixture({ isolatedNextInstall: true });
  const plugin = useNextFontLoader();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const appRequire = createRequire(path.join(root, "package.json"));
  const nextRequire = createRequire(appRequire.resolve("next/package.json"));

  try {
    expect(fs.existsSync(path.join(root, "node_modules", "postcss"))).toBe(false);
    expect(canResolve(nextRequire, "postcss")).toBe(true);

    await configResolved.call({} as never, { root, mode: "test", command: "serve" } as never);

    const resolved = await resolveId.call(
      {} as never,
      createNextFontTargetCssRequest({
        relativePath: path.relative(root, path.join(appDir, "page.tsx")),
      }),
      undefined,
      {} as never,
    );
    const code = await withBlockedProjectPostcssResolution(root, async () => {
      return (await load.call(
        {
          addWatchFile: () => {},
        } as never,
        resolved as string,
        {} as never,
      )) as string;
    });

    expect(code).toContain("__className_");
    expect(code).not.toContain(".className");
    expect(code).not.toContain("Cannot find module 'postcss'");
  } finally {
    cleanup();
  }
});

test("serves next/font local files from Next static media URLs in dev", async () => {
  const { appDir, root, cleanup } = createTempFontFixture({
    nextConfig: "module.exports = { assetPrefix: '/cdn' };\n",
  });
  const plugin = useNextFontLoader();
  const configResolved = getHookHandler(plugin.configResolved);
  const configureServer = getHookHandler(plugin.configureServer);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  let middleware:
    | ((req: { url?: string }, res: FakeResponse, next: () => void) => void)
    | undefined;

  try {
    await configResolved.call({} as never, { root, mode: "test", command: "serve" } as never);
    await configureServer.call(
      {} as never,
      {
        middlewares: {
          use(handler: typeof middleware) {
            middleware = handler;
          },
        },
      } as never,
    );

    const resolved = await resolveId.call(
      {} as never,
      createNextFontTargetCssRequest({
        relativePath: path.relative(root, path.join(appDir, "page.tsx")),
      }),
      undefined,
      {} as never,
    );
    const code = (await load.call(
      {
        addWatchFile: () => {},
      } as never,
      resolved as string,
      {} as never,
    )) as string;
    const nextUrl = /url\((\/cdn\/_next\/static\/media\/[^)]+\.p\.woff2)\)/.exec(code)?.[1];

    expect(nextUrl).toBeDefined();
    expect(code).not.toContain("data:font");
    expect(middleware).toBeDefined();

    const response = new FakeResponse();
    let missed = false;
    middleware!({ url: nextUrl }, response, () => {
      missed = true;
    });

    expect(missed).toBe(false);
    expect(response.statusCode).toBe(200);
    expect(response.headers["Content-Type"]).toBe("font/woff2");
    expect(response.body?.length).toBeGreaterThan(0);
  } finally {
    cleanup();
  }
});

function createTempFontFixture(
  options: { isolatedNextInstall?: boolean; nextConfig?: string } = {},
) {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-next-font-"));
  const appDir = path.join(root, "app");
  const fontPath = path.join(appDir, "geist-latin.woff2");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), "{}");
  if (options.isolatedNextInstall) {
    installIsolatedNextDependency(root);
  }
  fs.writeFileSync(
    path.join(appDir, "page.tsx"),
    "export default function Page() { return null; }\n",
  );
  fs.copyFileSync(sourceFontPath, fontPath);
  if (options.nextConfig) {
    fs.writeFileSync(path.join(root, "next.config.js"), options.nextConfig);
  }

  return {
    appDir,
    fontPath,
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

function installIsolatedNextDependency(root: string) {
  const nodeModulesDir = path.join(root, "node_modules");
  fs.mkdirSync(nodeModulesDir, { recursive: true });
  fs.symlinkSync(
    nextPackageDir,
    path.join(nodeModulesDir, "next"),
    process.platform === "win32" ? "junction" : "dir",
  );
}

type NodeModuleWithResolveFilename = {
  _resolveFilename(
    request: string,
    parent: { filename?: string } | undefined,
    isMain: boolean,
    options?: unknown,
  ): string;
};

async function withBlockedProjectPostcssResolution<T>(
  root: string,
  callback: () => Promise<T>,
): Promise<T> {
  const nodeModule = packageRequire("node:module") as NodeModuleWithResolveFilename;
  const originalResolveFilename = nodeModule._resolveFilename;

  nodeModule._resolveFilename = (request, parent, isMain, options) => {
    if (request === "postcss" && parent?.filename && isInsidePath(root, parent.filename)) {
      const error = new Error("Cannot find module 'postcss'");
      (error as NodeJS.ErrnoException).code = "MODULE_NOT_FOUND";
      throw error;
    }

    return Reflect.apply(originalResolveFilename, nodeModule, [
      request,
      parent,
      isMain,
      options,
    ]) as string;
  };

  try {
    return await callback();
  } finally {
    nodeModule._resolveFilename = originalResolveFilename;
  }
}

function isInsidePath(root: string, file: string) {
  const relative = path.relative(root, file);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function canResolve(moduleRequire: NodeJS.Require, id: string) {
  try {
    moduleRequire.resolve(id);
    return true;
  } catch {
    return false;
  }
}

function createNextFontTargetCssRequest({ relativePath }: { relativePath: string }) {
  const query = {
    path: relativePath,
    import: "",
    arguments: [
      {
        src: "./geist-latin.woff2",
        variable: "--font-local-geist",
        adjustFontFallback: false,
      },
    ],
    variableName: "localFont",
  };
  return `next/font/local/target.css?${JSON.stringify(query)}`;
}

class FakeResponse {
  statusCode = 0;
  headers: Record<string, string> = {};
  body: Buffer | undefined;

  setHeader(name: string, value: string) {
    this.headers[name] = value;
  }

  end(source: Buffer) {
    this.body = source;
  }
}

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}
