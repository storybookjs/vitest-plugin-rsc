// How much of each module of Node.js the package's built one has: of the
// exports of Node's own, which work, which throw when called, and which are
// not there. Writes docs/node-coverage.md, for the Node.js it runs on.
//
// `pnpm node-coverage` in the package, after `pnpm build`.
//
// A built file imports a module of Node.js by its bare name, as the server
// layers resolve it to the package's own: here too, by a hook of the
// resolver. What throws is told by its code: a function that throws that
// Node.js does not have it, as unenv's `notImplemented()` and the
// package's `missing()` do, or a class whose constructor does.

import fs from "node:fs";
import { createRequire, isBuiltin, registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dist = fileURLToPath(new URL("../dist/node/", import.meta.url));
const output = fileURLToPath(new URL("../../../docs/node-coverage.md", import.meta.url));
if (!fs.existsSync(dist)) throw new Error(`No ${dist}: run \`pnpm build\` first`);
const distUrl = pathToFileURL(dist).href;

registerHooks({
  resolve(specifier, context, next) {
    const own = specifier.startsWith("vitest-plugin-rsc/node/")
      ? specifier.slice("vitest-plugin-rsc/node/".length)
      : isBuiltin(specifier) && context.parentURL?.startsWith(distUrl)
        ? specifier.replace(/^node:/, "")
        : undefined;
    if (own !== undefined && own !== "async_hooks") {
      return { url: `${distUrl}${own}.js`, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

const nodeRequire = createRequire(import.meta.url);
const names = (function walk(dir: string, prefix = ""): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name), `${prefix}${entry.name}/`)
        : entry.name.endsWith(".js")
          ? [`${prefix}${entry.name.slice(0, -".js".length)}`]
          : [],
    );
})(dist).sort();

const throwing = /not ?implemented|notImplemented|not there in|notThere\(|not supported/i;
// Short: a stub is a line or two that throws, a function or a class with a
// constructor alone. A function that throws for one of its cases only, like
// `KeyObject` for a key that is not secret, is longer. A class extends one
// that throws, too.
function throws(value: unknown): boolean {
  if (typeof value !== "function") return false;
  const code = Function.prototype.toString.call(value);
  if (code.length < 400 && throwing.test(code)) return true;
  const parent = Object.getPrototypeOf(value);
  return code.startsWith("class") && parent !== Function.prototype && throws(parent);
}

type Row = { name: string; node: number; works: number; throwing: string[]; missing: string[] };
const rows: Row[] = [];
for (const name of names) {
  if (!isBuiltin(`node:${name}`)) continue;
  const ours = (await import(`${distUrl}${name}.js`)) as Record<string, unknown>;
  const ownDefault = (ours.default ?? {}) as Record<string, unknown>;
  const real = nodeRequire(`node:${name}`) as Record<string, unknown>;
  const row: Row = { name, node: 0, works: 0, throwing: [], missing: [] };
  for (const key of Object.keys(real)) {
    if (key.startsWith("_") || key === "default") continue;
    row.node++;
    const value = key in ours ? ours[key] : ownDefault[key];
    if (value === undefined || value === null) row.missing.push(key);
    else if (throws(value)) row.throwing.push(key);
    else row.works++;
  }
  rows.push(row);
}

const sum = (pick: (row: Row) => number) => rows.reduce((total, row) => total + pick(row), 0);
const total = {
  node: sum((row) => row.node),
  works: sum((row) => row.works),
  throwing: sum((row) => row.throwing.length),
  missing: sum((row) => row.missing.length),
};
const percent = (part: number) => `${Math.round((part / total.node) * 100)}%`;
const names_ = (list: string[]) =>
  list.length ? list.map((name) => `\`${name}\``).join(", ") : "";

const markdown = `# The modules of Node.js, covered

What the server layers have of each module of Node.js, \`vitest-plugin-rsc/node/<name>\`: of the exports of Node's own module, how many work, which throw when called, and which are not there. Written by \`pnpm node-coverage\` in packages/vitest-plugin-rsc, after \`pnpm build\`, on Node.js ${process.version}: a newer Node.js has more exports.

An export that throws is there so that code which imports it loads. It throws with what it is: \`vitest-plugin-rsc: zlib.brotliCompressSync of Node.js is not there in the browser\`, or unenv's \`[unenv] crypto.createSign is not implemented yet!\`.

Of ${total.node} exports: ${total.works} work (${percent(total.works)}), ${total.throwing} throw (${percent(total.throwing)}), ${total.missing} are not there (${percent(total.missing)}).

| Module | Exports | Work | Throw | Not there |
| --- | ---: | ---: | ---: | ---: |
${rows.map((row) => `| \`${row.name}\` | ${row.node} | ${row.works} | ${row.throwing.length} | ${row.missing.length} |`).join("\n")}

## What throws and what is not there

${rows
  .filter((row) => row.throwing.length || row.missing.length)
  .map((row) =>
    [
      `- **\`${row.name}\`**`,
      row.throwing.length ? `throws: ${names_(row.throwing)}.` : "",
      row.missing.length ? `Not there: ${names_(row.missing)}.` : "",
    ]
      .filter(Boolean)
      .join(" "),
  )
  .join("\n")}
`;
fs.writeFileSync(output, markdown);
console.log(
  `${total.works} of ${total.node} exports work, ${total.throwing} throw, ${total.missing} are not there: ${path.relative(process.cwd(), output)}`,
);
