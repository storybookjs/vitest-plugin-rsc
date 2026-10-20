import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { clientFileKeyExport } from "./client-file-key.ts";

// The tab's graph of the browser layer, without a browser: a module runner
// whose `import()` evaluates a file into a new exports object, which it keeps
// until the file is invalidated, the stylesheets of the dev server, or of a
// static build, and a document with a `<head>`. Each test gets a
// client-graph.ts of its own, as a tab does.

type FakeLink = {
  rel: string;
  href: string;
  attributes: Map<string, string>;
  onload: (() => void) | null;
  onerror: (() => void) | null;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
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
  /** The URLs of the modules that Vite invalidated since the graph last asked. */
  changed: [] as string[],
  /** What the answer to the graph's next question of what changed waits for. */
  answered: undefined as Promise<void> | undefined,
  /** The URLs that a file imports, by its URL. */
  imports: new Map<string, string[]>(),
  /** The URLs of the files whose evaluation throws. */
  failing: new Set<string>(),
  /** Whether a stylesheet that is linked loads, as the browser fetches it. */
  loads: true,
}));

// A build's stylesheets, by the path of a file of the host from the root.
const built = {
  assetPath: "/_next/",
  routes: {},
  hostFiles: {
    "host/badge.tsx": ["_next/static/css/badge-1a2b3c4d.css"],
    "host/plain.tsx": [],
    // A file of the host without "use client", which renders a node.
    "host/node.tsx": ["_next/static/css/note-5e6f7a8b.css"],
  },
  clientFiles: ["host/badge.tsx", "host/plain.tsx"],
};

vi.mock("./built-files.ts", () => ({
  get buildDirectory() {
    return tab.buildDirectory;
  },
  builtFiles: async () => built,
}));
type FakeModule = {
  id: string;
  url: string;
  file: null;
  importers: Set<string>;
  exports?: Promise<object>;
};

vi.mock("../utils.ts", () => ({
  checkFetchedModules: async () => {},
  takeChangedModules: async () => {
    const { changed, answered } = tab;
    tab.changed = [];
    tab.answered = undefined;
    await answered;
    return changed;
  },
  askDevServer: async (_event: string, { hostFiles }: { hostFiles: string[] }) => [
    ...new Set(hostFiles.flatMap((file) => tab.stylesheets.get(file) ?? [])),
  ],
  createEnvironmentRunner: () => {
    const idToModuleMap = new Map<string, FakeModule>();
    return {
      evaluatedModules: {
        idToModuleMap,
        getModuleById: (id: string) => idToModuleMap.get(id),
        getModuleByUrl: (url: string) => idToModuleMap.get(url),
        invalidateModule(node: FakeModule) {
          node.exports = undefined;
        },
      },
      import: (url: string) => importInto(idToModuleMap, url),
    };
  },
  environmentModule: (_environment: string, id: string) =>
    id === "virtual:vitest-plugin-rsc/client-references" ? "/built/references.js" : id,
}));

// What the runner's `import()` does: the module as it was evaluated, also an
// evaluation that threw, or a new evaluation once it was invalidated. The
// list of a build's references imports a file by its key, as a module of the
// runner.
function importInto(
  modules: Map<string, FakeModule>,
  url: string,
  importer?: string,
): Promise<object> {
  const node = modules.get(url) ?? { id: url, url, file: null, importers: new Set() };
  modules.set(url, node);
  if (importer) node.importers.add(importer);
  node.exports ??= evaluate(modules, url);
  return node.exports;
}

async function evaluate(modules: Map<string, FakeModule>, url: string): Promise<object> {
  if (url === "/built/references.js") {
    const list = Object.entries(tab.references).map(([key, file]) => [
      key,
      () => importInto(modules, file),
    ]);
    return { default: Object.fromEntries(list) };
  }
  const imports = await Promise.all(
    (tab.imports.get(url) ?? []).map((imported) => importInto(modules, imported, url)),
  );
  tab.evaluated.push(url);
  if (tab.failing.has(url)) throw new Error(`${url} failed`);
  const evaluation = { url, evaluation: tab.evaluated.length };
  return imports.length > 0 ? { ...evaluation, imports } : evaluation;
}

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
  tab.changed = [];
  tab.answered = undefined;
  tab.imports = new Map();
  tab.failing = new Set();
  tab.loads = true;
  head.clear();
  vi.stubGlobal("__viteRscCallServer", undefined);
  vi.stubGlobal("document", {
    createElement: (): FakeLink => ({
      rel: "",
      href: "",
      attributes: new Map(),
      onload: null,
      onerror: null,
      setAttribute(name, value) {
        this.attributes.set(name, value);
      },
      getAttribute(name) {
        return this.attributes.get(name) ?? null;
      },
      removeAttribute(name) {
        this.attributes.delete(name);
      },
      remove() {
        head.delete(this);
      },
    }),
    // The links with an attribute, `link[name]`.
    querySelectorAll: (selector: string) => {
      const name = /^link\[(.+)\]$/.exec(selector)![1]!;
      return [...head].filter((link) => link.attributes.has(name));
    },
    head: {
      append(link: FakeLink) {
        head.add(link);
        if (tab.loads) queueMicrotask(() => link.onload?.());
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const graph = () => import("./client-graph.ts");

// The module of the rsc layer for a file with `"use client"`: Vite RSC's
// reference for each export, which `loadClientModule()` reads nothing of,
// and in front of them the plugin's export with the file's key, see
// client-files.ts. A new import of the file is a new module.
const referenceModule = (key: string, ...names: string[]): object => ({
  [clientFileKeyExport]: key,
  ...Object.fromEntries(names.map((name) => [name, () => {}])),
});

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

test("tells the module by the plugin's export alone", async () => {
  const { loadClientModule } = await graph();
  const reference = await importHostFile("/host/badge.tsx", "Badge");
  const exports = await loadClientModule(reference);

  // An export that a plugin of the host added after Vite RSC, like a list of
  // the file's exports in their order, changes nothing.
  const withOrder = { ...reference, __exportOrder: ["Badge"], label: "Badge" };
  expect(await loadClientModule(withOrder)).toBe(exports);
  // Nor do React's client references without the export: a module that
  // re-exports them is no module of the file.
  const references = {
    Badge: Object.defineProperties(() => {}, {
      $$typeof: { value: Symbol.for("react.client.reference") },
      $$id: { value: "/host/badge.tsx#Badge" },
    }),
  };
  expect(await loadClientModule(references)).toBe(references);
});

test("evaluates a file once for two imports of it", async () => {
  const { loadClientModule } = await graph();
  const first = await importHostFile("/host/badge.tsx", "Badge");

  // Another module of the file, like one that Vite's client imports with a
  // timestamp, of the file as it was.
  const second = await importHostFile("/host/badge.tsx", "Badge");

  expect(tab.evaluated).toEqual(["/host/badge.tsx"]);
  expect(await loadClientModule(second)).toBe(await loadClientModule(first));
});

test("evaluates a file again after a change, for the module that the change made", async () => {
  const { loadClientModule } = await graph();
  const before = await importHostFile("/host/badge.tsx", "Badge");
  const old = await loadClientModule(before);

  // A file changed, and the host imports the file again: a new module, whose
  // prefix evaluated the file again.
  tab.changed = ["/host/badge.tsx"];
  const after = await importHostFile("/host/badge.tsx", "Badge");

  expect(await loadClientModule(after)).toEqual({ url: "/host/badge.tsx", evaluation: 2 });
  // The module of before keeps its own.
  expect(await loadClientModule(before)).toBe(old);
  expect(tab.evaluated).toEqual(["/host/badge.tsx", "/host/badge.tsx"]);
});

// A file of the host that imports another one, which the host reads too.
test("gives every reader of a file its one evaluation, also after a change of another", async () => {
  type Evaluation = { url: string; imports?: object[] };
  tab.imports.set("/host/page.tsx", ["/host/badge.tsx"]);
  const { loadClientModule } = await graph();
  const read = async (key: string) =>
    (await loadClientModule(await importHostFile(key))) as Evaluation;
  const badge = await read("/host/badge.tsx");
  expect((await read("/host/page.tsx")).imports?.[0]).toBe(badge);

  // The page changed, which nothing imports: Vite invalidated it alone, and
  // the host imports it again.
  tab.changed = ["/host/page.tsx"];
  expect((await read("/host/page.tsx")).imports?.[0]).toBe(badge);
  expect(tab.evaluated).toEqual(["/host/badge.tsx", "/host/page.tsx", "/host/page.tsx"]);

  // The badge changed, and the host imports both again. Vite invalidated the
  // badge alone, as it does when the page takes the change of it with HMR,
  // which the graph runs without: the page imports the badge as it is now.
  tab.changed = ["/host/badge.tsx"];
  const changed = await read("/host/badge.tsx");
  expect(changed).not.toBe(badge);
  expect((await read("/host/page.tsx")).imports?.[0]).toBe(changed);
  expect(tab.evaluated.slice(3)).toEqual(["/host/badge.tsx", "/host/page.tsx"]);
});

test("invalidates what changed before a file that loads meanwhile imports it", async () => {
  type Evaluation = { url: string; imports?: object[] };
  tab.imports.set("/host/page.tsx", ["/host/badge.tsx"]);
  const { loadClientModule } = await graph();
  await importHostFile("/host/badge.tsx");
  await importHostFile("/host/page.tsx");

  // A change of the badge, after which the host imports both files again at
  // once. The answer to the first question of what changed comes last.
  tab.changed = ["/host/badge.tsx", "/host/page.tsx"];
  const answer = Promise.withResolvers<void>();
  tab.answered = answer.promise;
  const loads = Promise.all([importHostFile("/host/badge.tsx"), importHostFile("/host/page.tsx")]);
  await new Promise((resolve) => setTimeout(resolve));
  answer.resolve();
  const [badge, page] = await loads;

  const read = async (module: object) => (await loadClientModule(module)) as Evaluation;
  expect((await read(page)).imports?.[0]).toBe(await read(badge));
  expect(tab.evaluated.slice(2)).toEqual(["/host/badge.tsx", "/host/page.tsx"]);
});

test("forgets the files for Vitest's setup file, which evaluates them again", async () => {
  const { forgetClientFiles, loadClientModule } = await graph();
  const before = await importHostFile("/host/badge.tsx", "Badge");
  const old = await loadClientModule(before);

  // Before the next test file, which imports the file again. A module whose
  // line ran before, and that the host asks for only now, still has the
  // evaluation it loaded.
  const unasked = await importHostFile("/host/badge.tsx", "Badge");
  forgetClientFiles();
  expect(await loadClientModule(unasked)).toBe(old);
  const after = await importHostFile("/host/badge.tsx", "Badge");

  expect(await loadClientModule(after)).toEqual({ url: "/host/badge.tsx", evaluation: 2 });
  expect(await loadClientModule(before)).toBe(old);
});

test("evaluates a setup file that failed once again for the next test file", async () => {
  const { forgetClientFiles, loadClientFile } = await graph();
  tab.failing.add("/vitest.setup.tsx");
  await expect(loadClientFile("/vitest.setup.tsx")).rejects.toThrow("/vitest.setup.tsx failed");
  // The runner keeps the error, as it keeps an evaluation, for the same file.
  await expect(loadClientFile("/vitest.setup.tsx")).rejects.toThrow("/vitest.setup.tsx failed");
  expect(tab.evaluated).toEqual(["/vitest.setup.tsx"]);

  // Fixed, before the next test file.
  tab.failing.clear();
  forgetClientFiles();
  await loadClientFile("/vitest.setup.tsx");

  expect(tab.evaluated).toEqual(["/vitest.setup.tsx", "/vitest.setup.tsx"]);
});

// Loading a file is not using it: a host links the stylesheets of the files
// it uses, by their paths, as Vitest's setup file does those of the setup
// files and the test file before each test, until `cleanup()` unlinks them.
test("links the stylesheets of the files that the host uses, until they are unlinked", async () => {
  const { loadClientModule, linkStylesheetsOf, unlinkStylesheets, forgetClientFiles } =
    await graph();
  const badge = await importHostFile("/host/badge.tsx", "Badge");
  await importHostFile("/host/card.tsx", "Card");

  // The exports alone, as a host loads a file it does not show yet.
  await loadClientModule(badge);
  expect(links()).toEqual([]);
  await linkStylesheetsOf(["/host/badge.tsx"]);
  expect(links()).toEqual(["/_next/static/css/badge.css"]);
  // Each once, in the order of the files.
  await linkStylesheetsOf(["/host/badge.tsx", "/host/card.tsx"]);
  expect(links()).toEqual(["/_next/static/css/badge.css", "/_next/static/css/card.css"]);
  // Marked as the host's, which a page that is left leaves: see document.ts.
  for (const link of head) expect(link.attributes.has("data-vitest-plugin-rsc-graph")).toBe(true);

  unlinkStylesheets();
  expect(links()).toEqual([]);
  // As they are now: an edit gave the CSS another version.
  tab.stylesheets.set("/host/badge.tsx", ["/_next/static/css/badge-2.css"]);
  await linkStylesheetsOf(["/host/badge.tsx"]);
  expect(links()).toEqual(["/_next/static/css/badge-2.css"]);
  // Vitest's setup file, for the next test file.
  forgetClientFiles();
  expect(links()).toEqual([]);
});

// A document can have several uses at once, like the stories of a docs
// page, each with its own end: the signal that a host gives it.
// Vite's client swaps the `<link>` of a stylesheet whose CSS changed for a
// copy, with its attributes, and removes the one it copied.
test("unlinks the copy that Vite's client swapped a link for", async () => {
  const { linkStylesheetsOf, unlinkStylesheets } = await graph();
  await importHostFile("/host/card.tsx", "Card");
  await linkStylesheetsOf(["/host/card.tsx"]);
  const [badge] = head;
  const copy = document.createElement("link") as unknown as FakeLink;
  copy.href = "/app/badge.css?t=1";
  for (const [name, value] of badge!.attributes) copy.setAttribute(name, value);
  badge!.remove();
  document.head.append(copy as unknown as HTMLLinkElement);
  expect(links()).toEqual(["/_next/static/css/card.css", "/app/badge.css?t=1"]);

  unlinkStylesheets();
  expect(links()).toEqual([]);
  expect(copy.attributes.size).toBe(0);
});

test("keeps a stylesheet while a use holds it, and ends a use as its signal aborts", async () => {
  const { linkStylesheetsOf, unlinkStylesheets } = await graph();
  const first = new AbortController();
  const second = new AbortController();
  await linkStylesheetsOf(["/host/badge.tsx"], { signal: first.signal });
  await linkStylesheetsOf(["/host/card.tsx"], { signal: second.signal });
  expect(links()).toEqual(["/_next/static/css/badge.css", "/_next/static/css/card.css"]);

  // badge.css is the second use's too.
  first.abort();
  expect(links()).toEqual(["/_next/static/css/badge.css", "/_next/static/css/card.css"]);
  second.abort();
  expect(links()).toEqual([]);

  // A use without a signal ends at `cleanup()`, which ends every use, and
  // the abort of a use that it ended takes nothing that is linked again.
  const third = new AbortController();
  await linkStylesheetsOf(["/host/badge.tsx"], { signal: third.signal });
  await linkStylesheetsOf(["/host/card.tsx"]);
  unlinkStylesheets();
  expect(links()).toEqual([]);
  await linkStylesheetsOf(["/host/badge.tsx"]);
  third.abort();
  expect(links()).toEqual(["/_next/static/css/badge.css"]);
});

test("ends a use whose signal aborts before its stylesheets load, as renderServer() does", async () => {
  const { linkStylesheetsOf, unlinkStylesheets } = await graph();
  const left = new AbortController();
  left.abort();
  // An aborted signal links nothing.
  await expect(linkStylesheetsOf(["/host/badge.tsx"], { signal: left.signal })).rejects.toThrow(
    "aborted",
  );
  expect(links()).toEqual([]);

  tab.loads = false;
  const leaving = new AbortController();
  const use = linkStylesheetsOf(["/host/badge.tsx"], { signal: leaving.signal });
  await vi.waitFor(() => expect(links()).toEqual(["/_next/static/css/badge.css"]));
  leaving.abort(new Error("left the story"));
  await expect(use).rejects.toThrow("left the story");
  expect(links()).toEqual([]);

  // A use that waits for a stylesheet that `cleanup()` takes back before it
  // loads resolves: a link out of the document fires no `load`.
  const waiting = linkStylesheetsOf(["/host/badge.tsx"]);
  await vi.waitFor(() => expect(links()).toEqual(["/_next/static/css/badge.css"]));
  unlinkStylesheets();
  await expect(waiting).resolves.toBeUndefined();
});

test("gives any other module as it is", async () => {
  const { loadClientModule } = await graph();
  const reference = { renderGreeting() {} };

  expect(await loadClientModule(reference)).toBe(reference);
  expect(tab.evaluated).toEqual([]);
});

test("rejects for a file with `use client` that is not the host's", async () => {
  const { loadClientFile, loadClientModule } = await graph();
  // The app's own: its module has the key, and no prefix evaluated it.
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
// that the build has for a file by its path from the root of the project.
test("loads a file of the host in a static build, by its key", async () => {
  tab.buildDirectory = "https://site.test/docs/";
  tab.references = {
    "5f3a9c1e": "/vitest-plugin-rsc/react_client/assets/badge.js",
    "7d2b4e6a": "/vitest-plugin-rsc/react_client/assets/plain.js",
    "9c8e1f3b": "/vitest-plugin-rsc/react_client/assets/far.js",
  };
  const { loadClientFile, loadClientModule, linkStylesheetsOf } = await graph();

  await loadClientFile("5f3a9c1e");

  expect(tab.evaluated).toEqual(["/vitest-plugin-rsc/react_client/assets/badge.js"]);
  const exports = await loadClientModule(referenceModule("5f3a9c1e", "Badge"));
  expect(exports).toEqual({
    url: "/vitest-plugin-rsc/react_client/assets/badge.js",
    evaluation: 1,
  });
  // A file of the build, wherever the build is served.
  await linkStylesheetsOf(["host/badge.tsx"]);
  expect(links()).toEqual(["https://site.test/docs/_next/static/css/badge-1a2b3c4d.css"]);
  // Once for two imports, with an export a plugin of the host added.
  await loadClientFile("5f3a9c1e");
  const again = { ...referenceModule("5f3a9c1e", "Badge"), __exportOrder: ["Badge"] };
  expect(await loadClientModule(again)).toBe(exports);
  expect(tab.evaluated).toHaveLength(1);
  // One without any, one that the build has none for, like a file of
  // another project, and one without the directive, as the dev server
  // answers for none.
  await loadClientFile("7d2b4e6a");
  await linkStylesheetsOf(["host/plain.tsx", "/elsewhere/far.tsx", "host/node.tsx"]);
  expect(links()).toHaveLength(1);
  // A key the build has no reference for.
  await expect(loadClientFile("0000")).rejects.toThrow(
    'vitest-plugin-rsc: the build has no client reference "0000"',
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
