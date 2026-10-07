import type { EnvironmentModuleNode } from "vite";
import type { Plugin } from "vitest/config";

/**
 * Tailwind registers every file it scans as a dependency of the stylesheet.
 * Vite keeps those as watched-only module records (no `id`) imported by the
 * stylesheet, and Vitest's watcher follows them: saving any scanned file
 * reruns every test that loads the stylesheet.
 *
 * Detach those records right before Vitest looks up the related tests. Their
 * importers are invalidated first, so the stylesheet is regenerated and
 * registers them again on its next transform.
 */
export function ignoreWatchedOnlyModules(): Plugin {
  return {
    name: "ignore-watched-only-modules",
    configureVitest({ vitest }) {
      (vitest.config.watchTriggerPatterns ??= []).push({
        pattern: /./,
        testsToRun() {
          for (const project of vitest.projects) {
            for (const { moduleGraph } of Object.values(project.vite.environments)) {
              const invalidated = new Set<EnvironmentModuleNode>();
              for (const modules of moduleGraph.fileToModulesMap.values()) {
                for (const mod of modules) {
                  if (mod.id) continue;
                  mod.importers.forEach((importer) =>
                    moduleGraph.invalidateModule(importer, invalidated),
                  );
                  mod.importers.clear();
                }
              }
            }
          }
        },
      });
    },
  };
}
