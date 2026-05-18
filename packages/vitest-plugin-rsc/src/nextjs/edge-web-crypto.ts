type CryptoWithSubtle = Partial<Crypto> & { subtle?: Partial<SubtleCrypto> };

// Begin adapted: Next.js Edge runtime WebCrypto baseline
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/web/sandbox/context.ts#L264-L296
// Source: https://github.com/vercel/next.js/blob/ee6e79b1792a4d401ddf2480f40a83549fe8e722/packages/next/src/server/app-render/app-render.tsx#L2372-L2376
// Adaptation: Generated Edge App Page modules run in a hidden Vite browser
// runner, not Next's EdgeRuntime sandbox. Ensure the Edge global has the
// WebCrypto digest shape that App Page render uses for static request IDs.
export function installNextEdgeWebCrypto(): void {
  const crypto = ensureEdgeCryptoGlobal();
  if (!crypto.randomUUID) {
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: () => createRandomUUID(crypto),
    });
  }
  if (crypto.subtle?.digest) return;

  const subtle = crypto.subtle ?? {};
  Object.defineProperty(subtle, "digest", {
    configurable: true,
    value: digestWithSha1Fallback,
  });
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    enumerable: true,
    value: subtle,
  });
}

function ensureEdgeCryptoGlobal(): CryptoWithSubtle {
  const crypto = globalThis.crypto as CryptoWithSubtle | undefined;
  if (crypto) return crypto;

  const edgeCrypto = {} as CryptoWithSubtle;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    enumerable: true,
    value: edgeCrypto,
  });
  return edgeCrypto;
}

async function digestWithSha1Fallback(
  algorithm: AlgorithmIdentifier,
  data: BufferSource,
): Promise<ArrayBuffer> {
  const name = typeof algorithm === "string" ? algorithm : algorithm.name;
  if (name.toUpperCase().replaceAll("-", "") !== "SHA1") {
    throw new Error(`Unsupported Edge WebCrypto digest algorithm "${name}".`);
  }

  return sha1Digest(toUint8Array(data));
}

function toUint8Array(data: BufferSource) {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function sha1Digest(input: Uint8Array): ArrayBuffer {
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(input);
  padded[input.length] = 0x80;

  const view = new DataView(padded.buffer);
  const bitLength = input.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(80);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 80; index += 1) {
      words[index] = rotateLeft(
        words[index - 3]! ^ words[index - 8]! ^ words[index - 14]! ^ words[index - 16]!,
        1,
      );
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let index = 0; index < 80; index += 1) {
      let f: number;
      let k: number;
      if (index < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (index < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (index < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const temp = (rotateLeft(a, 5) + f + e + k + words[index]!) >>> 0;
      e = d;
      d = c;
      c = rotateLeft(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  const digest = new ArrayBuffer(20);
  const digestView = new DataView(digest);
  digestView.setUint32(0, h0);
  digestView.setUint32(4, h1);
  digestView.setUint32(8, h2);
  digestView.setUint32(12, h3);
  digestView.setUint32(16, h4);
  return digest;
}

function rotateLeft(value: number, shift: number) {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function createRandomUUID(crypto: CryptoWithSubtle) {
  const bytes = new Uint8Array(16);
  if (crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    // Vite's hidden SSR runner can lack an EdgeRuntime crypto global entirely.
    // Next uses this value as a render request id, not as key material.
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
// End adapted
