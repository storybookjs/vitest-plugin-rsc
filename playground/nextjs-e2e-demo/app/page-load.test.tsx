import { renderServer } from "vitest-plugin-rsc/nextjs/testing-library";
import { expect, test } from "vitest";
import { cdp, page } from "vitest/browser";
import { fileChanged } from "../test/service.ts";
import { Counter } from "./components/counter.tsx";

// Every `renderServer()` is a page load, which evaluates the modules of the
// browser layer again. The tab keeps what it fetched from the dev server, as a
// browser keeps what it loaded in its HTTP cache: a suite loads a page for
// every test, and Vite's module runner asks the server for every import of
// every module.

// The modules of the browser layer that the tab asks the dev server for while
// `load` runs.
async function modulesFetched(load: () => Promise<unknown>): Promise<number> {
  const session = cdp();
  let fetched = 0;
  const count = ({ response }: { response: { payloadData: string } }) => {
    const { data } = JSON.parse(response.payloadData) as {
      data?: { environment?: string; payload?: { data?: { name?: string } } };
    };
    if (data?.environment === "react_client" && data.payload?.data?.name === "fetchModule") {
      fetched++;
    }
  };
  await session.send("Network.enable");
  session.on("Network.webSocketFrameSent", count);
  try {
    await load();
  } finally {
    session.off("Network.webSocketFrameSent", count);
    await session.send("Network.disable");
  }
  return fetched;
}

test("a page that loads again fetches no module again", async () => {
  await renderServer({ url: "/" });

  expect(await modulesFetched(() => renderServer({ url: "/" }))).toBe(0);
  // It is a page of its own: its state is not the one of the page before.
  await page.getByRole("button", { name: "Count: 0" }).click();
  await expect.element(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
  await renderServer({ url: "/" });
  await expect.element(page.getByRole("button", { name: "Count: 0" })).toBeVisible();
});

test("a node that renders again fetches no module again", async () => {
  await renderServer(<Counter />);

  expect(await modulesFetched(() => renderServer(<Counter />))).toBe(0);
});

test("fetches the modules again once a file has changed", async () => {
  await renderServer(<Counter />);
  expect(await modulesFetched(() => renderServer(<Counter />))).toBe(0);

  await fileChanged("app/components/counter.tsx");

  expect(await modulesFetched(() => renderServer(<Counter />))).toBeGreaterThan(0);
  expect(await modulesFetched(() => renderServer(<Counter />))).toBe(0);
});
