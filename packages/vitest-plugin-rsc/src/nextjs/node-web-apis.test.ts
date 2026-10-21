// The package's modules of Node.js that stand on the web's APIs, fflate and
// @noble/hashes: `zlib`, `crypto`, `stream/consumers` and `buffer`. Each as
// Node.js does it: Node's own is here to compare with.

import nodeBuffer from "node:buffer";
import nodeCrypto from "node:crypto";
import nodeConsumers from "node:stream/consumers";
import { promisify } from "node:util";
import nodeZlib from "node:zlib";
import { expect, test } from "vitest";
import * as buffer from "../node/buffer.ts";
import * as crypto from "../node/crypto.ts";
import { Readable } from "../node/stream.ts";
import * as consumers from "../node/stream/consumers.ts";
import * as zlib from "../node/zlib.ts";

const text = "the notes of today, ".repeat(200);

// What a function of Node's that calls back gives, as a promise.
const promised = <T>(call: (callback: (error: Error | null, result?: T) => void) => void) =>
  new Promise<T>((resolve, reject) =>
    call((error, result) => (error ? reject(error) : resolve(result as T))),
  );

// What a call gives, or the code and message of what it throws.
const outcome = (call: () => { toString(): string } | undefined) => {
  try {
    return String(call());
  } catch (error) {
    const { code, message } = error as { code: string; message: string };
    return `${code}: ${message}`;
  }
};

test("has every export of Node's `zlib`, `buffer` and `stream/consumers`", () => {
  for (const [name, node, ours] of [
    ["zlib", nodeZlib, zlib],
    ["buffer", nodeBuffer, buffer],
    ["stream/consumers", nodeConsumers, consumers],
  ] as const) {
    const missing = Object.keys(node).filter((key) => !(key in ours));
    expect(missing, name).toEqual([]);
    expect(Object.keys(ours.default), name).toEqual(expect.arrayContaining(Object.keys(node)));
  }
});

test("`zlib`'s sync functions compress as Node's decompress, and decompress what Node's compress", () => {
  const pairs = [
    ["gzipSync", "gunzipSync"],
    ["deflateSync", "inflateSync"],
    ["deflateRawSync", "inflateRawSync"],
  ] as const;
  for (const [compress, decompress] of pairs) {
    for (const options of [{}, { level: 1 }, { level: 9 }, { level: 0 }]) {
      const ours = zlib[compress](text, options);
      expect(nodeZlib[decompress](ours).toString(), compress).toBe(text);
      expect(Buffer.isBuffer(ours)).toBe(true);
    }
    expect(zlib[decompress](nodeZlib[compress](text)).toString(), decompress).toBe(text);
    expect(zlib[decompress](zlib[compress]("")).toString(), decompress).toBe("");
  }
  expect(zlib.unzipSync(nodeZlib.gzipSync(text)).toString()).toBe(text);
  expect(zlib.unzipSync(nodeZlib.deflateSync(text)).toString()).toBe(text);
  const dictionary = Buffer.from("the notes of");
  expect(
    nodeZlib.inflateSync(zlib.deflateSync(text, { dictionary }), { dictionary }).toString(),
  ).toBe(text);
  expect(zlib.crc32(text)).toBe(nodeZlib.crc32(text));
  expect(zlib.crc32("b", zlib.crc32("a"))).toBe(nodeZlib.crc32("ab"));
});

test("`zlib`'s gzip is the same bytes for the same data, without a time, as Node's", async () => {
  const first = zlib.gzipSync(text);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  expect(zlib.gzipSync(text)).toEqual(first);
  expect([...first.subarray(4, 8)]).toEqual([...nodeZlib.gzipSync(text).subarray(4, 8)]);
});

test("`zlib` checks what it decompresses as zlib does: headers, checksums, dictionaries and short data", () => {
  const gz = nodeZlib.gzipSync("hello");
  const df = nodeZlib.deflateSync("hello");
  const raw = nodeZlib.deflateRawSync("hello");
  // A header with all of its fields: extra bytes, a name, a comment, and
  // its own CRC.
  const header = Buffer.concat([
    Buffer.from([0x1f, 0x8b, 8, 8 | 16 | 4 | 2, 0, 0, 0, 0, 0, 3, 3, 0, 1, 2, 3]),
    Buffer.from("a name\0a comment\0"),
  ]);
  const headerCrc = Buffer.alloc(2);
  headerCrc.writeUInt16LE(nodeZlib.crc32(header) & 0xffff);
  const named = Buffer.concat([header, headerCrc, gz.subarray(10)]);
  const flipped = (data: Buffer, at: number) => {
    const copy = Buffer.from(data);
    copy[at < 0 ? copy.length + at : at]! ^= 1;
    return copy;
  };
  const dictionary = Buffer.from("a dictionary");
  const withDictionary = nodeZlib.deflateSync("hello", { dictionary });
  const cases: [string, (lib: typeof nodeZlib) => Buffer][] = [
    ["a bad CRC-32", (lib) => lib.gunzipSync(flipped(gz, -8))],
    ["a bad size", (lib) => lib.gunzipSync(flipped(gz, -4))],
    ["a bad Adler-32", (lib) => lib.inflateSync(flipped(df, -1))],
    ["unzip of a bad CRC-32", (lib) => lib.unzipSync(flipped(gz, -8))],
    ["not gzip", (lib) => lib.gunzipSync(Buffer.from("not gzip data"))],
    ["a bad method", (lib) => lib.gunzipSync(Buffer.from([0x1f, 0x8b, 7, 0, 0, 0, 0, 0, 0, 3]))],
    ["a bad zlib header", (lib) => lib.inflateSync(Buffer.from([0x78, 0x9d, 1, 2, 3, 4, 5, 6]))],
    ["not deflate", (lib) => lib.inflateRawSync(Buffer.from([0xff, 0xff, 0xff]))],
    ["a header with all of its fields", (lib) => lib.gunzipSync(named)],
    ["a bad CRC of a header", (lib) => lib.gunzipSync(flipped(named, header.length))],
    ["a header without its CRC", (lib) => lib.gunzipSync(named.subarray(0, header.length + 1))],
    ["gzip of no bytes", (lib) => lib.gunzipSync(nodeZlib.gzipSync(""))],
    ["no bytes", (lib) => lib.inflateSync(Buffer.alloc(0))],
    ["no bytes of gzip", (lib) => lib.gunzipSync(Buffer.alloc(0))],
    ["no bytes of raw", (lib) => lib.inflateRawSync(Buffer.alloc(0))],
    ["no bytes to unzip", (lib) => lib.unzipSync(Buffer.alloc(0))],
    ...[1, 2, 3, 9, 10, 12, gz.length - 8, gz.length - 1].map(
      (n): [string, (lib: typeof nodeZlib) => Buffer] => [
        `${n} bytes of a gzip`,
        (lib) => lib.gunzipSync(gz.subarray(0, n)),
      ],
    ),
    ...[1, 2, 3, 6, df.length - 1].map((n): [string, (lib: typeof nodeZlib) => Buffer] => [
      `${n} bytes of a deflate`,
      (lib) => lib.inflateSync(df.subarray(0, n)),
    ]),
    ["3 bytes of raw", (lib) => lib.inflateRawSync(raw.subarray(0, 3))],
    ["a dictionary", (lib) => lib.inflateSync(withDictionary, { dictionary })],
    [
      "a wrong dictionary",
      (lib) => lib.inflateSync(withDictionary, { dictionary: Buffer.from("wrong") }),
    ],
    ["a missing dictionary", (lib) => lib.inflateSync(withDictionary)],
    ["a dictionary not needed", (lib) => lib.inflateSync(df, { dictionary })],
    [
      "a dictionary of raw",
      (lib) =>
        lib.inflateRawSync(nodeZlib.deflateRawSync("hellohello", { dictionary }), { dictionary }),
    ],
    ["over maxOutputLength", (lib) => lib.gunzipSync(gz, { maxOutputLength: 1 })],
    ["gzipSync over maxOutputLength", (lib) => lib.gzipSync("hello", { maxOutputLength: 1 })],
  ];
  for (const [name, call] of cases) {
    expect(
      outcome(() => call(zlib as unknown as typeof nodeZlib)),
      name,
    ).toBe(outcome(() => call(nodeZlib)));
  }
});

test("`zlib` throws for a gzip of more than one member, or with bytes after it, which Node's reads", () => {
  const twice = Buffer.concat([nodeZlib.gzipSync("hello "), nodeZlib.gzipSync("world")]);
  const same = Buffer.concat([nodeZlib.gzipSync("hello"), nodeZlib.gzipSync("hello")]);
  const garbage = Buffer.concat([nodeZlib.gzipSync("hello"), Buffer.from("garbage")]);
  for (const data of [twice, same]) {
    expect(() => zlib.gunzipSync(data)).toThrow("gzip of more than one member is not there");
  }
  expect(() => zlib.gunzipSync(garbage)).toThrow(expect.objectContaining({ code: "Z_DATA_ERROR" }));
  const after = Buffer.concat([nodeZlib.deflateSync("hello"), Buffer.from("garbage")]);
  expect(() => zlib.inflateSync(after)).toThrow(expect.objectContaining({ code: "Z_DATA_ERROR" }));
});

test("`zlib`'s functions that call back do after the code that called them, on a copy", async () => {
  const data = Buffer.from(text);
  let returned = false;
  const compressed = promised<Buffer>((done) =>
    zlib.gzip(data, (error, result) => {
      expect(returned).toBe(true);
      done(error, result);
    }),
  );
  returned = true;
  data.fill(0);
  expect(nodeZlib.gunzipSync(await compressed).toString()).toBe(text);
  for (const [compress, decompress] of [
    ["deflate", "inflate"],
    ["deflateRaw", "inflateRaw"],
    ["gzip", "unzip"],
  ] as const) {
    const there = await promised<Buffer>((done) => zlib[compress](text, { level: 9 }, done));
    expect((await promisify(nodeZlib[decompress])(there)).toString(), compress).toBe(text);
    const back = await promisify(zlib[decompress] as typeof nodeZlib.inflate)(there);
    expect(back.toString(), decompress).toBe(text);
  }
  const failed = await new Promise<Error | null>((resolve) =>
    zlib.gunzip(Buffer.from("not gzip data"), resolve),
  );
  expect(failed).toMatchObject({ code: "Z_DATA_ERROR", message: "incorrect header check" });
  expect(() => zlib.gzip(text, {})).toThrow(
    expect.objectContaining({ code: "ERR_INVALID_ARG_TYPE" }),
  );
});

test("`zlib`'s streams and Brotli throw, as unenv's, and Zstandard's", () => {
  expect(() => zlib.createGzip()).toThrow();
  expect(() => zlib.brotliCompressSync(text)).toThrow();
  expect(() => zlib.zstdCompressSync(text)).toThrow(
    "zlib.zstdCompressSync of Node.js is not there",
  );
  expect(zlib.constants.Z_SYNC_FLUSH).toBe(nodeZlib.constants.Z_SYNC_FLUSH);
  expect(zlib.Z_BEST_COMPRESSION).toBe(nodeZlib.Z_BEST_COMPRESSION);
});

test("`crypto` hashes with MD5, SHA-1 and SHA-2 as Node.js does, by Node's names", () => {
  expect(crypto.getHashes()).toEqual(["md5", "sha1", "sha224", "sha256", "sha384", "sha512"]);
  for (const algorithm of crypto.getHashes()) {
    expect(nodeCrypto.getHashes(), algorithm).toContain(algorithm);
    expect(crypto.createHash(algorithm).update(text).digest("hex"), algorithm).toBe(
      nodeCrypto.createHash(algorithm).update(text).digest("hex"),
    );
    expect(crypto.hash(algorithm, "abc"), algorithm).toBe(nodeCrypto.hash(algorithm, "abc"));
    expect(crypto.createHmac(algorithm, "key").update(text).digest("base64"), algorithm).toBe(
      nodeCrypto.createHmac(algorithm, "key").update(text).digest("base64"),
    );
  }
  for (const name of ["SHA256", "sha-256", "RSA-SHA256", "SHA-1", "RSA-MD5"]) {
    expect(crypto.createHash(name).update("x").digest("hex"), name).toBe(
      nodeCrypto.createHash(name).update("x").digest("hex"),
    );
  }
  expect(crypto.hash("sha1", "abc", "base64")).toBe(nodeCrypto.hash("sha1", "abc", "base64"));
  expect(Buffer.isBuffer(crypto.hash("md5", "abc", "buffer"))).toBe(true);
  expect(crypto.createHash("sha256").update("é", "latin1").digest("hex")).toBe(
    nodeCrypto.createHash("sha256").update("é", "latin1").digest("hex"),
  );
  expect(
    crypto.createHmac("sha256", "deadbeef", { encoding: "hex" }).update("x").digest("hex"),
  ).toBe(nodeCrypto.createHmac("sha256", Buffer.from("deadbeef", "hex")).update("x").digest("hex"));
});

test("`crypto` fails as Node.js does: another algorithm, a digest twice, a copy after it", () => {
  const calls: [string, (lib: typeof nodeCrypto) => unknown][] = [
    ["createHash of nothing", (lib) => lib.createHash("md55")],
    ["createHmac of nothing", (lib) => lib.createHmac("md55", "k")],
    ["createHash of a prototype's name", (lib) => lib.createHash("constructor")],
    ["hash of nothing", (lib) => lib.hash("md55", "x")],
    [
      "a second digest of a hash",
      (lib) => {
        const hash = lib.createHash("sha1");
        hash.digest();
        return hash.digest();
      },
    ],
    [
      "a second digest of an HMAC",
      (lib) => {
        const hmac = lib.createHmac("sha1", "k");
        hmac.digest();
        return JSON.stringify(hmac.digest("hex"));
      },
    ],
    [
      "an update after the digest",
      (lib) => {
        const hash = lib.createHash("sha1");
        hash.digest();
        return hash.update("x");
      },
    ],
    [
      "a copy after the digest",
      (lib) => {
        const hash = lib.createHash("sha1");
        hash.digest();
        return hash.copy();
      },
    ],
    [
      "timingSafeEqual of two lengths",
      (lib) => lib.timingSafeEqual(Buffer.alloc(1), Buffer.alloc(2)),
    ],
  ];
  for (const [name, call] of calls) {
    expect(
      outcome(() => call(crypto as unknown as typeof nodeCrypto) as string),
      name,
    ).toBe(outcome(() => call(nodeCrypto) as string));
  }
  expect(() => crypto.createHash("sha3-256")).toThrow("Digest method not supported");
  const hash = crypto.createHash("sha1").update("a");
  const copy = hash.copy().update("b");
  expect(hash.digest("hex")).toBe(nodeCrypto.createHash("sha1").update("a").digest("hex"));
  expect(copy.digest("hex")).toBe(nodeCrypto.createHash("sha1").update("ab").digest("hex"));
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
  // After a pipe, `digest()` gives what the stream wrote.
  const piped = crypto.createHash("sha256");
  await new Promise((resolve) => Readable.from(["abc"]).pipe(piped).on("finish", resolve));
  expect(piped.digest("hex")).toBe(nodeCrypto.createHash("sha256").update("abc").digest("hex"));
});

test("`crypto` has random numbers in a range, fills large buffers, and checks as Node.js does", async () => {
  for (let i = 0; i < 50; i++) {
    const value = crypto.randomInt(3, 7) as number;
    expect(value).toBeGreaterThanOrEqual(3);
    expect(value).toBeLessThan(7);
  }
  expect(crypto.randomInt(1)).toBe(0);
  expect(crypto.randomInt(0, 2 ** 48 - 1)).toBeGreaterThanOrEqual(0);
  expect(await promised<number>((done) => crypto.randomInt(10, done))).toBeLessThan(10);
  const large = crypto.randomFillSync(new Uint8Array(200_000));
  expect(large.subarray(150_000).some((byte) => byte !== 0)).toBe(true);
  // The offset and the size are in elements, as in Node.js.
  const words = crypto.randomFillSync(new Uint32Array(4), 1, 2);
  expect([words[0], words[3]]).toEqual([0, 0]);
  const part = crypto.randomFillSync(new ArrayBuffer(8), 4);
  expect([...new Uint8Array(part).subarray(0, 4)]).toEqual([0, 0, 0, 0]);
  const filled = await promised<Uint8Array>((done) =>
    crypto.randomFill(new Uint8Array(8), 4, done),
  );
  expect([...filled.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
  expect((await promised<Buffer>((done) => crypto.randomBytes(16, done))).length).toBe(16);

  const calls: [string, (lib: typeof nodeCrypto) => unknown][] = [
    ["randomFillSync offset", (lib) => lib.randomFillSync(new Uint8Array(4), 5)],
    ["randomFillSync size", (lib) => lib.randomFillSync(new Uint8Array(4), 4, 1)],
    ["randomFillSync offset of words", (lib) => lib.randomFillSync(new Uint32Array(4), 5)],
    ["randomFillSync size of words", (lib) => lib.randomFillSync(new Uint32Array(4), 2, 3)],
    ["randomInt of nothing", (lib) => lib.randomInt(5, 5)],
    ["randomInt range", (lib) => lib.randomInt(0, 2 ** 48)],
  ];
  for (const [name, call] of calls) {
    expect(
      outcome(() => call(crypto as unknown as typeof nodeCrypto) as string),
      name,
    ).toBe(outcome(() => call(nodeCrypto) as string));
  }
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
  async function* withBlob() {
    yield new Blob(["hel"]);
    yield "lo";
    yield new Uint8Array([33]);
  }
  expect(await (await consumers.blob(withBlob())).text()).toBe("hello!");
  expect((await consumers.buffer(withBlob())).toString()).toBe("hello!");
});

test("`buffer` tells UTF-8 and ASCII as Node.js does, and has the browser's File", () => {
  for (const bytes of [
    Buffer.from("héllo"),
    Buffer.from([0xc3]),
    Buffer.from("plain"),
    Buffer.from([0xff]),
    Buffer.from([0xef, 0xbb, 0xbf, 0x41]),
    new Uint8Array(0),
  ]) {
    expect(buffer.isUtf8(bytes)).toBe(nodeBuffer.isUtf8(bytes));
    expect(buffer.isAscii(bytes)).toBe(nodeBuffer.isAscii(bytes));
    expect(buffer.isUtf8(bytes.buffer as ArrayBuffer)).toBe(nodeBuffer.isUtf8(bytes.buffer));
  }
  expect(buffer.File).toBe(globalThis.File);
  expect(buffer.default.isUtf8).toBe(buffer.isUtf8);
  const transcode = buffer.transcode as typeof nodeBuffer.transcode;
  expect(() => transcode(Buffer.from("a"), "utf8", "latin1")).toThrow();
});

test("throws Node's error for what is no data or an option out of its range, never an answer", async () => {
  // The code of what a call throws, as `outcome()` has it.
  const code = (call: () => unknown) => outcome(call as () => undefined).split(":")[0];
  const calls: [string, (z: any, c: any, b: any) => unknown][] = [
    ["gzipSync({})", (z) => z.gzipSync({})],
    ["gzipSync([1, 2, 3])", (z) => z.gzipSync([1, 2, 3])],
    ["crc32(123)", (z) => z.crc32(123)],
    ["level 10", (z) => z.deflateSync("a", { level: 10 })],
    ["memLevel 0", (z) => z.deflateSync("a", { memLevel: 0 })],
    ["chunkSize 10", (z) => z.deflateSync("a", { chunkSize: 10 })],
    ["maxOutputLength 0", (z) => z.deflateSync("a", { maxOutputLength: 0 })],
    ["windowBits 7", (z) => z.inflateSync(z.deflateSync("a"), { windowBits: 7 })],
    ["isUtf8(string)", (_z, _c, b) => b.isUtf8("abc")],
    ["isAscii(array)", (_z, _c, b) => b.isAscii([200])],
    ["randomFillSync(array)", (_z, c) => c.randomFillSync([1, 2, 3])],
    ["randomFill without a callback", (_z, c) => c.randomFill(new Uint8Array(2), 1)],
    ["randomBytes with a number", (_z, c) => c.randomBytes(2, 5)],
    ["randomInt(1.5)", (_z, c) => c.randomInt(1.5)],
    ["randomInt(0, 2 ** 53)", (_z, c) => c.randomInt(0, 2 ** 53)],
    ["odd hex", (_z, c) => c.createHash("sha256").update("deadbee", "hex")],
    ["createHash(undefined)", (_z, c) => c.createHash(undefined)],
    ["outputLength 16", (_z, c) => c.createHash("sha256", { outputLength: 16 })],
  ];
  for (const [name, call] of calls) {
    const node = code(() => call(nodeZlib, nodeCrypto, nodeBuffer));
    expect(node, name).toMatch(/^ERR_|^Z_/);
    expect(
      code(() => call(zlib, crypto, buffer)),
      name,
    ).toBe(node);
  }
  expect(outcome(() => crypto.randomInt(2 ** 48))).toContain('"max" is out of range');
  // `null` is no options, and Node's options form of `hash()`.
  expect(zlib.inflateSync(zlib.deflateSync(text, null), null).toString()).toBe(text);
  expect(await promised<Buffer>((done) => zlib.gzip(text, null, done))).toHaveLength(
    zlib.gzipSync(text).length,
  );
  expect(crypto.hash("sha256", text, { outputEncoding: "base64" })).toBe(
    nodeCrypto.hash("sha256", text, { outputEncoding: "base64" }),
  );
  // Gzip has no dictionary, as Node's ignores one: what it writes, Node reads.
  const gzipped = zlib.gzipSync(text, { dictionary: Buffer.from("the notes") });
  expect(nodeZlib.gunzipSync(gzipped).toString()).toBe(text);
  // What zlib's header has that Node rejects.
  const flagged = Uint8Array.from(zlib.gzipSync(text));
  flagged[3]! |= 0x20;
  expect(outcome(() => zlib.gunzipSync(flagged))).toBe(outcome(() => nodeZlib.gunzipSync(flagged)));
  const wide = Uint8Array.from(zlib.deflateSync(text));
  wide[0] = 0x88;
  wide[1] = (31 - ((0x88 * 256) % 31)) % 31;
  expect(outcome(() => zlib.inflateSync(wide))).toBe(outcome(() => nodeZlib.inflateSync(wide)));
});

test("throws for an option of zlib that would change the answer and is not here", () => {
  for (const options of [
    { info: true },
    { finishFlush: nodeZlib.constants.Z_SYNC_FLUSH },
    { flush: nodeZlib.constants.Z_SYNC_FLUSH },
    { windowBits: 9 },
  ]) {
    expect(() => zlib.deflateSync(text, options as never), JSON.stringify(options)).toThrow(
      /^vitest-plugin-rsc: zlib's .* is not there in the browser$/,
    );
  }
  expect(zlib.inflateSync(zlib.deflateSync(text), { windowBits: 0 }).toString()).toBe(text);
});

test("`stream/consumers` reads what `for await` reads, like an array or a string", async () => {
  expect(await consumers.text(["a", "b"] as never)).toBe(
    await nodeConsumers.text(["a", "b"] as never),
  );
  expect(await consumers.text("ab" as never)).toBe(await nodeConsumers.text("ab" as never));
  // A web stream without `Symbol.asyncIterator`, as in Safari before 18.
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("ab"));
      controller.close();
    },
  });
  const old = { getReader: () => stream.getReader() };
  expect(await consumers.text(old as never)).toBe("ab");
});
