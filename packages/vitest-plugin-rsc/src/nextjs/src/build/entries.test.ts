import { expect, test } from "vitest";
import { fixtureRoot } from "../../plugin/test-utils.ts";
import { createNextSourceOptimizerEntries } from "./entries.ts";

test("uses Next app convention files as optimizer scan entries", () => {
  expect(createNextSourceOptimizerEntries(fixtureRoot)).toEqual([
    "app/**/{page,layout,template,error,loading,not-found,forbidden,unauthorized,global-error,default,route,icon,apple-icon,opengraph-image,twitter-image,sitemap,robots,manifest}.{js,jsx,ts,tsx}",
  ]);
});

test("does not scan app test files as optimizer entries", () => {
  for (const entry of createNextSourceOptimizerEntries(fixtureRoot)) {
    expect(entry).not.toBe("app/**/*.test.{js,jsx,ts,tsx}");
    expect(entry).not.toBe("src/app/**/*.test.{js,jsx,ts,tsx}");
  }
});
