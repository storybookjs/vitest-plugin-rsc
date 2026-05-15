import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { loadNextProjectConfig } from "./config";

const fixtureRoot = fileURLToPath(
  new URL("../../../../playground/nextjs-notes-demo/", import.meta.url),
);

test("loads custom routes from the real Next config loader", async () => {
  const previousCwd = process.cwd();

  process.chdir(fixtureRoot);
  try {
    const projectConfig = await loadNextProjectConfig(fixtureRoot, "test");

    expect(projectConfig.customRoutes.rewrites.afterFiles).toMatchObject([
      { source: "/next-config-rewrite", destination: "/next-apis" },
    ]);
    expect(projectConfig.customRoutes.redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "/next-config-redirect",
          destination: "/next-apis",
          permanent: false,
        }),
      ]),
    );
    expect(projectConfig.customRoutes.headers).toMatchObject([
      {
        source: "/next-apis",
        headers: [{ key: "x-next-config-header", value: "notes-demo" }],
      },
    ]);
  } finally {
    process.chdir(previousCwd);
  }
});
