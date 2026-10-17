import { afterEach, beforeEach, expect, test, vi } from "vitest";

// The tab's graph of the browser layer, without a browser: a module runner
// whose `import()` evaluates a file into a new exports object, the
// stylesheets of the dev server, or of a static build, and a document with a
// `<head>`. Each test gets a client-graph.ts of its own, as a tab does.

type FakeLink = {
  rel: string;
  href: string;
  attributes: Set<string>;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  setAttribute(name: string): void;
  remove(): void;
};

const tab = vi.hoisted(() => ({
  /** The URLs the graph evaluated, in order. */
  evaluated: [] as string[],
  /** The stylesheets of a file, by its URL. */
  stylesheets: new Map<string, string[]>(),
  /** The directory of a static build: nothing with a dev server. */
  buildDirectory: undefined as string | undefined,
  /** The client references of the build, by key: the URL of the file each evaluates. */
  references: {} as Record<string, string>,
}));

// A build's stylesheets, by the path of a file of the host from the root.
const built = {
  assetPath: "/_next/",
  routes: {},
  hostFiles: {
    "host/badge.tsx": ["_next/static/css/badge-1a2b3c4d.css"],
    "host/plain.tsx": [],
  },
};

vi.mock("./built-stylesheets.ts", () => ({
  get buildDirectory() {
    return tab.buildDirectory;
  },
  builtStylesheets: async () => built,
}));
vi.mock("../utils.ts", () => ({
  checkFetchedModules: async () => {},
  takeFetchedModules: async () => false,
  askDevServer: async (_event: string, { url }: { url: string }) => tab.stylesheets.get(url) ?? [],
  createEnvironmentRunner: () => ({
    evaluatedModules: {
      idToModuleMap: new Map(),
      getModuleByUrl: () => undefined,
      invalidateModule() {},
    },
    async import(url: string) {
      // The list of a build's references, which evaluates a file by its key.
      if (url === "/built/references.js") {
        const evaluate = (file: string) => async () => {
          tab.evaluated.push(file);
          return { url: file, evaluation: tab.evaluated.length };
        };
        return {
          default: Object.fromEntries(
            Object.entries(tab.references).map(([key, file]) => [key, evaluate(file)]),
          ),
        };
      }
      tab.evaluated.push(url);
      return { url, evaluation: tab.evaluated.length };
    },
  }),
  environmentModule: (_environment: string, id: string) =>
    id === "virtual:vitest-plugin-rsc/client-references" ? "/built/references.js" : id,
}));

const head = new Set<FakeLink>();
const links = () => [...head].map((link) => link.href);

beforeEach(() => {
  vi.resetModules();
  tab.evaluated = [];
  tab.stylesheets = new Map([
    ["/host/badge.tsx", ["/_next/static/css/badge.css"]],
    ["/host/card.tsx", ["/_next/static/css/badge.css", "/_next/static/css/card.css"]],
  ]);
  tab.buildDirectory = undefined;
  tab.references = {};
  head.clear();
  vi.stubGlobal("__viteRscCallServer", undefined);
  vi.stubGlobal("document", {
    createElement: (): FakeLink => ({
      rel: "",
      href: "",
      attributes: new Set(),
      onload: null,
      onerror: null,
      setAttribute(name) {
        this.attributes.add(name);
      },
      remove() {
        head.delete(this);
      },
    }),
    head: {
      append(link: FakeLink) {
        head.add(link);
        queueMicrotask(() => link.onload?.());
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const graph = () => import("./client-graph.ts");

// What Vite RSC makes of a file with `"use client"` in the rsc layer: a
// reference for each export, see client-reference.test.ts. A new import of
// the file, after it changed, is a new module.
const referenceModule = (key: string, ...names: string[]): object =>
  Object.fromEntries(
    names.map((name) => [
      name,
      Object.defineProperties(() => {}, {
        $$typeof: { value: Symbol.for("react.client.reference") },
        $$id: { value: `${key}#${name}` },
      }),
    ]),
  );

// The host imports a file of its own with `"use client"`: the prefix of its
// reference module evaluates it in the graph as it loads.
async function importHostFile(key: string, ...names: string[]) {
  const { loadClientFile } = await graph();
  await loadClientFile(key);
  return referenceModule(key, ...names);
}

test("gives the evaluation that the reference module made as it loaded", async () => {
  const { loadClientModule } = await graph();
  const reference = await importHostFile("/host/badge.tsx", "Badge");

  // Asked for twice at once, before the module is bound to its exports.
  const [first, second] = await Promise.all([
    loadClientModule(reference),
    loadClientModule(reference),
  ]);

  expect(first).toEqual({ url: "/host/badge.tsx", evaluation: 1 });
  expect(second).toBe(first);
  // And the same object later, from the one evaluation: as the module loaded.
  expect(await loadClientModule(reference)).toBe(first);
  expect(tab.evaluated).toEqual(["/host/badge.tsx"]);
});

test("binds a new reference module of the file to the evaluation it made", async () => {
  const { loadClientModule } = await graph();
  const before = await importHostFile("/host/badge.tsx", "Badge");
  const old = await loadClientModule(before);

  // The file changed, and the host imports it again: a new module, whose
  // prefix evaluated the file again.
  const after = await importHostFile("/host/badge.tsx", "Badge");

  expect(await loadClientModule(after)).toEqual({ url: "/host/badge.tsx", evaluation: 2 });
  // The module of before keeps its own.
  expect(await loadClientModule(before)).toBe(old);
  expect(tab.evaluated).toEqual(["/host/badge.tsx", "/host/badge.tsx"]);
});

test("links each stylesheet once for the tab, until Vitest's setup file takes them", async () => {
  const { unlinkClientStylesheets } = await graph();
  await importHostFile("/host/badge.tsx", "Badge");
  await importHostFile("/host/badge.tsx", "Badge");
  await importHostFile("/host/card.tsx", "Card");

  expect(links()).toEqual(["/_next/static/css/badge.css", "/_next/static/css/card.css"]);
  // Marked as the tab's, which a page that is left leaves: see document.ts.
  for (const link of head) expect(link.attributes).toContain("data-vitest-plugin-rsc-graph");

  unlinkClientStylesheets();
  expect(links()).toEqual([]);
  await importHostFile("/host/badge.tsx", "Badge");
  expect(links()).toEqual(["/_next/static/css/badge.css"]);
});

test("gives any other module as it is", async () => {
  const { loadClientModule } = await graph();
  const reference = { renderGreeting() {} };

  expect(await loadClientModule(reference)).toBe(reference);
  expect(tab.evaluated).toEqual([]);
});

test("rejects for a file with `use client` that is not the host's", async () => {
  const { loadClientFile, loadClientModule } = await graph();
  // The app's own: no prefix evaluated it.
  const reference = referenceModule("/app/components/counter.tsx", "Counter");

  await expect(loadClientModule(reference)).rejects.toThrow(
    '/app/components/counter.tsx has "use client" and is not a file of the host',
  );
  // Which says what the key is, as a build's is a hash.
  await expect(loadClientModule(reference)).rejects.toThrow(
    "is the reference key that Vite RSC gives the file: its URL with a dev server, and in a " +
      "static build a hash of the file",
  );
  await expect(loadClientModule(reference)).rejects.toThrow("host.files of vitestPluginNext()");
  // Nothing is kept of it: once the file has been evaluated, the module has it.
  await loadClientFile("/app/components/counter.tsx");
  expect(await loadClientModule(reference)).toEqual({
    url: "/app/components/counter.tsx",
    evaluation: 1,
  });
});

// A static build has no dev server: the graph evaluates a file by its key,
// from the list of the browser layer's references, and links the stylesheets
// that the build has for it, by its path from the root of the project.
test("loads a file of the host in a static build, by its key", async () => {
  tab.buildDirectory = "https://site.test/docs/";
  tab.references = { "5f3a9c1e": "/vitest-plugin-rsc/react_client/assets/badge.js" };
  const { loadClientFile, loadClientModule } = await graph();

  await loadClientFile("5f3a9c1e", "host/badge.tsx");

  expect(tab.evaluated).toEqual(["/vitest-plugin-rsc/react_client/assets/badge.js"]);
  expect(await loadClientModule(referenceModule("5f3a9c1e", "Badge"))).toEqual({
    url: "/vitest-plugin-rsc/react_client/assets/badge.js",
    evaluation: 1,
  });
  // A file of the build, wherever the build is served.
  expect(links()).toEqual(["https://site.test/docs/_next/static/css/badge-1a2b3c4d.css"]);
  // One without any, and a key the build has no reference for.
  await loadClientFile("5f3a9c1e", "host/plain.tsx");
  expect(links()).toHaveLength(1);
  await expect(loadClientFile("0000", "host/badge.tsx")).rejects.toThrow(
    'vitest-plugin-rsc: the build has no Client Component "0000"',
  );
});

test("has a Server Action say that it needs a page of the app, from the start", async () => {
  const { callServerWithoutPage } = await graph();

  expect(globalThis.__viteRscCallServer).toBe(callServerWithoutPage);
  await expect(callServerWithoutPage("/app/actions.ts#like")).rejects.toThrow(
    "a component called the Server Action like, and no page of the app is open",
  );
});

test("keeps the Server Actions of a page that is open while a file loads", async () => {
  await importHostFile("/host/badge.tsx", "Badge");
  // A page opens, with Next's own: see client.tsx.
  const ofThePage = async () => {};
  globalThis.__viteRscCallServer = ofThePage;

  await importHostFile("/host/card.tsx", "Card");

  expect(globalThis.__viteRscCallServer).toBe(ofThePage);
});
