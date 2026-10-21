// The package's modules of Node.js that stand on the web's APIs, fflate and
// the noble packages: `zlib`, `crypto`, `stream/consumers`, `buffer`,
// `events` and the rest of `util`. Each as Node.js does it: Node's own is
// here to compare with.

import nodeBuffer from "node:buffer";
import nodeCrypto from "node:crypto";
import { promisify } from "node:util";
import type { Duplex } from "node:stream";
import nodeZlib from "node:zlib";
import { expect, test } from "vitest";
import * as buffer from "../node/buffer.ts";
import * as crypto from "../node/crypto.ts";
import events, { EventEmitter, listenerCount, setMaxListeners } from "../node/events.ts";
import stream, { duplexPair, Readable } from "../node/stream.ts";
import * as consumers from "../node/stream/consumers.ts";
import * as url from "../node/url.ts";
import { aborted, styleText, stripVTControlCharacters, toUSVString } from "../node/util.ts";
import types from "../node/util/types.ts";
import * as zlib from "../node/zlib.ts";

const text = "the notes of today, ".repeat(200);

// What a function of Node's that calls back gives, as a promise.
const promised = <T>(call: (callback: (error: Error | null, result?: T) => void) => void) =>
  new Promise<T>((resolve, reject) =>
    call((error, result) => (error ? reject(error) : resolve(result as T))),
  );

test("`zlib`'s sync functions compress as Node's decompress, and decompress what Node's compress", () => {
  const pairs = [
    ["gzipSync", "gunzipSync"],
    ["deflateSync", "inflateSync"],
    ["deflateRawSync", "inflateRawSync"],
  ] as const;
  for (const [compress, decompress] of pairs) {
    const ours = zlib[compress](text, { level: 9 });
    expect(nodeZlib[decompress](ours).toString(), compress).toBe(text);
    expect(zlib[decompress](nodeZlib[compress](text)).toString(), decompress).toBe(text);
    expect(Buffer.isBuffer(ours)).toBe(true);
  }
  expect(zlib.unzipSync(nodeZlib.gzipSync(text)).toString()).toBe(text);
  expect(zlib.unzipSync(nodeZlib.deflateSync(text)).toString()).toBe(text);
  expect(() => zlib.gunzipSync(Buffer.from("not gzip"))).toThrow(
    expect.objectContaining({ code: "Z_DATA_ERROR" }),
  );
  expect(() => zlib.gunzipSync(nodeZlib.gzipSync(text).subarray(0, 20))).toThrow(
    expect.objectContaining({ code: "Z_BUF_ERROR" }),
  );
  expect(() => zlib.brotliCompressSync(text)).toThrow("brotliCompressSync of Node.js is not there");
});

test("`zlib`'s async functions go through the web's compression streams", async () => {
  const gzipped = await promised<Buffer>((done) => zlib.gzip(text, done));
  expect(nodeZlib.gunzipSync(gzipped).toString()).toBe(text);
  for (const [decompress, compressed] of [
    [zlib.gunzip, nodeZlib.gzipSync(text)],
    [zlib.inflate, nodeZlib.deflateSync(text)],
    [zlib.inflateRaw, nodeZlib.deflateRawSync(text)],
    [zlib.unzip, nodeZlib.deflateSync(text)],
  ] as const) {
    const back = await promised<Buffer>((done) => decompress(compressed, done));
    expect(back.toString()).toBe(text);
  }
  // A function that calls back last, which `promisify()` makes a promise of.
  expect((await promisify(zlib.gzip)(text))?.length).toBeGreaterThan(0);
  const failed = await new Promise<Error | null>((resolve) =>
    zlib.gunzip(Buffer.from("not gzip"), (error) => resolve(error)),
  );
  expect(failed).toMatchObject({ code: "Z_DATA_ERROR" });
});

test("`zlib`'s streams pipe through the web's compression streams, and fail on bad data", async () => {
  const gzip = zlib.createGzip();
  const chunks: Buffer[] = [];
  gzip.on("data", (chunk: Buffer) => chunks.push(chunk));
  const ended = new Promise((resolve) => gzip.on("end", resolve));
  gzip.write(text.slice(0, 100));
  gzip.end(text.slice(100));
  await ended;
  expect(nodeZlib.gunzipSync(Buffer.concat(chunks)).toString()).toBe(text);
  expect(gzip.bytesWritten).toBe(text.length);

  const unzipped = await consumers.text(
    Readable.from([nodeZlib.gzipSync(text)]).pipe(zlib.createUnzip()),
  );
  expect(unzipped).toBe(text);

  const gunzip = zlib.createGunzip();
  const failed = new Promise((resolve) => gunzip.on("error", resolve));
  gunzip.end(Buffer.from("not gzip at all"));
  expect(await failed).toMatchObject({ code: "Z_DATA_ERROR" });
  expect(zlib.crc32("hello")).toBe(nodeZlib.crc32("hello"));
  expect(zlib.crc32("world", zlib.crc32("hello "))).toBe(nodeZlib.crc32("hello world"));
  expect(zlib.constants.Z_BEST_COMPRESSION).toBe(nodeZlib.constants.Z_BEST_COMPRESSION);
  for (const name of Object.keys(nodeZlib)) expect(zlib, name).toHaveProperty(name);
});

test("`crypto` hashes with every algorithm Node.js does, as Node.js does", () => {
  for (const algorithm of crypto.getHashes()) {
    expect(nodeCrypto.getHashes(), algorithm).toContain(algorithm);
    expect(crypto.createHash(algorithm).update(text).digest("hex"), algorithm).toBe(
      nodeCrypto.createHash(algorithm).update(text).digest("hex"),
    );
    expect(crypto.hash(algorithm, "abc"), algorithm).toBe(nodeCrypto.hash(algorithm, "abc"));
  }
  expect(crypto.createHash("SHA-256").update("x").digest("hex")).toBe(
    nodeCrypto.createHash("sha256").update("x").digest("hex"),
  );
  expect(crypto.createHash("shake256", { outputLength: 8 }).update("x").digest("hex")).toBe(
    nodeCrypto.createHash("shake256", { outputLength: 8 }).update("x").digest("hex"),
  );
  const hash = crypto.createHash("sha1").update("a");
  const copy = hash.copy().update("b");
  expect(hash.digest("hex")).toBe(nodeCrypto.createHash("sha1").update("a").digest("hex"));
  expect(copy.digest("hex")).toBe(nodeCrypto.createHash("sha1").update("ab").digest("hex"));
  expect(() => hash.digest()).toThrow(
    expect.objectContaining({ code: "ERR_CRYPTO_HASH_FINALIZED" }),
  );
  for (const algorithm of ["md5", "sha512", "sha3-256"]) {
    expect(crypto.createHmac(algorithm, "key").update(text).digest("base64"), algorithm).toBe(
      nodeCrypto.createHmac(algorithm, "key").update(text).digest("base64"),
    );
  }
});

test("`crypto`'s Hash and Hmac are streams, which write their digest when they end", async () => {
  const digest = await consumers.buffer(Readable.from([text]).pipe(crypto.createHash("md5")));
  expect(digest.toString("hex")).toBe(nodeCrypto.createHash("md5").update(text).digest("hex"));
  const signed = await consumers.buffer(
    Readable.from([text]).pipe(crypto.createHmac("sha256", "k")),
  );
  expect(signed.toString("hex")).toBe(
    nodeCrypto.createHmac("sha256", "k").update(text).digest("hex"),
  );
});

test("`crypto` derives keys as Node.js does: pbkdf2, hkdf and scrypt, sync and async", async () => {
  const args = ["password", "salt", 1000, 32] as const;
  for (const digest of ["sha256", "sha512", "md5"]) {
    expect(crypto.pbkdf2Sync(...args, digest).toString("hex"), digest).toBe(
      nodeCrypto.pbkdf2Sync(...args, digest).toString("hex"),
    );
    const derived = await promised<Buffer>((done) => crypto.pbkdf2(...args, digest, done));
    expect(derived.toString("hex"), digest).toBe(
      nodeCrypto.pbkdf2Sync(...args, digest).toString("hex"),
    );
  }
  for (const digest of ["sha256", "sha3-256"]) {
    const node = Buffer.from(nodeCrypto.hkdfSync(digest, "ikm", "salt", "info", 42));
    expect(Buffer.from(crypto.hkdfSync(digest, "ikm", "salt", "info", 42)), digest).toEqual(node);
    const derived = await promised<ArrayBuffer>((done) =>
      crypto.hkdf(digest, "ikm", "salt", "info", 42, done),
    );
    expect(derived).toBeInstanceOf(ArrayBuffer);
    expect(Buffer.from(derived), digest).toEqual(node);
  }
  const options = { N: 1024, r: 8, p: 1 };
  const node = nodeCrypto.scryptSync("password", "salt", 32, options).toString("hex");
  expect(crypto.scryptSync("password", "salt", 32, options).toString("hex")).toBe(node);
  const derived = await promised<Buffer>((done) =>
    crypto.scrypt("password", "salt", 32, { cost: 1024 }, done),
  );
  expect(derived.toString("hex")).toBe(node);
});

test("`crypto` ciphers with AES as Node.js does, and fails a tampered GCM message", () => {
  const plaintext = "a note to keep to myself";
  for (const algorithm of crypto.getCiphers()) {
    const bits = Number(/aes-(\d+)/.exec(algorithm)![1]);
    const key = nodeCrypto.randomBytes(bits / 8);
    const iv = algorithm.endsWith("ecb")
      ? null
      : nodeCrypto.randomBytes(algorithm.endsWith("gcm") ? 12 : 16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    cipher.setAAD?.(Buffer.from("aad"));
    const ours = cipher.update(plaintext, "utf8", "hex") + cipher.final("hex");
    const node = nodeCrypto.createCipheriv(algorithm, key, iv);
    if (algorithm.endsWith("gcm")) (node as nodeCrypto.CipherGCM).setAAD(Buffer.from("aad"));
    expect(ours, algorithm).toBe(node.update(plaintext, "utf8", "hex") + node.final("hex"));
    const decipher = nodeCrypto.createDecipheriv(algorithm, key, iv);
    if (algorithm.endsWith("gcm")) {
      expect(cipher.getAuthTag(), algorithm).toEqual((node as nodeCrypto.CipherGCM).getAuthTag());
      (decipher as nodeCrypto.DecipherGCM).setAAD(Buffer.from("aad"));
      (decipher as nodeCrypto.DecipherGCM).setAuthTag(cipher.getAuthTag());
    }
    expect(decipher.update(ours, "hex", "utf8") + decipher.final("utf8"), algorithm).toBe(
      plaintext,
    );
    const back = crypto.createDecipheriv(algorithm, key, iv);
    if (algorithm.endsWith("gcm")) back.setAAD(Buffer.from("aad")).setAuthTag(cipher.getAuthTag());
    expect(back.update(ours, "hex", "utf8") + back.final("utf8"), algorithm).toBe(plaintext);
  }
  const key = nodeCrypto.randomBytes(32);
  const iv = nodeCrypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const sealed = Buffer.concat([cipher.update("secret") as Buffer, cipher.final() as Buffer]);
  sealed[0]! ^= 1;
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv).setAuthTag(cipher.getAuthTag());
  decipher.update(sealed);
  expect(() => decipher.final()).toThrow("Unsupported state or unable to authenticate data");
  expect(() => crypto.createCipheriv("aes-256-gcm", Buffer.alloc(16), iv)).toThrow(
    expect.objectContaining({ code: "ERR_CRYPTO_INVALID_KEYLEN" }),
  );
  expect(() => crypto.createCipheriv("aes-128-cbc", Buffer.alloc(16), Buffer.alloc(8))).toThrow(
    expect.objectContaining({ code: "ERR_CRYPTO_INVALID_IV" }),
  );
  expect(() => crypto.createCipheriv("des-ede3", Buffer.alloc(24), null)).toThrow(
    "Invalid cipher type",
  );
});

test("`crypto` has random numbers in a range, a secret key, and fills large buffers", async () => {
  for (let i = 0; i < 50; i++) {
    const value = crypto.randomInt(3, 7) as number;
    expect(value).toBeGreaterThanOrEqual(3);
    expect(value).toBeLessThan(7);
  }
  expect(crypto.randomInt(1)).toBe(0);
  expect(await promised<number>((done) => crypto.randomInt(10, done))).toBeLessThan(10);
  expect(() => crypto.randomInt(5, 5)).toThrow(
    expect.objectContaining({ code: "ERR_OUT_OF_RANGE" }),
  );
  const large = crypto.randomFillSync(new Uint8Array(200_000));
  expect(large.subarray(150_000).some((byte) => byte !== 0)).toBe(true);
  const part = crypto.randomFillSync(new Uint8Array(8), 4);
  expect([...part.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
  expect((await promised<Buffer>((done) => crypto.randomBytes(16, done))).length).toBe(16);

  const key = crypto.createSecretKey(Buffer.from("a secret"));
  expect(key.type).toBe("secret");
  expect(key.symmetricKeySize).toBe(8);
  expect(key.export({ format: "jwk" })).toEqual(
    nodeCrypto.createSecretKey(Buffer.from("a secret")).export({ format: "jwk" }),
  );
  expect(key.equals(crypto.createSecretKey("a secret", "utf8"))).toBe(true);
  expect(crypto.createHmac("sha256", key).update("x").digest("hex")).toBe(
    nodeCrypto.createHmac("sha256", "a secret").update("x").digest("hex"),
  );
  expect(types.isKeyObject(key)).toBe(true);
  expect(types.isKeyObject({})).toBe(false);
});

test("`stream/consumers` reads a stream of Node.js, a web stream and an iterable", async () => {
  expect(await consumers.text(Readable.from(["a", "b"]))).toBe("ab");
  expect(await consumers.json(Readable.from(['{"a":', "1}"]))).toEqual({ a: 1 });
  const web = new Blob(["web"]).stream();
  expect(Buffer.isBuffer(await consumers.buffer(web))).toBe(true);
  async function* bytes() {
    yield new Uint8Array([1, 2]);
    yield Buffer.from([3]);
  }
  expect([...(await consumers.bytes(bytes()))]).toEqual([1, 2, 3]);
  expect((await consumers.arrayBuffer(Readable.from([Buffer.from("xy")]))).byteLength).toBe(2);
  expect(await (await consumers.blob(Readable.from(["blob"]))).text()).toBe("blob");
});

test("`buffer` tells UTF-8 and ASCII, transcodes, and has the browser's File", () => {
  for (const bytes of [
    Buffer.from("héllo"),
    Buffer.from([0xc3]),
    Buffer.from("plain"),
    Buffer.from([0xff]),
  ]) {
    expect(buffer.isUtf8(bytes)).toBe(nodeBuffer.isUtf8(bytes));
    expect(buffer.isAscii(bytes)).toBe(nodeBuffer.isAscii(bytes));
  }
  const source = Buffer.from("€ and é", "utf8");
  for (const target of ["latin1", "ascii", "utf16le"] as const) {
    expect(buffer.transcode(source, "utf8", target), target).toEqual(
      nodeBuffer.transcode(source, "utf8", target),
    );
  }
  expect(buffer.File).toBe(globalThis.File);
  expect(buffer.default.isUtf8).toBe(buffer.isUtf8);
});

test("`events` sets the most listeners, counts them, and has its functions on the class", async () => {
  const emitter = new EventEmitter();
  emitter.on("note", () => {});
  expect(listenerCount(emitter, "note")).toBe(1);
  setMaxListeners(3, emitter);
  expect(emitter.getMaxListeners()).toBe(3);
  const before = EventEmitter.defaultMaxListeners;
  setMaxListeners(20);
  expect(EventEmitter.defaultMaxListeners).toBe(20);
  EventEmitter.defaultMaxListeners = before;
  setMaxListeners(5, new EventTarget());
  expect(typeof (events as unknown as Record<string, unknown>).on).toBe("function");
  expect(typeof (events as unknown as Record<string, unknown>).setMaxListeners).toBe("function");
});

test("`util` strips and styles text, makes strings well formed, and awaits an abort", async () => {
  expect(stripVTControlCharacters("\u001b[31mred\u001b[39m")).toBe("red");
  expect(toUSVString("a\ud800b")).toBe("a�b");
  expect(styleText("red", "text")).toBe("text");
  expect(styleText(["bold", "red"], "text", { validateStream: false })).toBe(
    "\u001b[1m\u001b[31mtext\u001b[39m\u001b[22m",
  );
  expect(() => styleText("rainbow", "text")).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_ARG_VALUE" }),
  );
  const controller = new AbortController();
  const done = aborted(controller.signal, {});
  controller.abort();
  await done;
  await aborted(AbortSignal.abort(), {});
});

test("`util.types` tells a namespace of a module and a Float16Array, and no proxy", async () => {
  // A module of the engine's own, not of Vitest's runner, which takes properties.
  const source = "data:text/javascript,export const a = 1";
  const namespace: unknown = await import(/* @vite-ignore */ source);
  expect(types.isModuleNamespaceObject(namespace)).toBe(true);
  expect(types.isModuleNamespaceObject(await import("../node/stream/consumers.ts"))).toBe(false);
  expect(types.isModuleNamespaceObject({ [Symbol.toStringTag]: "Module" })).toBe(false);
  expect(types.isProxy(new Proxy({}, {}))).toBe(false);
  if (typeof Float16Array !== "undefined") {
    expect(types.isFloat16Array(new Float16Array(1))).toBe(true);
  }
  expect(types.isFloat16Array(new Float32Array(1))).toBe(false);
});

test("`url` has the browser's URLPattern", () => {
  expect(url.URLPattern).toBe((globalThis as { URLPattern?: unknown }).URLPattern);
});

test("`zlib` checks what it decompresses as zlib does: members, checksums, short and empty data", async () => {
  const twice = Buffer.concat([nodeZlib.gzipSync("hello "), nodeZlib.gzipSync("world")]);
  expect(zlib.gunzipSync(twice).toString()).toBe("hello world");
  expect(zlib.unzipSync(twice).toString()).toBe("hello world");
  expect((await promised<Buffer>((done) => zlib.gunzip(twice, done))).toString()).toBe(
    "hello world",
  );
  expect(await consumers.text(Readable.from([twice]).pipe(zlib.createGunzip()))).toBe(
    "hello world",
  );

  const badCrc = nodeZlib.gzipSync("hello");
  badCrc[badCrc.length - 8]! ^= 1;
  const badAdler = nodeZlib.deflateSync("hello");
  badAdler[badAdler.length - 1]! ^= 1;
  for (const [decompress, data] of [
    [zlib.gunzipSync, badCrc],
    [zlib.inflateSync, badAdler],
    [zlib.unzipSync, badCrc],
  ] as const) {
    expect(() => decompress(data)).toThrow(expect.objectContaining({ code: "Z_DATA_ERROR" }));
  }
  const short = nodeZlib.gzipSync(text).subarray(0, 15);
  for (const data of [short, Buffer.alloc(0)]) {
    for (const decompress of [
      zlib.gunzipSync,
      zlib.inflateSync,
      zlib.inflateRawSync,
      zlib.unzipSync,
    ]) {
      let node: unknown;
      try {
        nodeZlib[decompress.name as "gunzipSync"](data);
      } catch (error) {
        node = (error as { code: string }).code;
      }
      if (!node) continue;
      expect(() => decompress(data), `${decompress.name} of ${data.length} bytes`).toThrow(
        expect.objectContaining({ code: node }),
      );
    }
  }
  const failed = await new Promise<Error | null>((resolve) => zlib.gunzip(short, resolve));
  expect(failed).toMatchObject({ code: "Z_BUF_ERROR", message: "unexpected end of file" });
  const gunzip = zlib.createGunzip();
  const streamFailed = new Promise((resolve) => gunzip.on("error", resolve));
  gunzip.end(short);
  expect(await streamFailed).toMatchObject({ code: "Z_BUF_ERROR" });

  expect(() => zlib.gunzipSync(nodeZlib.gzipSync("hello"), { maxOutputLength: 1 })).toThrow(
    expect.objectContaining({ code: "ERR_BUFFER_TOO_LARGE" }),
  );
});

test("`zlib` flushes a stream, takes a dictionary and a level, and has the constants by their old names", async () => {
  const gzip = zlib.createGzip();
  const chunks: Buffer[] = [];
  gzip.on("data", (chunk: Buffer) => chunks.push(chunk));
  gzip.write("hello");
  await new Promise<void>((resolve) => gzip.flush(nodeZlib.constants.Z_SYNC_FLUSH, resolve));
  const flushed = nodeZlib.createGunzip();
  const read = new Promise<string>((resolve) =>
    flushed.once("data", (chunk) => resolve(String(chunk))),
  );
  flushed.write(Buffer.concat(chunks));
  expect(await read).toBe("hello");
  gzip.end();

  const dictionary = Buffer.from("the notes of today");
  const withDictionary = nodeZlib.deflateSync(text, { dictionary });
  expect(zlib.inflateSync(withDictionary, { dictionary }).toString()).toBe(text);
  expect(
    nodeZlib.inflateSync(zlib.deflateSync(text, { dictionary }), { dictionary }).toString(),
  ).toBe(text);
  // Level 0 stores, as zlib's does.
  expect(zlib.deflateSync(text, { level: 0 }).length).toBeGreaterThan(text.length);
  expect(zlib.deflateSync(text, { level: 9 }).length).toBeLessThan(text.length / 10);

  // A gzip whose first chunk is a byte: two tell `unzip` it is gzip.
  const gzipped = nodeZlib.gzipSync("unzipped");
  const unzip = zlib.createUnzip();
  const unzipped = consumers.text(unzip);
  unzip.write(gzipped.subarray(0, 1));
  unzip.end(gzipped.subarray(1));
  expect(await unzipped).toBe("unzipped");

  const names = Object.getOwnPropertyNames(nodeZlib).filter((name) => name.startsWith("Z_"));
  expect(names.length).toBeGreaterThan(20);
  for (const name of names) {
    expect(zlib, name).toHaveProperty(name, (nodeZlib as unknown as Record<string, number>)[name]);
    expect(zlib.default, name).toHaveProperty(name);
  }
});

test("`crypto`'s ciphers give at `update()` what Node's do, chunk by chunk", () => {
  const plaintext = Buffer.from("a note to keep to myself, ".repeat(5));
  const sizes = [1, 15, 16, 17, 3, 40, 0, 33];
  for (const algorithm of crypto.getCiphers()) {
    for (const padding of [true, false]) {
      const bits = Number(/aes-(\d+)/.exec(algorithm)![1]);
      const key = nodeCrypto.randomBytes(bits / 8);
      const iv = algorithm.endsWith("ecb")
        ? null
        : nodeCrypto.randomBytes(algorithm.endsWith("gcm") ? 12 : 16);
      const input = padding ? plaintext : plaintext.subarray(0, 128);
      const ours = crypto.createCipheriv(algorithm, key, iv).setAutoPadding(padding);
      const node = nodeCrypto.createCipheriv(algorithm, key, iv).setAutoPadding(padding);
      const decipher = crypto.createDecipheriv(algorithm, key, iv).setAutoPadding(padding);
      const nodeDecipher = nodeCrypto.createDecipheriv(algorithm, key, iv).setAutoPadding(padding);
      let at = 0;
      const sealed: Buffer[] = [];
      for (const size of [...sizes, input.length]) {
        const chunk = input.subarray(at, at + size);
        at += chunk.length;
        const mine = ours.update(chunk);
        expect(mine, `${algorithm} ${padding} update of ${size}`).toEqual(node.update(chunk));
        sealed.push(mine);
      }
      const last = ours.final();
      expect(last, `${algorithm} final`).toEqual(node.final());
      sealed.push(last);
      const all = Buffer.concat(sealed);
      if (algorithm.endsWith("gcm")) {
        const tag = (node as nodeCrypto.CipherGCM).getAuthTag();
        expect(ours.getAuthTag()).toEqual(tag);
        decipher.setAuthTag(tag);
        (nodeDecipher as nodeCrypto.DecipherGCM).setAuthTag(tag);
      }
      at = 0;
      for (const size of [...sizes, all.length]) {
        const chunk = all.subarray(at, at + size);
        at += chunk.length;
        expect(decipher.update(chunk), `${algorithm} ${padding} decipher of ${size}`).toEqual(
          nodeDecipher.update(chunk),
        );
      }
      expect(decipher.final(), `${algorithm} decipher final`).toEqual(nodeDecipher.final());
    }
  }
});

test("`crypto`'s ciphers keep their key and IV, authenticate every AAD, and fail as OpenSSL does", () => {
  const key = Buffer.alloc(32, 1);
  const iv = Buffer.alloc(12, 2);
  const ours = crypto.createCipheriv("aes-256-gcm", key, iv);
  const node = nodeCrypto.createCipheriv("aes-256-gcm", Buffer.from(key), Buffer.from(iv));
  key.fill(9);
  iv.fill(9);
  ours.setAAD(Buffer.from("a")).setAAD(Buffer.from("b"));
  node.setAAD(Buffer.from("a")).setAAD(Buffer.from("b"));
  expect(Buffer.concat([ours.update("text"), ours.final()])).toEqual(
    Buffer.concat([node.update("text"), node.final()]),
  );
  expect(ours.getAuthTag()).toEqual(node.getAuthTag());

  const cbcKey = Buffer.alloc(16, 3);
  const cbcIv = Buffer.alloc(16, 4);
  const wrong = crypto.createDecipheriv("aes-128-cbc", cbcKey, cbcIv);
  wrong.update(
    nodeCrypto.createCipheriv("aes-128-cbc", Buffer.alloc(16, 5), cbcIv).update(Buffer.alloc(32)),
  );
  expect(() => wrong.final()).toThrow(expect.objectContaining({ code: "ERR_OSSL_BAD_DECRYPT" }));
  const unpadded = crypto.createCipheriv("aes-128-cbc", cbcKey, cbcIv).setAutoPadding(false);
  unpadded.update(Buffer.alloc(5));
  expect(() => unpadded.final()).toThrow(
    expect.objectContaining({ code: "ERR_OSSL_WRONG_FINAL_BLOCK_LENGTH" }),
  );
});

test("`crypto`'s Hash and Hmac give their digest after a pipe, and copy SHAKE at a length", async () => {
  const piped = crypto.createHash("sha256");
  await new Promise((resolve) => Readable.from(["abc"]).pipe(piped).on("finish", resolve));
  expect(piped.digest("hex")).toBe(nodeCrypto.createHash("sha256").update("abc").digest("hex"));
  const ended = crypto.createHash("md5").update("a");
  ended.digest();
  ended.end();
  await new Promise((resolve) => ended.on("finish", resolve));

  const shake = crypto.createHash("shake256").update("hello");
  expect(shake.copy({ outputLength: 8 }).digest("hex")).toBe(
    nodeCrypto.createHash("shake256").update("hello").copy({ outputLength: 8 }).digest("hex"),
  );
  expect(
    crypto.createHmac("sha256", "deadbeef", { encoding: "hex" }).update("x").digest("hex"),
  ).toBe(nodeCrypto.createHmac("sha256", Buffer.from("deadbeef", "hex")).update("x").digest("hex"));
  expect(() => crypto.createHmac("md55", "k")).toThrow(
    expect.objectContaining({ code: "ERR_CRYPTO_INVALID_DIGEST" }),
  );
});

test("`crypto` checks its arguments as Node.js does, and keeps what the async forms were given", async () => {
  const codeOf = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      return (error as { code?: string }).code;
    }
    return undefined;
  };
  const noop = () => {};
  const calls: [string, (lib: typeof nodeCrypto) => unknown][] = [
    ["pbkdf2Sync iterations", (lib) => lib.pbkdf2Sync("p", "s", 0, 8, "sha256")],
    ["pbkdf2 iterations", (lib) => lib.pbkdf2("p", "s", 0, 8, "sha256", noop)],
    ["pbkdf2Sync keylen", (lib) => lib.pbkdf2Sync("p", "s", 1, -1, "sha256")],
    ["pbkdf2 digest", (lib) => lib.pbkdf2("p", "s", 1, 8, "md55", noop)],
    ["hkdfSync keylen", (lib) => lib.hkdfSync("sha256", "k", "s", "i", 255 * 32 + 1)],
    ["hkdf digest", (lib) => lib.hkdf("md55", "k", "s", "i", 8, noop)],
    ["scryptSync maxmem", (lib) => lib.scryptSync("p", "s", 16, { N: 1024, maxmem: 1024 })],
    ["scryptSync N", (lib) => lib.scryptSync("p", "s", 16, { N: 32768 })],
    ["randomFillSync offset", (lib) => lib.randomFillSync(new Uint8Array(4), 5)],
    ["randomFillSync size", (lib) => lib.randomFillSync(new Uint8Array(4), 4, 1)],
    ["randomInt range", (lib) => lib.randomInt(0, 2 ** 48)],
  ];
  for (const [name, call] of calls) {
    const node = codeOf(() => call(nodeCrypto));
    expect(node, name).toBeDefined();
    expect(
      codeOf(() => call(crypto as unknown as typeof nodeCrypto)),
      name,
    ).toBe(node);
  }
  expect(crypto.randomInt(0, 2 ** 48 - 1)).toBeGreaterThanOrEqual(0);

  const salt = Buffer.from("s");
  const derived = promised<Buffer>((done) => crypto.pbkdf2("p", salt, 1, 8, "sha256", done));
  salt[0] = "x".charCodeAt(0);
  expect((await derived).toString("hex")).toBe(
    nodeCrypto.pbkdf2Sync("p", "s", 1, 8, "sha256").toString("hex"),
  );
});

test("`duplexPair()` destroys one end with the other, and is on the default export", async () => {
  const [left, right] = duplexPair() as [Duplex, Duplex];
  const closed = new Promise((resolve) => right.on("close", resolve));
  left.on("error", () => {});
  left.destroy(new Error("gone"));
  await closed;
  expect(right.destroyed).toBe(true);
  expect(typeof (stream as unknown as Record<string, unknown>).duplexPair).toBe("function");
});

test("`stream/consumers` decodes text as it comes and copies bytes as they come, as Node's does", async () => {
  const emoji = Buffer.from(JSON.stringify({ x: "😀" }));
  const parts = [emoji.subarray(0, 8), emoji.subarray(8)];
  expect(await consumers.json(Readable.from(parts))).toEqual({ x: "😀" });
  const reused = new Uint8Array(1);
  async function* writesInPlace() {
    reused[0] = 65;
    yield reused;
    reused[0] = 66;
    yield reused;
  }
  expect(await consumers.text(writesInPlace())).toBe("AB");
  expect((await consumers.buffer(writesInPlace())).toString()).toBe("AB");
  await expect(consumers.text(Readable.from([{ an: "object" }]))).rejects.toMatchObject({
    code: "ERR_INVALID_ARG_TYPE",
  });
});

test("`buffer.transcode()` follows Node's ICU, for every pair of its encodings", () => {
  const encodings = ["ascii", "latin1", "utf8", "utf16le"] as const;
  const sources = [
    Buffer.from([0xe9]),
    Buffer.from([0x41, 0x00, 0x42]),
    Buffer.from([0x41]),
    Buffer.from([0xc3]),
    Buffer.from("€ and é 😀"),
    Buffer.from("€ and é 😀", "utf16le"),
    Buffer.from([0x3d, 0xd8]),
    Buffer.from([0x80, 0x9f, 0xff]),
    Buffer.from([0xff, 0xfe, 0x41, 0x00]),
    Buffer.from([0xef, 0xbb, 0xbf, 0x41]),
  ];
  const run = (lib: typeof nodeBuffer, source: Buffer, from: string, to: string) => {
    try {
      return [...lib.transcode(source, from as never, to as never)];
    } catch (error) {
      return (error as { code: string }).code;
    }
  };
  for (const source of sources) {
    for (const from of encodings) {
      for (const to of encodings) {
        expect(
          run(buffer as never, source, from, to),
          `${[...source].join(",")} ${from} to ${to}`,
        ).toEqual(run(nodeBuffer, source, from, to));
      }
    }
  }
});
