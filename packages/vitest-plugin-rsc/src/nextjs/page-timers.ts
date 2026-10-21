import { normalizePath, transformWithOxc, type Plugin } from "vite";
import { ssrImportMetaKey } from "vite/module-runner";
import { timerNames, timersKey } from "../timers.ts";

// A browser drops the timers of a page with the page. A module of the
// browser layer, which a page evaluates, calls a timer as a global, which
// would fire after the page is left, against the host's document. So the
// layer compiles each read of the global, a call, `typeof` or a write, to
// one of the module's `import.meta`,
// where its module runner puts timers that drop what a left page would call
// (../timers.ts). Scope-aware, as `define` is: a parameter named `setTimeout`
// stays. The name of the runner's `import.meta`, not `import.meta` itself:
// the modules of a pre-bundled CommonJS package have none, and the runner
// evaluates every module of the layer with that name.

const define = Object.fromEntries(
  timerNames.map((name) => [name, `${ssrImportMetaKey}.${timersKey}.${name}`]),
);

const mentionsTimer = new RegExp(`\\b(?:${timerNames.join("|")})\\b`);

/** For the modules of the browser layer, by the name of its environment. */
export function pageTimersPlugin(environment: string): Plugin {
  return {
    name: "vitest-plugin-rsc:next-page-timers",
    // JavaScript by then, also a pre-bundled dependency.
    enforce: "post",
    applyToEnvironment: ({ name }) => name === environment,
    transform: {
      filter: { code: mentionsTimer },
      async handler(code, id) {
        try {
          return await transformWithOxc(code, normalizePath(id), { lang: "js", define });
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
