import { normalizePath, transformWithOxc, type Environment, type Plugin } from "vite";
import { ssrImportMetaKey } from "vite/module-runner";
import { timerNames, timersKey } from "../timers.ts";
import { fileOfModule } from "./client-files.ts";

// A browser drops the timers of a page with the page. A module of the
// browser layer, which a page evaluates, calls a timer as a global, which
// would fire after the page is left, against the host's document. So the
// layer compiles each use of the global, a call, a read, `typeof` or a
// write, to one of the module's `import.meta`, where its module runner puts
// timers that drop what a left page would call (../timers.ts). With oxc's
// `define`, which is scope-aware: a parameter named `setTimeout` stays. The
// name of the runner's `import.meta`, not `import.meta` itself: the modules
// of a pre-bundled CommonJS package have none, and the runner evaluates
// every module of the layer with that name. Not a file of the host, like a
// test file with `"use client"`, which the layer evaluates too: its timers
// are the host's, which a spy of the test is on. A pre-bundled dependency
// gets the rewrite from the layer's optimizer, which has oxc's `define` too
// (`pageTimersDefine`): once, into the bundle Vite keeps across runs, where
// the `define` is part of the options Vite keys the bundle on. So the dev
// server, which would compile every pre-bundled chunk again at every start,
// leaves those.

/** The rewrite, for the `transform.define` of the browser layer's optimizer. */
export const pageTimersDefine: Record<string, string> = Object.fromEntries(
  timerNames.map((name) => [name, `${ssrImportMetaKey}.${timersKey}.${name}`]),
);

const isOptimizedDepFile = (environment: Environment, id: string) =>
  "depsOptimizer" in environment && !!environment.depsOptimizer?.isOptimizedDepFile(id);

const mentionsTimer = new RegExp(`\\b(?:${timerNames.join("|")})\\b`);

/**
 * For the modules of the browser layer, by the name of its environment, but
 * those of a file that `isHostFile()` and those its optimizer bundled.
 */
export function pageTimersPlugin(
  environment: string,
  isHostFile: (file: string) => boolean,
): Plugin {
  return {
    name: "vitest-plugin-rsc:next-page-timers",
    // JavaScript by then.
    enforce: "post",
    applyToEnvironment: ({ name }) => name === environment,
    transform: {
      filter: { code: mentionsTimer },
      async handler(code, id) {
        if (isOptimizedDepFile(this.environment, id)) return;
        const file = fileOfModule(id);
        if (file !== undefined && isHostFile(file)) return;
        try {
          return await transformWithOxc(code, normalizePath(id), {
            lang: "js",
            define: pageTimersDefine,
          });
        } catch (error) {
          const reason = String(error instanceof Error ? error.message : error);
          this.warn(
            `vitest-plugin-rsc: the timers of ${id} keep running after its page is left, it does ` +
              `not parse as JavaScript. ${reason.replace(/\s+/g, " ")}`,
          );
        }
      },
    },
  };
}
