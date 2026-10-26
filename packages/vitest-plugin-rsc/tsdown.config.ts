import fs from "node:fs";
import { isBuiltin } from "node:module";
import path from "node:path";
import type { Plugin } from "rolldown";
import { defineConfig, type UserConfig } from "tsdown";

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
    // readable-stream requires `process/`, the package: the module here.
    const name = id.replace(/\/$/, "");
    if (options.kind === "require-call" && isBuiltin(name)) return { id: facade + name };
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

// readable-stream requires abort-controller where a browser has none; every
// browser has one now, so the module is nothing, and stays out of the file.
const emptyModule = "\0empty-module";
const noAbortController: Plugin = {
  name: "no-abort-controller",
  resolveId: (id) => (id === "abort-controller" ? { id: emptyModule } : undefined),
  load: (id) => (id === emptyModule ? "module.exports = {};\n" : undefined),
};

// The package's own modules of Node.js stay imports by name, resolved by the
// layer: not through the package's exports, into dist/node/, which the
// builds are writing as they run.
const ownModules: Plugin = {
  name: "own-modules",
  resolveId: (id) => (id.startsWith("vitest-plugin-rsc/") ? { id, external: true } : undefined),
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

// What the two builds of the package's own modules have in common.
const ownBuild = {
  format: ["esm"],
  fixedExtension: false,
  deps: {
    neverBundle: [
      /^virtual:/,
      /^@vitejs\/plugin-rsc\/vendor\//,
      /^vitest(\/|$)/,
      "happy-dom",
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
} satisfies UserConfig;

// What a page loads in its `client` environment, the page and the rsc layer,
// is a build of its own, with a chunk per layer of the plugin: not one for
// every set of entries that shares a module, which had the setup file load
// 19 files from a dev server that serves every page at once, and 7 now. A
// module goes in the chunk of the first layer whose entries reach it, so a
// chunk imports only those of the layers before it, and an entry loads what
// the entries of its own layer and those before it load. What one entry
// alone has stays in its file, and so does setup.ts, which only the setup
// files import (see the entries): no layer reaches it.
const pageLayers = {
  // What the page's own imports load back: its host, by
  // `virtual:vitest-plugin-rsc/page-host`, and `node:async_hooks`.
  "page-base": ["browser-host.ts", "node-host.ts", "async-hooks.ts"],
  // Every page's, with Next.js or without.
  page: ["testing-library.tsx"],
  // The rsc layer's, which the testing library loads as it evaluates
  // (`rscLayer()`), so not in its chunk, which would wait for itself.
  "next-server": ["nextjs/rsc.ts", "nextjs/server-action.ts", "nextjs/prerender-verdict.ts"],
  // A host's, which renders its own files, without a layer of Next's server.
  "next-host": ["nextjs/client-components.ts", "nextjs/internal.ts"],
  // An app's: the testing library.
  "next-app": ["nextjs/index.ts"],
};
const pageLayerOf = new Map<string, string>();
const pageLayersPlugin: Plugin = {
  name: "page-layers",
  buildEnd() {
    pageLayerOf.clear();
    for (const [layer, entries] of Object.entries(pageLayers)) {
      const ids = entries.map((entry) => path.join(import.meta.dirname, "src", entry));
      for (let id = ids.pop(); id !== undefined; id = ids.pop()) {
        if (pageLayerOf.has(id) || !path.isAbsolute(id)) continue;
        pageLayerOf.set(id, layer);
        ids.push(...(this.getModuleInfo(id)?.importedIds ?? []));
      }
    }
  },
};

export default defineConfig([
  // The plugin, and what the other environments of a page load: the ssr
  // layer and the browser layer, which have modules of their own. What this
  // build shares with the page's, like page-protocol.ts, is in both: the
  // plugin's process and a page are realms of their own.
  {
    ...ownBuild,
    entry: [
      "src/index.ts",
      // Vitest's environment of a project with happy-dom: see the file.
      "src/happy-dom-environment.ts",
      // Under the `node` condition of its export: see the file.
      "src/async-hooks-node.ts",
      "src/testing-library-client.tsx",
      "src/nextjs/plugin.ts",
      "src/nextjs/adapter.ts",
      "src/nextjs/ssr.ts",
      "src/nextjs/client.tsx",
      // A thread of its own: see src/nextjs/project/env.ts.
      "src/nextjs/project/env-worker.ts",
      // A file of its own: Vite RSC compiles the module of a "use client"
      // directive.
      "src/nextjs/node-rendered.tsx",
    ],
    // The page the tests run in, next to the plugin that names it.
    copy: [{ from: "src/nextjs/tester.html", to: "dist/nextjs" }],
    // The package's own modules of Node.js stay imports by name, as in
    // node-server.ts: see `ownModules`.
    plugins: [ownModules],
  },
  // What a page loads in its `client` environment: see `pageLayers`.
  {
    ...ownBuild,
    entry: [
      // Imported by their files: see `pageHostId` of src/index.ts.
      "src/browser-host.ts",
      "src/node-host.ts",
      "src/async-hooks.ts",
      "src/testing-library.tsx",
      "src/nextjs/index.ts",
      "src/nextjs/client-components.ts",
      // The setup files: with what both of them run, setup.ts, in a chunk
      // that only they import, the only files of the build that import
      // Vitest.
      "src/nextjs/setup-browser.ts",
      "src/nextjs/setup-node.ts",
      "src/nextjs/rsc.ts",
      // Imported by its file, with `build: "production"`: see `prerenderId`
      // of src/nextjs/plugin.ts.
      "src/nextjs/prerender-verdict.ts",
      "src/nextjs/internal.ts",
      // A file of its own: Vite RSC compiles the module of a "use server"
      // directive.
      "src/nextjs/server-action.ts",
    ],
    plugins: [ownModules, pageLayersPlugin],
    outputOptions: {
      codeSplitting: {
        // What one entry alone has stays in its file.
        minShareCount: 2,
        // The first layer first, before a later one takes what it imports.
        groups: Object.keys(pageLayers).map((layer, index, layers) => ({
          name: layer,
          test: (id: string) => pageLayerOf.get(id) === layer,
          priority: layers.length - index,
        })),
      },
    },
  },
  // Loaded by Vitest, by their paths: the pool of a page in a worker of
  // Node.js and the entry of its worker, see src/worker-pool.ts. Files of
  // their own, without types: no other file imports them.
  {
    entry: { "worker-pool": "src/worker-pool.ts", "workers/forks": "src/workers/forks.ts" },
    format: ["esm" as const],
    fixedExtension: false,
    deps: { neverBundle: [/^vitest(\/|$)/] },
    dts: false,
  },
  // The stand-ins of the speed feature `fastCrypto`, src/nextjs/fast-crypto.ts:
  // one file, with the SHA-256 of @noble/hashes in it, which Vite serves as it
  // is, as the modules of Node.js below.
  {
    entry: { index: "src/fast-crypto/index.ts" },
    outDir: "dist/fast-crypto",
    format: ["esm" as const],
    fixedExtension: false,
    outputOptions: { codeSplitting: false as const },
    deps: { onlyBundle: ["@noble/hashes"] },
    plugins: [licenses],
    dts: false,
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
    // No comments of what is bundled: a JSDoc `@import` of a package reads
    // as an import to TypeScript, which types the file for src/node/. The
    // licenses are in LICENSES.md.
    outputOptions: {
      codeSplitting: false as const,
      comments: { legal: false, annotation: true, jsdoc: false },
      // The util package reads the global `process` as it loads, for
      // `NODE_DEBUG`: in the files with it, the package's own, as an import,
      // so that the file loads before anything made the global. Not in every
      // file: `process` imports `events`, which would import it back.
      ...((name === "util" || name === "assert") && {
        intro: 'import __process from "process";\nconst process = __process;\n',
      }),
    },
    // What is in a file, and nothing else on an upgrade: memfs, unenv,
    // readable-stream, fflate and @noble/hashes with what they depend on.
    // The package's own by name stays an import. The assert and util
    // packages depend on a tree of small packages that changes with their
    // versions: those files take all of theirs, which the licenses file
    // lists.
    deps: {
      neverBundle: [/^vitest-plugin-rsc\//],
      ...(name !== "assert" &&
        name !== "util" &&
        name !== "util/types" && {
          onlyBundle: [
            "memfs",
            /^@jsonjoy\.com\//,
            "glob-to-regex.js",
            "thingies",
            "tree-dump",
            "tslib",
            "unenv",
            "pathe",
            "readable-stream",
            "node-inspect-extracted",
            "events",
            "inherits",
            "string_decoder",
            "safe-buffer",
            "util-deprecate",
            "path-browserify",
            "fflate",
            "@noble/hashes",
          ],
        }),
    },
    // readable-stream's files for a browser, by its `browser` field: the one
    // for Node.js is made of the streams of Node.js itself.
    ...(name === "stream" && { inputOptions: { resolve: { aliasFields: [["browser"]] } } }),
    // The util package's `inherits` requires `util`, which is this file: the
    // package's own, in the file.
    ...(name === "util" && {
      alias: { util: path.join(import.meta.dirname, "node_modules/util/util.js") },
    }),
    plugins: [
      ownModules,
      unenvAsyncHooks,
      ...(name === "stream" ? [noAbortController] : []),
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
