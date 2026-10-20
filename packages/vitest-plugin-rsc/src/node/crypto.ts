// `node:crypto` for a browser: Web Crypto for random values and `subtle`,
// and a SHA-256 in JavaScript for `createHash`, which Next's cache keys need
// synchronously, where Next has no Web Crypto branch, like the ids of nanoid.
// The rest is unenv's: its constants, and functions that throw when called,
// like `createHmac`, so that code which imports one loads.

import unenv from "unenv/node/crypto";

export * from "unenv/node/crypto";

const web = globalThis.crypto;
export const webcrypto = web;
export const subtle = web.subtle;
export const randomUUID = () => web.randomUUID();
export const randomFillSync = <T extends ArrayBufferView>(buffer: T): T => (
  web.getRandomValues(buffer as never),
  buffer
);
export const randomBytes = (size: number) => web.getRandomValues(Buffer.alloc(size));
export const getRandomValues = <T extends ArrayBufferView>(buffer: T): T =>
  web.getRandomValues(buffer as never);

// The round constants: the fractional bits of the cube roots of the primes.
const K = new Uint32Array(64);
for (let n = 2, i = 0; i < 64; n++) {
  let prime = true;
  for (let d = 2; d * d <= n; d++) {
    if (n % d === 0) {
      prime = false;
      break;
    }
  }
  if (prime) K[i++] = (Math.cbrt(n) % 1) * 2 ** 32;
}

function sha256(bytes: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const length = bytes.length;
  const padded = new Uint8Array(((length + 9 + 63) >> 6) << 6);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((length * 8) / 2 ** 32));
  view.setUint32(padded.length - 4, (length * 8) >>> 0);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h as unknown as [
      number,
      number,
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    for (let i = 0; i < 64; i++) {
      const t1 =
        (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0]! += a;
    h[1]! += b;
    h[2]! += c;
    h[3]! += d;
    h[4]! += e;
    h[5]! += f;
    h[6]! += g;
    h[7]! += hh;
  }
  const out = new Uint8Array(32);
  const outView = new DataView(out.buffer);
  h.forEach((word, i) => outView.setUint32(i * 4, word));
  return out;
}

type Data = string | ArrayBufferView | ArrayBuffer;
type Hash = {
  update(data: Data, encoding?: BufferEncoding): Hash;
  digest(encoding?: BufferEncoding): Buffer | string;
};

export const createHash = (algorithm: string): Hash => {
  if (!/^sha-?256$/i.test(algorithm)) {
    throw new Error(
      `vitest-plugin-rsc: node:crypto's createHash(${JSON.stringify(algorithm)}) is not there in a browser`,
    );
  }
  const chunks: Uint8Array[] = [];
  const hash: Hash = {
    update(data, encoding) {
      chunks.push(
        typeof data === "string"
          ? Buffer.from(data, encoding ?? "utf8")
          : data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
      );
      return hash;
    },
    digest(encoding) {
      const digest = Buffer.from(sha256(Buffer.concat(chunks)));
      return encoding ? digest.toString(encoding) : digest;
    },
  };
  return hash;
};

export default {
  ...unenv,
  webcrypto,
  subtle,
  randomUUID,
  randomFillSync,
  randomBytes,
  getRandomValues,
  createHash,
};
