import { expect, test, vi } from "vitest";
import { changedEvent, versionEvent } from "./page-protocol.ts";
import { vitestModules } from "./vitest-modules.ts";
import { workerRunKey, type WorkerRun } from "./worker-run.ts";

// A change of a file in a worker of Node.js, as the page sees it: the page's
// runners get their modules from Vitest's RPC (vitest-modules.ts), and the
// versions of the modules from the dev server, which the page asks as a page
// load starts. What components/changing-probe.test.tsx of the notes demo asks
// of a page in a browser, at the granularity of a page load, as the page in
// Node.js hears no news.

// What the dev server has in the file now, and the version of its modules.
let label = "First";
let version = 1;
// The modules that changed after each version, as `changedAfter()` of
// module-versions.ts has them.
const changedAt = new Map<number, string[]>();
// What happens as Vitest's RPC fetches the module, once.
let whileFetching: (() => void) | undefined;
const asked: string[] = [];
const run: WorkerRun = {
  rpc: {
    fetch: async (url) => {
      asked.push(url);
      const code = `__vite_ssr_exportName__("label", () => ${JSON.stringify(label)});`;
      const during = whileFetching;
      whileFetching = undefined;
      during?.();
      return { code, file: `/root${url}`, id: `/root${url}`, url, invalidate: false };
    },
  },
  providedContext: {},
};
(globalThis as unknown as Record<PropertyKey, WorkerRun>)[workerRunKey] = run;

// The dev server's answers on the worker's channel: see index.ts.
async function answer(event: string, data: { since?: number }): Promise<unknown> {
  if (event === versionEvent) return version;
  if (event === changedEvent) {
    const changed = [...changedAt].filter(([at]) => at >= data.since!).flatMap(([, ids]) => ids);
    return { answer: changed };
  }
  throw new Error(`no answer at ${event}`);
}

vi.mock("virtual:vitest-plugin-rsc/host-modules", () => ({ default: undefined }));
vi.mock("virtual:vitest-plugin-rsc/layers", () => ({ default: undefined }));
vi.mock("virtual:vitest-plugin-rsc/vite-client", () => ({}));
vi.mock("virtual:vitest-plugin-rsc/page-host", () => ({
  default: {
    request: answer,
    modules: vitestModules(),
    // One realm: the window's is not what this test is about.
    compileInPage: (params: string[], body: string) =>
      new (async function () {}.constructor as FunctionConstructor)(...params, body),
  },
}));

const {
  checkFetchedModules,
  createEnvironmentRunner,
  forgetHeardVersions,
  takeChangedModules,
  versionOfModules,
} = await import("./utils.ts");

// A page load: the versions asked again, a runner of its own, after the check
// of the modules, as page.ts does in fidelity mode.
async function pageLoad(): Promise<string> {
  forgetHeardVersions();
  await checkFetchedModules();
  const runner = createEnvironmentRunner("react_client");
  return (await runner.import<{ label: string }>("/label.ts")).label;
}

// The file changes on the dev server, which moves the version of its modules.
function change(to: string) {
  label = to;
  changedAt.set(version, ["/root/label.ts"]);
  version++;
}

test("a page load after a change has the modules as they are now", async () => {
  change("First");
  expect(await pageLoad()).toBe("First");
  change("Second");
  expect(await pageLoad()).toBe("Second");
});

test("a change while a page loads: the next page load has the modules as they are now", async () => {
  change("Before the load");
  whileFetching = () => change("During the load");
  expect(await pageLoad()).toBe("Before the load");
  expect(whileFetching).toBeUndefined();

  expect(await pageLoad()).toBe("During the load");
});

test("a page load asks Vitest for a module once per version of the modules", async () => {
  change("Once");
  asked.length = 0;
  await pageLoad();
  await pageLoad();
  expect(asked).toEqual(["/label.ts"]);

  change("Again");
  await pageLoad();
  await pageLoad();
  expect(asked).toEqual(["/label.ts", "/label.ts"]);
});

test("a runner that outlives a page load takes the modules of the files that changed", async () => {
  await pageLoad();
  const kept = createEnvironmentRunner("react_client");
  await kept.import("/label.ts");
  const before = await versionOfModules("react_client");

  change("Kept");
  forgetHeardVersions();
  await checkFetchedModules();

  expect(await versionOfModules("react_client")).toBe(before + 1);
  expect(await takeChangedModules(kept)).toEqual(["/root/label.ts"]);
});
