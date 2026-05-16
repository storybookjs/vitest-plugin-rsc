import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { useNextImageClientReference } from "./image-plugin.ts";

const fixtureRoot = fileURLToPath(
  new URL("../../../../playground/nextjs-notes-demo/", import.meta.url),
);
const tinyPngBase64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

test("keeps next/image getImageProps callable in the RSC graph", async () => {
  const plugin = useNextImageClientReference();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);

  await configResolved.call({} as never, { root: fixtureRoot } as never);

  expect(await resolveId.call({} as never, "next/image", undefined, {} as never)).toBe(
    "virtual:vitest-plugin-rsc/next-image",
  );

  const imageModule = await load.call(
    {} as never,
    "virtual:vitest-plugin-rsc/next-image",
    {} as never,
  );
  expect(imageModule).toContain("export function getImageProps");
  expect(imageModule).toContain("getImgProps");
  expect(imageModule).toContain('typeof defaultLoaderModule.default === "function"');
  expect(imageModule).toContain('typeof defaultLoaderModule.default?.default === "function"');
  expect(imageModule).not.toContain('"use client"');

  const imageClientReference = await load.call(
    {} as never,
    "virtual:vitest-plugin-rsc/next-image-client-reference",
    {} as never,
  );
  expect(imageClientReference).toContain('"use client"');
  expect(imageClientReference).not.toContain("getImageProps");
});

test("emits imported static images through Next's image loader in build mode", async () => {
  const plugin = useNextImageClientReference();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const imagePath = path.join(fixtureRoot, "app/next-apis/fixtures/static-logo.svg");
  const emittedAssets: Array<{ fileName: string; source: Buffer }> = [];
  const watchedFiles: string[] = [];
  const previousCwd = process.cwd();

  process.chdir(fixtureRoot);
  try {
    await configResolved.call(
      {} as never,
      { root: fixtureRoot, mode: "test", command: "build" } as never,
    );

    const resolved = await resolveId.call(
      {
        resolve: async () => ({ id: imagePath }),
      } as never,
      "./fixtures/static-logo.svg",
      path.join(fixtureRoot, "app/next-apis/page.tsx"),
      {} as never,
    );

    expect(resolved).toBe(`\0vitest-plugin-rsc:next-static-image:${encodeURIComponent(imagePath)}`);

    const code = (await load.call(
      {
        addWatchFile: (file: string) => watchedFiles.push(file),
        emitFile: (asset: { type: "asset"; fileName: string; source: Buffer }) => {
          emittedAssets.push({ fileName: asset.fileName, source: asset.source });
          return "static-logo-reference";
        },
      } as never,
      resolved as string,
      {} as never,
    )) as string;

    expect(watchedFiles).toEqual([imagePath]);
    expect(emittedAssets).toHaveLength(1);
    expect(emittedAssets[0]!.fileName).toMatch(/^_next\/static\/media\/static-logo\..+\.svg$/);
    expect(emittedAssets[0]!.source.toString()).toContain("static logo");
    expect(code).toContain("import.meta.ROLLUP_FILE_URL_static-logo-reference");
    expect(code).not.toContain("/_next/static/media/static-logo.");
  } finally {
    process.chdir(previousCwd);
  }
});

test("emits build blur placeholders through Next's image loader", async () => {
  const tempRoot = fs.mkdtempSync(path.join(process.cwd(), ".tmp-next-image-blur-"));
  const appDir = path.join(tempRoot, "app");
  const imagePath = path.join(appDir, "tiny.png");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(tempRoot, "package.json"), "{}");
  fs.writeFileSync(imagePath, Buffer.from(tinyPngBase64, "base64"));

  const plugin = useNextImageClientReference();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const emittedAssets: Array<{ fileName: string; source: Buffer }> = [];

  try {
    await configResolved.call(
      {} as never,
      { root: tempRoot, mode: "test", command: "build" } as never,
    );

    const resolved = await resolveId.call(
      {
        resolve: async () => ({ id: imagePath }),
      } as never,
      "./tiny.png",
      path.join(appDir, "page.tsx"),
      {} as never,
    );
    const code = (await load.call(
      {
        addWatchFile: () => {},
        emitFile: (asset: { type: "asset"; fileName: string; source: Buffer }) => {
          emittedAssets.push({ fileName: asset.fileName, source: asset.source });
          return "tiny-reference";
        },
      } as never,
      resolved as string,
      {} as never,
    )) as string;

    expect(emittedAssets).toHaveLength(1);
    expect(code).toContain('blurDataURL":"data:image/png;base64,');
    expect(code).toContain('blurWidth":8');
    expect(code).toContain('blurHeight":8');
    expect(code).not.toContain("/_next/image?url=");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("uses dev blur placeholder URLs from Next's image loader in serve mode", async () => {
  const tempRoot = fs.mkdtempSync(path.join(process.cwd(), ".tmp-next-image-dev-blur-"));
  const appDir = path.join(tempRoot, "app");
  const imagePath = path.join(appDir, "tiny.png");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(tempRoot, "package.json"), "{}");
  fs.writeFileSync(
    path.join(tempRoot, "next.config.js"),
    "module.exports = { basePath: '/base' };\n",
  );
  fs.writeFileSync(imagePath, Buffer.from(tinyPngBase64, "base64"));

  const plugin = useNextImageClientReference();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);

  try {
    await configResolved.call(
      {} as never,
      { root: tempRoot, mode: "test", command: "serve" } as never,
    );

    const resolved = await resolveId.call(
      {
        resolve: async () => ({ id: imagePath }),
      } as never,
      "./tiny.png",
      path.join(appDir, "page.tsx"),
      {} as never,
    );
    const code = (await load.call(
      {
        addWatchFile: () => {},
      } as never,
      resolved as string,
      {} as never,
    )) as string;

    expect(code).toContain('blurDataURL":"/base/_next/image?url=');
    expect(code).toContain("&w=8&q=70");
    expect(code).not.toContain('blurDataURL":"data:image/png;base64,');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("serves imported static images through Next's image loader in dev mode", async () => {
  const tempRoot = fs.mkdtempSync(path.join(process.cwd(), ".tmp-next-image-"));
  const appDir = path.join(tempRoot, "app");
  const sourceImagePath = path.join(fixtureRoot, "app/next-apis/fixtures/static-logo.svg");
  const imagePath = path.join(appDir, "static-logo.svg");
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(tempRoot, "package.json"), "{}");
  fs.writeFileSync(
    path.join(tempRoot, "next.config.js"),
    "module.exports = { assetPrefix: '/cdn', basePath: '/base' };\n",
  );
  fs.copyFileSync(sourceImagePath, imagePath);

  const plugin = useNextImageClientReference();
  const configResolved = getHookHandler(plugin.configResolved);
  const configureServer = getHookHandler(plugin.configureServer);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const watchedFiles: string[] = [];
  let middleware:
    | ((req: { url?: string }, res: FakeResponse, next: () => void) => void)
    | undefined;

  try {
    await configResolved.call(
      {} as never,
      { root: tempRoot, mode: "test", command: "serve" } as never,
    );
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
      {
        resolve: async () => ({ id: imagePath }),
      } as never,
      "./static-logo.svg",
      path.join(appDir, "page.tsx"),
      {} as never,
    );
    const code = (await load.call(
      {
        addWatchFile: (file: string) => watchedFiles.push(file),
      } as never,
      resolved as string,
      {} as never,
    )) as string;
    const nextUrl = /"([^"]*\/cdn\/_next\/static\/media\/static-logo\.[^"]+\.svg)"/.exec(code)?.[1];

    expect(watchedFiles).toEqual([imagePath]);
    expect(nextUrl).toBeDefined();
    expect(code).not.toContain("/base/_next/static/media/static-logo.");
    expect(middleware).toBeDefined();

    const response = new FakeResponse();
    let missed = false;
    middleware!({ url: nextUrl }, response, () => {
      missed = true;
    });

    expect(missed).toBe(false);
    expect(response.statusCode).toBe(200);
    expect(response.headers["Content-Type"]).toBe("image/svg+xml");
    expect(response.body?.toString()).toContain("static logo");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

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
