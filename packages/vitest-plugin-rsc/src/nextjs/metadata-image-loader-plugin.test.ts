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

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}
