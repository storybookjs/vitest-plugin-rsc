// The headers and the cookies of the requests that the browser sends to the
// app. As in Next, `headers()` and `cookies()` are the request's: Next makes
// its request store, in AsyncLocalStorage, of the request it gets, here as on
// Node.js. So the plugin keeps them in one store for the test's document, and
// writes them on each request where it becomes one for the server: see
// `sendRequest()` in index.ts. The `Set-Cookie` headers of the response go
// back into the store. The app's cookies are not in `document.cookie`.
//
// A cookie is a name and a value, as in Next's `RequestCookies` and
// `ResponseCookies`: a `Set-Cookie` sets the cookie of its name, and one that
// has expired deletes it. Its `Path`, `Domain`, `Secure` and `HttpOnly` do not
// count: every request here is for the app, at one origin. Unlike those
// classes, the store keeps a value as the server wrote it, without decoding
// it and encoding it again, so a request carries what a browser would send.

/** A name and a value: of a `cookie` header, or of a `Set-Cookie` before its first `;`. */
function pairOf(text: string): [name: string, value: string] {
  const at = text.indexOf("=");
  // Without a `=` it is a value without a name, as a browser reads it.
  return at === -1 ? ["", text.trim()] : [text.slice(0, at).trim(), text.slice(at + 1).trim()];
}

// Whether the attributes of a `Set-Cookie` delete its cookie: a `Max-Age` of
// 0 or less, or else an `Expires` that has passed. The last of each counts,
// and `Max-Age` before `Expires`, as in a browser. Next's `parseSetCookie()`
// drops a `Max-Age` of 0, which is what Better Auth deletes a cookie with.
function deletes(attributes: string[]): boolean {
  let maxAge: number | undefined;
  let expires: number | undefined;
  for (const attribute of attributes) {
    const at = attribute.indexOf("=");
    if (at === -1) continue;
    const name = attribute.slice(0, at).trim().toLowerCase();
    const value = attribute.slice(at + 1).trim();
    if (name === "max-age" && /^-?\d+$/.test(value)) maxAge = Number(value);
    if (name === "expires" && !Number.isNaN(Date.parse(value))) expires = Date.parse(value);
  }
  if (maxAge !== undefined) return maxAge <= 0;
  // The clock of the test, which may be fake.
  return expires !== undefined && expires <= Date.now();
}

/**
 * What the browser's requests to the app carry, besides what a browser adds
 * itself. One for the document, from what the test opened until the test
 * ends: `cleanup()` makes a new one.
 */
export class PageStore {
  /** The `headers` of what the test opened, until it opens something else. */
  headers = new Headers();
  /** The app's cookies, by name, with the values the server wrote. */
  readonly cookies = new Map<string, string>();

  /** Sets the cookies of a `cookie` header, as a `Set-Cookie` of each would. */
  seed(cookie: string): void {
    // Each pair is a `Set-Cookie` without attributes.
    this.receive(cookie.split(";"));
  }

  /** Sets and deletes cookies by the `Set-Cookie` headers of a response of the app. */
  receive(setCookies: Iterable<string>): void {
    for (const setCookie of setCookies) {
      const [pair = "", ...attributes] = setCookie.split(";");
      const [name, value] = pairOf(pair);
      if (!name && !value) continue;
      if (deletes(attributes)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  /** The `cookie` header of a request: empty without cookies. */
  cookieHeader(): string {
    return Array.from(this.cookies, ([name, value]) => (name ? `${name}=${value}` : value)).join(
      "; ",
    );
  }
}
