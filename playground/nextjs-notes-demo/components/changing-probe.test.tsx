import { afterAll, expect, test } from "vitest";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { fileChanged } from "../../test-helpers/file-changed.ts";

// A change of a file while the tests run, as Vitest's watcher makes it: a
// page after it has the browser layer's modules as they are now. In fast
// mode the pages of a test file render in one app, which has the modules it
// started with: it goes with the first page after the page has the server's
// news of a change. So the page is a route, app/changing-probe/page.tsx,
// which fast mode renders in its kept app, where it would load a node as a
// page of its own. The server layers, which the tab loads once, and the test
// file's own imports have the file as it was until Vitest runs the file
// again.

const file = "components/changing-label.ts";
const changeLabel = (label: string) =>
  fileChanged(file, `export const label = ${JSON.stringify(label)};`);
// What is in the file again, for the dev server.
afterAll(() => fileChanged(file));

// Without the server's HTML: the ssr layer renders the Client Component as it
// was, and the page would hydrate that with the module of now.
const open = () => renderServer({ url: "/changing-probe", ssr: false });

// Loads the page until it shows `label`. In fidelity mode the first page
// does: a page load asks the dev server. In fast mode the page takes the
// server's news of the change, which can come after the request that made
// it; a kept app that stayed after it would show the label before for good.
const openUntilLabel = (label: string) =>
  expect
    .poll(async () => {
      await open();
      return document.body.textContent;
    })
    .toContain(`Client Component: ${label}`);

test("a page after a change has the modules as they are now", async () => {
  await open();
  await changeLabel("First");
  await openUntilLabel("First");

  await changeLabel("Second");
  await openUntilLabel("Second");
});

test("a change while a page loads: the page after it has the modules as they are now", async () => {
  await open();
  const loading = open();
  await changeLabel("During a load");
  await loading;

  await openUntilLabel("During a load");
});

test("a change at the end of a test", async () => {
  await open();
  await changeLabel("Before");
  await openUntilLabel("Before");

  await changeLabel("Between two tests");
});

test("the next test of the file has the modules as they are now", async () => {
  await openUntilLabel("Between two tests");
});
