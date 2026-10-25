import { expect, test, vi } from "vitest";
import { timersKey } from "./timers.ts";
import { answerEvent, invokeEvent, modulesChangedEvent, versionEvent } from "./websocket-bridge.ts";

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
// The environments the page asked the version of.
const versionsAsked: string[] = [];

type Message = {
  event: string;
  data: { id: string; environment?: string; payload?: { data: { name: string; data: [string] } } };
};
function answer({ event, data }: Message): unknown {
  if (event === versionEvent) {
    versionsAsked.push(data.environment!);
    return versions.get(data.environment!) ?? 1;
  }
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

const sockets = new Set<Socket>();
class Socket extends EventTarget {
  static readonly OPEN = 1;
  readyState = 0;
  constructor() {
    super();
    sockets.add(this);
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
// The server changes the modules of an environment, and tells the page.
function change(environment: string, version: number) {
  versions.set(environment, version);
  const data = JSON.stringify({
    type: "custom",
    event: modulesChangedEvent,
    data: { environment, version },
  });
  for (const socket of sockets) socket.dispatchEvent(new MessageEvent("message", { data }));
}

vi.stubGlobal("WebSocket", Socket);
vi.stubGlobal("dispatchEvent", () => true);
vi.stubGlobal("window", { location: new URL("http://localhost:63315/") });
vi.stubGlobal("fetch", async () => Response.json({ token: "t", path: "/socket" }));
const {
  checkFetchedModules,
  createEnvironmentRunner,
  forgetHeardVersions,
  modulesChanged,
  versionsOfAnswers,
} = await import("./utils.ts");

test("asks for the versions of the modules once, and then hears of a change from the server", async () => {
  const first = await checkFetchedModules();
  expect(first).toContain("client:1");
  expect(first).toContain("react_client:1");
  expect(versionsAsked.sort()).toEqual(["client", "react_client"]);

  versionsAsked.length = 0;
  expect(await checkFetchedModules()).toBe(first);
  expect(await versionsOfAnswers()).toBe("client:1 react_client:1");
  change("client", 2);
  const now = await checkFetchedModules();
  expect(now).toContain("client:2");
  expect(versionsAsked).toEqual([]);
  expect(modulesChanged(first, now)).toBe(true);
  expect(modulesChanged(now, `${now} ssr:1`)).toBe(false);

  // As a test file ends: the next check asks the server.
  forgetHeardVersions();
  expect(await checkFetchedModules()).toBe(now);
  expect(versionsAsked.sort()).toEqual(["client", "react_client"]);
});

test("fetches the modules of a page load again after a change, also one that came during a load", async () => {
  await checkFetchedModules();
  await createEnvironmentRunner("react_client").import("/entry.js");
  asked.length = 0;
  await createEnvironmentRunner("react_client").import("/entry.js");
  expect(asked).toEqual([]);

  // During a load: its runner has the modules of before.
  const during = createEnvironmentRunner("react_client");
  const loading = during.import("/entry.js");
  change("react_client", 3);
  await loading;
  asked.length = 0;
  await checkFetchedModules();
  await createEnvironmentRunner("react_client").import("/entry.js");
  expect(asked.sort()).toEqual(["/a.js", "/b.js", "/entry.js"]);
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
