import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "vitest";
import { useNextFontLoader } from "./font-loader-plugin";

const packageRequire = createRequire(import.meta.url);
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

function createTempFontFixture(options: { nextConfig?: string } = {}) {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-next-font-"));
  const appDir = path.join(root, "app");
  const fontPath = path.join(appDir, "geist-latin.woff2");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(root, "package.json"), "{}");
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
