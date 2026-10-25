import { afterAll, expect, inject, test } from "vitest";
import { within } from "@testing-library/dom";
import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { fileChanged } from "../../test-helpers/file-changed.ts";

// The tests of changing-probe.test.tsx in a Node.js worker with happy-dom or
// jsdom: see the node projects of vitest.config.ts. A page after a change of
// a file has the browser layer's modules as they are now, also where the
// page takes the server's news of the change, which a page in Node.js hears
// on a stream of its own next to its requests.

declare module "vitest" {
  interface ProvidedContext {
    // The speed feature of the project: see vitest.config.ts.
    cacheDevServer: boolean;
  }
}

const file = "components/changing-label.ts";
const changeLabel = async (label: string) => {
  step(`change to ${label}`);
  await fileChanged(file, `export const label = ${JSON.stringify(label)};`);
  step(`changed to ${label}`);
};
// What is in the file again, for the dev server.
afterAll(() => fileChanged(file));

// Without the server's HTML: the ssr layer renders the Client Component as it
// was, and the page would hydrate that with the module of now.
const started = performance.now();
const step = (name: string) =>
  process.stderr.write(
    `[probe-debug] ${Math.round(performance.now() - started)} ms ${name}: ${document.body.textContent?.slice(-200)}\n`,
  );
const open = async () => {
  step("open");
  try {
    await renderServer({ url: "/changing-probe", ssr: false });
  } catch (error) {
    step(`open failed ${String(error)}`);
    throw error;
  }
  step("opened");
};

const shows = (label: string) => `Client Component: ${label}`;

// Loads the page until it shows `label`. Without `cacheDevServer` the first
// page does: a page load asks the dev server. With it, the page takes the
// server's news of the change, which can come after the request that made it.
async function openUntilLabel(label: string) {
  if (!inject("cacheDevServer")) {
    await open();
    expect(await within(document.body).findByText(shows(label))).toBeTruthy();
    return;
  }
  await expect
    .poll(async () => {
      await open();
      return document.body.textContent;
    })
    .toContain(shows(label));
}

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
