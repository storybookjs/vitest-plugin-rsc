// What Next's Node.js server imports that a tab does not have: Node's own
// modules, and the modules of Next that set a Node.js process up or read the
// files of a build. Each of Next's is one module that Next itself keeps
// apart. This is the build side of it: the modules, as code for Vite. The
// tab's side is node-server.ts, and globals.ts for the globals.

/**
 * The stand-ins, for a `registry` of the tab that some of them call and a
 * `prefix` that their module ids start with.
 */
export function createNodePlatform(registry: string, prefix: string) {
  const bridgePrefix = prefix;
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
  import stream from ${JSON.stringify(`${bridgePrefix}node-stream`)};
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
    // The tab is the test's too. (Cache Components reads these patches.)
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
    // Of Node's \`crypto\`, what Next's server uses where it has no Web Crypto
    // branch: the ids of nanoid.
    "node-crypto": `
  const web = globalThis.crypto;
  export const webcrypto = web;
  export const randomUUID = () => web.randomUUID();
  export const randomFillSync = (buffer) => (web.getRandomValues(buffer), buffer);
  export const randomBytes = (size) => web.getRandomValues(Buffer.alloc(size));
  export const getRandomValues = (buffer) => web.getRandomValues(buffer);
  // Web Crypto hashes asynchronously. Next's cache keys are SHA-256, at once.
  const K = new Uint32Array(64);
  for (let n = 2, i = 0; i < 64; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
    if (prime) K[i++] = (Math.cbrt(n) % 1) * 2 ** 32;
  }
  function sha256(bytes) {
    const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const length = bytes.length;
    const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(padded.length - 8, Math.floor((length * 8) / 2 ** 32));
    view.setUint32(padded.length - 4, (length * 8) >>> 0);
    const w = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let offset = 0; offset < padded.length; offset += 64) {
      for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }
    const out = new Uint8Array(32);
    h.forEach((word, i) => new DataView(out.buffer).setUint32(i * 4, word));
    return out;
  }
  export const createHash = (algorithm) => {
    if (!/^sha-?256$/i.test(algorithm)) {
      throw new Error("vitest-plugin-rsc: node:crypto's createHash(" + JSON.stringify(algorithm) + ") is not there in a tab");
    }
    const chunks = [];
    const hash = {
      update(data) {
        chunks.push(typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data.buffer ?? data, data.byteOffset ?? 0, data.byteLength));
        return hash;
      },
      digest(encoding) {
        const digest = Buffer.from(sha256(Buffer.concat(chunks)));
        return encoding ? digest.toString(encoding) : digest;
      },
    };
    return hash;
  };
  export default { webcrypto, randomUUID, randomFillSync, randomBytes, getRandomValues, createHash };
  `,
    // Next patches the global \`setImmediate\` when this loads, to run the
    // stages of a prerender in one task. That is for Cache Components, and the
    // tab's globals are the page's too.
    "fast-set-immediate": `
  export const unpatchedSetImmediate = (...args) => ${registry}.setImmediate(...args);
  export function DANGEROUSLY_runPendingImmediatesAfterCurrentTask() {
    throw new Error("vitest-plugin-rsc: Next's staged rendering, for Cache Components, is not supported.");
  }
  export function expectNoPendingImmediates() {}
  `,
    // Next asks Node.js for the source map of a file in a stack. Vite has them.
    "node-module": `
  export const findSourceMap = () => undefined;
  export default { findSourceMap };
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
    [/^(node:)?crypto$/, "node-crypto"],
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
