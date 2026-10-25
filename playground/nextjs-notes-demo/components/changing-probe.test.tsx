import { afterAll, expect, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { fileChanged } from "../../test-helpers/file-changed.ts";

// A change of a file while the tests run, as Vitest's watcher makes it: a
// page after it has the browser layer's modules as they are now. In fast
// mode the pages of a test file render in one app, which has the modules it
// started with: it goes with the first page after a change. So the page is
// a route, app/changing-probe/page.tsx, which fast mode renders in its kept
// app, where it would load a node as a page of its own. The server layer,
// which the tab loads once, and the test file's own imports have the file as
// it was until Vitest runs the file again.

const file = "components/changing-label.ts";
const changeLabel = (label: string) =>
  fileChanged(file, `export const label = ${JSON.stringify(label)};`);
// What is in the file again, for the dev server.
afterAll(() => fileChanged(file));

const expectLabel = (label: string) =>
  expect.element(page.getByText(`Client Component: ${label}`)).toBeVisible();

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
  await loading;

  await renderServer({ url: "/changing-probe" });
  await expectLabel("During a load");
});

test("a change at the end of a test", async () => {
  await changeLabel("Before");
  await renderServer({ url: "/changing-probe" });
  await expectLabel("Before");

  await changeLabel("Between two tests");
});

test("the next test of the file has the modules as they are now", async () => {
  await renderServer({ url: "/changing-probe" });
  await expectLabel("Between two tests");
});
