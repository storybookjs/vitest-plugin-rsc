import { expect, test, vi } from "vitest";
import { timersKey } from "./timers.ts";
import { answerEvent, invokeEvent, versionEvent } from "./websocket-bridge.ts";

// The page's runners of a dev server's environment, without a browser: a
// socket whose server answers every module from `graph`, with what it
// imports, as `describeModule()` in index.ts does, and counts what it is
// asked for.

vi.mock("virtual:vitest-plugin-rsc/host-modules", () => ({ default: undefined }));
vi.mock("virtual:vitest-plugin-rsc/layers", () => ({ default: undefined }));
vi.mock("virtual:vitest-plugin-rsc/vite-client", () => ({}));

const graph: Record<string, string[]> = {
  "/entry.js": ["/a.js", "/b.js"],
  "/a.js": ["/b.js"],
  "/b.js": [],
  "/dir/meta.js": [],
};
// A module's own code, after its imports.
const ownCode: Record<string, string> = {
  "/dir/meta.js": "__vite_ssr_exportName__('meta', () => __vite_ssr_import_meta__);",
};
const asked: string[] = [];
// The version of the modules of each environment, by its name.
const versions = new Map<string, number>();

type Message = {
  event: string;
  data: { id: string; environment?: string; payload?: { data: { name: string; data: [string] } } };
};
function answer({ event, data }: Message): unknown {
  if (event === versionEvent) return versions.get(data.environment!) ?? 1;
  if (event !== invokeEvent) throw new Error(`no answer for ${event}`);
  const { name, data: args } = data.payload!.data;
  if (name === "getBuiltins") return { result: [] };
  const [url] = args;
  asked.push(url);
  const code = graph[url]!.map(
    (imported) => `await __vite_ssr_import__(${JSON.stringify(imported)});`,
  );
  if (ownCode[url]) code.push(ownCode[url]);
  return {
    result: { id: url, url, file: url, code: code.join("\n"), invalidate: false },
    imports: graph[url],
  };
}

class Socket extends EventTarget {
  static readonly OPEN = 1;
  readyState = 0;
  constructor() {
    super();
    setTimeout(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    });
  }
  send(raw: string) {
    const message = JSON.parse(raw) as Message;
    const result = answer(message);
    setTimeout(() => {
      const data = JSON.stringify({
        type: "custom",
        event: answerEvent,
        data: { id: message.data.id, result },
      });
      this.dispatchEvent(new MessageEvent("message", { data }));
    });
  }
}
vi.stubGlobal("WebSocket", Socket);
vi.stubGlobal("window", { location: new URL("http://localhost:63315/") });
vi.stubGlobal("fetch", async () => Response.json({ token: "t", path: "/socket" }));
const { checkFetchedModules, checkedVersions, createEnvironmentRunner } =
  await import("./utils.ts");

test("checks the versions of the modules the page keeps answers about before a page load", async () => {
  const first = await checkedVersions();
  expect(first).toContain("client:1");
  expect(first).toContain("react_client:1");
  // Kept until the next check.
  versions.set("client", 2);
  expect(await checkedVersions()).toBe(first);
  await checkFetchedModules();
  expect(await checkedVersions()).not.toBe(first);
  expect(await checkedVersions()).toContain("client:2");
});

test("gives a module of every page load an import.meta of its own, which says where its file is", async () => {
  type Meta = { meta: ImportMeta & Record<string, unknown> };
  const [first, second] = await Promise.all(
    [createEnvironmentRunner("client"), createEnvironmentRunner("client")].map((runner) =>
      runner.import<Meta>("/dir/meta.js"),
    ),
  );
  expect(first!.meta).not.toBe(second!.meta);
  // The timers of its own page, which stop once that page is left.
  expect(first!.meta[timersKey]).not.toBe(second!.meta[timersKey]);
  for (const { meta } of [first!, second!]) {
    expect(meta).toMatchObject({
      url: "file:///dir/meta.js",
      filename: "/dir/meta.js",
      dirname: "/dir",
    });
  }
  // What one page sets on it is not the next one's.
  first!.meta.set = true;
  expect(second!.meta.set).toBeUndefined();
});
