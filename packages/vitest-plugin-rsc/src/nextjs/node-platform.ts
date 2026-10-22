import MagicString from "magic-string";
import { parseAst, type Plugin } from "vite";
import { missingHelper, walk, type Node } from "./commonjs.ts";
import {
  instrumentationModule,
  nodePlatformModuleOf,
  nodePlatformModules,
} from "./compat/paths.ts";

// What Next's Node.js server imports of its own that a browser does not have:
// the modules of Next that set a Node.js process up or read the files of a
// build, each one module that Next itself keeps apart. This is the build side
// of it: the modules, as code for Vite. The browser's side is node-server.ts,
// build-output.ts for the files of a build, and globals.ts for the globals.
// The modules of Node.js themselves are the package's, see node-builtins.ts.
//
// A stand-in replaces all of a module, so it has every export of the module
// that Next has: compat/checks.ts checks that when the run starts. Where all
// a module of Next lacks in a browser is one capability of Node.js, the
// module is Next's own, given that capability: see `instrumentationRequire`.

/**
 * The stand-ins, for a `registry` in the browser that some of them call and a
 * `prefix` that their module ids start with.
 */
export function createNodePlatform(registry: string, prefix: string) {
  const forward = (owner: string, names: string[]) =>
    names
      .map((name) => `export const ${name} = (...args) => ${registry}.${owner}.${name}(...args);`)
      .join("\n");
  // Next's staged rendering, for Cache Components: see `fast-set-immediate`.
  const stagedRendering = `throw new Error(${JSON.stringify(
    "vitest-plugin-rsc: Next's staged rendering, for Cache Components, is not supported.",
  )});`;
  const modules: Record<string, string> = {
    "react-server-node": forward("flightServer", [
      "createTemporaryReferenceSet",
      "decodeReply",
      "decodeReplyFromBusboy",
      "decodeAction",
      "decodeFormState",
    ]),
    "load-manifest":
      forward("node", [
        "loadManifest",
        "evalManifest",
        "loadManifestFromRelativePath",
        "evalManifestFromRelativePath",
      ]) + `\nexport const clearManifestCache = () => false;`,
    // What Next's Node.js server patches when it starts: \`console\`, \`Date\`,
    // \`Math.random\`, \`crypto\`, \`setImmediate\`, the handlers of its process.
    // The globals are the test's too. (Cache Components reads these patches.)
    "node-environment": `
  export const installProcessErrorHandlers = () => {};
  export const isUnhandledRejectionListenerRegistered = () => false;
  export const registerUnhandledRejectionListener = () => {};
  export const setAbortedLogsStyle = () => {};
  `,
    // Next's bundle for Node.js brings React for both server layers, and its
    // route module hands them to those patches. Here a layer has its own.
    "vendored-react": `
  export const React = undefined;
  export const ReactDOM = undefined;
  export const ReactDOMServer = undefined;
  export const ReactJsxDevRuntime = undefined;
  export const ReactJsxRuntime = undefined;
  export const ReactCompilerRuntime = undefined;
  export const ReactServerDOMTurbopackClient = undefined;
  export const ReactServerDOMTurbopackServer = undefined;
  export const ReactServerDOMTurbopackStatic = undefined;
  export const ReactServerDOMWebpackClient = undefined;
  export const ReactServerDOMWebpackServer = undefined;
  export const ReactServerDOMWebpackStatic = undefined;
  `,
    // Next measures its bloom filter of the routes with this, to warn about
    // its size, as its build makes the filter, which the layers never do: a
    // bundle of its own, with \`fs\`, \`stream\` and \`zlib\`, for a call
    // that is not made. No warning here.
    "gzip-size": `
  export const sync = () => 0;
  export default { sync };
  `,
    // Next patches the global \`setImmediate\` when this loads, to run the
    // stages of a prerender in one task. That is for Cache Components, and the
    // globals are the page's too.
    "fast-set-immediate": `
  export const unpatchedSetImmediate = (...args) => ${registry}.setImmediate(...args);
  export function DANGEROUSLY_runPendingImmediatesAfterCurrentTask() {
    ${stagedRendering}
  }
  export function expectNoPendingImmediates() {}
  export class ImmediateTracker {
    constructor() {
      ${stagedRendering}
    }
  }
  export function runWithNativeImmediateTracking() {
    ${stagedRendering}
  }
  `,
    // And the contexts of Next's \`*.shared-runtime\` modules, which the rsc
    // layer's imports of them read off this module (project/layers.ts): the
    // ssr layer's, as the one bundle of Next's Node.js server has them.
    "ssr-app-page-module": `
  export const AppPageRouteModule = new Proxy(class {}, {
    construct: (_, args) => new ${registry}.ssr.AppPageRouteModule(...args),
  });
  export default AppPageRouteModule;
  export const vendored = new Proxy({}, {
    get: (_, key) => ${registry}.ssr.vendored[key],
  });
  ${forward("ssr", ["renderToHTMLOrFlight", "prerenderToHTMLOrFlight"])}
  `,
  };
  const names = new Map(
    Object.entries(nodePlatformModules).flatMap(([name, nextModules]) =>
      nextModules.map((nextModule) => [nextModule, name]),
    ),
  );
  return {
    /** The id of the stand-in for a specifier of a server layer, if it has one. */
    moduleOf(source: string): string | undefined {
      const name = names.get(nodePlatformModuleOf(source) ?? "");
      return name && prefix + name;
    },
    /** The code of a stand-in, by its id without the prefix. */
    load: (name: string): string | undefined => modules[name],
  };
}

// Next's module that loads the app's `instrumentation.ts` does it with one
// `require()`, of the file Next's build makes of it, and takes a module that
// is not found for an app without one. That call is all of the module that
// needs Node.js: it calls the function that compiled CommonJS calls for a
// module that is not there (commonjs.ts), which throws as Node.js does, and
// the rest of the module is Next's own, whatever it exports. The plugin does
// not run `instrumentation.ts` yet. A browser has no `require`.
const missingRequire = "$$cjsMissing";

// The name of the file in Next's call, `${INSTRUMENTATION_HOOK_FILENAME}.js`.
const hookFilename = "INSTRUMENTATION_HOOK_FILENAME";

/** The files of the module of Next that loads `instrumentation.ts`, of either build. */
const instrumentationFile = new RegExp(
  `/next/dist/(?:esm/)?${instrumentationModule.replaceAll(".", "\\.")}\\.js$`,
);

/**
 * The code of the module of Next that loads `instrumentation.ts`, with a
 * `require` that finds no file. Or why it cannot have one: its one use of
 * `require` has to be a call that loads the file, or this is a Next that
 * loads it otherwise.
 */
export function instrumentationRequire(code: string): MagicString | string {
  const uses: [Node, Node | undefined][] = [];
  for (const [node, parent] of walk(parseAst(code) as unknown as Node)) {
    if (node.type === "Identifier" && node.name === "require") uses.push([node, parent]);
  }
  const [use, call] = uses[0] ?? [];
  const loadsTheFile =
    uses.length === 1 &&
    call?.type === "CallExpression" &&
    call.callee === use &&
    [...walk(call)].some(([node]) => node.type === "Identifier" && node.name === hookFilename);
  if (!loadsTheFile) {
    const times = uses.length === 1 ? "once" : `${uses.length} times`;
    return `\`require\` ${times}, and not as the one call that loads \`${hookFilename}\``;
  }
  const replaced = new MagicString(code);
  replaced.overwrite(use!.start, use!.end, missingRequire);
  return replaced.prepend(missingHelper);
}

/**
 * Next's module that loads `instrumentation.ts`, with a `require` that finds
 * no file: for the dependency optimizer of a server layer, and for a static
 * build, which has no optimizer.
 */
export function instrumentationPlugin(): Plugin {
  return {
    name: "vitest-plugin-rsc:next-instrumentation",
    transform: {
      // Rolldown matches the id with `/` for a separator.
      filter: { id: instrumentationFile },
      handler(code, id) {
        const replaced = instrumentationRequire(code);
        if (typeof replaced === "string") {
          // compat/checks.ts says so with Next's version when the run starts.
          throw new Error(`vitest-plugin-rsc: ${id} has ${replaced}.`);
        }
        return { code: replaced.toString(), map: replaced.generateMap({ hires: "boundary" }) };
      },
    },
  };
}
