import { expect, test, vi } from "vitest";
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
const { checkFetchedModules, checkedVersions, createEnvironmentRunner, preloadModules } =
  await import("./utils.ts");

test("preloads a module and its imports for the runner of the next page load", async () => {
  await preloadModules("next_ssr", "/entry.js");
  // The imports are on their way once the module has come.
  await vi.waitFor(() => expect([...asked].sort()).toEqual(["/a.js", "/b.js", "/entry.js"]));

  const runner = createEnvironmentRunner("next_ssr");
  await runner.import("/entry.js");
  expect(runner.evaluatedModules.getModuleById("/b.js")?.evaluated).toBe(true);
  // From what the tab fetched: the server is asked for none of them again.
  expect(asked).toHaveLength(3);
  await runner.close();
});

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
