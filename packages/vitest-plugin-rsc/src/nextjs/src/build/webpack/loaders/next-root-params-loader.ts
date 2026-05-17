import type { Plugin } from "vite";
import { loadNextProjectConfig } from "../../../../config.ts";
import {
  createProjectRequire,
  getProjectRoot,
  tryResolveFromProject,
} from "../../../../plugin-utils.ts";

// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/build/webpack/loaders/next-root-params-loader.ts#L8-L44
// Adaptation: Vite resolves `next/root-params` to a virtual module and invokes
// Next's webpack loader with the minimal loader context it needs, so root
// parameter discovery stays owned by Next.
// Begin adapted: Next.js next-root-params-loader bridge
const virtualNextRootParamsId = "\0vitest-plugin-rsc:next-root-params";

type NextRootParamsLoaderContext = {
  getOptions(): {
    appDir: string;
    pageExtensions: string[];
  };
  addContextDependency(directory: string): void;
};

type NextRootParamsLoaderModule = {
  default?: (this: NextRootParamsLoaderContext) => Promise<string> | string;
} & ((this: NextRootParamsLoaderContext) => Promise<string> | string);

export function useNextRootParams(environmentName: string, isServerOnlyLayer: boolean): Plugin {
  let root = "";
  let mode = "test";
  let resolvedNextRootParamsId: string | undefined;
  let rootParamsModule: Promise<string> | undefined;

  return {
    name: `next-rsc-root-params:${environmentName}`,
    enforce: "pre",
    applyToEnvironment(environment) {
      return environment.name === environmentName;
    },
    configResolved(config) {
      root = getProjectRoot(config);
      mode = config.mode;
      resolvedNextRootParamsId = tryResolveFromProject(root, "next/root-params");
    },
    resolveId(source) {
      const [id] = source.split("?", 1);
      if (
        id === "next/root-params" ||
        id === "next/root-params.js" ||
        id === resolvedNextRootParamsId
      ) {
        return virtualNextRootParamsId;
      }
    },
    async load(id) {
      if (id !== virtualNextRootParamsId) {
        return;
      }

      rootParamsModule ??= createNextRootParamsModule({
        isServerOnlyLayer,
        mode,
        root,
      });
      return rootParamsModule;
    },
  };
}

async function createNextRootParamsModule({
  isServerOnlyLayer,
  mode,
  root,
}: {
  isServerOnlyLayer: boolean;
  mode: string;
  root: string;
}) {
  if (!isServerOnlyLayer) {
    return createNextInvalidImportModule(
      "'next/root-params' cannot be imported from a Client Component module. It should only be used from a Server Component.",
    );
  }

  const projectConfig = await loadNextProjectConfig(root, mode);
  const { nextConfig } = projectConfig;
  const isRootParamsEnabled =
    nextConfig.experimental?.rootParams ?? nextConfig.cacheComponents ?? false;

  if (!isRootParamsEnabled) {
    return createNextInvalidImportModule(
      "'next/root-params' can only be imported when `experimental.rootParams` is enabled.",
    );
  }

  const appDir = projectConfig.appDir;
  if (!appDir) {
    return createNextInvalidImportModule(
      "'next/root-params' can only be used with the App Directory.",
    );
  }

  const projectRequire = createProjectRequire(root);
  let loaderModule: NextRootParamsLoaderModule;
  try {
    loaderModule = projectRequire(
      "next/dist/build/webpack/loaders/next-root-params-loader.js",
    ) as NextRootParamsLoaderModule;
  } catch {
    return createNextInvalidImportModule(
      "'next/root-params' is not supported by this Next.js version.",
    );
  }
  const rootParamsLoader = loaderModule.default ?? loaderModule;
  const pageExtensions = projectConfig.pageExtensions;

  // Invoke Next's own root-params webpack loader rather than duplicating route
  // parameter discovery.
  // Source: https://github.com/vercel/next.js/blob/4588a7354283f97e2124e3d82f55733ca4eb9373/packages/next/src/build/webpack/loaders/next-root-params-loader.ts
  return rootParamsLoader.call({
    addContextDependency: () => {},
    getOptions: () => ({ appDir, pageExtensions }),
  });
}

function createNextInvalidImportModule(message: string) {
  return `throw new Error(${JSON.stringify(message)});\nexport {};`;
}
// End adapted
