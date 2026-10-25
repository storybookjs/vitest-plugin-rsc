import { expect, test } from "vitest";
import { toDomLocators, toDomLocatorsHelpers } from "#test/dom-locators-column.ts";

// The dom-locators column as test/write-dom-locators-tests.ts writes it now:
// a change of tests/vitest/ or test/vitest.ts that it hasn't been written
// again for fails here, before the column measures an older app than the
// others. Run `node test/write-dom-locators-tests.ts`.

const text = import.meta.glob<string>(
  [
    "../vitest/*.test.tsx",
    "../dom-locators/*.test.tsx",
    "../../test/vitest.ts",
    "../../test/dom-locators.ts",
  ],
  { query: "?raw", import: "default", eager: true },
);

test("tests/dom-locators/ is tests/vitest/ with the page of dom-locators", () => {
  const originals = Object.keys(text).filter((file) => file.startsWith("../vitest/"));
  const copies = Object.keys(text).filter((file) => file.startsWith("../dom-locators/"));
  const asCopy = (file: string) => file.replace("../vitest/", "../dom-locators/");
  expect(copies).toEqual(originals.map(asCopy));
  for (const file of originals) expect(text[asCopy(file)], file).toBe(toDomLocators(text[file]!));
});

test("test/dom-locators.ts is test/vitest.ts with the page of dom-locators", () => {
  expect(text["../../test/dom-locators.ts"]).toBe(
    toDomLocatorsHelpers(text["../../test/vitest.ts"]!),
  );
});
