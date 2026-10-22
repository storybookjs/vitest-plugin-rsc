import { nodePlatformModules } from "./compat/paths.ts";

// What Next's Node.js server imports of its own that a browser does not have:
// the modules of Next that set a Node.js process up or read the files of a
// build, each one module that Next itself keeps apart. This is the build side
// of it: the modules, as code for Vite. The browser's side is node-server.ts,
// build-output.ts for the files of a build, and globals.ts for the globals.
// The modules of Node.js themselves are the package's, see node-builtins.ts.

/**
 * The stand-ins, for a `registry` in the browser that some of them call and a
 * `prefix` that their module ids start with.
 */
export function createNodePlatform(registry: string, prefix: string) {
  const forward = (owner: string, names: string[]) =>
    names
      .map((name) => `export const ${name} = (...args) => ${registry}.${owner}.${name}(...args);`)
      .join("\n");
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
    // \`instrumentation.ts\` is not run yet.
    instrumentation: `
  export async function getInstrumentationModule() {}
  export async function instrumentationOnRequestError() {}
  export async function ensureInstrumentationRegistered() {}
  `,
    // What Next's Node.js server patches when it starts: \`console\`, \`Date\`,
    // \`Math.random\`, \`crypto\`, \`setImmediate\`, the handlers of its process.
    // The globals are the test's too. (Cache Components reads these patches.)
    "node-environment": `export const installProcessErrorHandlers = () => {};`,
    // Next's bundle for Node.js brings React for both server layers, and its
    // route module hands them to those patches. Here a layer has its own.
    "vendored-react": `export const React = undefined;`,
    // Next measures its bloom filter of the routes with this, to warn about
    // its size, and it reads files and streams for that. No warning here.
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
    throw new Error("vitest-plugin-rsc: Next's staged rendering, for Cache Components, is not supported.");
  }
  export function expectNoPendingImmediates() {}
  `,
    // And the contexts of Next's \`*.shared-runtime\` modules, which the rsc
    // layer's imports of them read off this module (project/layers.ts): the
    // ssr layer's, as the one bundle of Next's Node.js server has them.
    "ssr-app-page-module": `
  export const AppPageRouteModule = new Proxy(class {}, {
    construct: (_, args) => new ${registry}.ssr.AppPageRouteModule(...args),
  });
  export const vendored = {
    get contexts() {
      return ${registry}.ssr.vendored.contexts;
    },
  };
  `,
  };
  return {
    /** The id of the stand-in for a specifier of a server layer, if it has one. */
    moduleOf(source: string): string | undefined {
      const match = nodePlatformModules.find(([pattern]) => pattern.test(source));
      return match && prefix + match[1];
    },
    /** The code of a stand-in, by its id without the prefix. */
    load: (name: string): string | undefined => modules[name],
  };
}
