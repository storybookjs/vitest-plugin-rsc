export const userCookieKey = "_un";
export const cookieSep = "^)&_*($";

const iv = encode("encryptiv");
const password = process.env.SESSION_KEY ?? "secret";

const pwUtf8 = encode(password);
const algo = { name: "AES-GCM", iv };

function encode(value: string) {
  return new TextEncoder().encode(value);
}

function decode(value: ArrayBuffer) {
  return new TextDecoder().decode(value);
}

function base64ToArrayBuffer(base64: string) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  // @ts-ignore
  const binary = String.fromCharCode(...bytes);
  return btoa(binary);
}

// Encrypt
export function createEncrypt() {
  return async function (data: string) {
    const pwHash = await crypto.subtle.digest("SHA-256", pwUtf8);
    const encryptKey = await crypto.subtle.importKey("raw", pwHash, algo, false, ["encrypt"]);
    const encrypted = await crypto.subtle.encrypt(algo, encryptKey, encode(data));
    return arrayBufferToBase64(encrypted);
  };
}

// Decrypt
export function createDecrypt() {
  return async function decrypt(data: string) {
    const pwHash = await crypto.subtle.digest("SHA-256", pwUtf8);
    const buffer = base64ToArrayBuffer(data);
    const decryptKey = await crypto.subtle.importKey("raw", pwHash, algo, false, ["decrypt"]);
    const ptBuffer = await crypto.subtle.decrypt(algo, decryptKey, buffer);
    const decryptedText = decode(ptBuffer);
    return decryptedText;
  };
}

export function getSession(userCookie?: string) {
  const none = [null, null];
  if (!userCookie) return none;
  const value = decodeURIComponent(userCookie);
  if (!value) return none;
  const index = value.indexOf(cookieSep);
  if (index === -1) return none;
  const user = value.slice(0, index);
  const session = value.slice(index + cookieSep.length);
  return [user, session];
}

export function getUser(userCookie: string | undefined) {
  return getSession(userCookie)[0];
}
