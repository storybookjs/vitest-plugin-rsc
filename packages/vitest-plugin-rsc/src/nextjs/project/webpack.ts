import fs from "node:fs";
import path from "node:path";
import type { NextLayer, NextProject } from "../project.ts";
import type { NextContext } from "./context.ts";
import type { Loader, RunLoader } from "./loaders.ts";

// A `webpack` function in `next.config`, like the one of `@next/mdx`, which
// adds a rule with loaders for a type of file that Next does not compile, and
// an alias for what the code those loaders make imports. Here Vite loads the
// file: the loaders of such a rule run as webpack runs them, and Next's own
// compiler after them where the rule asks for it. What else a function does to
// webpack's config, like a plugin of webpack, does not apply, and a run says
// so when it starts.

/** A rule of the `webpack` function: the files it is for, and their loaders. */
export type WebpackRule = {
  test: RegExp;
  /** As webpack calls them: the last first. */
  loaders: { loader: string; options: unknown }[];
  /** Whether Next's compiler, `defaultLoaders.babel`, runs after them. */
  compile: boolean;
};

export type WebpackFunction = {
  rules: WebpackRule[];
  /** The candidates of each alias it sets, in order: the first that resolves is the one. */
  aliases: Record<string, string[]>;
  /** What of it does not apply, to say when a run starts. */
  differences: string[];
};

type WebpackConfig = {
  resolve: { alias: Record<string, unknown> };
  module: { rules: unknown[] };
  plugins: unknown[];
};

/**
 * Calls the `webpack` function of a `next.config` with a config of webpack
 * that has what the plugin reads of it, as Next calls it for the compiler of
 * a layer, and reads the rules and the aliases it adds.
 */
export function readWebpackFunction(
  webpack: unknown,
  options: { root: string; isServer: boolean; buildId: string; config: unknown },
): WebpackFunction {
  const read: WebpackFunction = { rules: [], aliases: {}, differences: [] };
  if (typeof webpack !== "function") return read;
  // Next's compiler, as the loader of a rule names it.
  const babel = { loader: "next-swc-loader", options: {} };
  const before: WebpackConfig = { resolve: { alias: {} }, module: { rules: [] }, plugins: [] };
  let after: WebpackConfig;
  try {
    after = (webpack as (config: WebpackConfig, options: object) => WebpackConfig)(before, {
      dir: options.root,
      dev: false,
      isServer: options.isServer,
      buildId: options.buildId,
      config: options.config,
      defaultLoaders: { babel },
      totalPages: 0,
      ...(options.isServer && { nextRuntime: "nodejs" }),
    });
  } catch (error) {
    read.differences.push(
      `the \`webpack\` function of next.config failed, so none of it applies: ${(error as Error).message}`,
    );
    return read;
  }
  for (const rule of after?.module?.rules ?? []) {
    const { test, use, ...rest } = (rule ?? {}) as { test?: unknown; use?: unknown };
    const uses = Array.isArray(use) ? use : [use];
    const loaders = uses.flatMap((entry) => {
      if (entry === babel) return [];
      if (typeof entry === "string") return [{ loader: entry, options: undefined }];
      const { loader, options } = (entry ?? {}) as { loader?: unknown; options?: unknown };
      return typeof loader === "string" ? [{ loader, options }] : [];
    });
    if (
      !(test instanceof RegExp) ||
      Object.keys(rest).length > 0 ||
      loaders.length + (uses.includes(babel) ? 1 : 0) !== uses.length
    ) {
      read.differences.push(
        `a rule of the \`webpack\` function of next.config does not apply: only one with a \`test\` ` +
          `and the loaders in \`use\` does, not ${String(test ?? "this one")}`,
      );
      continue;
    }
    read.rules.push({ test, loaders, compile: uses.includes(babel) });
  }
  for (const [name, target] of Object.entries(after?.resolve?.alias ?? {})) {
    const candidates = (Array.isArray(target) ? target : [target]).filter(
      (candidate): candidate is string => typeof candidate === "string",
    );
    read.aliases[name] = candidates.map((candidate) =>
      candidate.replace(/^private-next-root-dir(?=\/|$)/, options.root),
    );
  }
  if ((after?.plugins?.length ?? 0) > 0) {
    read.differences.push(
      "the plugins of webpack that the `webpack` function of next.config adds do not run",
    );
  }
  return read;
}

/**
 * The candidates of an alias for an import, as webpack takes them: a name
 * matches the import and what is under it, and one that ends with `$` only
 * the import itself.
 */
export function aliasOf(aliases: Record<string, string[]>, source: string): string[] | undefined {
  for (const [name, candidates] of Object.entries(aliases)) {
    if (name.endsWith("$")) {
      if (source === name.slice(0, -1)) return candidates;
    } else if (source === name) {
      return candidates;
    } else if (source.startsWith(`${name}/`)) {
      return candidates.map((candidate) => candidate + source.slice(name.length));
    }
  }
}

/**
 * A file of a package by the import that names it, `@next/mdx/mdx-components.js`:
 * what Vite pre-bundles. The candidate of an alias is often the file, as
 * `require.resolve()` finds it.
 */
export function importOfFile(file: string): string {
  if (!path.isAbsolute(file) || !file.split(path.sep).includes("node_modules")) return file;
  for (let dir = path.dirname(file); path.basename(dir) !== "node_modules"; ) {
    const manifest = path.join(dir, "package.json");
    const name = fs.existsSync(manifest)
      ? (JSON.parse(fs.readFileSync(manifest, "utf8")) as { name?: string }).name
      : undefined;
    if (name) return `${name}/${path.relative(dir, file).split(path.sep).join("/")}`;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return file;
}

/** The rules and aliases of the `webpack` function in `next.config`, for each layer. */
export function createWebpackRules(
  context: NextContext,
  runLoader: RunLoader,
): Pick<
  NextProject,
  | "webpackRuleOf"
  | "loadWithWebpackRule"
  | "webpackAliasOf"
  | "webpackPackages"
  | "webpackDifferences"
> {
  const { root, projectRequire, config, buildId } = context;
  // Next calls the function for its client compiler and its server compiler,
  // whose layers are rsc and ssr.
  const read = (isServer: boolean) =>
    readWebpackFunction(config.webpack, { root, isServer, buildId, config });
  const client = read(false);
  const server = read(true);
  const of: Record<NextLayer, WebpackFunction> = { rsc: server, ssr: server, browser: client };
  const ruleOf = (file: string, layer: NextLayer) =>
    of[layer].rules.find((rule) => rule.test.test(file));
  const loaders = new Map<string, Loader>();
  const loaderAt = (request: string) => {
    let loader = loaders.get(request);
    if (!loader) {
      const loaded = projectRequire(request) as Loader | { default: Loader };
      loader = typeof loaded === "function" ? loaded : loaded.default;
      loaders.set(request, loader);
    }
    return loader;
  };

  // The packages among the candidates of the aliases, for Vite to pre-bundle
  // when a run starts: the code of a loader imports them, which the scan of
  // the dependencies does not read.
  const packagesOf = ({ aliases }: WebpackFunction) =>
    Object.values(aliases)
      .flat()
      .map(importOfFile)
      .filter((candidate) => {
        if (candidate.startsWith(".") || path.isAbsolute(candidate)) return false;
        try {
          projectRequire.resolve(candidate);
          return true;
        } catch {
          return false;
        }
      });

  return {
    webpackRuleOf: ruleOf,
    webpackPackages: {
      rsc: packagesOf(server),
      ssr: packagesOf(server),
      browser: packagesOf(client),
    },
    async loadWithWebpackRule(file, layer) {
      const rule = ruleOf(file, layer);
      if (!rule) return;
      let code: unknown = await fs.promises.readFile(file, "utf8");
      for (const { loader, options } of rule.loaders.toReversed()) {
        [code] = await runLoader(loaderAt(loader), options, file, code);
      }
      return String(code);
    },
    webpackAliasOf: (source, layer) => aliasOf(of[layer].aliases, source)?.map(importOfFile),
    webpackDifferences: Array.from(new Set([...client.differences, ...server.differences])),
  };
}
