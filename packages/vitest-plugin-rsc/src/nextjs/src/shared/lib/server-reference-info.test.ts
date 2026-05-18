import path from "node:path";
import { expect, test } from "vitest";
import { fixtureRoot, getHookHandler } from "../../../plugin/test-utils.ts";
import { useVitestServerReferenceInfo } from "./server-reference-info.ts";

test("aliases Next server-reference-info for Next internals", async () => {
  const plugin = useVitestServerReferenceInfo(fixtureRoot);
  const resolveId = getHookHandler(plugin.resolveId);
  const load = getHookHandler(plugin.load);
  const id = "\0vitest-plugin-rsc:next-server-reference-info";

  expect(
    await resolveId.call(
      {} as never,
      "next/dist/shared/lib/server-reference-info.js",
      path.join(fixtureRoot, "node_modules/next/dist/client/components/router-reducer.js"),
      {} as never,
    ),
  ).toBe(id);

  const code = await load.call({} as never, id, {} as never);
  expect(code).toContain("extractNextInfoFromServerReferenceId");
  expect(code).toContain('id.includes("#")');
  expect(code).toContain("usedArgs: [true, true, true, true, true, true]");
});
