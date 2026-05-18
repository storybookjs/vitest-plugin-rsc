import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { loadNextProjectConfig } from "./config.ts";
import { getProjectRoot } from "./plugin-utils.ts";
import { generateNextRouteManifestModule } from "./src/build/adapter/build-complete.ts";
import {
  generateNextEntrypointsModule,
  parseNextAppLoaderOptions,
  parseNextAppRouteLoaderOptions,
} from "./src/build/entries.ts";
import {
  generateNextAppRouteModule,
  generateNextAppPageModule,
  generateNextRouteTreeModule,
} from "./src/build/webpack/loaders/next-app-loader/index.ts";
import { createNextServerActionEntryModule } from "./src/build/webpack/plugins/flight-client-entry-plugin.ts";
import {
  createNextEdgeAppRouteEntrypointSource,
  parseNextEdgeAppRouteEntrypointOptions,
} from "./src/build/webpack/loaders/next-edge-app-route-loader/index.ts";
import {
  createNextEdgeAppPageEntrypointSource,
  parseNextEdgeAppPageEntrypointOptions,
} from "./src/build/webpack/loaders/next-edge-ssr-loader/index.ts";
import { scanNextAppRouteHandlers } from "./src/server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.ts";
import { scanNextAppRoutes } from "./src/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts";
import {
  virtualNextAppPageIdPrefix,
  virtualNextAppPagePublicId,
  virtualNextAppRouteIdPrefix,
  virtualNextAppRoutePublicId,
  virtualNextEdgeAppRouteIdPrefix,
  virtualNextEdgeAppRoutePublicId,
  virtualNextEdgeSsrAppIdPrefix,
  virtualNextEdgeSsrAppPublicId,
  virtualNextEntrypointsId,
  virtualNextEntrypointsPublicId,
  virtualNextRouteEmptyModuleId,
  virtualNextRouteEmptyModulePublicId,
  virtualNextRouteManifestId,
  virtualNextRouteManifestPublicId,
  virtualNextRouteTreeIdPrefix,
  virtualNextRouteTreePublicId,
  virtualNextServerActionEntryIdPrefix,
  virtualNextServerActionEntryPublicId,
} from "./virtual-ids.ts";

export function useNextRouteManifest(): Plugin {
  let root = process.cwd();
  let mode = "test";

  return {
    name: "next-rsc-route-manifest",
    enforce: "pre",
    configResolved(config) {
      root = getProjectRoot(config);
      mode = config.mode;
    },
    resolveId(source) {
      const [sourceFile] = source.split("?");
      if (
        sourceFile &&
        path.isAbsolute(sourceFile) &&
        !fs.existsSync(sourceFile) &&
        isInNextAppDir(root, sourceFile)
      ) {
        return virtualNextRouteEmptyModuleId;
      }

      if (source === virtualNextRouteManifestPublicId) {
        return virtualNextRouteManifestId;
      }
      if (source === virtualNextEntrypointsPublicId) {
        return virtualNextEntrypointsId;
      }
      if (source.startsWith(`${virtualNextRouteTreePublicId}?`)) {
        return `${virtualNextRouteTreeIdPrefix}${source.slice(virtualNextRouteTreePublicId.length + 1)}`;
      }
      if (source.startsWith(`${virtualNextAppPagePublicId}?`)) {
        const [params] = source.slice(virtualNextAppPagePublicId.length + 1).split("!");
        return `${virtualNextAppPageIdPrefix}${params}`;
      }
      if (source.startsWith(`${virtualNextAppRoutePublicId}?`)) {
        const [params] = source.slice(virtualNextAppRoutePublicId.length + 1).split("!");
        return `${virtualNextAppRouteIdPrefix}${params}`;
      }
      if (source.startsWith(`${virtualNextEdgeSsrAppPublicId}?`)) {
        return `${virtualNextEdgeSsrAppIdPrefix}${source.slice(virtualNextEdgeSsrAppPublicId.length + 1)}`;
      }
      if (source.startsWith(`${virtualNextEdgeAppRoutePublicId}?`)) {
        return `${virtualNextEdgeAppRouteIdPrefix}${source.slice(virtualNextEdgeAppRoutePublicId.length + 1)}`;
      }
      if (source.startsWith(`${virtualNextServerActionEntryPublicId}?`)) {
        return `${virtualNextServerActionEntryIdPrefix}${source.slice(virtualNextServerActionEntryPublicId.length + 1)}`;
      }
      if (source === virtualNextRouteEmptyModulePublicId) {
        return virtualNextRouteEmptyModuleId;
      }
    },
    async load(id) {
      if (id === virtualNextRouteEmptyModuleId) {
        return "export default function VitestNextEmptyRouteModule() { return null; }";
      }

      if (id.startsWith(virtualNextRouteTreeIdPrefix)) {
        const params = new URLSearchParams(id.slice(virtualNextRouteTreeIdPrefix.length));
        const loaderOptions = parseNextAppLoaderOptions(params);
        const entry = await getNextAppRouteEntry(root, mode, loaderOptions.page);

        const { code, watchFiles } = await generateNextRouteTreeModule(root, entry, loaderOptions);
        for (const file of watchFiles) {
          this.addWatchFile(file);
        }
        return code;
      }

      if (id.startsWith(virtualNextAppPageIdPrefix)) {
        const params = new URLSearchParams(id.slice(virtualNextAppPageIdPrefix.length));
        const loaderOptions = parseNextAppLoaderOptions(params);
        const entry = await getNextAppRouteEntry(root, mode, loaderOptions.page);

        const { code, watchFiles } = await generateNextAppPageModule(root, entry, loaderOptions);
        for (const file of watchFiles) {
          this.addWatchFile(file);
        }
        return code;
      }

      if (id.startsWith(virtualNextAppRouteIdPrefix)) {
        const params = new URLSearchParams(id.slice(virtualNextAppRouteIdPrefix.length));
        const loaderOptions = parseNextAppRouteLoaderOptions(params);
        const entry = await getNextAppRouteHandlerEntry(root, mode, loaderOptions.page);

        const { code, watchFiles } = await generateNextAppRouteModule(root, entry, loaderOptions);
        for (const file of watchFiles) {
          this.addWatchFile(file);
        }
        return code;
      }

      if (id.startsWith(virtualNextEdgeSsrAppIdPrefix)) {
        const params = new URLSearchParams(id.slice(virtualNextEdgeSsrAppIdPrefix.length));
        return await createNextEdgeAppPageEntrypointSource(
          parseNextEdgeAppPageEntrypointOptions(params),
        );
      }

      if (id.startsWith(virtualNextEdgeAppRouteIdPrefix)) {
        const params = new URLSearchParams(id.slice(virtualNextEdgeAppRouteIdPrefix.length));
        return await createNextEdgeAppRouteEntrypointSource(
          parseNextEdgeAppRouteEntrypointOptions(params),
        );
      }

      if (id.startsWith(virtualNextServerActionEntryIdPrefix)) {
        const params = new URLSearchParams(id.slice(virtualNextServerActionEntryIdPrefix.length));
        const actionId = params.get("actionId");
        if (!actionId) {
          throw new Error("Missing actionId for Next server action entry virtual module.");
        }
        return createNextServerActionEntryModule(actionId);
      }

      if (id === virtualNextEntrypointsId) {
        const [entries, routeHandlers] = await Promise.all([
          scanNextAppRoutes(root, mode),
          scanNextAppRouteHandlers(root, mode),
        ]);
        for (const entry of routeHandlers) {
          this.addWatchFile(entry.routeFile);
        }

        const projectConfig = await loadNextProjectConfig(root, mode);
        const { code, watchFiles } = await generateNextEntrypointsModule(
          root,
          projectConfig,
          entries,
        );
        for (const file of watchFiles) {
          this.addWatchFile(file);
        }
        return code;
      }

      if (id === virtualNextRouteManifestId) {
        const [entries, routeHandlers, projectConfig] = await Promise.all([
          scanNextAppRoutes(root, mode),
          scanNextAppRouteHandlers(root, mode),
          loadNextProjectConfig(root, mode),
        ]);
        for (const entry of entries) {
          this.addWatchFile(entry.pageFile);
        }
        for (const entry of routeHandlers) {
          this.addWatchFile(entry.routeFile);
        }

        return await generateNextRouteManifestModule(root, entries, routeHandlers, projectConfig);
      }
    },
  };
}

async function getNextAppRouteEntry(root: string, mode: string, page: string) {
  const entries = await scanNextAppRoutes(root, mode);
  const entry = entries.find((candidate) => candidate.appPath === page);
  if (!entry) {
    throw new Error(`No Next app route entry found for ${page}.`);
  }
  return entry;
}

async function getNextAppRouteHandlerEntry(root: string, mode: string, page: string) {
  const entries = await scanNextAppRouteHandlers(root, mode);
  const entry = entries.find((candidate) => candidate.appPath === page);
  if (!entry) {
    throw new Error(`No Next app route handler entry found for ${page}.`);
  }
  return entry;
}

function isInNextAppDir(root: string, file: string) {
  const dirs = [path.join(root, "app"), path.join(root, "src", "app")];
  return dirs.some((dir) => {
    const relative = path.relative(dir, file);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}
