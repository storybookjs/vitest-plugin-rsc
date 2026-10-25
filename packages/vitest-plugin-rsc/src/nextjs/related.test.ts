import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { afterAll, beforeAll, expect, test } from "vitest";
import { createVitest, type Vitest } from "vitest/node";
import { vitestPluginRSC } from "../index.ts";
import { vitestPluginNext } from "./plugin.ts";

// `vitest related` and `vitest --changed` with the real Vitest, in Browser
// Mode, for an app of its own: which test files a change of a file of the app
// finds, through the routes a test opens, a Server Action and a Client
// Component. That Vitest reads the imports of a test file of Browser Mode in
// the `ssr` environment is not something it promises (see
// ../related-lookup.ts), so this is where an update that changes it shows.
// No test runs: Vitest may start a headless Chromium, which `close()` shuts
// down. The test files are named `.related.tsx`, so that no project of this
// repository takes them for its own.

const demo = fileURLToPath(new URL("../../../../playground/nextjs-e2e-demo", import.meta.url));
const testingLibrary = "vitest-plugin-rsc/nextjs/testing-library";
const files: Record<string, string> = {
  "next.config.mjs":
    "export default { async redirects() { return [{ source: '/old', destination: '/notes', permanent: true }]; } };",
  "app/globals.css": "body { margin: 0; }",
  "app/layout.tsx":
    'import "./globals.css";\nexport default ({ children }) => <html><body>{children}</body></html>;',
  "app/page.tsx": "export default () => <h1>Home</h1>;",
  "app/notes/page.tsx":
    'import { List } from "../../components/list.tsx";\nexport default () => <List />;',
  "app/notes/[id]/page.tsx":
    'import { save } from "./actions.ts";\nimport { Button } from "../../../components/button.tsx";\n' +
    "export default () => <form action={save}><Button /></form>;",
  "app/notes/[id]/actions.ts":
    '"use server";\nimport { store } from "../../../lib/store.ts";\nexport async function save() { store.push(1); }',
  "components/list.tsx": "export const List = () => <ul />;",
  "components/button.tsx":
    '"use client";\nimport { label } from "../lib/format.ts";\nexport const Button = () => <button>{label}</button>;',
  "lib/store.ts": "export const store = [];",
  "lib/format.ts": 'export const label = "Save";',
  "lib/unused.ts": "export const unused = 1;",
  "notes.related.tsx": `import { renderServer } from "${testingLibrary}";\nawait renderServer({ url: "/notes" });`,
  "note.related.tsx": `import { renderServer } from "${testingLibrary}";\nawait renderServer({ url: \`/notes/\${1}\` });`,
  "old.related.tsx": `import { renderServer } from "${testingLibrary}";\nawait renderServer({ url: "/old" });`,
  "other.related.ts": "export {};",
};

let app: string;
let vitest: Vitest;

beforeAll(async () => {
  // Next to the demo, so that it finds the same Next and this package.
  app = fs.mkdtempSync(path.join(demo, ".related-"));
  for (const [file, code] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(app, file)), { recursive: true });
    fs.writeFileSync(path.join(app, file), code);
  }
  vitest = await createVitest(
    "test",
    {
      root: app,
      config: false,
      include: ["*.related.{ts,tsx}"],
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [{ browser: "chromium" }],
      },
      watch: false,
      fsModuleCache: false,
      reporters: [{}],
    },
    { root: app, plugins: [vitestPluginRSC(), vitestPluginNext()] },
  );
});

afterAll(async () => {
  await vitest?.close();
  if (app) fs.rmSync(app, { recursive: true, force: true });
});

const related = async (file: string) => {
  vitest.config.related = [path.join(app, file)];
  const specifications = await vitest.getRelevantTestSpecifications();
  expect(specifications.every(({ pool }) => pool === "browser")).toBe(true);
  return specifications.map((specification) => path.basename(specification.moduleId)).sort();
};

test("a page finds the test files that open its route", async () => {
  expect(await related("app/notes/[id]/page.tsx")).toEqual(["note.related.tsx"]);
  // Also through a redirect of next.config.
  expect(await related("app/notes/page.tsx")).toEqual(["notes.related.tsx", "old.related.tsx"]);
  expect(await related("app/layout.tsx")).toEqual([
    "note.related.tsx",
    "notes.related.tsx",
    "old.related.tsx",
  ]);
});

test("so does what a page imports, also behind a Server Action and a Client Component", async () => {
  expect(await related("components/list.tsx")).toEqual(["notes.related.tsx", "old.related.tsx"]);
  expect(await related("lib/store.ts")).toEqual(["note.related.tsx"]);
  expect(await related("lib/format.ts")).toEqual(["note.related.tsx"]);
});

test("a stylesheet finds the test files of the routes that link it, a file of no route none", async () => {
  expect(await related("app/globals.css")).toEqual([
    "note.related.tsx",
    "notes.related.tsx",
    "old.related.tsx",
  ]);
  expect(await related("lib/unused.ts")).toEqual([]);
});
