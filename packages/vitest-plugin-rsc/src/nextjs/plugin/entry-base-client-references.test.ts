import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "vitest";
import { useNextEntryBaseClientReferences } from "./entry-base-client-references.ts";
import { fixtureRoot, getHookHandler } from "./test-utils.ts";

test("proxies Next entry-base client imports as RSC client references", async () => {
  const plugin = useNextEntryBaseClientReferences();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const entryBaseFile = path.join(
    fixtureRoot,
    "node_modules/next/dist/server/app-render/entry-base.js",
  );
  const encodedModuleId = encodeURIComponent("next/dist/client/components/layout-router.js");

  await configResolved.call({} as never, { root: fixtureRoot } as never);

  const resolved = (await resolveId.call(
    {} as never,
    "../../client/components/layout-router",
    entryBaseFile,
    {} as never,
  )) as string;
  const serverCode = (await load.call({} as never, resolved, {} as never)) as string;
  const browserCode = (await load.call(
    { environment: { name: "react_client" } } as never,
    resolved,
    {} as never,
  )) as string;

  expect(resolved).toBe(`\0vitest-plugin-rsc:next-entry-base-client-reference:${encodedModuleId}`);
  expect(serverCode).toContain(
    'import { registerClientReference } from "@vitejs/plugin-rsc/react/rsc"',
  );
  expect(serverCode).toContain(
    `"/@id/__x00__vitest-plugin-rsc:next-entry-base-client-reference:${encodedModuleId}"`,
  );
  expect(serverCode).toContain('export default createClientReference("default");');
  expect(browserCode).toContain('"use client"');
  expect(browserCode).toContain("next/dist/client/components/layout-router.js");
});

test("proxies Next entry-base client imports with comment-wrapped CJS exports", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-plugin-rsc-next-"));
  try {
    const entryBaseFile = path.join(root, "node_modules/next/dist/server/app-render/entry-base.js");
    const moduleFile = path.join(
      root,
      "node_modules/next/dist/client/components/commented-export.js",
    );
    fs.mkdirSync(path.dirname(entryBaseFile), { recursive: true });
    fs.mkdirSync(path.dirname(moduleFile), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    fs.writeFileSync(path.join(root, "node_modules/next/package.json"), "{}");
    fs.writeFileSync(entryBaseFile, "");
    fs.writeFileSync(
      moduleFile,
      `
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
Object.defineProperty(exports, /**
 * Next 16.0/16.1 SWC keeps comments before the export name.
 */ "default", {
  enumerable: true,
  get: function() { return CommentedExport; }
});
function CommentedExport() {}
`,
    );

    const plugin = useNextEntryBaseClientReferences();
    const configResolved = getHookHandler(plugin.configResolved);
    const resolveId = getHookHandler(plugin.resolveId);
    const load = getHookHandler(plugin.load);

    await configResolved.call({} as never, { root } as never);

    const resolved = (await resolveId.call(
      {} as never,
      "../../client/components/commented-export",
      entryBaseFile,
      {} as never,
    )) as string;
    const serverCode = (await load.call({} as never, resolved, {} as never)) as string;

    expect(serverCode).toContain('export default createClientReference("default");');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("proxies Next entry-base devtools client imports as RSC client references", async () => {
  const plugin = useNextEntryBaseClientReferences();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const entryBaseFile = path.join(
    fixtureRoot,
    "node_modules/next/dist/server/app-render/entry-base.js",
  );
  const encodedModuleId = encodeURIComponent(
    "next/dist/next-devtools/userspace/app/segment-explorer-node.js",
  );

  await configResolved.call({} as never, { root: fixtureRoot } as never);

  const resolved = (await resolveId.call(
    {} as never,
    "../../next-devtools/userspace/app/segment-explorer-node",
    entryBaseFile,
    {} as never,
  )) as string;
  const serverCode = (await load.call({} as never, resolved, {} as never)) as string;
  const browserCode = (await load.call(
    { environment: { name: "react_client" } } as never,
    resolved,
    {} as never,
  )) as string;

  expect(resolved).toBe(`\0vitest-plugin-rsc:next-entry-base-client-reference:${encodedModuleId}`);
  expect(serverCode).toContain(
    'export const SegmentViewNode = createClientReference("SegmentViewNode");',
  );
  expect(serverCode).toContain(
    'export const SegmentViewStateNode = createClientReference("SegmentViewStateNode");',
  );
  expect(serverCode).toContain(
    'export const SegmentBoundaryTriggerNode = createClientReference("SegmentBoundaryTriggerNode");',
  );
  expect(browserCode).toContain('"use client"');
  expect(browserCode).toContain("next/dist/next-devtools/userspace/app/segment-explorer-node.js");
});

test("does not proxy Next entry-base server imports as client references", async () => {
  const plugin = useNextEntryBaseClientReferences();
  const configResolved = getHookHandler(plugin.configResolved);
  const resolveId = getHookHandler(plugin.resolveId);
  const entryBaseFile = path.join(
    fixtureRoot,
    "node_modules/next/dist/server/app-render/entry-base.js",
  );

  await configResolved.call({} as never, { root: fixtureRoot } as never);

  expect(
    await resolveId.call(
      {} as never,
      "../app-render/work-async-storage.external",
      entryBaseFile,
      {} as never,
    ),
  ).toBeUndefined();
});
