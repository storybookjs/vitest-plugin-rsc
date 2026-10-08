import path from "node:path";
import type { Plugin } from "vite";
import type { NextProject } from "./project.ts";

// The `paths` and the `baseUrl` of the app's tsconfig or jsconfig, the way
// Next's build resolves them: for every file of the app. Vite reads a tsconfig
// for the files that TypeScript compiles with it, so not a jsconfig, and not a
// `.js` file that the tsconfig leaves out.

/**
 * The part of `request` that the `*` of `pattern` stands for, or nothing. A
 * pattern has one `*` at most: Next leaves out one with more.
 */
function matchOf(pattern: string, request: string): string | undefined {
  const star = pattern.indexOf("*");
  if (star === -1) return pattern === request ? "" : undefined;
  if (pattern.includes("*", star + 1)) return undefined;
  const [before, after] = [pattern.slice(0, star), pattern.slice(star + 1)];
  const matches =
    request.length >= before.length + after.length &&
    request.startsWith(before) &&
    request.endsWith(after);
  return matches ? request.slice(before.length, request.length - after.length) : undefined;
}

/**
 * The files that the `paths` have for a request, in order: TypeScript takes
 * the pattern with the longest prefix. Not a declaration file, which is for
 * the types only.
 */
export function candidatesOf(paths: NonNullable<NextProject["paths"]>, request: string): string[] {
  const prefix = (pattern: string) => pattern.split("*")[0]!.length;
  const pattern = Object.keys(paths.patterns)
    .filter((candidate) => matchOf(candidate, request) !== undefined)
    .sort((a, b) => prefix(b) - prefix(a))[0];
  if (!pattern) return [];
  return paths.patterns[pattern]!.filter((target) => !target.endsWith(".d.ts")).map((target) =>
    path.resolve(paths.baseUrl, target.replace("*", matchOf(pattern, request)!)),
  );
}

export function createPathsPlugin(getProject: () => NextProject): Plugin {
  return {
    name: "vitest-plugin-rsc:next-paths",
    enforce: "pre",
    async resolveId(source, importer, options) {
      const { paths } = getProject();
      if (!paths || !importer || importer.includes("/node_modules/")) return;
      const isBare = !source.startsWith(".") && !source.startsWith("\0");
      if (!isBare || path.isAbsolute(source)) return;
      const resolve = (id: string) => this.resolve(id, importer, { ...options, skipSelf: true });
      for (const candidate of candidatesOf(paths, source)) {
        const resolved = await resolve(candidate);
        if (resolved) return resolved;
      }
      // A `baseUrl` that the config sets is a root for every bare import, after
      // `node_modules`: a package wins from a directory with its name.
      if (!paths.explicitBaseUrl) return;
      return (await resolve(source)) ?? resolve(path.resolve(paths.baseUrl, source));
    },
  };
}
