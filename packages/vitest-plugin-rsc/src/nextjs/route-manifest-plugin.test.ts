import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { loadNextProjectConfig } from "./config";
import { loadNextRouteStaticInfo } from "./route-manifest-plugin";

const fixtureRoot = fileURLToPath(
  new URL("../../../../playground/nextjs-notes-demo/", import.meta.url),
);

test("collects route segment config through Next static info", async () => {
  const previousCwd = process.cwd();

  process.chdir(fixtureRoot);
  try {
    const projectConfig = await loadNextProjectConfig(fixtureRoot, "test");
    const appPath = "/route-patterns/conventions/generated/page";

    const staticInfo = await loadNextRouteStaticInfo(fixtureRoot, projectConfig, {
      route: "/route-patterns/conventions/generated",
      appDir: projectConfig.appDir ?? path.join(fixtureRoot, "app"),
      appPath,
      appPaths: [appPath],
      allNormalizedAppPaths: [appPath],
      pageFile: path.join(fixtureRoot, "app/route-patterns/conventions/generated/page.tsx"),
    });

    expect(staticInfo.runtime).toBe("edge");
    expect(staticInfo.maxDuration).toBe(5);
    expect(staticInfo.preferredRegion).toBe("auto");
  } finally {
    process.chdir(previousCwd);
  }
});
