// The user-event column is tests/vitest/ with its clicks and fills in the page,
// by test/user-event.ts, so it measures what an action that Node.js has
// Playwright carry out costs: each of its files is the text of its original,
// with `await locator.click()` as `await click(locator)` and
// `await locator.fill(text)` as `await fill(locator, text)`.
// test/write-columns.ts writes it, and tests/zz-checks/ checks it.

const importAfter = 'import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";\n';
const action = /^(\s*)await (page\..+)\.(click|fill)\((.*)\);$/;

/** A test of tests/vitest/ as the user-event column has it. */
export function toUserEvent(source: string): string {
  const used = new Set<string>();
  const lines = source.split("\n").map((line) => {
    const match = action.exec(line);
    if (!match) {
      // An action of another shape would stay Playwright's in the column.
      if (/\.(click|fill)\(/.test(line)) throw new Error(`An action of an unknown shape: ${line}`);
      return line;
    }
    const [, indent, locator, name, args] = match;
    used.add(name!);
    return `${indent}await ${name}(${[locator, args].filter(Boolean).join(", ")});`;
  });
  if (used.size === 0) return source;
  if (!source.includes(importAfter)) throw new Error(`No import to follow: ${importAfter}`);
  const names = ["click", "fill"].filter((name) => used.has(name)).join(", ");
  return lines
    .join("\n")
    .replace(importAfter, `${importAfter}import { ${names} } from "#test/user-event.ts";\n`);
}
