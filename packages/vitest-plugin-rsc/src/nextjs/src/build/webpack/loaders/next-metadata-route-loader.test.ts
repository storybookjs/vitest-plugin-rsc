import fs from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import { useNextMetadataRouteLoader } from "./next-metadata-route-loader.ts";

test("invokes Next metadata route loader for dynamic text conventions", async () => {
  const root = createNextAppFixture({
    "app/robots.ts": `export const runtime = "edge";
export default function robots() {
  return { rules: { userAgent: "*", disallow: "/private" } };
}
`,
  });
  const robotsPath = path.join(root, "app/robots.ts");
  const watchedFiles: string[] = [];

  try {
    const code = await loadMetadataRouteModule({
      root,
      request: createMetadataRouteRequest({
        filePath: robotsPath,
        isDynamicRouteExtension: "1",
      }),
      watchedFiles,
    });

    expect(watchedFiles).toEqual([robotsPath]);
    expect(code).toContain("/* dynamic asset route */");
    expect(code).toContain('const contentType = "text/plain"');
    expect(code).toContain(`import handler from ${JSON.stringify(`/@fs/${robotsPath.slice(1)}`)}`);
    expect(code).toContain(
      `export { runtime } from ${JSON.stringify(`/@fs/${robotsPath.slice(1)}`)}`,
    );
    expect(code).toContain("next/dist/build/webpack/loaders/metadata/resolve-route-data");
    expect(code).not.toContain(`from ${JSON.stringify(robotsPath)}`);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("provides module exports for dynamic sitemap metadata routes", async () => {
  const root = createNextAppFixture({
    "app/sitemap.ts": `export function generateSitemaps() {
  return [{ id: "notes" }];
}

export default function sitemap() {
  return [{ url: "https://notes.example.test/notes" }];
}
`,
  });
  const sitemapPath = path.join(root, "app/sitemap.ts");

  try {
    const code = await loadMetadataRouteModule({
      root,
      request: createMetadataRouteRequest({
        filePath: sitemapPath,
        isDynamicRouteExtension: "1",
      }),
    });

    expect(code).toContain("/* dynamic sitemap route with generateSitemaps */");
    expect(code).toContain("export async function generateStaticParams()");
    expect(code).toContain("__metadata_id__");
    expect(code).toContain(
      `import { default as handler, generateSitemaps } from ${JSON.stringify(
        `/@fs/${sitemapPath.slice(1)}`,
      )}`,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

async function loadMetadataRouteModule({
  root,
  request,
  watchedFiles = [],
}: {
  root: string;
  request: string;
  watchedFiles?: string[];
}) {
  const plugin = useNextMetadataRouteLoader();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);

  await configResolved.call({} as never, { root } as never);

  const resolved = (await resolveId.call({} as never, request, undefined, {} as never)) as string;
  return (await load.call(
    {
      addWatchFile: (file: string) => watchedFiles.push(file),
    } as never,
    resolved,
    {} as never,
  )) as string;
}

function createNextAppFixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-next-metadata-route-"));
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");

  for (const [relativePath, source] of Object.entries(files)) {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }

  return root;
}

function createMetadataRouteRequest(options: {
  filePath: string;
  isDynamicRouteExtension: "1" | "0";
}) {
  const params = new URLSearchParams({
    filePath: options.filePath,
    isDynamicRouteExtension: options.isDynamicRouteExtension,
  });
  return `next-metadata-route-loader?${params.toString()}!?__next_metadata_route__`;
}

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}
