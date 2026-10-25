import { expect, test, vi } from "vitest";
import { invokeEvent, modulesChangedEvent, versionEvent } from "./page-protocol.ts";
import type { PageNews } from "./page-host.ts";
import { timersKey } from "./timers.ts";

// The page's runners and checks of a dev server's modules, without a browser:
// a host of the page whose server answers every module from `graph`, with what
// it imports, as `describeModule()` in index.ts does, and the version of the
// modules of each environment, as `versionOf()` in module-versions.ts does,
// and tells the page of a change of them. The questions and the news go
// through the host, so they are the same in a browser and in Node.js.

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

type Question = { environment: string; payload?: { data: { name: string; data: [string] } } };
function answer(event: string, { environment, payload }: Question): unknown {
  if (event === versionEvent) {
    versionsAsked.push(environment);
    return versions.get(environment) ?? 1;
  }
  if (event !== invokeEvent) throw new Error(`no answer for ${event}`);
  const { name, data: args } = payload!.data;
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

// What the page listens to the host with.
let news: PageNews | undefined;
// The server changes the modules of an environment, and tells the page. The
// tests share the page's state, in order: the versions it heard of.
function change(environment: string, version: number) {
  versions.set(environment, version);
  news!.heard(modulesChangedEvent, { environment, version });
}

vi.mock("virtual:vitest-plugin-rsc/host-modules", () => ({ default: undefined }));
vi.mock("virtual:vitest-plugin-rsc/layers", () => ({ default: undefined }));
vi.mock("virtual:vitest-plugin-rsc/vite-client", () => ({}));
vi.mock("virtual:vitest-plugin-rsc/page-host", () => ({
  default: {
    // An answer comes in a task of its own, as over a socket: news can come
    // while it is on its way.
    request: (event: string, data: Question) => {
      const result = answer(event, data);
      return new Promise((resolve) => setTimeout(() => resolve(result)));
    },
    listen: (listener: PageNews) => (news = listener),
    // One realm, as in a browser.
    compileInPage: (params: string[], body: string) =>
      new (async function () {}.constructor as FunctionConstructor)(...params, body),
  },
}));

const {
  checkFetchedModules,
  createEnvironmentRunner,
  forgetHeardVersions,
  versionOfModules,
  versionsOfAnswers,
} = await import("./utils.ts");

test("asks for the versions of the modules once, and then hears of a change from the server", async () => {
  await checkFetchedModules();
  expect(await versionsOfAnswers()).toBe("client:1 react_client:1");
  expect(versionsAsked.sort()).toEqual(["client", "react_client"]);

  versionsAsked.length = 0;
  await checkFetchedModules();
  change("client", 2);
  expect(await versionsOfAnswers()).toBe("client:2 react_client:1");
  expect(versionsAsked).toEqual([]);

  // As a test file ends: the next check asks the server, also for a version
  // it heard of since.
  forgetHeardVersions();
  change("react_client", 2);
  await checkFetchedModules();
  expect(versionsAsked.sort()).toEqual(["client", "react_client"]);

  // An answer that was on its way as the file ended counts for the file before.
  versionsAsked.length = 0;
  forgetHeardVersions();
  const before = versionOfModules("client");
  forgetHeardVersions();
  await before;
  await versionOfModules("client");
  expect(versionsAsked).toEqual(["client", "client"]);
});

test("asks once for an environment, however many ask meanwhile", async () => {
  forgetHeardVersions();
  versionsAsked.length = 0;
  await Promise.all([
    versionOfModules("client"),
    versionOfModules("client"),
    checkFetchedModules(),
  ]);
  expect(versionsAsked.sort()).toEqual(["client", "react_client"]);
});

test("asks again once its host may have missed a change, like when its socket closed", async () => {
  await checkFetchedModules();
  versionsAsked.length = 0;
  news!.missed();
  await checkFetchedModules();
  expect(versionsAsked.sort()).toEqual(["client", "react_client"]);
});

// After the tests before: the page has asked for the versions, and heard of
// changes since.
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
