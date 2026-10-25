import { afterAll, expect, inject, test } from "vitest";
import { page } from "vitest/browser";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { fileChanged } from "../../test-helpers/file-changed.ts";

// The change of a file of changing-probe.test.tsx in the node projects of
// vitest.config.ts, whose page asks the dev server for the versions of its
// modules over Vitest's RPC. Without the speed feature `cacheDevServer` a
// page load asks, so the page after a change has the browser layer's
// modules as they are now. With it the page asks once, as a test file
// starts, so it keeps the modules of then until the next file.

declare module "vitest" {
  interface ProvidedContext {
    // The speed feature of the project: see vitest.config.ts.
    cacheDevServer: boolean;
  }
}

const file = "components/changing-label.ts";
const changeLabel = (label: string) =>
  fileChanged(file, `export const label = ${JSON.stringify(label)};`);
// What is in the file again, for the dev server.
afterAll(() => fileChanged(file));

// Without the server's HTML: the ssr layer renders the Client Component as it
// was, and the page would hydrate that with the module of now.
const open = () => renderServer({ url: "/changing-probe", ssr: false });

const shows = (label: string) => page.getByText(`Client Component: ${label}`);

test.skipIf(inject("cacheDevServer"))(
  "a page load after a change has the modules as they are now",
  async () => {
    await open();
    await expect.element(shows("As written")).toBeVisible();

    await changeLabel("First");
    await open();
    await expect.element(shows("First")).toBeVisible();

    await changeLabel("Second");
    await open();
    await expect.element(shows("Second")).toBeVisible();
  },
);

test.runIf(inject("cacheDevServer"))(
  "with cacheDevServer, a page load after a change has the modules of the file's start",
  async () => {
    await open();
    await expect.element(shows("As written")).toBeVisible();

    await changeLabel("Within the file");
    await open();
    await expect.element(shows("As written")).toBeVisible();
  },
);
