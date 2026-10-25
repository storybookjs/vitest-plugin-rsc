import { afterAll, expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { fileChanged } from "../../test-helpers/file-changed.ts";

// A change of a file while the tests run, as Vitest's watcher makes it: a
// page after it has the modules as they are now, in the Server Component
// and in the Client Component that import the file. The page is a route,
// app/changing-probe/page.tsx: a node would be the test file's, as it was
// imported. In fast mode the pages
// of a test file render in one app, which has the modules it started with:
// it goes after a change.

const file = "components/changing-label.ts";
const changeLabel = (label: string) =>
  fileChanged(file, `export const label = ${JSON.stringify(label)};`);
// What is in the file again, for the dev server.
afterAll(() => fileChanged(file));

async function expectLabel(label: string) {
  await expect.element(page.getByText(`Server Component: ${label}`)).toBeVisible();
  await expect.element(page.getByText(`Client Component: ${label}`)).toBeVisible();
}

// The page hears of a change on its socket to the dev server, which it opens
// as it loads a page: each test loads one before it changes the file.

test("a page after a change has the modules as they are now", async () => {
  await renderServer({ url: "/changing-probe" });
  await changeLabel("First");
  await renderServer({ url: "/changing-probe" });
  await expectLabel("First");

  await changeLabel("Second");
  await renderServer({ url: "/changing-probe" });
  await expectLabel("Second");
});

test("a change while a page loads: the page after it has the modules as they are now", async () => {
  await renderServer({ url: "/changing-probe" });
  const loading = renderServer({ url: "/changing-probe" });
  await changeLabel("During a load");
  await loading.catch(() => {});

  await renderServer({ url: "/changing-probe" });
  await expectLabel("During a load");
});

test("a change at the end of a test", async () => {
  await renderServer({ url: "/changing-probe" });
  await changeLabel("Before");
  await renderServer({ url: "/changing-probe" });
  await expectLabel("Before");

  await changeLabel("Between two tests");
});

test("the next test of the file has the modules as they are now", async () => {
  await renderServer({ url: "/changing-probe" });
  await expectLabel("Between two tests");
});
