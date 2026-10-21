// The package's modules of Node.js (src/node/), as they behave: in Node.js
// here, with its `crypto` and `Buffer`, which the browser has too.

import nodeCrypto from "node:crypto";
import { execFileSync } from "node:child_process";
import nodeFs from "node:fs";
import { isBuiltin } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "vitest";
import * as crypto from "../node/crypto.ts";
import fs, { existsSync, mkdirSync, readFileSync, writeFileSync } from "../node/fs.ts";
import promises, { readFile } from "../node/fs/promises.ts";
import {
  duplexPair,
  getDefaultHighWaterMark,
  isDisturbed,
  isErrored,
  pipeline,
  promises as streamPromises,
  Readable,
  setDefaultHighWaterMark,
  Writable,
} from "../node/stream.ts";
import { pipeline as pipelineAsync } from "../node/stream/promises.ts";
import { scheduler, setInterval as every, setTimeout as sleep } from "../node/timers/promises.ts";
import assert, { AssertionError, deepStrictEqual, ok } from "../node/assert.ts";
import util, { callbackify, format, inherits, inspect, isObject, promisify } from "../node/util.ts";
import pathModule, { normalize, parse, posix, resolve } from "../node/path.ts";
import strictAssert, { deepStrictEqual as strictDeepStrictEqual } from "../node/assert/strict.ts";
import { normalize as posixNormalize } from "../node/path/posix.ts";
import win32Path from "../node/path/win32.ts";
import { StringDecoder } from "../node/string_decoder.ts";
import { setImmediate } from "../node/timers.ts";
import { diskGlobal, resetDisk } from "./disk.ts";
import { registryGlobal } from "./registry-global.ts";

test("`fs` is a disk in memory, on a global, that starts with `/tmp` and that `resetDisk()` empties", async () => {
  expect((globalThis as Record<string, unknown>)[diskGlobal]).toBeDefined();
  expect(fs.readdirSync("/")).toEqual(["tmp"]);
  mkdirSync("/notes");
  writeFileSync("/notes/today.txt", "hello");
  expect(readFileSync("/notes/today.txt", "utf8")).toBe("hello");
  expect(await readFile("/notes/today.txt", "utf8")).toBe("hello");
  expect(promises).toBe(fs.promises);
  resetDisk();
  expect(existsSync("/notes")).toBe(false);
  expect(fs.readdirSync("/")).toEqual(["tmp"]);
});

test("`resetDisk()` closes what watches a file of the disk", async () => {
  writeFileSync("/tmp/watched.txt", "1");
  const watcher = fs.watch("/tmp/watched.txt");
  const closed = new Promise<void>((resolve) => watcher.on("close", resolve));
  const changes: unknown[] = [];
  fs.watchFile("/tmp/watched.txt", { interval: 5 }, (current: unknown) => changes.push(current));
  resetDisk();
  await closed;
  writeFileSync("/tmp/watched.txt", "2");
  await new Promise((resolve) => setTimeout(resolve, 30));
  expect(changes).toEqual([]);
  resetDisk();
});

test("`crypto` hashes with SHA-256 as Node.js does, and has Web Crypto", () => {
  const nodeHash = (update: (hash: nodeCrypto.Hash) => void) => {
    const hash = nodeCrypto.createHash("sha256");
    update(hash);
    return hash.digest("hex");
  };
  const ownHash = (update: (hash: ReturnType<typeof crypto.createHash>) => void) => {
    const hash = crypto.createHash("sha256");
    update(hash);
    return hash.digest("hex");
  };
  for (const length of [0, 55, 56, 63, 64, 65, 1000]) {
    const text = "a".repeat(length);
    expect(
      ownHash((hash) => hash.update(text)),
      `${length}`,
    ).toBe(nodeHash((hash) => hash.update(text)));
  }
  expect(ownHash((hash) => hash.update("héllo").update(Buffer.from("wörld")))).toBe(
    nodeHash((hash) => hash.update("héllo").update(Buffer.from("wörld"))),
  );
  expect(ownHash((hash) => hash.update("616263", "hex"))).toBe(
    nodeHash((hash) => hash.update("616263", "hex")),
  );
  const view = new Uint8Array([1, 2, 3, 4, 5, 6]).subarray(2, 5);
  expect(ownHash((hash) => hash.update(view))).toBe(nodeHash((hash) => hash.update(view)));
  expect(crypto.createHash("sha256").update("x").digest("base64")).toBe(
    nodeCrypto.createHash("sha256").update("x").digest("base64"),
  );
  expect(() => crypto.createHash("whirlpool")).toThrow("Digest method not supported");
  expect(crypto.randomUUID()).toHaveLength(36);
  expect(crypto.randomBytes(4)).toHaveLength(4);
  expect(crypto.subtle).toBe(globalThis.crypto.subtle);
  // The rest is unenv's, which throws when called.
  const rest = crypto as Record<string, any>;
  expect(() => rest.createSign("sha256")).toThrow("createSign is not implemented");
  expect(crypto.default.createHash).toBe(crypto.createHash);
  expect(typeof rest.constants.RSA_PKCS1_PADDING).toBe("number");
});

test("`crypto` signs with HMAC as Node.js does, and compares in constant time", () => {
  const long = "k".repeat(100);
  for (const key of ["key", "", long, Buffer.from([0, 1, 2, 255])]) {
    expect(crypto.createHmac("sha256", key).update("a").update("bc").digest("hex")).toBe(
      nodeCrypto.createHmac("sha256", key).update("abc").digest("hex"),
    );
  }
  // A webhook's: the signature of the body, as base64.
  const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
  expect(crypto.createHmac("SHA256", "whsec").update(body, "utf8").digest("base64")).toBe(
    nodeCrypto.createHmac("sha256", "whsec").update(body, "utf8").digest("base64"),
  );
  expect(Buffer.isBuffer(crypto.createHmac("sha256", "key").digest())).toBe(true);
  expect(crypto.createHmac("sha1", "key").update("abc").digest("hex")).toBe(
    nodeCrypto.createHmac("sha1", "key").update("abc").digest("hex"),
  );

  expect(crypto.timingSafeEqual(Buffer.from("same"), Buffer.from("same"))).toBe(true);
  expect(crypto.timingSafeEqual(Buffer.from("same"), Buffer.from("sane"))).toBe(false);
  expect(() => crypto.timingSafeEqual(Buffer.from("a"), Buffer.from("ab"))).toThrow(
    expect.objectContaining({ code: "ERR_CRYPTO_TIMING_SAFE_EQUAL_LENGTH" }),
  );
});

test("`fileURLToPath()` takes a URL of the page's origin, as a module's `import.meta.url` is", async () => {
  const { fileURLToPath } = await import("../node/url.ts");
  const scope = globalThis as { location?: { origin: string } };
  const location = scope.location;
  scope.location = { origin: "http://localhost:5173" };
  try {
    expect(fileURLToPath("http://localhost:5173/app/page.tsx?v=1")).toBe("/app/page.tsx");
    expect(fileURLToPath(new URL("http://localhost:5173/@fs/Users/me/a%20b.ts"))).toBe(
      "/Users/me/a b.ts",
    );
    expect(fileURLToPath("file:///notes/today.txt")).toBe("/notes/today.txt");
    // Another origin's is no file, as in Node.js, nor is a blob of the page's.
    expect(() => fileURLToPath("https://example.com/a.ts")).toThrow();
    expect(() => fileURLToPath("blob:http://localhost:5173/a-b-c")).toThrow();
  } finally {
    scope.location = location;
  }
});

test("`stream` reads and writes: not unenv's `Readable`, which reads nothing", async () => {
  // memfs' `createReadStream()` is a `Readable` of this one in a server
  // layer. Here, in Node.js, memfs has Node's: see disk.test.tsx of the
  // e2e demo for memfs in the browser.
  const chunks = ["from ", "a ", "stream"];
  const source = new Readable({
    read() {
      this.push(chunks.shift() ?? null);
    },
  });
  const read: string[] = [];
  const sink = new Writable({
    write(chunk: Uint8Array, _encoding, done) {
      read.push(new TextDecoder().decode(chunk));
      done();
    },
  });
  await new Promise<void>((resolve, reject) =>
    pipeline(source, sink, (error?: Error | null) => (error ? reject(error) : resolve())),
  );
  expect(read.join("")).toBe("from a stream");
});

test("`stream/promises` pipes with the package's stream, and `Readable` bridges to web streams", async () => {
  // The package's own `Readable.from()`, in Node.js too.
  const source = Readable.from(["web ", "stream"]);
  const chunks: unknown[] = [];
  for await (const chunk of Readable.from(
    (async function* () {
      yield "async ";
      yield Buffer.from("too");
    })(),
  )) {
    chunks.push(chunk);
  }
  expect(chunks.map(String).join("")).toBe("async too");
  expect(
    await new Promise<string[]>((resolve) => {
      const one: string[] = [];
      Readable.from("one string")
        .on("data", (chunk: unknown) => one.push(String(chunk)))
        .on("end", () => resolve(one));
    }),
  ).toEqual(["one string"]);
  const read: string[] = [];
  const sink = new Writable({
    write(chunk: Uint8Array, _encoding, done) {
      read.push(new TextDecoder().decode(chunk));
      done();
    },
  });
  await pipelineAsync(source, sink);
  expect(read.join("")).toBe("web stream");
  const toWeb = (Readable as unknown as { toWeb(r: unknown): ReadableStream<Uint8Array> }).toWeb;
  const text = await new Response(toWeb(Readable.from([Buffer.from("to the web")]))).text();
  expect(text).toBe("to the web");
});

// The `setImmediate` of the plugin's registry, which the page has.
const scope = globalThis as unknown as Record<string, Record<string, unknown>>;
Object.assign((scope[registryGlobal] ??= {}), {
  setImmediate: (callback: (...args: unknown[]) => void, ...args: unknown[]) =>
    setTimeout(callback, 0, ...args),
  clearImmediate: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
});

test("`timers/promises` waits with the page's timers, and takes a signal", async () => {
  const started = performance.now();
  expect(await sleep(30, "value")).toBe("value");
  expect(performance.now() - started).toBeGreaterThanOrEqual(25);
  await expect(scheduler.wait(1000, { signal: AbortSignal.abort("why") })).rejects.toMatchObject({
    name: "AbortError",
    code: "ABORT_ERR",
    cause: "why",
  });
});

test("`timers/promises`' setInterval keeps ticking while the consumer works, and stops when it is done", async () => {
  const controller = new AbortController();
  const ticks = every(20, "tick", { signal: controller.signal });
  expect((await ticks.next()).value).toBe("tick");
  // The consumer is busy for several intervals: those ticks come at once.
  await new Promise((resolve) => setTimeout(resolve, 70));
  const started = performance.now();
  await ticks.next();
  await ticks.next();
  expect(performance.now() - started).toBeLessThan(10);
  controller.abort();
  await expect(ticks.next()).rejects.toMatchObject({ name: "AbortError" });
  const stopped = every(5, "tick");
  await stopped.next();
  expect(await stopped.return(undefined)).toEqual({ done: true, value: undefined });
});

test("`stream` is readable-stream 4: `from()` awaits, rejects null and errors, and the predicates tell", async () => {
  const chunks: unknown[] = [];
  for await (const chunk of Readable.from([Promise.resolve("awaited")])) chunks.push(chunk);
  expect(chunks).toEqual(["awaited"]);
  await expect(async () => {
    for await (const _ of Readable.from(["a", null])) void _;
  }).rejects.toMatchObject({ code: "ERR_STREAM_NULL_VALUES" });
  function* failing() {
    yield "x";
    throw new Error("the iterable failed");
  }
  await expect(async () => {
    for await (const _ of Readable.from(failing())) void _;
  }).rejects.toThrow("the iterable failed");
  const read = Readable.from(["a"]);
  expect(isDisturbed(read)).toBe(false);
  for await (const _ of read) void _;
  expect(isDisturbed(read)).toBe(true);
  const failed = new Readable({ read() {} });
  failed.on("error", () => {});
  failed.destroy(new Error("failed"));
  await new Promise((resolve) => failed.on("close", resolve));
  expect(isErrored(failed)).toBe(true);
  const defaultHighWaterMark = getDefaultHighWaterMark(false);
  setDefaultHighWaterMark(false, 1234);
  expect(new Readable({ read() {} }).readableHighWaterMark).toBe(1234);
  setDefaultHighWaterMark(false, defaultHighWaterMark);
  expect(typeof streamPromises.pipeline).toBe("function");
  expect(() => duplexPair()).toThrow("not there in the browser");
});

test("`assert/strict`, `path/posix`, `path/win32` and `string_decoder` are the package's own", () => {
  // By the package's name, so the built `assert` and `path`: not this
  // source's instances, but the same code.
  expect(() => strictAssert.deepStrictEqual(new Map([["a", 1]]), new Map([["a", 2]]))).toThrow(
    "Expected values to be strictly deep-equal",
  );
  expect(() => strictDeepStrictEqual([1], [1])).not.toThrow();
  expect(posixNormalize("a\\b/../c")).toBe("c");
  expect(win32Path.sep).toBe("/");
  expect(win32Path.posix).toBe(win32Path);
  const decoder = new StringDecoder("utf8");
  expect(decoder.write(Buffer.from([0xe2, 0x82])) + decoder.end(Buffer.from([0xac]))).toBe("€");
});

test("`assert` compares as Node.js does, with a message", () => {
  expect(() => deepStrictEqual(new Map([["a", 1]]), new Map([["a", 2]]))).toThrow(AssertionError);
  expect(() => ok(false, "required invariant")).toThrow("required invariant");
  expect(() => assert.ok(0)).toThrow(AssertionError);
  expect(() => deepStrictEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).not.toThrow();
  expect(typeof assert.strict.equal).toBe("function");
});

test("`timers` hands a callback its arguments, as Node.js does", async () => {
  const got = await new Promise((resolve) => setImmediate(resolve, "payload", 3));
  expect(got).toBe("payload");
});

test("`util.types`, `isDeepStrictEqual` and `promisify.custom` are Node's", async () => {
  expect(util.types.isUint8Array(new Uint8Array())).toBe(true);
  expect(util.types.isPromise(Promise.resolve())).toBe(true);
  expect(util.isDeepStrictEqual(new Map([["a", 1]]), new Map([["a", 2]]))).toBe(false);
  expect(util.isDeepStrictEqual({ a: [1] }, { a: [1] })).toBe(true);
  expect(promisify.custom).toBe(Symbol.for("nodejs.util.promisify.custom"));
  const custom = Object.assign(() => {}, { [promisify.custom]: async () => "custom" });
  expect(await (promisify(custom) as () => Promise<string>)()).toBe("custom");
  expect(await (promisify(promisify(custom)) as () => Promise<string>)()).toBe("custom");
  expect(util.types.isNativeError(new TypeError("x"))).toBe(true);
});

test("`util` inspects and formats as Node.js does, and has Node's helpers", () => {
  expect(typeof callbackify(async () => 3)).toBe("function");
  expect(isObject(Object.create(null))).toBe(true);
  expect(typeof promisify(setTimeout)).toBe("function");
  expect(typeof inherits).toBe("function");
  expect(typeof (util as Record<string, unknown>).callbackify).toBe("function");
  expect(inspect(new Error("boom")).split("\n")[0]).toBe("Error: boom");
  expect(inspect({ a: [1, { b: new Map([["k", 1]]) }] })).toBe("{ a: [ 1, { b: [Map] } ] }");
  expect(format("%s has %d items, %j", "list", 3, { x: 1 })).toBe('list has 3 items, {"x":1}');
});

test("`path` is the POSIX path of Node.js", () => {
  expect(posix.join("/a", "b")).toBe("/a/b");
  expect(pathModule.posix).toBe(posix);
  expect(pathModule.win32.join("/a", "b")).toBe("/a/b");
  // A backslash is a character of a name, not a separator, as on Linux.
  expect(normalize("a\\b/../c")).toBe("c");
  expect(resolve("/notes", "../today.txt")).toBe("/today.txt");
  expect(parse("/notes/today.txt")).toEqual({
    root: "/",
    dir: "/notes",
    base: "today.txt",
    ext: ".txt",
    name: "today",
  });
});

// The built files, where there is a build: `pnpm build` of the package.
const dist = fileURLToPath(new URL("../../dist/node/", import.meta.url));
test.skipIf(!nodeFs.existsSync(dist))(
  "builds each module to one file of its own, with only imports of Node.js and the package left",
  () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of nodeFs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(file);
        else if (entry.name.endsWith(".js")) files.push(file);
      }
    };
    walk(dist);
    expect(files.length).toBeGreaterThan(50);
    for (const file of files) {
      const code = nodeFs.readFileSync(file, "utf8");
      expect(code, file).not.toContain("__require(");
      // No `require` of Node.js: the package's `module` has a `createRequire()`
      // of its own, whose `require` throws.
      expect(code, file).not.toContain("createRequire(import.meta");
      for (const match of code.matchAll(/^(?:import|export)[^;]*?from\s*"([^"]+)"/gm)) {
        const specifier = match[1]!;
        expect(
          isBuiltin(specifier) || specifier.startsWith("vitest-plugin-rsc/node/"),
          `${file} imports ${specifier}`,
        ).toBe(true);
        // unenv's is in the file: the package's own, which the app's
        // `node:async_hooks` is too, would share a chunk with the app.
        expect(specifier.replace(/^node:/, ""), file).not.toBe("async_hooks");
      }
    }
    // The package's own files import the modules by name too: not their
    // source, with readable-stream's file for Node.js in it.
    const nextjs = fileURLToPath(new URL("../../dist/nextjs/", import.meta.url));
    for (const entry of nodeFs.readdirSync(nextjs)) {
      if (!entry.endsWith(".js")) continue;
      const code = nodeFs.readFileSync(path.join(nextjs, entry), "utf8");
      expect(code, entry).not.toContain("__require(");
      expect(code, entry).not.toContain("READABLE_STREAM");
    }
    expect(
      nodeFs.readdirSync(nextjs).some((entry) => {
        return (
          entry.endsWith(".js") &&
          nodeFs
            .readFileSync(path.join(nextjs, entry), "utf8")
            .includes('"vitest-plugin-rsc/node/stream"')
        );
      }),
    ).toBe(true);
    const licenses = nodeFs.readFileSync(path.join(dist, "LICENSES.md"), "utf8");
    for (const name of [
      "memfs",
      "unenv",
      "path-browserify",
      "@jsonjoy.com/fs-node",
      "readable-stream",
      "string_decoder",
    ]) {
      expect(licenses).toContain(`## ${name} `);
    }
  },
);

// The built files as a server layer has them: in Node.js, with a hook that
// gives a module of Node.js that one of them imports its file next to it, as
// the layer resolver does (nextjs/plugin.ts), and the package's own by name.
test.skipIf(!nodeFs.existsSync(dist))(
  "the built files work together: streams of the disk, zlib, a hash, and a console, without a debug log",
  () => {
    const dir = nodeFs.mkdtempSync(path.join(os.tmpdir(), "node-modules-"));
    try {
      const distUrl = pathToFileURL(dist).href;
      nodeFs.writeFileSync(
        path.join(dir, "hooks.mjs"),
        `import fs from "node:fs";
import { isBuiltin } from "node:module";
const dist = ${JSON.stringify(distUrl)};
export async function resolve(specifier, context, next) {
  const name = specifier.replace(/^node:/, "");
  if (context.parentURL?.startsWith(dist) && isBuiltin(specifier) && name !== "async_hooks") {
    const url = dist + name + ".js";
    if (fs.existsSync(new URL(url))) return { url, shortCircuit: true };
  }
  if (specifier.startsWith("vitest-plugin-rsc/node/")) {
    return { url: dist + specifier.slice("vitest-plugin-rsc/node/".length) + ".js", shortCircuit: true };
  }
  return next(specifier, context);
}
`,
      );
      nodeFs.writeFileSync(
        path.join(dir, "register.mjs"),
        `import { register } from "node:module";\nregister("./hooks.mjs", import.meta.url);\n`,
      );
      nodeFs.writeFileSync(
        path.join(dir, "run.mjs"),
        `const dist = ${JSON.stringify(distUrl)};
const debug = [];
console.debug = (...args) => debug.push(args.join(" "));
const stream = await import(dist + "stream.js");
const fs = (await import(dist + "fs.js")).default;
await import(dist + "console.js");
fs.writeFileSync("/tmp/note.txt", "from the disk");
const read = [];
const sink = new stream.Writable({
  write(chunk, _encoding, done) {
    read.push(new TextDecoder().decode(chunk));
    done();
  },
});
await new Promise((resolve, reject) =>
  stream.pipeline(fs.createReadStream("/tmp/note.txt"), sink, (error) => (error ? reject(error) : resolve())),
);
const items = [];
for await (const item of stream.Readable.from(["from ", "an iterable"])) items.push(item);
// assert through the built util: its types are the package's own.
const assert = (await import(dist + "assert.js")).default;
assert.deepStrictEqual({ a: [1] }, { a: [1] });
let unequalMaps = "";
try { assert.deepStrictEqual(new Map([["a", 1]]), new Map([["a", 2]])); } catch (error) { unequalMaps = error.message; }
// zlib's and crypto's built files: a hash is the built stream's Transform.
const zlib = await import(dist + "zlib.js");
const crypto = await import(dist + "crypto.js");
const consumers = await import(dist + "stream/consumers.js");
const gunzipped = zlib.gunzipSync(zlib.gzipSync("gzipped"));
const md5 = await consumers.buffer(stream.Readable.from([gunzipped]).pipe(crypto.createHash("md5")));
process.stdout.write(JSON.stringify({ read: read.join(""), debug: debug.length, transform: typeof new stream.Transform().pipe, from: items.join(""), unequalMaps: unequalMaps.split("\\n")[0], base: new stream.Writable() instanceof stream.Stream, md5: md5.toString("hex") }));
`,
      );
      const output = execFileSync(process.execPath, ["--import", "./register.mjs", "run.mjs"], {
        cwd: dir,
        encoding: "utf8",
      });
      expect(JSON.parse(output)).toEqual({
        read: "from the disk",
        debug: 0,
        transform: "function",
        from: "from an iterable",
        unequalMaps: "Expected values to be strictly deep-equal:",
        base: true,
        md5: "ea3eded0ee50e0dd4aa53c0ff59988dc",
      });
    } finally {
      nodeFs.rmSync(dir, { recursive: true, force: true });
    }
  },
);
