import type { Plugin } from "vite";

// What a `require()` of an ES module returns in a pre-bundle. Rolldown's
// `__toCommonJS` copies the exports of the module onto a new object at every
// call, with a getter for each. Next's server requires modules like
// `node:stream` and its `AfterContext` inside the functions a request runs,
// so that was a copy of every export per call, on every request. Node.js
// returns the same object every time, and so does this: one per module.

// In Rolldown's runtime: the declaration of `__toCommonJS`, and in it the
// copy. Only the copy is kept: a module that exports a `module.exports` of
// its own has it read at every call, as the binding it is.
const declaration = /^(?:export )?var __toCommonJS = /m;
const copy =
  /__copyProps\(\s*__defProp\(\s*\{\s*\}\s*,\s*(["'])__esModule\1\s*,\s*\{\s*value:\s*true\s*\}\s*\)\s*,\s*mod\s*\)/y;

/**
 * The plugin of the optimizer that makes `__toCommonJS` of Rolldown's runtime
 * return one object per module. A runtime that does not have it as above is
 * left as it is.
 */
export function esmRequirePlugin(): Plugin {
  return {
    name: "vitest-plugin-rsc:esm-require",
    transform: {
      // Its id is `\0rolldown/runtime.js`.
      filter: { id: /rolldown\/runtime\.js$/ },
      handler(code) {
        const start = code.search(declaration);
        if (start === -1) return;
        const end = code.indexOf(";", start);
        const at = code.indexOf("__copyProps(", start);
        copy.lastIndex = at;
        const copied = at !== -1 && at < end ? copy.exec(code)?.[0] : undefined;
        if (!copied) return;
        const cached = `(__toCommonJSOf.get(mod) ?? __toCommonJSOf.set(mod, ${copied}).get(mod))`;
        return {
          code:
            `${code.slice(0, start)}var __toCommonJSOf = new WeakMap();\n` +
            `${code.slice(start, at)}${cached}${code.slice(at + copied.length)}`,
          map: null,
        };
      },
    },
  };
}
