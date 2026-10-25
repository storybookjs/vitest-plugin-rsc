import { afterEach, beforeEach, expect, test, vi } from "vitest";

// The modules of the stand-ins that need a browser as they evaluate. The
// page's `fetch` answers a request of the app in a context, and passes on
// every other one, as `pageFetch()` does.
vi.mock("./app-requests.ts", () => ({
  pageFetch:
    (store: () => unknown, network: () => typeof fetch): typeof fetch =>
    (input, init) =>
      store() ? Promise.resolve(new Response("the app")) : network()(input, init),
}));
vi.mock("./document-loads.ts", () => ({ followNavigation: () => {} }));
// The host of a browser, whose navigations are the document's.
vi.mock("virtual:vitest-plugin-rsc/page-host", () => ({
  default: {
    get navigation() {
      return (globalThis.window as { navigation?: EventTarget }).navigation;
    },
    interceptRequests: () => false,
  },
}));
vi.mock("./document.ts", () => ({
  streamedContentQueue: { configurable: true, get: () => undefined, set: () => {} },
}));

// A browser's storage of the origin, which other documents share.
class Storage {
  readonly #items = new Map<string, string>();
  get length() {
    return this.#items.size;
  }
  key(index: number) {
    return [...this.#items.keys()][index] ?? null;
  }
  getItem(key: string) {
    return this.#items.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.#items.set(key, value);
  }
  removeItem(key: string) {
    this.#items.delete(key);
  }
  clear() {
    this.#items.clear();
  }
}

// A document with the browser's own APIs, as a page of the origin has them.
function browserDocument() {
  let jar = "";
  class Document {
    get cookie() {
      return jar;
    }
    set cookie(cookie: string) {
      jar = cookie.split(";")[0]!;
    }
  }
  const local = new Storage();
  const session = new Storage();
  const fetch = async () => new Response("the network");
  // One realm, as a browser's: the page's web APIs are its global's.
  const { Request, Response, Headers, FormData, Blob } = globalThis;
  const window = {
    fetch,
    Request,
    Response,
    Headers,
    FormData,
    Blob,
    cookieStore: {},
    CookieStore: class CookieStore {},
    CookieChangeEvent: class CookieChangeEvent {},
    navigation: new EventTarget(),
  };
  Object.defineProperties(window, {
    localStorage: { configurable: true, enumerable: true, get: () => local },
    sessionStorage: { configurable: true, enumerable: true, get: () => session },
  });
  return { window, document: new Document(), fetch, local };
}

let browser: ReturnType<typeof browserDocument>;

beforeEach(() => {
  vi.resetModules();
  browser = browserDocument();
  vi.stubGlobal("Storage", Storage);
  vi.stubGlobal("window", browser.window);
  vi.stubGlobal("self", browser.window);
  vi.stubGlobal("document", browser.document);
});

afterEach(() => vi.unstubAllGlobals());

const browserContext = () => import("./browser-context.ts");

const descriptors = (target: object, names: string[]) =>
  Object.fromEntries(names.map((name) => [name, Object.getOwnPropertyDescriptor(target, name)]));

const windowNames = ["localStorage", "sessionStorage", "cookieStore", "CookieStore", "$RC"];

test("puts back what the document had when the context closes", async () => {
  const { openContext, closeContext } = await browserContext();
  const before = {
    fetch: Object.getOwnPropertyDescriptor(window, "fetch"),
    window: descriptors(browser.window, windowNames),
  };

  openContext();
  expect(Object.getPrototypeOf(window.localStorage) === Storage.prototype).toBe(false);
  expect(Object.hasOwn(document, "cookie")).toBe(true);
  expect("cookieStore" in window).toBe(false);
  expect(await (await window.fetch("/")).text()).toBe("the app");
  closeContext();

  expect(Object.getOwnPropertyDescriptor(window, "fetch")).toEqual(before.fetch);
  expect(descriptors(browser.window, windowNames)).toEqual(before.window);
  expect(Object.hasOwn(document, "cookie")).toBe(false);
  expect(window.localStorage).toBe(browser.local);
});

test("has empty cookies and storage in each context, apart from the browser's", async () => {
  const { openContext, closeContext } = await browserContext();
  browser.local.setItem("host", "panel");

  openContext();
  expect(window.localStorage.getItem("host")).toBeNull();
  window.localStorage.setItem("theme", "dark");
  document.cookie = "visitor=Ada";
  expect(document.cookie).toBe("visitor=Ada");
  closeContext();

  expect(browser.local.getItem("theme")).toBeNull();
  expect(document.cookie).toBe("");
  openContext();
  expect([window.localStorage.length, document.cookie]).toEqual([0, ""]);
  closeContext();
});

test("a stand-in taken in a context is the browser's own outside one", async () => {
  const { openContext, closeContext } = await browserContext();
  openContext();
  const taken = window.fetch;
  const storage = window.localStorage;
  const cookie = Object.getOwnPropertyDescriptor(document, "cookie")!;
  storage.setItem("theme", "dark");
  closeContext();

  expect(await (await taken("/")).text()).toBe("the network");
  storage.setItem("draft", "Hello");
  expect(browser.local.getItem("draft")).toBe("Hello");
  expect(storage.getItem("theme")).toBeNull();
  cookie.set!.call(document, "browser=yes");
  expect(cookie.get!.call(document)).toBe("browser=yes");
  expect(browser.document.cookie).toBe("browser=yes");

  openContext();
  expect(storage.getItem("draft")).toBeNull();
  expect(await (await taken("/")).text()).toBe("the app");
  closeContext();
});

test("passes on to a fetch of the host's that was there before the first context", async () => {
  const { openContext, closeContext } = await browserContext();
  // Like MSW's, installed as the host starts.
  const mocked = vi.fn(async () => new Response("mocked"));
  window.fetch = mocked;

  openContext();
  const taken = window.fetch;
  closeContext();

  expect(window.fetch).toBe(mocked);
  expect(await (await taken("/elsewhere")).text()).toBe("mocked");
});

test("keeps a patch of fetch that was set in a context, over the next one's", async () => {
  const { openContext, closeContext } = await browserContext();
  const native = window.fetch;
  openContext();
  const own = window.fetch;
  // A spy of the test's, which passes on to the context's.
  const spy = vi.fn((input: RequestInfo | URL, init?: RequestInit) => own(input, init));
  window.fetch = spy;
  closeContext();

  expect(window.fetch).toBe(spy);
  expect(await (await window.fetch("/")).text()).toBe("the network");
  openContext();
  expect(window.fetch).toBe(spy);
  expect(await (await window.fetch("/")).text()).toBe("the app");
  closeContext();

  // The spy restored outside a context: the context's is back, and passes
  // on to the browser's, until closing again puts that back.
  window.fetch = own;
  expect(await (await window.fetch("/elsewhere")).text()).toBe("the network");
  closeContext();
  expect(window.fetch).toBe(native);
  expect(spy).toHaveBeenCalledTimes(2);
});

test("puts back nothing before the first context", async () => {
  const { closeContext, openContext } = await browserContext();
  const native = window.fetch;
  closeContext();
  expect(window.fetch).toBe(native);
  expect("cookieStore" in window).toBe(true);

  openContext();
  expect(window.fetch).not.toBe(native);
  closeContext();
  expect(window.fetch).toBe(native);
});

test("installs its fetch again after a spy from before it was restored in it", async () => {
  const { openContext, closeContext } = await browserContext();
  const native = window.fetch;
  // A spy of a `beforeAll`, restored by an `afterEach` while the context is open.
  const spy = vi.fn(native);
  window.fetch = spy;
  openContext();
  window.fetch = native;
  closeContext();
  expect(window.fetch).toBe(native);

  openContext();
  expect(await (await window.fetch("/")).text()).toBe("the app");
  closeContext();
  expect(window.fetch).toBe(native);
});

test("keeps a spy over its fetch that outlived the context, without passing on to itself", async () => {
  const { openContext, closeContext } = await browserContext();
  openContext();
  const own = window.fetch;
  const inner = vi.fn((input: RequestInfo | URL, init?: RequestInit) => own(input, init));
  window.fetch = inner;
  closeContext();
  // Restored once the context closed: the context's is there, outside one.
  window.fetch = own;
  // A spy of the next file's top level, over it.
  const outer = vi.fn((input: RequestInfo | URL, init?: RequestInit) => own(input, init));
  window.fetch = outer;

  openContext();
  expect(window.fetch).toBe(outer);
  expect(await (await window.fetch("/elsewhere")).text()).toBe("the app");
  closeContext();
  window.fetch = own;
  closeContext();
  expect(await (await window.fetch("/elsewhere")).text()).toBe("the network");
  expect(window.fetch).not.toBe(own);
});
