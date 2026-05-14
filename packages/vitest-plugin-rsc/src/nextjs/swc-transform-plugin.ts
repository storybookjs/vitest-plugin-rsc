import path from "node:path";
import type { Plugin } from "vite";
import { createProjectRequire, getProjectRoot, normalizePath } from "./plugin-utils";

type NextSwc = {
  loadBindings(): Promise<unknown>;
  transform(code: string, options: unknown): Promise<{ code: string; map?: string | null }>;
};

type NextSwcOptionsModule = {
  getParserOptions(options: { filename: string; jsConfig?: unknown }): unknown;
};

const fontLoaders = ["next/font/local", "next/font/google"] as const;

export function useNextSwcTransform(): Plugin {
  let root = process.cwd();
  let loadBindingsPromise: Promise<unknown> | undefined;

  return {
    name: "next-rsc-swc-transform",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
    },
    async transform(code, id) {
      if (!isUserSourceFile(id) || !hasSupportedNextSwcTransformTrigger(code)) return;

      const filename = id.replace(/\?.*$/, "");
      const projectRequire = createProjectRequire(root);
      const nextSwc = projectRequire("next/dist/build/swc/index.js") as NextSwc;
      const nextSwcOptions = projectRequire(
        "next/dist/build/swc/options.js",
      ) as NextSwcOptionsModule;

      loadBindingsPromise ??= nextSwc.loadBindings();
      await loadBindingsPromise;

      return nextSwc.transform(code, {
        filename,
        jsc: {
          parser: nextSwcOptions.getParserOptions({ filename, jsConfig: {} }),
          transform: {
            react: {
              runtime: "automatic",
              development: true,
            },
          },
        },
        sourceMaps: true,
        fontLoaders: {
          fontLoaders,
          relativeFilePathFromRoot: normalizePath(path.relative(root, filename)),
        },
        module: { type: "es6" },
        isDevelopment: true,
      });
    },
  };
}

function isUserSourceFile(id: string) {
  return (
    /\.(?:[cm]?[jt]sx?)($|\?)/.test(id) &&
    !id.includes("/node_modules/") &&
    !id.includes("/.vite/")
  );
}

function hasSupportedNextSwcTransformTrigger(code: string) {
  return /\bnext\/font\/(?:google|local)\b/.test(code);
}
