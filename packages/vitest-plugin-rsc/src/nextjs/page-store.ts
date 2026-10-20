// The headers and the cookies of the requests that the browser sends to the
// app. As in Next, `headers()` and `cookies()` are the request's: Next makes
// its request store, in AsyncLocalStorage, of the request it gets, here as on
// Node.js. So the plugin keeps them in one store for the test's document, and
// writes them on each request where it becomes one for the server: see
// `sendRequest()` in app-requests.ts. The `Set-Cookie` headers of the response go
// back into the store.
//
// The store is the browser's cookie jar, and `document.cookie` of the test's
// document is a view of it, as in a browser: a script of the page reads the
// cookies that are not `HttpOnly`, and the cookie it writes goes into the
// store. The browser's own cookie jar has none of the app's cookies.
//
// A cookie is a name and a value, as in Next's `RequestCookies` and
// `ResponseCookies`: a `Set-Cookie` sets the cookie of its name, and one that
// has expired deletes it. Its `Path`, `Domain` and `Secure` do not count:
// every request here is for the app, at one origin, as if that were an
// `https:` one. Only `HttpOnly` does, which keeps a cookie from the scripts of
// the page. Unlike those classes, the store keeps a value as the server wrote
// it, without decoding it and encoding it again, so a request carries what a
// browser would send.

/** A name and a value: of a `cookie` header, or of a `Set-Cookie` before its first `;`. */
function pairOf(text: string): [name: string, value: string] {
  const at = text.indexOf("=");
  // Without a `=` it is a value without a name, as a browser reads it.
  return at === -1 ? ["", text.trim()] : [text.slice(0, at).trim(), text.slice(at + 1).trim()];
}

/** The name of an attribute of a `Set-Cookie`, in lower case, and its value. */
function attributeOf(text: string): [name: string, value: string] {
  const at = text.indexOf("=");
  return at === -1
    ? [text.trim().toLowerCase(), ""]
    : [text.slice(0, at).trim().toLowerCase(), text.slice(at + 1).trim()];
}

// The time of an `Expires`, for a date a browser takes: one with a time of
// day and the name of a month. `Date.parse()` takes more, like `0` for the
// year 2000, where a browser ignores the attribute.
function expiresAt(value: string): number | undefined {
  if (!/\d{1,2}:\d{1,2}:\d{1,2}/.test(value)) return undefined;
  if (!/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(value)) return undefined;
  const time = Date.parse(value);
  return Number.isNaN(time) ? undefined : time;
}

// Whether the attributes of a `Set-Cookie` delete its cookie: a `Max-Age` of
// 0 or less, or else an `Expires` that has passed. The last of each counts,
// and `Max-Age` before `Expires`, as in a browser. Next's `parseSetCookie()`
// drops a `Max-Age` of 0, which is what Better Auth deletes a cookie with.
function deletes(attributes: string[]): boolean {
  let maxAge: number | undefined;
  let expires: number | undefined;
  for (const [name, value] of attributes.map(attributeOf)) {
    if (name === "max-age" && /^-?\d+$/.test(value)) maxAge = Number(value);
    if (name === "expires") expires = expiresAt(value) ?? expires;
  }
  if (maxAge !== undefined) return maxAge <= 0;
  // The clock of the test, which may be fake.
  return expires !== undefined && expires <= Date.now();
}

type Cookie = { value: string; httpOnly: boolean };

/** The cookies as a `cookie` header, or as `document.cookie` has them. */
function serialize(cookies: Iterable<[string, Cookie]>): string {
  return Array.from(cookies, ([name, { value }]) => (name ? `${name}=${value}` : value)).join("; ");
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
  readonly cookies = new Map<string, Cookie>();

  /** Sets the cookies of a `cookie` header, as a `Set-Cookie` of each would. */
  seed(cookie: string): void {
    // Each pair is a `Set-Cookie` without attributes.
    this.receive(cookie.split(";"));
  }

  /** Sets and deletes cookies by the `Set-Cookie` headers of a response of the app. */
  receive(setCookies: Iterable<string>): void {
    for (const setCookie of setCookies) this.#set(setCookie, false);
  }

  /**
   * Sets or deletes a cookie as a script of the page does, with
   * `document.cookie`. As in a browser, a script cannot write an `HttpOnly`
   * cookie, nor change or delete one.
   */
  write(setCookie: string): void {
    this.#set(setCookie, true);
  }

  /** The `cookie` header of a request: empty without cookies. */
  cookieHeader(): string {
    return serialize(this.cookies);
  }

  /** What `document.cookie` has: the cookies that are not `HttpOnly`. */
  documentCookie(): string {
    return serialize(Array.from(this.cookies).filter(([, { httpOnly }]) => !httpOnly));
  }

  #set(setCookie: string, byScript: boolean): void {
    const [pair = "", ...attributes] = setCookie.split(";");
    const [name, value] = pairOf(pair);
    if (!name && !value) return;
    const httpOnly = attributes.some((attribute) => attributeOf(attribute)[0] === "httponly");
    if (byScript && (httpOnly || this.cookies.get(name)?.httpOnly)) return;
    if (deletes(attributes)) this.cookies.delete(name);
    else this.cookies.set(name, { value, httpOnly });
  }
}
