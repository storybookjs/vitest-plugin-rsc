import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { useNextImageClientReference } from "./image-plugin";

const fixtureRoot = fileURLToPath(
  new URL("../../../../playground/nextjs-notes-demo/", import.meta.url),
);

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
  expect(imageModule).not.toContain('"use client"');

  const imageClientReference = await load.call(
    {} as never,
    "virtual:vitest-plugin-rsc/next-image-client-reference",
    {} as never,
  );
  expect(imageClientReference).toContain('"use client"');
  expect(imageClientReference).not.toContain("getImageProps");
});

function getHookHandler<T extends (...args: never[]) => unknown>(
  hook: T | { handler: T } | undefined,
): T {
  if (!hook) throw new Error("Expected Vite hook to be defined.");
  return typeof hook === "function" ? hook : hook.handler;
}
