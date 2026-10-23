// Passwords as PBKDF2 hashes, with Web Crypto: the same code on Node.js and in
// the browser of the Vitest tests.
const iterations = 10_000;

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(hex.match(/../g)!.map((byte) => parseInt(byte, 16)));
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `${toHex(salt)}:${await derive(password, salt)}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [salt, expected] = hash.split(":");
  return (await derive(password, fromHex(salt!))) === expected;
}
