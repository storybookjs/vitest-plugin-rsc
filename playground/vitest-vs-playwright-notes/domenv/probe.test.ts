// What each environment does with the APIs that Next's app router, React,
// Testing Library, user-event and the plugin use. Prints one JSON line.
import { screen } from "@testing-library/dom";
import { userEvent } from "@testing-library/user-event";
import { inject, test } from "vitest";

const env = inject("envName");
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const within = <T>(p: Promise<T>, ms = 500) =>
  Promise.race([p, tick(ms).then(() => "TIMEOUT" as const)]);

test("probe", async () => {
  const out: Record<string, unknown> = {};
  const probe = async (k: string, f: () => unknown) => {
    try {
      out[k] = await f();
    } catch (e) {
      out[k] = `THROWS ${(e as Error)?.name}: ${String((e as Error)?.message).slice(0, 90)}`;
    }
  };
  const errors: string[] = [];
  const onError = (e: ErrorEvent) => errors.push(String(e.message ?? e.error));
  window.addEventListener("error", onError);
  document.body.innerHTML = `
    <style>.gone{display:none} .invisible{visibility:hidden} html{scroll-padding-top:10px}</style>
    <div id="box" style="height:50px;width:100px;padding:5px">box</div>
    <div style="height:5000px">spacer</div>
    <p id="far">far below</p>
    <button class="gone">Hidden by class</button>
    <div class="invisible"><button>Invisible child</button></div>
    <form id="f" action="/submit"><input name="a" value="1"><button name="who" value="me" type="submit">Go</button></form>
    <dialog id="dlg"><button>In dialog</button></dialog>
    <div id="pop" popover>popover</div>
    <a id="lnk" href="/elsewhere">link</a>`;
  const box = document.getElementById("box")!;
  // Layout
  await probe("clientHeight of a 50px div", () => box.clientHeight);
  await probe("documentElement.clientHeight", () => document.documentElement.clientHeight);
  await probe("getBoundingClientRect().height", () => box.getBoundingClientRect().height);
  await probe("getClientRects().length", () => box.getClientRects().length);
  await probe("typeof scrollIntoView", () => typeof box.scrollIntoView);
  await probe("scrollIntoView moves scrollY", () => {
    document.getElementById("far")!.scrollIntoView();
    return window.scrollY > 0 || document.documentElement.scrollTop > 0;
  });
  await probe("scrollTop = 0 assignable", () => {
    document.documentElement.scrollTop = 0;
    return document.documentElement.scrollTop;
  });
  await probe("getComputedStyle scrollPaddingTop", () => getComputedStyle(document.documentElement).scrollPaddingTop);
  await probe("getComputedStyle display from <style> class", () => getComputedStyle(document.querySelector(".gone")!).display);
  await probe("getComputedStyle visibility inherited", () => getComputedStyle(document.querySelector(".invisible button")!).visibility);
  await probe("getComputedStyle height", () => getComputedStyle(box).height);
  await probe("getByRole excludes display:none (class)", () => screen.queryByRole("button", { name: "Hidden by class" }) === null);
  await probe("getByRole excludes visibility:hidden (inherited)", () => screen.queryByRole("button", { name: "Invisible child" }) === null);
  await probe("checkVisibility", () => typeof box.checkVisibility === "function" ? (document.querySelector(".gone") as HTMLElement).checkVisibility() : "absent");
  await probe("IntersectionObserver", () => typeof IntersectionObserver);
  await probe("ResizeObserver", () => typeof ResizeObserver);
  await probe("matchMedia('(min-width: 1px)')", () => typeof matchMedia === "function" ? matchMedia("(min-width: 1px)").matches : "absent");
  await probe("innerWidth x innerHeight", () => `${innerWidth}x${innerHeight}`);
  // History, location, navigation
  const start = location.href;
  await probe("history.pushState updates location", () => {
    history.pushState({ n: 1, d: new Date(0) }, "", "/pushed?x=1");
    return location.pathname + location.search;
  });
  await probe("history.state is a structured clone", () => {
    const s = history.state as { d: unknown };
    return s?.d instanceof Date;
  });
  await probe("history.back fires popstate", async () => {
    const p = new Promise((r) => window.addEventListener("popstate", () => r(location.pathname), { once: true }));
    history.back();
    return within(p);
  });
  await probe("Navigation API (window.navigation)", () => typeof (window as { navigation?: unknown }).navigation);
  await probe("location.assign('/x') changes URL", async () => {
    if (env === "browser") return "SKIPPED: would unload the tester (a browser navigates)";
    try { location.assign("/assigned"); } catch (e) { return `THROWS ${(e as Error).message.slice(0, 60)}`; }
    await tick(50);
    return location.pathname;
  });
  history.replaceState(null, "", start);
  // fetch & streams
  await probe("fetch relative URL", async () => {
    const r = await within(fetch("/__vitest_probe_404__").then((x) => x.status), 3000);
    return r;
  });
  await probe("TextDecoderStream", async () => {
    const s = new Response("héllo").body!.pipeThrough(new TextDecoderStream());
    let t = "";
    for await (const c of s as unknown as AsyncIterable<string>) t += c;
    return t;
  });
  await probe("CompressionStream", () => typeof CompressionStream);
  await probe("Response keeps set-cookie", () => new Response("", { headers: { "set-cookie": "a=1" } }).headers.get("set-cookie"));
  await probe("Request keeps cookie header", () => new Request("http://localhost/", { headers: { cookie: "a=1" } }).headers.get("cookie"));
  await probe("Request with stream body + duplex", () => {
    const r = new Request("http://localhost/", { method: "POST", body: new ReadableStream(), duplex: "half" } as RequestInit);
    return r.body instanceof ReadableStream;
  });
  await probe("Response(FormData of form).text() works", async () => {
    const fd = new FormData(document.getElementById("f") as HTMLFormElement);
    return (await new Response(fd).text()).includes('name="a"');
  });
  await probe("structuredClone(Map, Date)", () => {
    const c = structuredClone({ m: new Map([[1, 2]]), d: new Date(0) });
    return c.m instanceof Map && c.d instanceof Date;
  });
  await probe("WebAssembly.compileStreaming", () => typeof WebAssembly.compileStreaming);
  await probe("crypto.subtle.digest", async () => {
    const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("x"));
    return d.byteLength;
  });
  await probe("crypto.randomUUID", () => typeof crypto.randomUUID());
  // Event loop
  await probe("typeof setImmediate (React scheduler picks it)", () => typeof (globalThis as { setImmediate?: unknown }).setImmediate);
  await probe("MessageChannel delivers", async () => {
    const c = new MessageChannel();
    const p = new Promise((r) => (c.port1.onmessage = () => r("ok")));
    c.port2.postMessage(1);
    return within(p);
  });
  await probe("requestAnimationFrame fires (ms)", async () => {
    if (typeof requestAnimationFrame !== "function") return "absent";
    const t = performance.now();
    await within(new Promise((r) => requestAnimationFrame(r)));
    return Math.round(performance.now() - t);
  });
  await probe("requestIdleCallback", () => typeof (globalThis as { requestIdleCallback?: unknown }).requestIdleCallback);
  await probe("performance.now resolution (min nonzero delta, us)", () => {
    let min = Infinity;
    for (let i = 0; i < 20000; i++) {
      const a = performance.now(), b = performance.now();
      if (b > a) min = Math.min(min, b - a);
    }
    return Math.round(min * 1000 * 100) / 100;
  });
  // Focus
  const input = document.querySelector("input")!;
  await probe("focus() sets activeElement", () => { input.focus(); return document.activeElement === input; });
  await probe("focus() of hidden button ignored", () => {
    const b = document.querySelector<HTMLButtonElement>(".gone")!;
    b.focus();
    return document.activeElement !== b;
  });
  await probe("document.hasFocus()", () => document.hasFocus());
  await probe(":focus-visible after keyboard", async () => {
    await userEvent.setup().tab();
    try { return document.activeElement?.matches(":focus-visible") ?? false; } catch (e) { return `THROWS ${(e as Error).message.slice(0, 50)}`; }
  });
  // Forms
  const form = document.getElementById("f") as HTMLFormElement;
  let submitter: unknown = "none";
  let defaultPrevented = false;
  form.addEventListener("submit", (e) => {
    submitter = (e as SubmitEvent).submitter?.getAttribute("name") ?? null;
    defaultPrevented = true;
    e.preventDefault();
  });
  await probe("requestSubmit(submitter) fires submit with submitter", () => {
    form.requestSubmit(form.querySelector("button")!);
    return submitter;
  });
  await probe("SubmitEvent", () => typeof SubmitEvent);
  await probe("new FormData(form, submitter) has submitter", () => {
    const fd = new FormData(form, form.querySelector("button")!);
    return fd.get("who");
  });
  await probe("click on submit button submits", async () => {
    submitter = "none";
    await userEvent.setup().click(screen.getByRole("button", { name: "Go" }));
    return submitter;
  });
  await probe("submit without preventDefault navigates", async () => {
    if (env === "browser") return "SKIPPED: would unload the tester (a browser navigates)";
    const f2 = document.createElement("form");
    f2.action = "/posted";
    document.body.append(f2);
    const before = location.href;
    try { f2.requestSubmit(); } catch (e) { return `THROWS ${(e as Error).message.slice(0, 60)}`; }
    await tick(50);
    return location.href === before ? "no navigation" : location.href;
  });
  void defaultPrevented;
  // Cookies
  await probe("document.cookie round trip", () => { document.cookie = "probe=1; path=/"; return document.cookie.includes("probe=1"); });
  await probe("cookieStore", () => typeof (globalThis as { cookieStore?: unknown }).cookieStore);
  // dialog, popover
  const dlg = document.getElementById("dlg") as HTMLDialogElement;
  await probe("dialog.showModal", () => { if (typeof dlg.showModal !== "function") return "absent"; dlg.showModal(); return dlg.open && dlg.matches(":modal"); });
  await probe("modal dialog makes outside inert for role queries", () => screen.queryByRole("button", { name: "Go" }) === null);
  await probe("dialog close event", async () => {
    if (typeof dlg.close !== "function") return "absent";
    const p = new Promise((r) => dlg.addEventListener("close", () => r("fired"), { once: true }));
    dlg.close();
    return within(p);
  });
  const pop = document.getElementById("pop") as HTMLElement & { showPopover?: () => void };
  await probe("popover showPopover + :popover-open", () => { if (typeof pop.showPopover !== "function") return "absent"; pop.showPopover(); return pop.matches(":popover-open"); });
  // What the plugin uses
  await probe("DOMParser text/html", () => new DOMParser().parseFromString("<!doctype html><title>t</title><p>x", "text/html").title);
  await probe("adoptedStyleSheets + new CSSStyleSheet", () => { const s = new CSSStyleSheet(); s.replaceSync("p{color:red}"); document.adoptedStyleSheets = [s]; return document.adoptedStyleSheets.length; });
  await probe("indirect eval sees document", () => (0, eval)("typeof document"));
  await probe("document.startViewTransition", () => typeof (document as { startViewTransition?: unknown }).startViewTransition);
  await probe("navigator.userAgent", () => navigator.userAgent.slice(0, 60));
  await probe("click on <a href> navigates", async () => {
    if (env === "browser") return "SKIPPED: would unload the tester (a browser navigates)";
    const before = location.href;
    document.getElementById("lnk")!.click();
    await tick(50);
    return location.href === before ? "no navigation" : location.href;
  });
  await probe("<link rel=stylesheet> fires load or error", async () => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/__probe_missing__.css";
    const p = new Promise((r) => {
      link.addEventListener("load", () => r("load"), { once: true });
      link.addEventListener("error", () => r("error"), { once: true });
    });
    document.head.append(link);
    return within(p, 2000);
  });
  await probe("document.defaultView === globalThis", () => document.defaultView === (globalThis as unknown));
  await probe("script of a DOMParser doc moved into document runs", async () => {
    const doc = new DOMParser().parseFromString("<p>x<script>window.__probeMoved = 1</script>", "text/html");
    for (const n of Array.from(doc.body.childNodes)) document.body.append(n);
    await tick(10);
    return { onGlobal: (globalThis as { __probeMoved?: number }).__probeMoved ?? null, onDefaultView: (document.defaultView as unknown as { __probeMoved?: number }).__probeMoved ?? null };
  });
  await probe("created <script> runs, global visible to test code", async () => {
    const sc = document.createElement("script");
    sc.textContent = "self.__probeCreated = 2";
    document.body.append(sc);
    await tick(10);
    return { onGlobal: (globalThis as { __probeCreated?: number }).__probeCreated ?? null, onDefaultView: (document.defaultView as unknown as { __probeCreated?: number }).__probeCreated ?? null };
  });
  out["window errors"] = errors.slice(0, 5);
  window.removeEventListener("error", onError);
  console.log("DOMENV_PROBE " + JSON.stringify({ env, out }));
});
