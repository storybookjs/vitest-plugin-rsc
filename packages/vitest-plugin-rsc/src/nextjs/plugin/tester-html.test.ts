import { expect, test } from "vitest";
import { createNextTesterHtmlConfig, nextTesterHtmlPath } from "./tester-html.ts";

test("sets the Next tester HTML in Vitest browser projects by default", () => {
  expect(createNextTesterHtmlConfig({})).toEqual({
    test: {
      browser: {
        testerHtmlPath: nextTesterHtmlPath,
      },
    },
  });
});

test("does not replace a user-provided Vitest browser tester HTML", () => {
  expect(
    createNextTesterHtmlConfig({
      test: {
        browser: {
          testerHtmlPath: "/custom/tester.html",
        },
      },
    } as never),
  ).toEqual({});
});

test("does not replace user-provided Vitest browser instance tester HTML", () => {
  expect(
    createNextTesterHtmlConfig({
      test: {
        browser: {
          instances: [{ testerHtmlPath: "/custom/chromium.html" }],
        },
      },
    } as never),
  ).toEqual({});
});
