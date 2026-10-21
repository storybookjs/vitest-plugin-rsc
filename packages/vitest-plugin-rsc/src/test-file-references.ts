import type { Plugin, ResolvedConfig, TransformResult } from "vite";

// Vite RSC makes a module of the rsc layer with `"use client"` a client
// reference, which has none of the module's code, in a transform of the
// normal order. For a file of the app that is React's rule. A test file or a
// setup file of Vitest with the directive is a reference because the plugin
// loads it that way, in the browser layer (nextjs/client-files.ts): so it
// becomes one after the plugins of the normal order compiled it. A plugin
// of the project then sees the file as written, also in the rsc
// layer, like Storybook's Vitest addon, which makes a story file a test file.
// Not a file of another host, like a story of Storybook's builder, which
// compiles the reference module itself, as the host's own module of the
// file. Which modules are Vitest's files, the plugin named `testFilesPlugin`
// says, with its api: vitestPluginNext() has one.

/** The name of Vite RSC's plugin that makes the reference. */
export const useClientPlugin = "rsc:use-client";

/** The name of the plugin whose `api` says which modules are Vitest's files. */
export const testFilesPlugin = "vitest-plugin-rsc:test-files";

/** The name of the plugin that makes the reference of a test file, last. */
export const testFileReferencesPlugin = `${useClientPlugin}:test-files`;

/** The `api` of `testFilesPlugin`. */
export type TestFilesApi = { isModuleOfTestFile(id: string): boolean };

type Transform = (
  this: unknown,
  code: string,
  id: string,
) => Promise<TransformResult | string | null | undefined | void>;

/**
 * Vite RSC's plugins, with the transform of `rsc:use-client` in two: of the
 * normal order for every other module, and among the plugins that are
 * enforced last for the modules of a test file or a setup file, before
 * those of vitestPluginNext(): the line it puts in front of the module of
 * such a file comes after it (nextjs/client-files.ts).
 */
export function referencingTestFilesLast(plugins: Plugin[]): Plugin[] {
  if (!plugins.some(({ name }) => name === useClientPlugin)) {
    throw new Error(`vitest-plugin-rsc: Vite RSC has no plugin \`${useClientPlugin}\` anymore.`);
  }
  const testFiles = new WeakMap<ResolvedConfig, TestFilesApi | undefined>();
  // A file without the directive first, which most are: that costs less
  // than to match the id with the test files.
  const isModuleOfTestFile = (context: unknown, code: string, id: string) => {
    if (!code.includes("use client")) return false;
    const { environment } = context as { environment: { getTopLevelConfig(): ResolvedConfig } };
    const config = environment.getTopLevelConfig();
    if (!testFiles.has(config)) {
      const plugin = config.plugins.find(({ name }) => name === testFilesPlugin);
      testFiles.set(config, plugin?.api as TestFilesApi | undefined);
    }
    return testFiles.get(config)?.isModuleOfTestFile(id) ?? false;
  };
  return plugins.flatMap((plugin) => {
    if (plugin.name !== useClientPlugin) return [plugin];
    const hook =
      typeof plugin.transform === "function" ? { handler: plugin.transform } : plugin.transform;
    if (!hook) {
      throw new Error(
        `vitest-plugin-rsc: Vite RSC's plugin \`${useClientPlugin}\` has no transform anymore.`,
      );
    }
    const transform = hook.handler as Transform;
    return [
      {
        ...plugin,
        transform: {
          ...hook,
          handler(code, id) {
            if (isModuleOfTestFile(this, code, id)) return;
            return transform.call(this, code, id);
          },
        },
      },
      {
        name: testFileReferencesPlugin,
        enforce: "post",
        // The filter of Vite RSC's hook, not its order, which would move the
        // test files out of the last.
        transform: {
          ...hook,
          order: null,
          handler(code, id) {
            if (!isModuleOfTestFile(this, code, id)) return;
            return transform.call(this, code, id);
          },
        },
      },
    ];
  });
}
