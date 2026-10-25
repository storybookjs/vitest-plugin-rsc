import { expect, test, vi } from "vitest";
import { vitestModules } from "./vitest-modules.ts";
import { workerRunKey, type WorkerRun } from "./worker-run.ts";

// A change of a file in a worker of Node.js, as the page sees it: the page's
// runners get their modules from Vitest's RPC (vitest-modules.ts), and the
// page sees a change of a file at the next run of Vitest, which names the
// file, as the test's own modules do. What components/changing-probe.test.tsx
// of the notes demo asks of a page in a browser, at the granularity of a run.

// What the dev server has in the file now.
let label = "First";
const asked: string[] = [];
const run: WorkerRun = {
  rpc: {
    fetch: async (url) => {
      asked.push(url);
      return {
        code: `__vite_ssr_exportName__("label", () => ${JSON.stringify(label)});`,
        file: `/root${url}`,
        id: `/root${url}`,
        url,
        invalidate: false,
      };
    },
  },
  providedContext: {},
  changed: [],
};
(globalThis as unknown as Record<PropertyKey, WorkerRun>)[workerRunKey] = run;

vi.mock("virtual:vitest-plugin-rsc/host-modules", () => ({ default: undefined }));
vi.mock("virtual:vitest-plugin-rsc/layers", () => ({ default: undefined }));
vi.mock("virtual:vitest-plugin-rsc/vite-client", () => ({}));
vi.mock("virtual:vitest-plugin-rsc/page-host", () => ({
  default: {
    request: () => Promise.reject(new Error("no question in these tests")),
    modules: vitestModules(),
  },
}));

const { checkFetchedModules, createEnvironmentRunner, takeChangedModules, versionOfModules } =
  await import("./utils.ts");

// A page load: a runner of its own, after the check of the modules.
async function pageLoad(): Promise<string> {
  await checkFetchedModules();
  const runner = createEnvironmentRunner("react_client");
  return (await runner.import<{ label: string }>("/label.ts")).label;
}

// The file changes on the dev server, and the next run of Vitest names it.
function change(to: string) {
  label = to;
}
function nextRun() {
  run.changed.push(["/root/label.ts"]);
}

test("a page after a change has the modules as they are now, from the next run", async () => {
  expect(await pageLoad()).toBe("First");
  change("Second");
  // The run goes on with the modules it fetched, as the test's own do.
  expect(await pageLoad()).toBe("First");

  nextRun();
  expect(await pageLoad()).toBe("Second");
});

test("a change while a page loads: the page after the next run has the modules as they are now", async () => {
  const loading = pageLoad();
  change("During a load");
  await loading;

  nextRun();
  expect(await pageLoad()).toBe("During a load");
});

test("a page load asks Vitest for a module once per version of the modules", async () => {
  asked.length = 0;
  await pageLoad();
  await pageLoad();
  expect(asked).toEqual([]);

  change("Between two runs");
  nextRun();
  await pageLoad();
  await pageLoad();
  expect(asked).toEqual(["/label.ts"]);
});

test("a runner that outlives a page load takes the modules of the files that changed", async () => {
  await checkFetchedModules();
  const kept = createEnvironmentRunner("react_client");
  await kept.import("/label.ts");
  const version = await versionOfModules("react_client");

  change("Kept");
  nextRun();
  await checkFetchedModules();

  expect(await versionOfModules("react_client")).toBe(version + 1);
  expect(await takeChangedModules(kept)).toEqual(["/root/label.ts"]);
});
