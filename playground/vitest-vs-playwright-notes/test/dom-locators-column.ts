// The dom-locators column is tests/vitest/ with the `page` of dom-locators in
// place of `vitest/browser`'s, so it measures what that import buys: each of
// its files is the text of its original, with the imports swapped.
// test/write-columns.ts writes it, and tests/zz-checks/ checks it.

/** A test of tests/vitest/ as the dom-locators column has it. */
export function toDomLocators(source: string): string {
  return source
    .replaceAll('from "vitest/browser";', 'from "dom-locators";')
    .replaceAll('from "#test/vitest.ts";', 'from "#test/dom-locators.ts";');
}

/** test/vitest.ts as test/dom-locators.ts. */
export function toDomLocatorsHelpers(source: string): string {
  return toDomLocators(source).replace(
    "// The helpers of tests/vitest/, which tests/playwright/test.ts has too.",
    "// The helpers of tests/dom-locators/: test/vitest.ts, by test/write-columns.ts.",
  );
}
