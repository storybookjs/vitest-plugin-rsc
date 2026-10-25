import { pathToFileURL } from "node:url";
import MagicString, { type SourceMap } from "magic-string";
import type { Plugin } from "vite";

// The files next to a module of the `client` environment in a worker of
// Node.js, by `new URL("./file", import.meta.url)`: the file's own URL, as
// Node.js has it. That environment, the tests' and the rsc layer's, runs on
// the worker's global there, on Node.js, where Vite makes the URL one that
// the dev server serves, as for a browser, and Vitest's environment of a DOM
// one of the page. A package that sees Node.js, like PGlite, which reads its
// wasm with `fs`, fails on such a URL. The page's own environment, which runs
// in the window's realm, keeps the page's URLs.

// A relative URL by a string, as Vite takes it: one with an expression in it
// is a glob of Vite's, which stays the page's.
const moduleFileUrl =
  /\bnew\s+URL\s*\(\s*('\.\.?\/[^'\n]*'|"\.\.?\/[^"\n]*"|`\.\.?\/[^`$\n]*`)\s*,\s*import\.meta\.url\s*(?:,\s*)?\)/g;

/** `code` of `file`, with each URL of a file next to it as a `file:` URL. */
export function withModuleFileUrls(
  code: string,
  file: string,
): { code: string; map: SourceMap } | undefined {
  const base = pathToFileURL(file);
  let output: MagicString | undefined;
  for (const match of code.matchAll(moduleFileUrl)) {
    const url = new URL(match[1]!.slice(1, -1), base).href;
    output ??= new MagicString(code);
    output.overwrite(match.index, match.index + match[0].length, `new URL(${JSON.stringify(url)})`);
  }
  return output && { code: output.toString(), map: output.generateMap({ hires: "boundary" }) };
}

/**
 * Gives a module of the `client` environment the `file:` URLs of the files
 * next to it, where the page is in a worker of Node.js: see the top.
 */
export function moduleFilesPlugin(page: { inNode: boolean }): Plugin {
  return {
    name: "rsc:module-files-in-node",
    // Before Vite's, which makes the URL one of the dev server.
    enforce: "pre",
    transform: {
      filter: { code: "import.meta.url" },
      handler(code, id) {
        if (!page.inNode || this.environment.name !== "client") return;
        return withModuleFileUrls(code, id.split("?")[0]!);
      },
    },
  };
}
