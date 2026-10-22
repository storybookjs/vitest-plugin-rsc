import { normalizePath, transformWithOxc, type Rolldown } from "vite";
import { pageScopeKey } from "../runner-scope.ts";

// The browser's globals that the files of Next.js, and of the React that it
// ships, reach through the scope of the page that runs them, as Vite
// pre-bundles them for the browser layer: see page-scope.ts. A define of
// oxc, which is scope-aware: a local `setTimeout` is not the global. The
// code of the app and of its other packages keeps the browser's own.

const globals = [
  "setTimeout",
  "clearTimeout",
  "setInterval",
  "clearInterval",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "MessageChannel",
  "PerformanceObserver",
];

// `addEventListener()` as a global is the one of `window`.
const listeners = {
  addEventListener: "windowAddEventListener",
  removeEventListener: "windowRemoveEventListener",
};

const prefixes = ["", "globalThis.", "self.", "window."];

/** What a file of Next's gets in place of the browser's globals. */
export const pageScopeDefines: Record<string, string> = Object.fromEntries([
  ...globals.flatMap((name) =>
    prefixes.map((prefix) => [`${prefix}${name}`, `${pageScopeKey}.${name}`]),
  ),
  ...Object.entries(listeners).flatMap(([name, member]) =>
    prefixes.map((prefix) => [`${prefix}${name}`, `${pageScopeKey}.${member}`]),
  ),
  ["document.addEventListener", `${pageScopeKey}.documentAddEventListener`],
  ["document.removeEventListener", `${pageScopeKey}.documentRemoveEventListener`],
]);

const mentionsGlobal = new RegExp(`\\b(?:${[...globals, ...Object.keys(listeners)].join("|")})\\b`);

// The files of `next/dist`, which include the React, React DOM, scheduler
// and Flight client that Next ships. One for each `nextDir`, as a static
// build asks for every file it has.
const nextFilesOf = new Map<string, RegExp>();
const nextFiles = (nextDir: string) => {
  let files = nextFilesOf.get(nextDir);
  if (!files) {
    files = new RegExp(
      `^${`${normalizePath(nextDir)}/dist/`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*\\.[cm]?js$`,
    );
    nextFilesOf.set(nextDir, files);
  }
  return files;
};

/** Whether `file` is one of Next's that reaches the scope of its page. */
export function isScopedToPage(nextDir: string, file: string): boolean {
  return nextFiles(nextDir).test(normalizePath(file));
}

/**
 * Compiles a file of Next's so that it reaches the browser's globals
 * through the scope of its page. Returns nothing for a file that names none.
 */
export async function scopeToPage(
  code: string,
  id: string,
  define: Record<string, string> = {},
): Promise<{ code: string; map?: Rolldown.SourceMapInput } | undefined> {
  if (!mentionsGlobal.test(code)) return;
  const { code: compiled, map } = await transformWithOxc(code, id, {
    lang: "js",
    define: { ...define, ...pageScopeDefines },
  });
  return { code: compiled, ...(map && { map }) };
}

/**
 * For the dependency optimizer of the browser layer, which pre-bundles all
 * of Next: its files reach the browser's globals through the scope of the
 * page that runs them.
 */
export function nextPageScopePlugin(nextDir: string): Rolldown.Plugin {
  return {
    name: "vitest-plugin-rsc:next-page-scope",
    transform: {
      // Rolldown matches the id with `/` for a separator.
      filter: { id: nextFiles(nextDir), code: mentionsGlobal },
      handler: (code, id) => scopeToPage(code, id),
    },
  };
}
