// The user-event column is tests/vitest/ with its clicks and fills in the page,
// by test/user-event.ts, so it measures what an action that Node.js has
// Playwright carry out costs: each of its files is the text of its original,
// with `await locator.click()` as `await click(locator)` and
// `await locator.fill(text)` as `await fill(locator, text)`.
// test/write-columns.ts writes it, and tests/zz-checks/ checks it.

// The import of test/user-event.ts goes after this one.
const renderServerImport =
  'import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";\n';
const action = /^(\s*)await (page\..+)\.(click\(\)|fill\((.+)\));$/;
// Any action of Vitest's locators or `userEvent`, which would stay Playwright's
// in the column unless it is one that `action` turns into test/user-event.ts's.
const anyAction =
  /\.(click|dblClick|tripleClick|fill|clear|hover|unhover|selectOptions|upload|dropTo)\(|\buserEvent\./;

/** A test of tests/vitest/ as the user-event column has it. */
export function toUserEvent(source: string): string {
  const used = new Set<string>();
  const lines = source.split("\n").map((line) => {
    const match = action.exec(line);
    if (!match) {
      if (anyAction.test(line)) throw new Error(`An action of an unknown shape: ${line}`);
      return line;
    }
    const [, indent, locator, call, text] = match;
    const name = call!.startsWith("click") ? "click" : "fill";
    used.add(name);
    return `${indent}await ${name}(${[locator, text].filter(Boolean).join(", ")});`;
  });
  if (used.size === 0) return source;
  if (!source.includes(renderServerImport)) {
    throw new Error(`No import of renderServer for the import of test/user-event.ts to follow`);
  }
  const names = ["click", "fill"].filter((name) => used.has(name)).join(", ");
  return lines
    .join("\n")
    .replace(
      renderServerImport,
      `${renderServerImport}import { ${names} } from "#test/user-event.ts";\n`,
    );
}
