import path from "node:path";
import { expect, test } from "vitest";
import {
  disableNextDevServerRuntime,
  provideBufferLikeNextWebpack,
  treatNextInternalsAsServerInRsc,
} from "./runtime-rewrites.ts";
import { fixtureRoot, getHookHandler } from "./test-utils.ts";

test("rewrites Next server-runtime checks only for Next internals in the RSC environment", async () => {
  const plugin = treatNextInternalsAsServerInRsc();
  const transform = getHookHandler(plugin.transform);
  const code = `
    export const runtime = process.env.NEXT_RUNTIME;
    export const hasWindow = typeof window !== "undefined";
    export const indexedWindow = typeof window.document;
  `;

  expect(plugin.applyToEnvironment?.({ name: "client" } as never)).toBe(true);
  expect(plugin.applyToEnvironment?.({ name: "react_client" } as never)).toBe(false);

  const result = (await transform.call(
    {} as never,
    code,
    path.join(fixtureRoot, "node_modules/next/dist/server/app-render/work-async-storage.js"),
  )) as { code: string };

  expect(result.code).toContain('export const runtime = "edge";');
  expect(result.code).toContain('export const hasWindow = "undefined" !== "undefined";');
  expect(result.code).toContain("export const indexedWindow = typeof window.document;");
  expect(
    await transform.call({} as never, code, path.join(fixtureRoot, "node_modules/react/index.js")),
  ).toBeUndefined();
});

test("disables Next dev-server runtime checks only inside Next internals", async () => {
  const plugin = disableNextDevServerRuntime();
  const transform = getHookHandler(plugin.transform);
  const code = `
    export const isNextDevServer = process.env.__NEXT_DEV_SERVER;
  `;

  const result = (await transform.call(
    {} as never,
    code,
    path.join(fixtureRoot, "node_modules/next/dist/client/components/app-router.js"),
  )) as { code: string };

  expect(result.code).toContain("export const isNextDevServer = false;");
  expect(
    await transform.call({} as never, code, path.join(fixtureRoot, "node_modules/react/index.js")),
  ).toBeUndefined();
});

test("provides Buffer only to Next internals that reference Buffer", async () => {
  const plugin = provideBufferLikeNextWebpack();
  const transform = getHookHandler(plugin.transform);
  const code = `export const value = Buffer.from("next");`;

  const result = (await transform.call(
    {} as never,
    code,
    path.join(fixtureRoot, "node_modules/next/dist/server/web/spec-extension/blob.js"),
  )) as { code: string };

  expect(result.code).toMatch(/^import \{ Buffer \} from "node:buffer";/);
  expect(
    await transform.call({} as never, code, path.join(fixtureRoot, "node_modules/react/index.js")),
  ).toBeUndefined();
});
