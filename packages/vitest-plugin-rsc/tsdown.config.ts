import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import type { Plugin } from "rolldown";
import { defineConfig } from "tsdown";

const dts = { sourcemap: process.argv.slice(2).includes("--sourcemap") };

// memfs requires modules of Node.js, `require("node:events")`, which stay
// out of the file: in a browser `require` is nothing, so each becomes an
// import of the module, which the server layers stand in for. What a
// `require` of a module of Node.js gives is its default export, so that is
// what the facade of one exports. As Vite's optimizer does for a pre-bundle.
const facade = "\0require-as-import:";
const requireAsImport: Plugin = {
  name: "require-as-import",
  resolveId(id, _importer, options) {
    if (options.kind === "require-call" && isBuiltin(id)) return { id: facade + id };
  },
  load(id) {
    if (!id.startsWith(facade)) return;
    const name = JSON.stringify(id.slice(facade.length));
    return `import * as m from ${name};\nmodule.exports = m.default;\n`;
  },
};

// unenv's `async_hooks` in the file, for what unenv's modules import of it:
// `AsyncResource` for `events`. Not the package's own, which the app's
// `node:async_hooks` gets (../index.ts): a file that imports it shares a
// chunk with the app in a build, which every page then fetches.
const unenvAsyncHooks: Plugin = {
  name: "unenv-async-hooks",
  resolveId(id) {
    if (id === "node:async_hooks" || id === "async_hooks") {
      return this.resolve("unenv/node/async_hooks", path.join(nodeSource, "index.ts"));
    }
  },
};

// What a package's `browser` field maps to `false` is nothing, for the
// stream build, where readable-stream's says so for `util`: before
// `requireAsImport`, which would make the `require` an import of the
// package's `util`, whose `debuglog()` logs every step of a stream.
const emptyModule = "\0browser-false";
const browserFalse: Plugin = {
  name: "browser-false",
  resolveId(id, importer) {
    if (!importer || !isBuiltin(id)) return;
    for (let dir = path.dirname(importer); dir !== path.dirname(dir); dir = path.dirname(dir)) {
      const file = path.join(dir, "package.json");
      if (!fs.existsSync(file)) continue;
      const { browser } = JSON.parse(fs.readFileSync(file, "utf8")) as { browser?: unknown };
      const mapped =
        typeof browser === "object" && browser
          ? (browser as Record<string, unknown>)[id]
          : undefined;
      return mapped === false ? { id: emptyModule } : undefined;
    }
  },
  load: (id) => (id === emptyModule ? "module.exports = {};\n" : undefined),
};

const nodeSource = path.join(import.meta.dirname, "src/node");
const nodeOutput = path.join(import.meta.dirname, "dist/node");

// The licenses of what the files of dist/node/ have in them: memfs, unenv
// and what they depend on, by the modules of node_modules that the builds
// bundled, into dist/node/LICENSES.md. The builds run at once, and every
// one writes the file as it closes, with what all of them have bundled by
// then: the last to close has it all, as each closes after it bundled.
const bundled = new Map<string, { version: string; license: string; text: string }>();
const licenses: Plugin = {
  name: "licenses",
  generateBundle() {
    for (const id of this.getModuleIds()) {
      // The last `node_modules/<name>/` of the path: pnpm has `.pnpm/` first.
      const match = [
        ...id.split("?")[0]!.matchAll(/\/node_modules\/((?:@[^/]+\/)?[^/.][^/]*)\//g),
      ].at(-1);
      if (!match || bundled.has(match[1]!)) continue;
      const dir = id.slice(0, match.index + match[0].length);
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as {
        version: string;
        license?: string;
      };
      const file = fs.readdirSync(dir).find((name) => /^licen[cs]e/i.test(name));
      bundled.set(match[1]!, {
        version: pkg.version,
        license: pkg.license ?? "",
        text: file ? fs.readFileSync(path.join(dir, file), "utf8").trim() : "",
      });
    }
  },
  closeBundle() {
    const sections = [...bundled]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([name, { version, license, text }]) =>
          `## ${name} ${version}\n\nLicense: ${license}\n\n${text}\n`,
      );
    fs.mkdirSync(nodeOutput, { recursive: true });
    fs.writeFileSync(
      path.join(nodeOutput, "LICENSES.md"),
      "# Licenses of what the modules of Node.js in this directory have in them\n\n" +
        sections.join("\n"),
    );
  },
};

export default defineConfig([
  {
    entry: [
      "src/index.ts",
      "src/async-hooks.ts",
      "src/testing-library.tsx",
      "src/testing-library-client.tsx",
      "src/nextjs/index.ts",
      "src/nextjs/client-components.ts",
      "src/nextjs/plugin.ts",
      "src/nextjs/adapter.ts",
      "src/nextjs/setup.ts",
      "src/nextjs/affected/browser.ts",
      "src/nextjs/rsc.ts",
      "src/nextjs/ssr.ts",
      "src/nextjs/client.tsx",
      "src/nextjs/internal.ts",
      // A thread of its own: see src/nextjs/project/env.ts.
      "src/nextjs/project/env-worker.ts",
      // Files of their own: Vite RSC compiles the module of a "use server" or
      // a "use client" directive.
      "src/nextjs/server-action.ts",
      "src/nextjs/node-rendered.tsx",
    ],
    // The page the tests run in, next to the plugin that names it.
    copy: [{ from: "src/nextjs/tester.html", to: "dist/nextjs" }],
    format: ["esm"],
    fixedExtension: false,
    deps: {
      neverBundle: [
        /^virtual:/,
        /^@vitejs\/plugin-rsc\/vendor\//,
        /^vitest(\/|$)/,
        // Left as this import in dist: it resolves to the entry of its own,
        // dist/nextjs/node-rendered.js, with its "use client". See rsc.ts.
        "vitest-plugin-rsc/nextjs/node-rendered",
      ],
    },
    inputOptions: {
      onLog(level, log, handler) {
        // The file of a directive is an entry of its own, so the directive
        // stays at its top: dist/nextjs/server-action.js and node-rendered.js.
        if (
          log.code === "MODULE_LEVEL_DIRECTIVE" &&
          /(server-action|node-rendered)\.tsx?$/.test(log.id ?? "")
        ) {
          return;
        }
        handler(level, log);
      },
    },
    dts,
  },
  // The modules of Node.js for the server layers, `vitest-plugin-rsc/node/*`:
  // each one file of its own, with memfs or unenv in it, which are
  // devDependencies for that. Vite serves such a file as it is, and a build
  // bundles it: no dependency for Vite to find and pre-bundle. A build per
  // file, as Rolldown shares code between the entries of one build. What one
  // imports of another, `fs/promises` of `fs`, stays an import, so that
  // memfs is in one of them. No types: the app types `node:fs` by
  // @types/node, and unenv's own .d.mts files do not parse.
  ...nodeModules().map((name) => ({
    entry: { [name]: path.join(nodeSource, `${name}.ts`) },
    outDir: nodeOutput,
    format: ["esm" as const],
    fixedExtension: false,
    outputOptions: { codeSplitting: false as const },
    // What is in a file, and nothing else on an upgrade: memfs, unenv and
    // stream-browserify with what they depend on. The package's own by name
    // stays an import. The assert and util packages depend on a tree of
    // small packages that changes with their versions: those two files take
    // all of theirs, which the licenses file lists.
    deps: {
      neverBundle: [/^vitest-plugin-rsc\//],
      ...(name !== "assert" &&
        name !== "util" && {
          onlyBundle: [
            "memfs",
            /^@jsonjoy\.com\//,
            "glob-to-regex.js",
            "thingies",
            "tree-dump",
            "tslib",
            "unenv",
            "pathe",
            "stream-browserify",
            "readable-stream",
            "node-inspect-extracted",
            "events",
            "inherits",
            "string_decoder",
            "safe-buffer",
            "util-deprecate",
            "path-browserify",
          ],
        }),
    },
    // readable-stream's files for a browser, by its `browser` field: the one
    // for Node.js requires `stream`, which is this file.
    ...(name === "stream" && { inputOptions: { resolve: { aliasFields: [["browser"]] } } }),
    // The util package's `inherits` requires `util`, which is this file: the
    // package's own, in the file.
    ...(name === "util" && {
      alias: { util: path.join(import.meta.dirname, "node_modules/util/util.js") },
    }),
    plugins: [
      unenvAsyncHooks,
      ...(name === "stream" ? [browserFalse] : []),
      requireAsImport,
      licenses,
    ],
    dts: false,
  })),
]);

// "fs", "fs/promises", ... : every file of src/node/.
function nodeModules(dir = ""): string[] {
  return fs
    .readdirSync(path.join(nodeSource, dir), { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? nodeModules(path.posix.join(dir, entry.name))
        : entry.name.endsWith(".ts")
          ? [path.posix.join(dir, entry.name.slice(0, -".ts".length))]
          : [],
    );
}
