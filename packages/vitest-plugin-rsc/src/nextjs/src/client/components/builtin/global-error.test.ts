import { expect, test } from "vitest";
import { getHookHandler } from "../../../../plugin/test-utils.ts";
import { useNextBuiltinGlobalErrorStub } from "./global-error.ts";

test("loads the virtual built-in global-error client stub", async () => {
  const plugin = useNextBuiltinGlobalErrorStub();
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const id = "\0virtual:vitest-plugin-rsc/next-builtin-global-error-stub";

  expect(
    await resolveId.call(
      {} as never,
      "virtual:vitest-plugin-rsc/next-builtin-global-error-stub",
      undefined,
      {} as never,
    ),
  ).toBe(id);
  expect(await load.call({} as never, id, {} as never)).toContain('"use client"');
  expect(await load.call({} as never, id, {} as never)).toContain(
    "export default function GlobalError()",
  );
});
