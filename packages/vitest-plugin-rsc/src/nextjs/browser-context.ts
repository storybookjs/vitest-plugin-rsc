import pageHost from "virtual:vitest-plugin-rsc/page-host";
import { pageFetch } from "./app-requests.ts";
import { followNavigation } from "./document-loads.ts";
import { streamedContentQueue } from "./document.ts";
import { appHasNavigations } from "./host-document.ts";
import { PageStore } from "./page-store.ts";
import { registry } from "./registry.ts";
import { itemsOfStorage, PageStorage, storageOf, type Items } from "./storage.ts";

// The document's cookies, storage, requests and navigations as the app sees
// them, between the host's `newBrowserContext()` and `cleanup()`; outside,
// the browser's own. A browser gives a page the cookie jar and the storage of
// its origin, which every other document of the origin shares, like Vitest's
// UI or a host's own. A browser context of the app has its own, like a new
// one of Playwright, and the requests of the page go to the app. The host
// opens one for what renders on the server: under Vitest the plugin's setup
// file, for every test of a file without `"use client"`. `renderServer()`,
// `handleRequest()` and `runInServerAction()` open one when none is. A
// component that the host renders as React does, like a test file with
// `"use client"`, is outside any, with the browser's own APIs.
//
// Opening one saves what the document has, and puts the context's in its
// place. Closing puts back what it saved, where the context's are still
// there. A patch that a test set over the context's meanwhile, like a spy on
// `fetch`, passes on to it, so it stays, also in the next context. Once it is
// restored, the next closing puts back the browser's, also with no context
// open.
//
// Each of the context's is one object for the document, which code can
// take: in a context it is the context's, and outside one it passes on to
// what the document had, the browser's own. So a library that took
// `localStorage` as a page loaded has the items of the context that is open,
// and the browser's after it.

/** A browser context of the app: its cookie jar, the headers of its requests, and its storage. */
export class BrowserContext {
  readonly store = new PageStore();
  readonly storage = new PageStorage();
}

let opened: BrowserContext | undefined;

// A property of the document that a context has its own of: none, for an
// API that the page does not have.
type Binding = { target: object; name: string; own: PropertyDescriptor | undefined };

// What the document had of its own for each binding as the last context
// opened, which closing puts back.
const saved = new Map<Binding, PropertyDescriptor | undefined>();

// The bindings where the context's may be under what is there now: closing
// found something else in its place, like a spy that wraps it. That one
// stays, until it is restored.
const patched = new Set<Binding>();

// What a stand-in passes on to outside a context: the saved one, or else the
// one the document inherits, like `document.cookie` of `Document.prototype`.
const savedOf = (binding: Binding) =>
  saved.get(binding) ??
  descriptorOf(Object.getPrototypeOf(binding.target) as object | null, binding.name);

// The value of a binding as the document had it, for `this` of `target`.
function savedValue<T>(binding: Binding): T {
  const descriptor = savedOf(binding);
  return (descriptor?.get ? descriptor.get.call(binding.target) : descriptor?.value) as T;
}

function descriptorOf(target: object | null, name: string): PropertyDescriptor | undefined {
  for (; target; target = Object.getPrototypeOf(target) as object | null) {
    const descriptor = Object.getOwnPropertyDescriptor(target, name);
    if (descriptor) return descriptor;
  }
}

// A request of the page that is not the app's goes to the `fetch` the
// document had: the browser's, or one of the host's, like a mock of the
// network.
const fetchBinding: Binding = {
  target: globalThis,
  name: "fetch",
  own: {
    configurable: true,
    enumerable: true,
    writable: true,
    value: pageFetch(
      () => opened?.store,
      () => savedValue<typeof fetch>(fetchBinding) ?? registry.network,
    ),
  },
};

// A script of the page reads and writes the app's cookies with
// `document.cookie`, as in a browser, where it is a view of the cookie jar.
const cookieBinding: Binding = {
  target: document,
  name: "cookie",
  own: {
    configurable: true,
    get: () => (opened ? opened.store.documentCookie() : savedValue<string>(cookieBinding)),
    set(cookie: unknown) {
      if (opened) opened.store.write(String(cookie));
      else savedOf(cookieBinding)?.set?.call(document, cookie);
    },
  },
};

// The page's `localStorage` and `sessionStorage`. The page hears the
// browser's `storage` events, which are about the host's storage, never its
// own.
const storageBindings = (["localStorage", "sessionStorage"] as const).map((name) => {
  const binding: Binding = { target: window, name, own: undefined };
  const items = (): Items =>
    opened ? opened.storage[name] : itemsOfStorage(savedValue<Storage>(binding));
  const storage = storageOf(items);
  binding.own = { configurable: true, enumerable: true, get: () => storage };
  return binding;
});

const bindings: Binding[] = [
  fetchBinding,
  cookieBinding,
  // The Cookie Store API is a view of the browser's own jar, so the page has
  // none, as in a browser without it. Code that uses it checks for it first,
  // like Next's own.
  ...["cookieStore", "CookieStore", "CookieChangeEvent"].map((name) => ({
    target: window,
    name,
    own: undefined,
  })),
  ...storageBindings,
  { target: self, name: "$RC", own: streamedContentQueue },
];

// Whether two descriptors have the same value, or the same accessors.
function same(one: PropertyDescriptor | undefined, other: PropertyDescriptor | undefined): boolean {
  if (!one || !other) return one === other;
  return one.get === other.get && one.set === other.set && one.value === other.value;
}

const ownOf = ({ target, name }: Binding) => Object.getOwnPropertyDescriptor(target, name);

// What the document had of its own for each binding before the plugin: one
// that predates the context's cannot wrap it. Read, not changed.
const original = new Map(bindings.map((binding) => [binding, ownOf(binding)] as const));

// Whether `descriptor` is what the document had before a context: the saved
// one, or its own from before the plugin. A patch restored to it is gone.
const isDocuments = (binding: Binding, descriptor: PropertyDescriptor | undefined) =>
  (saved.has(binding) && same(descriptor, saved.get(binding))) ||
  same(descriptor, original.get(binding));

const { navigation } = pageHost;

// The navigations of the app that would load the document: see document-loads.ts.
const followed = (event: Event) => {
  if (opened) followNavigation(event, opened.store);
};

/**
 * Opens a browser context of the app, empty, unless one is open: the
 * document has its cookies, storage, requests and navigations until
 * `closeContext()`.
 */
export function openContext(): BrowserContext {
  if (opened) return opened;
  for (const binding of bindings) {
    const { target, name, own } = binding;
    const descriptor = ownOf(binding);
    // Still the context's, or a patch over it, which passes on to it: either
    // stays, and so does what was saved before.
    if (same(descriptor, own)) continue;
    if (patched.has(binding) && !isDocuments(binding, descriptor)) continue;
    patched.delete(binding);
    saved.set(binding, descriptor);
    if (own) Object.defineProperty(target, name, own);
    else Reflect.deleteProperty(target, name);
  }
  navigation?.addEventListener("navigate", followed);
  appHasNavigations(true);
  return (opened = new BrowserContext());
}

/**
 * Closes the browser context that is open, and puts back what the document
 * had wherever the context's own are in place. Also with none open: a patch
 * over them that has gone since, like a spy that a test restored after
 * `cleanup()`, put them back.
 */
export function closeContext(): void {
  const closing = opened !== undefined;
  opened = undefined;
  navigation?.removeEventListener("navigate", followed);
  appHasNavigations(false);
  for (const binding of bindings) {
    const { target, name, own } = binding;
    const descriptor = ownOf(binding);
    if (!same(descriptor, own)) {
      // A patch that was restored to what the document had is gone. Any
      // other one may wrap the context's, if it was set in the context.
      if (isDocuments(binding, descriptor)) patched.delete(binding);
      else if (closing) patched.add(binding);
      continue;
    }
    patched.delete(binding);
    // Nothing to put back before the first context.
    if (!saved.has(binding)) continue;
    const put = saved.get(binding);
    if (put) Object.defineProperty(target, name, put);
    else Reflect.deleteProperty(target, name);
  }
}
