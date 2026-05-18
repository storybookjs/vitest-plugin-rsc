import fs from "node:fs/promises";
import { expect, test } from "vitest";

test("does not expose a public Next App Router client wrapper", async () => {
  const packageJson = JSON.parse(
    await fs.readFile(new URL("../../package.json", import.meta.url), "utf8"),
  ) as {
    exports: Record<string, unknown>;
  };
  const tsdownConfig = await fs.readFile(
    new URL("../../tsdown.config.ts", import.meta.url),
    "utf8",
  );
  const clientSource = await fs.readFile(new URL("client.tsx", import.meta.url), "utf8");

  expect(packageJson.exports["./nextjs/client"]).toEqual({
    "vitest-plugin-rsc-source": "./src/nextjs/client.tsx",
    default: null,
  });
  expect(tsdownConfig).not.toContain('"src/nextjs/client.tsx"');
  expect(clientSource).toContain("intentionally internal");
  expect(clientSource).not.toContain("export const NextRouter");
});
