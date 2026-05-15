import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { useNextMetadataImageLoader } from "./metadata-image-loader-plugin";

test("invokes Next metadata image loader for static metadata image files", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-metadata-image-"));
  const appDir = path.join(root, "app");
  const imagePath = path.join(appDir, "opengraph-image.svg");
  const watchedFiles: string[] = [];
  const plugin = useNextMetadataImageLoader();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);

  try {
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    fs.writeFileSync(
      imagePath,
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="black"/></svg>`,
    );
    fs.writeFileSync(path.join(appDir, "opengraph-image.alt.txt"), "Notes social image");

    await configResolved.call({} as never, { root } as never);

    const request = [
      "next-metadata-image-loader?type=openGraph&segment=/route-patterns&pageExtensions=tsx&basePath=/docs",
      imagePath,
    ].join("!");
    const resolved = (await resolveId.call({} as never, request, undefined, {} as never)) as string;
    const code = (await load.call(
      {
        addWatchFile: (file: string) => watchedFiles.push(file),
      } as never,
      resolved,
      {} as never,
    )) as string;

    expect(watchedFiles).toEqual([imagePath]);
    expect(code).toContain("fillMetadataSegment");
    expect(code).toContain('"/docs/route-patterns"');
    expect(code).toContain('"opengraph-image.svg"');
    expect(code).toContain('"type":"image/svg+xml"');
    expect(code).toContain('"width":1200');
    expect(code).toContain('"height":630');
    expect(code).toContain('"alt":"Notes social image"');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("invokes Next metadata image loader for static icon conventions", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-metadata-icon-"));
  const appDir = path.join(root, "app");
  const iconPath = path.join(appDir, "icon.svg");
  const appleIconPath = path.join(appDir, "apple-icon.png");
  const plugin = useNextMetadataImageLoader();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);

  try {
    fs.mkdirSync(appDir, { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    fs.writeFileSync(
      iconPath,
      `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="black"/></svg>`,
    );
    fs.writeFileSync(
      appleIconPath,
      Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lhJ2kQAAAABJRU5ErkJggg==",
        "base64",
      ),
    );

    await configResolved.call({} as never, { root } as never);

    const iconCode = await loadMetadataImageModule({
      load,
      request: [
        "next-metadata-image-loader?type=icon&segment=/settings&pageExtensions=tsx&basePath=",
        iconPath,
      ].join("!"),
      resolveId,
    });
    const appleIconCode = await loadMetadataImageModule({
      load,
      request: [
        "next-metadata-image-loader?type=apple&segment=/settings&pageExtensions=tsx&basePath=",
        appleIconPath,
      ].join("!"),
      resolveId,
    });

    expect(iconCode).toContain('"icon.svg"');
    expect(iconCode).toContain('"type":"image/svg+xml"');
    expect(iconCode).toContain('"sizes":"any"');
    expect(iconCode).toContain('"/settings"');
    expect(appleIconCode).toContain('"apple-icon.png"');
    expect(appleIconCode).toContain('"type":"image/png"');
    expect(appleIconCode).toContain('"sizes":"1x1"');
    expect(appleIconCode).toContain('"/settings"');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

async function loadMetadataImageModule({
  load,
  request,
  resolveId,
}: {
  load: HookWithCall;
  request: string;
  resolveId: HookWithCall;
}) {
  const resolved = (await resolveId.call({} as never, request, undefined, {} as never)) as string;
  return (await load.call(
    {
      addWatchFile: () => {},
    } as never,
    resolved,
    {} as never,
  )) as string;
}

type HookWithCall = {
  call(thisArg: unknown, ...args: unknown[]): unknown;
};

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}
