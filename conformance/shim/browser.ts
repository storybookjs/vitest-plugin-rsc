// Next's e2e tests drive a page through `test/lib/browsers/playwright.ts`, a
// chainable wrapper around a Playwright `Page`. Here the test runs in the tab
// that the page is in, so the same API is written against the DOM: a selector
// is `document.querySelector`, `eval` is `eval`, and a click is the real one
// that Vitest's `userEvent` asks Playwright for.
//
// What a tab of its own gives a test and this one cannot is thrown as
// `Unsupported`, which the runner reports as not applicable.
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { page as vitestPage, userEvent } from "vitest/browser";
import { consoleCapture, type PageLog } from "./console.ts";
import { unsupported } from "./unsupported.ts";

// A test's own timers may be fake.
const setTimeout = globalThis.setTimeout;
const clearTimeout = globalThis.clearTimeout;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type ElementState = "attached" | "visible" | "hidden";

export type ElementByCssOpts = {
  timeout?: number;
  state?: ElementState;
  waitUntil?: false | "load" | "domcontentloaded" | "networkidle";
};

// Playwright's rule: a box that is not empty, and not `visibility: hidden`.
function isVisible(element: Element): boolean {
  if (!element.isConnected) return false;
  const style = getComputedStyle(element);
  if (style.visibility !== "visible") return false;
  if (style.display === "contents") return Array.from(element.children).some(isVisible);
  const box = element.getBoundingClientRect();
  return box.width > 0 && box.height > 0;
}

function query(selector: string, root: ParentNode = document): Element[] {
  try {
    return Array.from(root.querySelectorAll(selector));
  } catch (error) {
    if (error instanceof DOMException && error.name === "SyntaxError") {
      unsupported(`a selector of Playwright's own engine: ${selector}`);
    }
    throw error;
  }
}

async function waitForSelector(
  selector: string,
  state: ElementState,
  timeout: number,
  root: ParentNode = document,
): Promise<Element | undefined> {
  const started = performance.now();
  for (;;) {
    const [element] = query(selector, root);
    if (state === "attached" && element) return element;
    if (state === "visible" && element && isVisible(element)) return element;
    if (state === "hidden" && (!element || !isVisible(element))) return element;
    if (performance.now() - started > timeout) {
      throw new Error(
        `waitForSelector: Timeout ${timeout}ms exceeded.\n` +
          `waiting for ${selector} to be ${state}` +
          (element ? `\n  it is in the document, and not ${state}` : ""),
      );
    }
    await sleep(30);
  }
}

// `userEvent.type` reads `{Enter}` and `[KeyA]` as keys. Playwright's `type`
// takes text.
const literal = (text: string) => text.replace(/[{[]/g, (bracket) => bracket + bracket);

// As long as Playwright waits for an element to be ready for an action.
const actionTimeout = 10_000;

/** What Playwright's `ElementHandle` has, for the element of this document. */
export class ElementHandle {
  readonly element: HTMLElement;
  readonly selector: string;
  private readonly missingAttribute: string | null;

  // `elementsByCss()` answers "" for an attribute that is not there, as
  // selenium did.
  constructor(element: Element, selector: string, missingAttribute: string | null = null) {
    this.element = element as HTMLElement;
    this.selector = selector;
    this.missingAttribute = missingAttribute;
  }

  async click(): Promise<void> {
    await userEvent.click(this.element, { timeout: actionTimeout });
  }
  async dblclick(): Promise<void> {
    await userEvent.dblClick(this.element, { timeout: actionTimeout });
  }
  async hover(): Promise<void> {
    await userEvent.hover(this.element, { timeout: actionTimeout });
  }
  async focus(): Promise<void> {
    this.element.focus();
  }
  async type(text: string): Promise<void> {
    await userEvent.type(this.element, literal(text));
  }
  async fill(text: string): Promise<void> {
    await userEvent.fill(this.element, text);
  }
  async press(key: string): Promise<void> {
    this.element.focus();
    await userEvent.keyboard(`{${key}}`);
  }
  async check(): Promise<void> {
    if (!(this.element as HTMLInputElement).checked) await this.click();
  }
  async uncheck(): Promise<void> {
    if ((this.element as HTMLInputElement).checked) await this.click();
  }
  async selectOption(value: string | string[]): Promise<void> {
    await userEvent.selectOptions(this.element, value);
  }
  async innerText(): Promise<string> {
    return this.element.innerText;
  }
  text(): Promise<string> {
    return this.innerText();
  }
  async textContent(): Promise<string | null> {
    return this.element.textContent;
  }
  async innerHTML(): Promise<string> {
    return this.element.innerHTML;
  }
  async getAttribute(name: string): Promise<string | null> {
    return this.element.getAttribute(name) ?? this.missingAttribute;
  }
  async inputValue(): Promise<string> {
    return (this.element as HTMLInputElement).value;
  }
  async isVisible(): Promise<boolean> {
    return isVisible(this.element);
  }
  async isChecked(): Promise<boolean> {
    return (this.element as HTMLInputElement).checked;
  }
  async isDisabled(): Promise<boolean> {
    return (this.element as HTMLInputElement).disabled;
  }
  async isEnabled(): Promise<boolean> {
    return !(this.element as HTMLInputElement).disabled;
  }
  async boundingBox(): Promise<{ x: number; y: number; width: number; height: number } | null> {
    if (!isVisible(this.element)) return null;
    const { x, y, width, height } = this.element.getBoundingClientRect();
    return { x, y, width, height };
  }
  async getComputedCss(property: string): Promise<string | null> {
    const element = document.querySelector(this.selector) ?? this.element;
    return (getComputedStyle(element) as unknown as Record<string, string>)[property] || null;
  }
  async evaluate<T>(fn: (element: Element, arg?: unknown) => T, arg?: unknown): Promise<T> {
    return fn(this.element, arg);
  }
  async dispatchEvent(type: string): Promise<void> {
    this.element.dispatchEvent(
      new Event(type, { bubbles: true, cancelable: true, composed: true }),
    );
  }
  async scrollIntoViewIfNeeded(): Promise<void> {
    this.element.scrollIntoView({ block: "center", inline: "center" });
  }
  async $(selector: string): Promise<ElementHandle | null> {
    const [element] = query(selector, this.element);
    return element ? new ElementHandle(element, selector) : null;
  }
  async $$(selector: string): Promise<ElementHandle[]> {
    return query(selector, this.element).map((element) => new ElementHandle(element, selector));
  }
}

/** The part of Playwright's `Locator` that the tests use, for a CSS selector. */
export class Locator {
  private readonly resolve: () => Element[];
  private readonly description: string;

  constructor(resolve: () => Element[], description: string) {
    this.resolve = resolve;
    this.description = description;
  }

  private async one(state: ElementState = "attached"): Promise<ElementHandle> {
    const started = performance.now();
    for (;;) {
      const elements = this.resolve();
      if (elements.length > 1) {
        throw new Error(
          `strict mode violation: ${this.description} resolved to ${elements.length} elements`,
        );
      }
      const [element] = elements;
      if (element && (state === "attached" || isVisible(element))) {
        return new ElementHandle(element, this.description);
      }
      if (performance.now() - started > actionTimeout) {
        throw new Error(`Timeout ${actionTimeout}ms exceeded.\nwaiting for ${this.description}`);
      }
      await sleep(30);
    }
  }

  first(): Locator {
    return this.nth(0);
  }
  last(): Locator {
    return new Locator(() => this.resolve().slice(-1), `${this.description} >> last`);
  }
  nth(index: number): Locator {
    return new Locator(
      () => this.resolve().slice(index, index + 1),
      `${this.description} >> nth=${index}`,
    );
  }
  locator(selector: string): Locator {
    return new Locator(
      () => this.resolve().flatMap((element) => query(selector, element)),
      `${this.description} >> ${selector}`,
    );
  }
  async all(): Promise<Locator[]> {
    return this.resolve().map((_, index) => this.nth(index));
  }
  async count(): Promise<number> {
    return this.resolve().length;
  }
  async isVisible(): Promise<boolean> {
    const [element] = this.resolve();
    return element !== undefined && isVisible(element);
  }
  async isHidden(): Promise<boolean> {
    return !(await this.isVisible());
  }
  async waitFor(
    options: { state?: ElementState | "detached"; timeout?: number } = {},
  ): Promise<void> {
    const { state = "visible", timeout = actionTimeout } = options;
    const started = performance.now();
    for (;;) {
      const [element] = this.resolve();
      if (
        state === "detached"
          ? !element
          : state === "attached"
            ? element
            : state === "visible"
              ? element && isVisible(element)
              : !element || !isVisible(element)
      )
        return;
      if (performance.now() - started > timeout) {
        throw new Error(
          `Timeout ${timeout}ms exceeded.\nwaiting for ${this.description} to be ${state}`,
        );
      }
      await sleep(30);
    }
  }
  async click(): Promise<void> {
    return (await this.one("visible")).click();
  }
  async hover(): Promise<void> {
    return (await this.one("visible")).hover();
  }
  async fill(text: string): Promise<void> {
    return (await this.one("visible")).fill(text);
  }
  async type(text: string): Promise<void> {
    return (await this.one("visible")).type(text);
  }
  async press(key: string): Promise<void> {
    return (await this.one("visible")).press(key);
  }
  async focus(): Promise<void> {
    return (await this.one()).focus();
  }
  async innerText(): Promise<string> {
    return (await this.one()).innerText();
  }
  async textContent(): Promise<string | null> {
    return (await this.one()).textContent();
  }
  async innerHTML(): Promise<string> {
    return (await this.one()).innerHTML();
  }
  async inputValue(): Promise<string> {
    return (await this.one()).inputValue();
  }
  async getAttribute(name: string): Promise<string | null> {
    return (await this.one()).getAttribute(name);
  }
  async allInnerTexts(): Promise<string[]> {
    return this.resolve().map((element) => (element as HTMLElement).innerText);
  }
  async allTextContents(): Promise<string[]> {
    return this.resolve().map((element) => element.textContent ?? "");
  }
  async evaluate<T>(fn: (element: Element, arg?: unknown) => T, arg?: unknown): Promise<T> {
    return (await this.one()).evaluate(fn, arg);
  }
  async elementHandle(): Promise<ElementHandle> {
    return this.one();
  }
}

// A request and a response as Playwright hands them to `page.on()`. Only what
// the page fetches is seen: the document of a page load that the test asks
// for, the requests of Next's router and of Server Actions, and a `fetch` of
// the app. Not what the browser loads by itself, like a script or an image.
function lowerCased(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, name) => (record[name.toLowerCase()] = value));
  return record;
}

type SentRequest = { url: string; method: string; headers: Headers; body?: string | null };

class NetworkRequest {
  answer: NetworkResponse | undefined;
  private readonly request: SentRequest;
  private readonly type: "document" | "fetch";

  constructor(request: SentRequest, type: "document" | "fetch") {
    this.request = request;
    this.type = type;
  }
  url = () => this.request.url;
  method = () => this.request.method;
  headers = () => lowerCased(this.request.headers);
  allHeaders = async () => this.headers();
  headerValue = async (name: string) => this.request.headers.get(name);
  postData = () => this.request.body ?? null;
  resourceType = () => this.type;
  isNavigationRequest = () => this.type === "document";
  response = async () => this.answer ?? null;
  failure = () => null;
}

class NetworkResponse {
  private readonly of: NetworkRequest;
  private readonly answer: Response;
  private readonly copy: Response | undefined;

  constructor(of: NetworkRequest, answer: Response, copy: Response | undefined) {
    this.of = of;
    this.answer = answer;
    this.copy = copy;
  }
  url = () => this.answer.url || this.of.url();
  status = () => this.answer.status;
  statusText = () => this.answer.statusText;
  ok = () => this.answer.ok;
  headers = () => lowerCased(this.answer.headers);
  allHeaders = async () => this.headers();
  headerValue = async (name: string) => this.answer.headers.get(name);
  request = () => this.of;
  finished = async () => null;
  body = async () => new Uint8Array(await this.read().arrayBuffer());
  text = async () => this.read().text();
  json = async () => this.read().json() as Promise<unknown>;
  private read(): Response {
    return (
      this.copy ?? unsupported("the body of the document of a page load, in a response listener")
    );
  }
}

type NetworkEvent = "request" | "response";
type NetworkListener = (subject: never) => void;

const browsers = new Set<Browser<unknown>>();
// The requests the page has in flight, for `waitForIdleNetwork()`.
let inFlight = 0;
let lastSettled = performance.now();

function emit(event: NetworkEvent, subject: NetworkRequest | NetworkResponse): void {
  for (const browser of browsers) browser.emit(event, subject);
}
const listening = () => Array.from(browsers).some((browser) => browser.listens());

// After the plugin's own `fetch`, which sends the app's requests to the
// server in the tab: this one only watches.
const pluginFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (!listening()) {
    inFlight++;
    try {
      return await pluginFetch(input, init);
    } finally {
      inFlight--;
      lastSettled = performance.now();
    }
  }
  const sent = new Request(input instanceof Request ? input.clone() : input, init);
  const body =
    sent.method === "GET" || sent.method === "HEAD" ? null : await sent.text().catch(() => null);
  const request = new NetworkRequest(
    { url: sent.url, method: sent.method, headers: sent.headers, body },
    "fetch",
  );
  emit("request", request);
  inFlight++;
  try {
    const response = await pluginFetch(input, init);
    request.answer = new NetworkResponse(request, response, response.clone());
    emit("response", request.answer);
    return response;
  } finally {
    inFlight--;
    lastSettled = performance.now();
  }
};

// A page that the app loads itself: a link or a redirect that Next's router
// does with a page load, which the plugin turns into one of its own. Playwright
// waits for such a load after a click and an `eval`. Here it is over when
// Next's root component says it has hydrated, through the hook Next has for
// its own e2e tests, which the plugin uses for `renderServer()` too.
let loading: Promise<void> | undefined;
let loaded: (() => void) | undefined;
let hydrated: (() => void) | undefined;
Object.defineProperty(globalThis, "__NEXT_HYDRATED_CB", {
  configurable: true,
  get: () => hydrated,
  set(callback: (() => void) | undefined) {
    hydrated =
      callback &&
      (() => {
        callback();
        loaded?.();
      });
  },
});

type NavigateEvent = Event & {
  destination: { url: string; sameDocument: boolean };
  hashChange: boolean;
};
(window as { navigation?: EventTarget }).navigation?.addEventListener(
  "navigate",
  (event) => {
    const { destination, hashChange } = event as NavigateEvent;
    // What the plugin loads a page for: see its own listener.
    if (destination.sameDocument || hashChange || !event.cancelable) return;
    if (new URL(destination.url).origin !== window.location.origin) return;
    loading ??= new Promise<void>((resolve) => {
      // Or not at all, for a page that does not hydrate, like one the plugin
      // could not load.
      const timer = setTimeout(resolve, 10_000);
      loaded = () => {
        clearTimeout(timer);
        resolve();
      };
    }).then(() => {
      loading = loaded = undefined;
    });
  },
  // Before the plugin's listener, which stops the event.
  { capture: true },
);

/** Resolves once no page is loading. */
const pageLoaded = () => loading ?? Promise.resolve();

// A page load starts with an empty `window`, and this tab keeps its own. What
// a test leaves on it through `browser.eval()`, like `window.beforeNav = 1`
// to tell a client-side navigation from a page load, is taken off when the
// plugin loads a page: it gives every page a `<body>` of its own.
const pageGlobals = new Set<string>();
new MutationObserver((records) => {
  const hasNewBody = records.some((record) =>
    Array.from(record.addedNodes).some((node) => node instanceof HTMLBodyElement),
  );
  if (!hasNewBody) return;
  for (const name of pageGlobals) delete (window as unknown as Record<string, unknown>)[name];
  pageGlobals.clear();
}).observe(document.documentElement, { childList: true });

function evaluate(snippet: string | ((...args: unknown[]) => unknown), args: unknown[]): unknown {
  if (typeof snippet === "function") return snippet(...args);
  const before = new Set(Object.keys(window));
  try {
    // As Playwright does: in the global scope, and an expression that is a
    // function is called.
    const value: unknown = (0, eval)(snippet);
    return typeof value === "function"
      ? (value as (...args: unknown[]) => unknown)(...args)
      : value;
  } finally {
    for (const name of Object.keys(window)) if (!before.has(name)) pageGlobals.add(name);
  }
}

type LoadOptions = {
  beforePageLoad?: (page: unknown) => void | Promise<void>;
  extraHTTPHeaders?: Record<string, string>;
  pushErrorAsConsoleLog?: boolean;
};

/** Stands in for the wrapper of `test/lib/browsers/playwright.ts`. */
export class Browser<TCurrent = undefined> {
  private logStart = consoleCapture.length;
  private errors: PageLog[] = [];
  private listeners: Record<NetworkEvent, Set<NetworkListener>> = {
    request: new Set(),
    response: new Set(),
  };
  private headers: Record<string, string> | undefined;
  private leave: (() => Promise<void>) | undefined;
  // The entry of the history that the page was opened in.
  private firstEntry: string | undefined;
  // What the page listens to outside of itself, to stop when it is closed.
  private stops: (() => void)[] = [];

  private onPageError(listener: (error: unknown, message: string) => void): void {
    const onError = (event: ErrorEvent) => listener(event.error, event.message);
    window.addEventListener("error", onError);
    this.stops.push(() => window.removeEventListener("error", onError));
  }
  private stopListening(): void {
    for (const stop of this.stops.splice(0)) stop();
  }

  listens(): boolean {
    return this.listeners.request.size > 0 || this.listeners.response.size > 0;
  }
  emit(event: NetworkEvent, subject: NetworkRequest | NetworkResponse): void {
    for (const listener of this.listeners[event]) listener(subject as never);
  }

  on(event: NetworkEvent, listener: NetworkListener): void {
    if (!(event in this.listeners)) unsupported(`browser.on("${String(event)}")`);
    this.listeners[event].add(listener);
  }
  off(event: NetworkEvent, listener: NetworkListener): void {
    this.listeners[event]?.delete(listener);
  }

  // What `beforePageLoad` gets of Playwright's `Page`.
  private pageFacade(): unknown {
    const facade: Record<string, unknown> = {
      on: (event: string, listener: (subject: never) => void) => {
        if (event === "request" || event === "response") return this.on(event, listener);
        if (event === "console") {
          this.stops.push(
            consoleCapture.listen((chunk, source) =>
              listener({ type: () => source, text: () => chunk.replace(/\n$/, "") } as never),
            ),
          );
          return;
        }
        if (event === "pageerror") return this.onPageError((error) => listener(error as never));
        unsupported(`page.on("${event}") of Playwright, in beforePageLoad`);
      },
      off: (event: NetworkEvent, listener: NetworkListener) => this.off(event, listener),
      url: () => window.location.href,
      evaluate: (snippet: string | ((...args: unknown[]) => unknown), ...args: unknown[]) =>
        evaluate(snippet, args),
      addInitScript: (script: string | (() => unknown) | { content?: string }) => {
        if (typeof script === "object") return evaluate(script.content ?? "", []);
        return evaluate(script, []);
      },
      exposeFunction: (name: string, fn: unknown) => {
        (window as unknown as Record<string, unknown>)[name] = fn;
        pageGlobals.add(name);
      },
    };
    return new Proxy(facade, {
      get: (target, property) =>
        typeof property === "symbol" || property in target || property === "then"
          ? target[property as string]
          : unsupported(`page.${property}() of Playwright, in beforePageLoad`),
    });
  }

  /** Opens a page in a new tab, which here is the page `renderServer()` opens. */
  async loadPage(url: string, options: LoadOptions = {}): Promise<void> {
    // The tab has one page. Opening one closes the page before it, as Next's
    // wrapper does.
    for (const other of browsers) other.stopListening();
    browsers.clear();
    browsers.add(this as Browser<unknown>);
    this.logStart = consoleCapture.length;
    this.errors = [];
    this.headers = options.extraHTTPHeaders;
    if (options.pushErrorAsConsoleLog) {
      this.onPageError((error, message) => {
        this.errors.push({
          source: "error",
          message: String((error as Error | undefined)?.message ?? message),
          args: [],
        });
      });
    }
    await options.beforePageLoad?.(this.pageFacade());
    await this.goto(url);
    this.firstEntry = navigation?.currentEntry.key;
  }

  private async goto(url: string): Promise<void> {
    const target = new URL(url, window.location.origin);
    const request = new NetworkRequest(
      { url: target.href, method: "GET", headers: new Headers(this.headers) },
      "document",
    );
    emit("request", request);
    inFlight++;
    try {
      const { response, unmount } = await renderServer({ url: target.href, headers: this.headers });
      this.leave = unmount;
      request.answer = new NetworkResponse(request, response, undefined);
      emit("response", request.answer);
    } catch (error) {
      // The page went on to another one before it had hydrated: a redirect
      // that Next's router does with a page load. `renderServer()` rejects
      // then. Playwright's `goto` has resolved by then, and the test goes on
      // with the page the tab ends up on.
      if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
      await pageLoaded();
    } finally {
      inFlight--;
      lastSettled = performance.now();
    }
    // Playwright waits for the `load` event and then for Next's hydration
    // hook, from another process. A frame later, here.
    await sleep(50);
  }

  async get(url: string): Promise<void> {
    await this.goto(url);
  }

  async close(): Promise<void> {
    this.stopListening();
    browsers.delete(this as Browser<unknown>);
    await this.leave?.();
    this.leave = undefined;
  }

  back() {
    return this.startChain(() => traverse(-1, this.firstEntry));
  }
  forward() {
    return this.startChain(() => traverse(1, this.firstEntry));
  }
  // A reload is a page load of the URL the tab is at.
  refresh() {
    return this.startChain(() => this.goto(window.location.href));
  }
  clearBrowserCache() {
    return this.startChain(async () => {});
  }
  setDimensions({ width, height }: { width: number; height: number }) {
    return this.startOrPreserveChain(() => vitestPage.viewport(width, height));
  }
  addCookie({ name, value }: { name: string; value: string }) {
    return this.startOrPreserveChain(async () => {
      document.cookie = `${name}=${value}; path=/`;
    });
  }
  deleteCookies() {
    return this.startOrPreserveChain(async () => {
      for (const cookie of document.cookie.split(";")) {
        const name = cookie.split("=")[0]!.trim();
        if (name) document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
      }
    });
  }

  elementByCss(selector: string, options?: ElementByCssOpts) {
    return this.waitForElementByCss(selector, { timeout: 5000, ...options });
  }
  elementByCssInstant(selector: string, options?: ElementByCssOpts) {
    return this.waitForElementByCss(selector, { timeout: 10, waitUntil: false, ...options });
  }
  elementById(id: string) {
    return this.elementByCss(`#${id}`);
  }
  hasElementByCss(selector: string) {
    return this.startChain(async () => {
      const [element] = query(selector);
      return element !== undefined && isVisible(element);
    });
  }
  hasElementByCssSelector(selector: string) {
    return this.eval<boolean>(`!!document.querySelector('${selector}')`);
  }
  elementsByCss(selector: string) {
    return this.startChain(async () =>
      query(selector).map((element) => new ElementHandle(element, selector, "")),
    );
  }
  waitForElementByCss(selector: string, options: number | ElementByCssOpts = {}) {
    const {
      timeout = 10_000,
      // The tags of a `<head>` have no box.
      state = /^(base|link|meta|script|source|style|title)/.test(selector) ? "attached" : "visible",
    } = typeof options === "number" ? { timeout: options } : options;
    const waitUntil = typeof options === "number" ? undefined : options.waitUntil;
    return this.startChain(async () => {
      let element = await waitForSelector(selector, state, timeout);
      // As Next's wrapper does: the page that is loading has to be there. The
      // element can be one of the page that is going.
      if (waitUntil !== false && loading) {
        await pageLoaded();
        element = await waitForSelector(selector, state, timeout);
      }
      // `state: "hidden"` is also met by an element that is not there.
      return new ElementHandle(element ?? document.createElement("missing"), selector);
    });
  }
  waitForCondition(snippet: string, timeout = 10_000) {
    return this.startOrPreserveChain(async () => {
      const started = performance.now();
      while (!(await evaluate(snippet, []))) {
        if (performance.now() - started > timeout)
          throw new Error(`waitForCondition: Timeout ${timeout}ms exceeded.`);
        await sleep(30);
      }
    });
  }

  getValue(this: Browser<ElementHandle>) {
    return this.continueChain((element) => element.inputValue());
  }
  text(this: Browser<ElementHandle>) {
    return this.continueChain((element) => element.innerText());
  }
  type(this: Browser<ElementHandle>, text: string) {
    return this.continueChain(async (element) => {
      await element.type(text);
      return element;
    });
  }
  moveTo(this: Browser<ElementHandle>) {
    return this.continueChain(async (element) => {
      await element.hover();
      return element;
    });
  }
  getComputedCss(this: Browser<ElementHandle>, property: string) {
    return this.continueChain((element) => element.getComputedCss(property));
  }
  getAttribute(this: Browser<ElementHandle>, name: string) {
    return this.continueChain((element) => element.getAttribute(name));
  }
  click(this: Browser<ElementHandle>) {
    return this.continueChain(async (element) => {
      await element.click();
      return element;
    });
  }
  touchStart(this: Browser<ElementHandle>) {
    return this.continueChain(async (element) => {
      await element.dispatchEvent("touchstart");
      return element;
    });
  }
  keydown(key: string) {
    return this.startOrPreserveChain(async () => {
      await userEvent.keyboard(`{${key}>}`);
    });
  }
  keyup(key: string) {
    return this.startOrPreserveChain(async () => {
      await userEvent.keyboard(`{/${key}}`);
    });
  }

  eval<T = unknown>(
    snippet: string | ((...args: never[]) => unknown),
    ...args: unknown[]
  ): Browser<T> & Promise<T> {
    return this.startChain(async () => {
      try {
        return (await evaluate(snippet as never, args)) as T;
      } catch (error) {
        // What Next's wrapper does with an error of the page.
        console.error("eval error:", error);
        return null as T;
      } finally {
        await pageLoaded();
      }
    });
  }

  log(options?: { includeArgs?: boolean }) {
    return this.startChain(async () =>
      [...consoleCapture.logsSince(this.logStart), ...this.errors].map(
        ({ source, message, args }) =>
          options?.includeArgs ? { source, message, args } : { source, message },
      ),
    );
  }
  url() {
    return this.startChain(async () => window.location.href);
  }
  waitForIdleNetwork() {
    return this.startOrPreserveChain(async () => {
      // Playwright's `networkidle`: no request for half a second.
      while (inFlight > 0 || performance.now() - lastSettled < 500) await sleep(50);
    });
  }
  websocketFrames() {
    return this.startChain(() =>
      unsupported("the frames of a websocket: the dev server's HMR socket"),
    );
  }

  locator(selector: string): Locator {
    return new Locator(() => query(selector), selector);
  }
  getByRole(role: string, options?: Record<string, unknown>): Locator {
    const locator = vitestPage.getByRole(role as never, options as never);
    return new Locator(() => locator.elements() as Element[], `role=${role}`);
  }
  // Next's dev overlay does not run here: the app runs as `next start` runs it.
  locateRedbox(): Locator {
    return this.locator('nextjs-portal [aria-labelledby="nextjs__container_errors_label"]');
  }
  locateDevToolsIndicator(): Locator {
    return this.locator("nextjs-portal [data-nextjs-dev-tools-button]");
  }

  // The chain of Next's wrapper: a call returns the browser again, and that
  // browser is also the promise of what the call resolves to.
  private continueChain<TNext>(nextCall: (value: TCurrent) => Promise<TNext>) {
    return this.chain(true, nextCall);
  }
  private startChain<TNext>(nextCall: () => TNext | Promise<TNext>) {
    return this.chain(false, nextCall);
  }
  private startOrPreserveChain(nextCall: () => Promise<unknown>) {
    return this.chain(false, async (value) => {
      await nextCall();
      return value;
    });
  }
  private chain<TNext>(
    mustBeChained: boolean,
    nextCall: (current: TCurrent) => TNext | Promise<TNext>,
  ): Browser<TNext> & Promise<TNext> {
    let current = (this as { promise?: Promise<TCurrent> }).promise;
    if (!current) {
      if (mustBeChained) throw new Error("Expected this call to be chained after a previous call");
      current = Promise.resolve(undefined as TCurrent);
    }
    // A call of Playwright is a round trip to the browser, and React has
    // rendered what was scheduled by the time it gets there.
    const promise = current.then(async (value) => {
      await sleep(0);
      return nextCall(value);
    });
    // A chain that nobody awaits fails in the call after it, not on its own.
    promise.catch(() => {});
    return new Proxy(this, {
      get(target, property) {
        if (property === "promise") return promise;
        if (property === "then") return promise.then.bind(promise);
        if (property === "catch") return promise.catch.bind(promise);
        if (property === "finally") return promise.finally.bind(promise);
        return (target as unknown as Record<string | symbol, unknown>)[property];
      },
    }) as unknown as Browser<TNext> & Promise<TNext>;
  }
}

type NavigationEntry = { key: string; index: number };
const navigation = (
  window as { navigation?: { currentEntry: NavigationEntry; entries(): NavigationEntry[] } }
).navigation;

// A page of Next's tests has a tab of its own, with a history that starts at
// the page. This tab's history has the entries of every test before it, and
// below those the test runner's own: going back that far leaves the test. So
// the page a test opened is as far back as it goes.
async function traverse(delta: number, firstEntry: string | undefined): Promise<void> {
  if (navigation) {
    const entries = navigation.entries();
    const first = entries.find((entry) => entry.key === firstEntry)?.index ?? 0;
    const target = navigation.currentEntry.index + delta;
    if (target < first || target >= entries.length) {
      throw new Error(
        `browser.${delta < 0 ? "back" : "forward"}(): the history of this page has no entry to go to. ` +
          "A page that the app loads itself replaces the entry it was loaded from, where a browser adds one.",
      );
    }
  }
  const moved = new Promise<void>((resolve) => {
    window.addEventListener("popstate", () => resolve(), { once: true });
    setTimeout(resolve, 2000);
  });
  window.history.go(delta);
  await moved;
  await sleep(0);
  await pageLoaded();
}

export type BrowserOptions = LoadOptions & {
  waitHydration?: boolean;
  retryWaitHydration?: boolean;
  disableCache?: boolean;
  disableJavaScript?: boolean;
  disableBrowserLog?: boolean;
  cpuThrottleRate?: number;
  locale?: string;
  userAgent?: string;
  permissions?: string[];
  ignoreHTTPSErrors?: boolean;
  waitUntil?: string;
  baseUrl?: string | number;
};

/** `next.browser(url, options)` and `webdriver(appPort, url, options)`. */
export async function openBrowser(url: string, options: BrowserOptions = {}): Promise<Browser> {
  if (options.disableJavaScript) {
    unsupported("a page with JavaScript off: the test runs in the page's own tab");
  }
  if (options.baseUrl !== undefined) unsupported("a browser on another server than the app's");
  if (options.locale) unsupported("a browser context with another locale");
  if (options.userAgent) unsupported("a browser context with another user agent");
  if (options.permissions) unsupported("a browser context with other permissions");
  if (options.waitHydration === false) {
    unsupported("a page before it has hydrated: renderServer() resolves once it has");
  }
  const browser = new Browser();
  await browser.loadPage(url, options);
  return browser;
}
