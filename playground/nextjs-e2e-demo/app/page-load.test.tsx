import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { expect, test } from "vitest";
import { page } from "vitest/browser";
import { fileChanged } from "../test/service.ts";
import { Counter } from "./components/counter.tsx";

// Every `renderServer()` is a page load, which evaluates the modules of the
// browser layer again. The tab keeps what it fetched from the dev server, as a
// browser keeps what it loaded in its HTTP cache: a suite loads a page for
// every test, and Vite's module runner asks the server for every import of
// every module. That goes for the server layer too, which the tab runs once.

type Asked = { environment: string; url: string };
type Answered = { file: string; code: string };

// What the tab asks the dev server for while `load` runs, for the layers it
// runs through a module runner, and the modules it gets. Read off the
// websocket of the plugin in the tab itself: the modules of a page are
// megabytes, which the browser would send to the test through Vitest
// otherwise.
async function modulesWhile(
  load: () => Promise<unknown>,
): Promise<{ asked: Asked[]; answered: Answered[] }> {
  const asked: Asked[] = [];
  const answered: Answered[] = [];
  const sockets = new Set<WebSocket>();
  const received = ({ data }: MessageEvent) => {
    const fetched = (JSON.parse(String(data)) as { data?: any }).data?.result?.result;
    if (typeof fetched?.code === "string") answered.push(fetched);
  };
  const { send } = WebSocket.prototype;
  WebSocket.prototype.send = function (message) {
    send.call(this, message);
    // Every websocket of the tab sends through here, and only the plugin's
    // sends a request for an environment.
    const data = typeof message === "string" && message.includes('"environment"') ? message : "{}";
    const request = (JSON.parse(data) as { data?: any }).data;
    if (!request?.environment) return;
    if (!sockets.has(this)) this.addEventListener("message", received);
    sockets.add(this);
    if (request.payload?.data?.name !== "fetchModule") return;
    const [url] = request.payload.data.data;
    asked.push({ environment: request.environment, url });
  };
  try {
    await load();
  } finally {
    WebSocket.prototype.send = send;
    for (const socket of sockets) socket.removeEventListener("message", received);
  }
  return { asked, answered };
}

// React hydrates the counter once its module has loaded, which can be after
// the page has: from then on the page asks for no more modules.
async function counted(): Promise<void> {
  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
}

// How many modules the tab asks for, of every layer or of one.
async function modulesFetched(load: () => Promise<unknown>, layer?: string): Promise<number> {
  const { asked } = await modulesWhile(load);
  return asked.filter(({ environment }) => !layer || environment === layer).length;
}

// Before a file changes in this tab: the server layer asks the dev server
// itself from then on.
test("a page that loads again fetches no module again", async () => {
  await renderServer({ url: "/" });
  await counted();

  expect(await modulesFetched(() => renderServer({ url: "/" }))).toBe(0);
  // And the page works.
  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
});

test("a node that renders again fetches no module again", async () => {
  await renderServer(<Counter />);
  await counted();

  expect(await modulesFetched(() => renderServer(<Counter />))).toBe(0);
});

test("fetches the modules again once a file has changed", async () => {
  await renderServer(<Counter />);
  await counted();
  expect(await modulesFetched(() => renderServer(<Counter />))).toBe(0);

  await fileChanged("app/components/counter.tsx");

  const again = async () => {
    await renderServer(<Counter />);
    await counted();
  };
  expect(await modulesFetched(again)).toBeGreaterThan(0);
  // The server layer has modules of before the change, and asks the server
  // about every module from then on.
  expect(await modulesFetched(again, "react_client")).toBe(0);
});

test("the browser layer of a page asks the dev server for a module once", async () => {
  await renderServer({ url: "/" });
  await counted();
  await fileChanged("app/components/counter.tsx");

  const { asked } = await modulesWhile(async () => {
    await renderServer({ url: "/" });
    await counted();
  });

  // Vite's module runner asks for a module for every import of it, and again
  // for every URL it has for the module.
  const urls = asked
    .filter(({ environment }) => environment === "react_client")
    .map(({ url }) => url);
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.filter((url, index) => urls.indexOf(url) !== index)).toEqual([]);
});

test("a dependency comes without its source map, a file of the app with it", async () => {
  await renderServer({ url: "/" });
  await counted();
  await fileChanged("app/components/counter.tsx");

  const { answered } = await modulesWhile(async () => {
    await renderServer({ url: "/" });
    await counted();
  });

  // How Vite marks the source map it puts in a module for a module runner.
  const hasSourceMap = ({ code }: { code: string }) =>
    code.includes("//# sourceMappingSource=vite-generated");
  const dependencies = answered.filter(({ file }) => file.includes("/node_modules/"));
  expect(dependencies.length).toBeGreaterThan(0);
  expect(dependencies.filter(hasSourceMap).map(({ file }) => file)).toEqual([]);
  const counter = answered.filter(({ file }) => file.endsWith("/app/components/counter.tsx"));
  expect(counter.length).toBeGreaterThan(0);
  expect(counter.every(hasSourceMap)).toBe(true);
});

test("Rolldown compiles a pre-bundled dependency, Vite a file of the app", async () => {
  await renderServer({ url: "/" });
  await fileChanged("app/components/counter.tsx");

  const { answered } = await modulesWhile(async () => {
    await renderServer({ url: "/" });
    await counted();
  });

  // How each of the two writes an export for a module runner.
  const byRolldown = ({ code }: { code: string }) =>
    code.includes("Object.defineProperty(__vite_ssr_exports__");
  const byVite = ({ code }: { code: string }) => code.includes("__vite_ssr_exportName__(");
  const preBundled = answered.filter(({ file }) => /\/deps_\w+\//.test(file));
  expect(preBundled.filter(byRolldown).length).toBeGreaterThan(0);
  expect(preBundled.filter(byVite).map(({ file }) => file)).toEqual([]);
  const counter = answered.filter(({ file }) => file.endsWith("/app/components/counter.tsx"));
  expect(counter.length).toBeGreaterThan(0);
  expect(counter.every(byVite)).toBe(true);
});

test("a page has what the server streamed in place before the app starts", async () => {
  await renderServer({ url: "/slow-metadata" });

  // React's scripts in the document put streamed content in place after a
  // frame, or 300 ms after the last time: that was in the page before. An app
  // that starts before that renders the metadata of the page a second time.
  await renderServer({ url: "/slow-metadata" });

  // How React marks content that still waits for that.
  const comments = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
  const waiting: string[] = [];
  while (comments.nextNode()) {
    if ((comments.currentNode as Comment).data === "$~") waiting.push("$~");
  }
  expect(waiting).toEqual([]);
  expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1);
});
