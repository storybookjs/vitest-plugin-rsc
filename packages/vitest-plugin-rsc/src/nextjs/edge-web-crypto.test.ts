import { afterEach, expect, test } from "vitest";
import { installNextEdgeWebCrypto } from "./edge-web-crypto.ts";

const originalCryptoDescriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto");

afterEach(() => {
  if (originalCryptoDescriptor) {
    Object.defineProperty(globalThis, "crypto", originalCryptoDescriptor);
  } else {
    delete (globalThis as { crypto?: unknown }).crypto;
  }
});

test("keeps existing WebCrypto digest when the runner already provides it", async () => {
  const digest = async () => new ArrayBuffer(1);
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      subtle: { digest },
    },
  });

  installNextEdgeWebCrypto();

  expect(globalThis.crypto.subtle.digest).toBe(digest);
});

test("installs the SHA-1 digest shape required by generated Edge App Page render", async () => {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {},
  });

  installNextEdgeWebCrypto();

  expect(typeof globalThis.crypto.subtle.digest).toBe("function");
  const digest = await globalThis.crypto.subtle.digest("SHA-1", new TextEncoder().encode("abc"));
  expect(Buffer.from(digest).toString("hex")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  await expect(globalThis.crypto.subtle.digest("SHA-256", new Uint8Array())).rejects.toThrow(
    'Unsupported Edge WebCrypto digest algorithm "SHA-256"',
  );
});

test("installs the Edge crypto global when the SSR runner does not provide one", async () => {
  delete (globalThis as { crypto?: unknown }).crypto;

  installNextEdgeWebCrypto();

  expect(typeof globalThis.crypto.randomUUID).toBe("function");
  expect(globalThis.crypto.randomUUID()).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-1", new TextEncoder().encode("abc"));
  expect(Buffer.from(digest).toString("hex")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
});
