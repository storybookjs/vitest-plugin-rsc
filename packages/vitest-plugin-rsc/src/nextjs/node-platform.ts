// What Next's Node.js server imports that a browser does not have: Node's own
// modules, and the modules of Next that set a Node.js process up or read the
// files of a build. Each of Next's is one module that Next itself keeps
// apart. This is the build side of it: the modules, as code for Vite. The
// browser's side is node-server.ts, and globals.ts for the globals.

import zlib from "node:zlib";

/**
 * The stand-ins, for a `registry` in the browser that some of them call and a
 * `prefix` that their module ids start with.
 */
export function createNodePlatform(registry: string, prefix: string) {
  const forward = (owner: string, names: string[]) =>
    names
      .map((name) => `export const ${name} = (...args) => ${registry}.${owner}.${name}(...args);`)
      .join("\n");
  const nodeStream = `
  import stream from "next/dist/compiled/stream-browserify";
  const { Readable } = stream;
  // Next's polyfill is an older \`stream\`, without the bridge to web streams.
  Readable.toWeb ??= (readable) =>
    new ReadableStream({
      start(controller) {
        readable.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
        readable.on("end", () => controller.close());
        readable.on("error", (error) => controller.error(error));
      },
      cancel: (reason) => void readable.destroy(reason),
    });
  Readable.fromWeb ??= (web) => {
    const reader = web.getReader();
    return new Readable({
      read() {
        reader.read().then(
          ({ done, value }) => void this.push(done ? null : Buffer.from(value)),
          (error) => this.destroy(error),
        );
      },
    });
  };
  export default stream;
  export const { Writable, Duplex, Transform, PassThrough, Stream, finished, pipeline } = stream;
  export { Readable };
  `;
  const modules: Record<string, string> = {
    "node-stream": nodeStream,
    "node-stream-promises": `
  import stream from ${JSON.stringify(`${prefix}node-stream`)};
  const isStream = (value) => value && (typeof value.pipe === "function" || typeof value.write === "function");
  export const pipeline = (...streams) => {
    // The options, with a signal: the request ends with the test here.
    if (!isStream(streams.at(-1))) streams.pop();
    return new Promise((resolve, reject) =>
      stream.pipeline(...streams, (error) => (error ? reject(error) : resolve())),
    );
  };
  export const finished = (target) =>
    new Promise((resolve, reject) => stream.finished(target, (error) => (error ? reject(error) : resolve())));
  `,
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
    // For the server code of the app. Next's own importer of it is replaced below.
    "node-timers": `
  export const setImmediate = (...args) => ${registry}.setImmediate(...args);
  export const clearImmediate = (...args) => ${registry}.clearImmediate(...args);
  export const setTimeout = (...args) => globalThis.setTimeout(...args);
  export const clearTimeout = (...args) => globalThis.clearTimeout(...args);
  export const setInterval = (...args) => globalThis.setInterval(...args);
  export const clearInterval = (...args) => globalThis.clearInterval(...args);
  export default { setImmediate, clearImmediate, setTimeout, clearTimeout, setInterval, clearInterval };
  `,
    // The timers of the page, as promises: unenv's resolve at once.
    "node-timers-promises": `
  const aborted = (signal) =>
    Object.assign(new Error("The operation was aborted"), { name: "AbortError", code: "ABORT_ERR", cause: signal.reason });
  const after = (start, clear, value, options) =>
    new Promise((resolve, reject) => {
      const signal = options?.signal;
      if (signal?.aborted) return reject(aborted(signal));
      const abort = () => {
        clear(id);
        reject(aborted(signal));
      };
      const id = start(() => {
        signal?.removeEventListener("abort", abort);
        resolve(value);
      });
      signal?.addEventListener("abort", abort, { once: true });
    });
  export const setTimeout = (delay, value, options) =>
    after((done) => globalThis.setTimeout(done, delay), globalThis.clearTimeout, value, options);
  export const setImmediate = (value, options) =>
    after((done) => ${registry}.setImmediate(done), (id) => ${registry}.clearImmediate(id), value, options);
  // Ticks while the consumer works, as Node's does: a tick it has not
  // taken yet comes at once.
  export async function* setInterval(delay, value, options) {
    const signal = options?.signal;
    if (signal?.aborted) throw aborted(signal);
    let pending = 0;
    let wake;
    const tick = () => {
      pending++;
      wake?.();
    };
    const id = globalThis.setInterval(tick, delay);
    signal?.addEventListener("abort", tick, { once: true });
    try {
      for (;;) {
        while (pending === 0 && !signal?.aborted) {
          await new Promise((resolve) => {
            wake = resolve;
          });
          wake = undefined;
        }
        if (signal?.aborted) throw aborted(signal);
        pending--;
        yield value;
      }
    } finally {
      globalThis.clearInterval(id);
      signal?.removeEventListener("abort", tick);
    }
  }
  export const scheduler = {
    wait: (delay, options) => setTimeout(delay, undefined, options),
    yield: () => setImmediate(),
  };
  export default { setTimeout, setImmediate, setInterval, scheduler };
  `,
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
    // Next compresses what a prerender leaves for the request that resumes
    // it, and no page is prerendered here. Every export of Node's \`zlib\` is
    // there, so that code which imports one loads: the functions throw.
    "node-zlib": `
  const missing = (name) =>
    function () {
      throw new Error("vitest-plugin-rsc: node:zlib's " + name + " is not there in the browser");
    };
  ${Object.entries(zlib)
    .map(([name, value]) =>
      typeof value === "function"
        ? `export const ${name} = missing(${JSON.stringify(name)});`
        : `export const ${name} = ${JSON.stringify(value)};`,
    )
    .join("\n  ")}
  export default { ${Object.keys(zlib).join(", ")} };
  `,
    // Next asks Node.js for the source map of a file in a stack. Vite has them.
    "node-module": `
  export const findSourceMap = () => undefined;
  export const builtinModules = [];
  export default { findSourceMap, builtinModules };
  `,
    "ssr-app-page-module": `
  export const AppPageRouteModule = new Proxy(class {}, {
    construct: (_, args) => new ${registry}.ssr.AppPageRouteModule(...args),
  });
  `,
    // Next's cache keeps its entries in memory. With this it finds no file.
    "node-fs": `
  const missing = () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); };
  export const nodeFs = {
    existsSync: () => false,
    readFile: async () => missing(),
    readFileSync: missing,
    stat: async () => missing(),
    writeFile: async () => {},
    mkdir: async () => {},
  };
  `,
  };
  const patterns: [RegExp, string][] = [
    [/^(node:)?stream$/, "node-stream"],
    [/^(node:)?stream\/promises$/, "node-stream-promises"],
    [/^next\/dist\/(esm\/)?server\/app-render\/react-server\.node(\.js)?$/, "react-server-node"],
    [/^next\/dist\/(esm\/)?server\/load-manifest\.external(\.js)?$/, "load-manifest"],
    [
      /^next\/dist\/(esm\/)?server\/lib\/router-utils\/instrumentation-globals\.external(\.js)?$/,
      "instrumentation",
    ],
    [/^next\/dist\/(esm\/)?server\/lib\/node-fs-methods(\.js)?$/, "node-fs"],
    [
      /^next\/dist\/(esm\/)?server\/node-environment(-extensions\/(error-inspect|console-file|console-exit|console-dim\.external|unhandled-rejection\.external|random|date|web-crypto|node-crypto|process-error-handlers))?(\.js)?$/,
      "node-environment",
    ],
    // What sets up a Node.js process for Next: the patches above, a hook on
    // \`require\`, a \`crypto\` global.
    [/^next\/dist\/(esm\/)?build\/adapter\/setup-node-env\.external(\.js)?$/, "node-environment"],
    [/^(node:)?module$/, "node-module"],
    [
      /^next\/dist\/(esm\/)?server\/node-environment-extensions\/fast-set-immediate\.external(\.js)?$/,
      "fast-set-immediate",
    ],
    [/^(node:)?timers$/, "node-timers"],
    [/^(node:)?timers\/promises$/, "node-timers-promises"],
    [/^(node:)?zlib$/, "node-zlib"],
    [/^next\/dist\/compiled\/gzip-size(\/index(\.js)?)?$/, "gzip-size"],
    [
      /^next\/dist\/(esm\/)?server\/route-modules\/app-page\/vendored\/(rsc|ssr)\/entrypoints(\.js)?$/,
      "vendored-react",
    ],
  ];

  return {
    /** The id of the stand-in for a specifier of a server layer, if it has one. */
    moduleOf(source: string): string | undefined {
      const match = patterns.find(([pattern]) => pattern.test(source));
      return match && prefix + match[1];
    },
    /** The code of a stand-in, by its id without the prefix. */
    load: (name: string): string | undefined => modules[name],
  };
}
