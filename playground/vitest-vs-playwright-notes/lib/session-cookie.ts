import type { User } from "./schema.ts";

// The signed-in user in a signed cookie of its own, for five minutes, as
// Better Auth's cookie cache keeps it: a request reads the user from the
// cookie, and looks the session up in the database only when the cookie is
// missing, stale or of another session. Signing out ends both cookies; a
// session deleted elsewhere lasts in this browser until its cookie is stale.

export const USER_COOKIE = "session_user";
export const USER_COOKIE_MAX_AGE = 5 * 60;

export type SessionUser = Pick<User, "id" | "name" | "email">;

type Payload = { token: string; user: SessionUser; expires: number };

// The benchmark's own key, the same for its server and its tests' helpers.
// Whoever knows the key signs in as anyone: an app that is deployed takes it
// from a secret of its server, without a fallback.
// oxlint-disable-next-line no-process-env
const secret = process.env.SESSION_SECRET ?? "the secret of the notes benchmark";

let key: Promise<CryptoKey> | undefined;
function signingKey(): Promise<CryptoKey> {
  key ??= crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  return key;
}

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (char) =>
    char.charCodeAt(0),
  );
}

/** The value of the cookie: the user of the session `token`, until five minutes from now. */
export async function signUserCookie(
  token: string,
  { id, name, email }: SessionUser,
): Promise<string> {
  const payload: Payload = {
    token,
    user: { id, name, email },
    expires: Date.now() + USER_COOKIE_MAX_AGE * 1000,
  };
  const data = new TextEncoder().encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(), data);
  return `${toBase64Url(data)}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * The user of the cookie, if it is signed, fresh and of the session `token`.
 * A cookie that isn't base64url is no user either, as a missing one.
 */
export async function readUserCookie(
  value: string | undefined,
  token: string,
): Promise<SessionUser | undefined> {
  const [data, signature] = value?.split(".") ?? [];
  if (!data || !signature) return undefined;
  let bytes: Uint8Array<ArrayBuffer>, signatureBytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = fromBase64Url(data);
    signatureBytes = fromBase64Url(signature);
  } catch {
    return undefined;
  }
  if (!(await crypto.subtle.verify("HMAC", await signingKey(), signatureBytes, bytes)))
    return undefined;
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- What signUserCookie() signed.
  const payload = JSON.parse(new TextDecoder().decode(bytes)) as Payload;
  return payload.token === token && payload.expires > Date.now() ? payload.user : undefined;
}
