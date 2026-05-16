import { expect, test } from "vitest";
import { virtualNextEntrypointsPublicId } from "../../virtual-ids.ts";
import { fixtureRoot } from "../../plugin/test-utils.ts";
import { createNextSourceOptimizerEntries } from "./entries.ts";

test("uses the route-discovered virtual Next entrypoint as the optimizer scan entry", () => {
  expect(createNextSourceOptimizerEntries(fixtureRoot)).toEqual([virtualNextEntrypointsPublicId]);
});

test("does not use broad app source globs as optimizer scan entries", () => {
  for (const entry of createNextSourceOptimizerEntries(fixtureRoot)) {
    expect(entry).not.toContain("app/**/*");
    expect(entry).not.toContain("src/app/**/*");
  }
});
