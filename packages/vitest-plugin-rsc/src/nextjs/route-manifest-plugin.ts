import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { loadNextProjectConfig } from "./config.ts";
import { getProjectRoot } from "./plugin-utils.ts";
import { generateNextRouteManifestModule } from "./src/build/adapter/build-complete.ts";
import { generateNextEntrypointsModule, parseNextAppLoaderOptions } from "./src/build/entries.ts";
import { generateNextRouteTreeModule } from "./src/build/webpack/loaders/next-app-loader/index.ts";
import { scanNextAppRouteHandlers } from "./src/server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.ts";
import { scanNextAppRoutes } from "./src/server/route-matcher-providers/dev/dev-app-page-route-matcher-provider.ts";
import {
  virtualNextEntrypointsId,
  virtualNextEntrypointsPublicId,
  virtualNextRouteEmptyModuleId,
  virtualNextRouteEmptyModulePublicId,
  virtualNextRouteManifestId,
  virtualNextRouteManifestPublicId,
  virtualNextRouteTreeIdPrefix,
  virtualNextRouteTreePublicId,
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

        const entries = await scanNextAppRoutes(root, mode);
        const entry = entries.find((candidate) => candidate.appPath === loaderOptions.page);
        if (!entry) {
          throw new Error(`No Next app route entry found for ${loaderOptions.page}.`);
        }

        const { code, watchFiles } = await generateNextRouteTreeModule(root, entry, loaderOptions);
        for (const file of watchFiles) {
          this.addWatchFile(file);
        }
        return code;
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
          routeHandlers,
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

function isInNextAppDir(root: string, file: string) {
  const dirs = [path.join(root, "app"), path.join(root, "src", "app")];
  return dirs.some((dir) => {
    const relative = path.relative(dir, file);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative);
  });
}
