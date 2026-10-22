import { normalizePath, transformWithOxc, type Rolldown } from "vite";
import { ssrImportMetaKey } from "vite/module-runner";
import {
  documentRegistrationNames,
  registrationNames,
  registrationsKey,
} from "../registrations.ts";

// A browser drops what a page registered with it when the page is left: its
// timers, its message ports, its performance observers, its listeners on
// `window` and `document`. The files of `next/dist`, which include the
// React, React DOM, scheduler and Flight client that Next ships, register
// those as a page does, and never take them back: Next's router its
// listeners for `pagehide`, React's scheduler its port, `next/image` its
// observer. Each would keep the page that is left, or run its work in the
// next one. So as Vite pre-bundles those files for the browser layer, a
// define of oxc, which is scope-aware, points each use of the global, a
// call, a read, `typeof` or a write, to the registrations of the module's
// runner (../registrations.ts), on the `import.meta` that the runner gives
// every module (utils.ts). The name of the runner's `import.meta`, not
// `import.meta` itself: the modules of a pre-bundled CommonJS package have
// none. Leaving the page closes the runner, which releases them all. Only
// the files of Next: the code of the app and of its other packages keeps
// the browser's own, and what it leaves is its own, as in any test setup.
// A use through another name keeps the browser's too, like `w.addEventListener`
// after `const w = window`, or a listener on `document.body`: Next has none
// that keeps a page.

const prefixes = ["", "globalThis.", "self.", "window."];
const ofRunner = (name: string) => `${ssrImportMetaKey}.${registrationsKey}.${name}`;

/** What a file of Next's gets in place of the browser's globals. */
export const pageRegistrationsDefine: Record<string, string> = Object.fromEntries([
  ...registrationNames.flatMap((name) =>
    prefixes.map((prefix) => [`${prefix}${name}`, ofRunner(name)]),
  ),
  ...Object.entries(documentRegistrationNames).map(([name, member]) => [
    `document.${name}`,
    ofRunner(member),
  ]),
]);

const mentionsRegistration = new RegExp(`\\b(?:${registrationNames.join("|")})\\b`);

// The files of `next/dist`, by the directory of the installed `next`. One
// RegExp for each, as a static build asks for every file it has.
const nextFilesOf = new Map<string, RegExp>();
const nextFiles = (nextDir: string): RegExp => {
  let files = nextFilesOf.get(nextDir);
  if (!files) {
    const dir = `${normalizePath(nextDir)}/dist/`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    files = new RegExp(`^${dir}.*\\.[cm]?js$`);
    nextFilesOf.set(nextDir, files);
  }
  return files;
};

/** Whether `file` is one of Next's, which registers through its runner. */
export function isNextFile(nextDir: string, file: string): boolean {
  return nextFiles(nextDir).test(normalizePath(file));
}

/**
 * Compiles a file of Next's so that it registers through its runner, with
 * the other constants of `define`. Nothing for a file that names none of the
 * globals.
 */
export async function compileNextFile(
  code: string,
  id: string,
  define: Record<string, string> = {},
): Promise<{ code: string; map?: Rolldown.SourceMapInput } | undefined> {
  if (!mentionsRegistration.test(code)) return;
  const { code: compiled, map } = await transformWithOxc(code, id, {
    lang: "js",
    define: { ...define, ...pageRegistrationsDefine },
  });
  return { code: compiled, ...(map && { map }) };
}

/**
 * For the dependency optimizer of the browser layer, which pre-bundles all
 * of Next: its files register through their runner.
 */
export function nextRegistrationsPlugin(nextDir: string): Rolldown.Plugin {
  return {
    name: "vitest-plugin-rsc:next-registrations",
    transform: {
      // Rolldown matches the id with `/` for a separator.
      filter: { id: nextFiles(nextDir), code: mentionsRegistration },
      async handler(code, id) {
        try {
          return await compileNextFile(code, id);
        } catch (error) {
          // One file that does not parse keeps the browser's own, not the
          // whole pre-bundle.
          const reason = String(error instanceof Error ? error.message : error);
          this.warn(
            `vitest-plugin-rsc: what ${id} registers with the browser stays after its page is ` +
              `left, it does not parse as JavaScript. ${reason.replace(/\s+/g, " ")}`,
          );
          return;
        }
      },
    },
  };
}
