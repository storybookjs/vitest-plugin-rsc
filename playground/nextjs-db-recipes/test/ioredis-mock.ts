import type { Plugin } from "vite";

// ioredis-mock's build for browsers, `browser.js`, does two things as it
// loads:
//
// - It calls `require()` for `fs` and `path`, for the utils of ioredis that it
//   bundles, through esbuild's shim of `require`. In a page there is none, and
//   the shim throws: "Dynamic require of "fs" is not supported". That breaks
//   any page. Nothing it does in a page uses them: they get an empty object.
// - It sets `window.Buffer` to its own copy of the `buffer` polyfill, in place
//   of the plugin's, which Next's server in the page uses: every render would
//   fail. Without it, ioredis-mock takes the plugin's global `Buffer`.
//
// Both are in the bundle itself, minified, so a transform of that file: in
// the dependency optimizer, which pre-bundles it, and in Vite, for a build.
// It throws when a version of ioredis-mock has other code there.
const name = String.raw`[\w$]+`;
const requireShim = new RegExp(
  String.raw`var (${name})=\(${name}=>typeof require<"u"\?require:typeof Proxy<"u"\?new Proxy\(${name},\{get:\(${name},${name}\)=>\(typeof require<"u"\?require:${name}\)\[${name}\]\}\):${name}\)\(function\(${name}\)\{if\(typeof require<"u"\)return require\.apply\(this,arguments\);throw Error\('Dynamic require of "'\+${name}\+'" is not supported'\)\}\);`,
);
const bufferGlobal = new RegExp(String.raw`window\.Buffer=${name}\.Buffer;`);

export function ioredisMockBrowser(): Plugin {
  return {
    name: "nextjs-db-recipes:ioredis-mock-browser",
    transform: {
      filter: { id: /[\\/]ioredis-mock[\\/]browser\.js(\?|$)/ },
      handler(code) {
        if (!requireShim.test(code) || !bufferGlobal.test(code)) {
          throw new Error("ioredis-mock's browser.js is not the one test/ioredis-mock.ts patches");
        }
        return {
          code: code.replace(requireShim, "var $1=()=>({});").replace(bufferGlobal, ""),
          // Both on its first line: the lines stay where they are.
          map: null,
        };
      },
    },
  };
}
